/**
 * Stratum V1 TCP server.
 *
 * Protocol summary (line-delimited JSON, one object per line):
 *
 *   miner -> { id, method: "mining.subscribe", params: [userAgent, sessionId?] }
 *   pool  -> { id, result: [[subs], extranonce1, extranonce2_size], error: null }
 *
 *   miner -> { id, method: "mining.authorize", params: [worker, password] }
 *   pool  -> { id, result: true, error: null }
 *
 *   pool  -> { id: null, method: "mining.set_difficulty", params: [difficulty] }
 *   pool  -> { id: null, method: "mining.notify",
 *              params: [jobId, prevhash, coinb1, coinb2, [merkleBranch...],
 *                       version, nbits, ntime, cleanJobs] }
 *
 *   miner -> { id, method: "mining.submit", params: [worker, jobId, en2, ntime, nonce] }
 *   pool  -> { id, result: true|false, error: null|[code,msg,null] }
 *
 * The server keeps per-connection state, deduplicates share submissions,
 * forwards accepted shares to the stats tracker, and submits found blocks
 * to bitcoind via `submitblock`. Found-block payouts go to whatever address
 * was used to build the coinbase — i.e. the operator's address.
 */

import { EventEmitter } from "node:events";
import net from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { bufToHex, difficultyToTargetBE } from "./bytes.js";
import type { JobManager } from "./jobs.js";
import { assembleCoinbaseWithWitness } from "./coinbase.js";
import { buildSerializedBlock } from "./block-serializer.js";
import { hashHeaderBuf } from "./header.js";
import { serializeHeader } from "./header.js";
import { hexToBuf, reverseBuffer } from "./bytes.js";
import { rebuildMerkleRoot } from "./merkle.js";
import { assembleCoinbaseNoWitness } from "./coinbase.js";
import type { BitcoindRpc } from "./rpc.js";
import { validateShare } from "./share.js";
import type { StatsTracker } from "./stats.js";
import type { ShareSubmission, StratumJob, StratumSession } from "./types.js";

interface StratumServerOptions {
  host: string;
  port: number;
  jobs: JobManager;
  stats: StatsTracker;
  rpc: BitcoindRpc;
  /** initial difficulty advertised to every new miner */
  initialDifficulty: number;
}

interface PendingRequest {
  id: number | string | null;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

interface StratumMsg {
  id: number | string | null;
  method?: string;
  params?: JsonValue[];
  result?: JsonValue;
  error?: JsonValue;
}

export class StratumServer extends EventEmitter {
  private readonly opts: StratumServerOptions;
  private readonly server: net.Server;
  private readonly sessions = new Map<string, StratumSession>();
  private readonly sockets = new Map<string, net.Socket>();
  /** dedupe: sessionId -> set of "jobId|en2|ntime|nonce" */
  private readonly submitted = new Map<string, Set<string>>();
  private extraNonce1Counter = 0;

  constructor(opts: StratumServerOptions) {
    super();
    this.opts = opts;
    this.server = net.createServer((sock) => this.onConnection(sock));
    this.opts.jobs.on("job", (job: StratumJob) => this.broadcastJob(job));
  }

  start(): void {
    this.server.listen(this.opts.port, this.opts.host, () => {
      this.emit("listening", { host: this.opts.host, port: this.opts.port });
    });
  }

  stop(): void {
    this.server.close();
    for (const s of this.sockets.values()) s.destroy();
  }

  getSessions(): Map<string, StratumSession> {
    return this.sessions;
  }

  private onConnection(sock: net.Socket): void {
    const id = randomUUID();
    const remote = `${sock.remoteAddress ?? "?"}:${sock.remotePort ?? "?"}`;
    const extraNonce1Hex = this.assignExtraNonce1();
    const session: StratumSession = {
      id,
      extraNonce1Hex,
      extraNonce2Size: 4,
      shareTargetHex: bufToHex(difficultyToTargetBE(this.opts.initialDifficulty)),
      difficulty: this.opts.initialDifficulty,
      remote,
      sharesAccepted: 0,
      sharesRejected: 0,
      lastShareAt: 0,
      connectedAt: Math.floor(Date.now() / 1000),
      acceptedDifficultySum: 0,
    };
    this.sessions.set(id, session);
    this.sockets.set(id, sock);
    this.submitted.set(id, new Set());
    this.emit("connection", { sessionId: id, remote });

    let buffer = "";
    sock.setNoDelay(true);
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as StratumMsg;
          this.handleMessage(session, sock, msg);
        } catch (e) {
          this.emit("error", { sessionId: id, kind: "parse", error: (e as Error).message, line });
        }
      }
    });
    sock.on("close", () => {
      this.sessions.delete(id);
      this.sockets.delete(id);
      this.submitted.delete(id);
      this.emit("disconnect", { sessionId: id, remote });
    });
    sock.on("error", (e) => {
      this.emit("error", { sessionId: id, kind: "socket", error: e.message });
    });
  }

  private handleMessage(session: StratumSession, sock: net.Socket, msg: StratumMsg): void {
    switch (msg.method) {
      case "mining.subscribe":
        this.handleSubscribe(session, sock, msg);
        break;
      case "mining.authorize":
        this.handleAuthorize(session, sock, msg);
        break;
      case "mining.submit":
        void this.handleSubmit(session, sock, msg);
        break;
      case "mining.extranonce.subscribe":
        // We don't change extranonce mid-session, so just acknowledge.
        this.reply(sock, msg.id, true);
        break;
      case "mining.suggest_difficulty":
        // Some miners politely suggest a difficulty. For honesty we accept it
        // capped to a reasonable range so a misbehaving miner can't ask for
        // diff=0 and trivially "find" shares.
        if (Array.isArray(msg.params) && typeof msg.params[0] === "number") {
          const suggested = Math.max(0.0001, Math.min(1024, msg.params[0]));
          this.setDifficulty(session, sock, suggested);
        }
        this.reply(sock, msg.id, true);
        break;
      default:
        this.reply(sock, msg.id, null, [20, `unknown method ${msg.method}`, null]);
    }
  }

  private handleSubscribe(session: StratumSession, sock: net.Socket, msg: StratumMsg): void {
    // Result format: [[ [ "mining.set_difficulty", subId1 ], [ "mining.notify", subId2 ] ], extranonce1, extranonce2_size]
    const subId = randomBytes(4).toString("hex");
    const result: JsonValue = [
      [
        ["mining.set_difficulty", subId],
        ["mining.notify", subId],
      ],
      session.extraNonce1Hex,
      session.extraNonce2Size,
    ];
    this.reply(sock, msg.id, result);

    // Immediately push current difficulty + job (if any)
    this.notifyDifficulty(sock, session.difficulty);
    const job = this.opts.jobs.getCurrentJob();
    if (job) this.notifyJob(sock, job, true);
  }

  private handleAuthorize(session: StratumSession, sock: net.Socket, msg: StratumMsg): void {
    const worker = Array.isArray(msg.params) && typeof msg.params[0] === "string" ? msg.params[0] : null;
    if (!worker) {
      this.reply(sock, msg.id, false, [24, "Unauthorized: missing worker", null]);
      return;
    }
    session.worker = worker;
    this.reply(sock, msg.id, true);
    this.emit("authorized", { sessionId: session.id, worker });
  }

  private async handleSubmit(session: StratumSession, sock: net.Socket, msg: StratumMsg): Promise<void> {
    if (!session.worker) {
      this.reply(sock, msg.id, false, [24, "Unauthorized", null]);
      return;
    }
    const p = msg.params;
    if (
      !Array.isArray(p) ||
      typeof p[0] !== "string" ||
      typeof p[1] !== "string" ||
      typeof p[2] !== "string" ||
      typeof p[3] !== "string" ||
      typeof p[4] !== "string"
    ) {
      this.reply(sock, msg.id, false, [20, "bad params", null]);
      return;
    }
    const [, jobId, extraNonce2Hex, nTimeLEHex, nonceLEHex] = p;
    const submission: ShareSubmission = { jobId, extraNonce2Hex, nTimeLEHex, nonceLEHex };

    const job = this.opts.jobs.getCurrentJob();
    if (!job || job.jobId !== jobId) {
      session.sharesRejected++;
      this.reply(sock, msg.id, false, [21, "stale", null]);
      return;
    }

    const dedupKey = `${jobId}|${extraNonce2Hex}|${nTimeLEHex}|${nonceLEHex}`;
    const dedupSet = this.submitted.get(session.id);
    if (!dedupSet) {
      this.reply(sock, msg.id, false, [22, "no-session", null]);
      return;
    }
    if (dedupSet.has(dedupKey)) {
      session.sharesRejected++;
      this.reply(sock, msg.id, false, [22, "duplicate", null]);
      return;
    }
    dedupSet.add(dedupKey);

    const result = validateShare({ job, session, submission });
    if (!result.ok) {
      session.sharesRejected++;
      this.reply(sock, msg.id, false, [23, result.reason ?? "low-difficulty", null]);
      this.emit("share-rejected", {
        sessionId: session.id,
        worker: session.worker,
        reason: result.reason,
        hashBE: result.headerHashBEHex,
      });
      return;
    }

    session.sharesAccepted++;
    session.lastShareAt = Math.floor(Date.now() / 1000);
    session.acceptedDifficultySum += session.difficulty;
    this.opts.stats.recordShare(session.id, session.difficulty);
    this.reply(sock, msg.id, true);
    this.emit("share-accepted", {
      sessionId: session.id,
      worker: session.worker,
      difficulty: session.difficulty,
      hashBE: result.headerHashBEHex,
    });

    if (result.blockHashBEHex) {
      try {
        const submitResult = await this.submitFoundBlock(job, session, submission);
        this.emit("block-found", {
          height: job.height,
          hashBE: result.blockHashBEHex,
          foundBy: session.worker,
          submitResult,
        });
        this.opts.stats.recordBlock(job.height, result.blockHashBEHex, session.worker ?? session.id);
      } catch (e) {
        this.emit("block-submit-error", { error: (e as Error).message });
      }
    }
  }

  private async submitFoundBlock(
    job: StratumJob,
    session: StratumSession,
    submission: ShareSubmission,
  ): Promise<string | null> {
    // Build the full serialized block and ship it via submitblock RPC.
    const coinbaseWithWitness = assembleCoinbaseWithWitness(
      job.coinb1,
      session.extraNonce1Hex,
      submission.extraNonce2Hex,
      job.coinb2,
    );

    // Compute the merkle root from the (no-witness) coinbase txid + branch
    const cbNoWitness = assembleCoinbaseNoWitness(
      job.coinb1,
      session.extraNonce1Hex,
      submission.extraNonce2Hex,
      job.coinb2,
    );
    const branchLE = job.merkleBranch.map((h) => reverseBuffer(hexToBuf(h)));
    const merkleRootLE = rebuildMerkleRoot(cbNoWitness.txidLE, branchLE);

    const header = serializeHeader({
      versionLEHex: job.version,
      prevHashLEHex: job.prevHashLEHex,
      merkleRootLEHex: bufToHex(merkleRootLE),
      nTimeLEHex: submission.nTimeLEHex,
      nBitsLEHex: job.nbitsLEHex,
      nonceLEHex: submission.nonceLEHex,
    });
    // sanity check our hash matches
    hashHeaderBuf(header);

    const otherTxsHex: string[] = job.template.transactions.map((t) => t.data);
    const blockHex = buildSerializedBlock(header, coinbaseWithWitness, otherTxsHex);
    const res = await this.opts.rpc.submitBlock(blockHex);
    return res;
  }

  private setDifficulty(session: StratumSession, sock: net.Socket, diff: number): void {
    session.difficulty = diff;
    session.shareTargetHex = bufToHex(difficultyToTargetBE(diff));
    this.notifyDifficulty(sock, diff);
  }

  private notifyDifficulty(sock: net.Socket, diff: number): void {
    this.send(sock, { id: null, method: "mining.set_difficulty", params: [diff] });
  }

  private notifyJob(sock: net.Socket, job: StratumJob, cleanJobs: boolean): void {
    this.send(sock, {
      id: null,
      method: "mining.notify",
      params: [
        job.jobId,
        job.prevHashLEHex,
        job.coinb1,
        job.coinb2,
        job.merkleBranch,
        job.version,
        job.nbitsLEHex,
        job.ntimeLEHex,
        cleanJobs,
      ],
    });
  }

  private broadcastJob(job: StratumJob): void {
    for (const [sid, sock] of this.sockets) {
      const sess = this.sessions.get(sid);
      if (!sess?.worker) continue;
      this.notifyJob(sock, job, job.cleanJobs);
    }
  }

  private send(sock: net.Socket, msg: Record<string, JsonValue | undefined>): void {
    try {
      sock.write(JSON.stringify(msg) + "\n");
    } catch (e) {
      this.emit("error", { kind: "write", error: (e as Error).message });
    }
  }

  private reply(sock: net.Socket, id: PendingRequest["id"], result: JsonValue, error?: JsonValue): void {
    this.send(sock, { id, result, error: error ?? null });
  }

  private assignExtraNonce1(): string {
    this.extraNonce1Counter = (this.extraNonce1Counter + 1) & 0xffffffff;
    const b = Buffer.alloc(4);
    b.writeUInt32BE(this.extraNonce1Counter, 0);
    return b.toString("hex");
  }
}
