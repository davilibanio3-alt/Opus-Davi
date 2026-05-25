/**
 * Stratum V1 client — connects to a pool, handles subscribe/authorize, parses
 * mining.notify/mining.set_difficulty, submits shares. Emits events for the
 * main loop to wire into the workers.
 */

import { EventEmitter } from "node:events";
import net from "node:net";
import { hexToBuf } from "./bytes.js";
import type { FoundShare, MinerJob } from "./types.js";

interface StratumMsg {
  id: number | string | null;
  method?: string;
  params?: unknown[];
  result?: unknown;
  error?: unknown;
}

export interface StratumClientOptions {
  host: string;
  port: number;
  worker: string;
  password: string;
  userAgent?: string;
}

export class StratumClient extends EventEmitter {
  private readonly opts: StratumClientOptions;
  private sock?: net.Socket;
  private buffer = "";
  private nextId = 1;
  private extraNonce1Hex = "";
  private extraNonce2Size = 4;
  private currentDifficulty = 1;
  /** target sent by pool — derived from difficulty. Stratum doesn't send the target directly, but we re-derive locally. */
  private shareTargetHex = "";
  private subscribed = false;
  private authorized = false;

  constructor(opts: StratumClientOptions) {
    super();
    this.opts = opts;
  }

  connect(): void {
    const sock = net.createConnection({ host: this.opts.host, port: this.opts.port });
    this.sock = sock;
    sock.setNoDelay(true);
    sock.setEncoding("utf8");
    sock.on("connect", () => {
      this.emit("connect");
      this.send({ id: this.nextId++, method: "mining.subscribe", params: [this.opts.userAgent ?? "opus-davi-miner/0.1.0"] });
    });
    sock.on("data", (chunk: string) => this.handleChunk(chunk));
    sock.on("close", () => this.emit("close"));
    sock.on("error", (e) => this.emit("error", e));
  }

  disconnect(): void {
    this.sock?.destroy();
  }

  submitShare(share: FoundShare): void {
    this.send({
      id: this.nextId++,
      method: "mining.submit",
      params: [this.opts.worker, share.jobId, share.extraNonce2Hex, share.ntimeLEHex, share.nonceLEHex],
    });
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as StratumMsg;
        this.handleMessage(msg);
      } catch (e) {
        this.emit("parse-error", { error: (e as Error).message, line });
      }
    }
  }

  private handleMessage(msg: StratumMsg): void {
    if (msg.method === "mining.set_difficulty" && Array.isArray(msg.params)) {
      const diff = Number(msg.params[0]);
      if (Number.isFinite(diff) && diff > 0) {
        this.currentDifficulty = diff;
        this.shareTargetHex = difficultyToTargetHex(diff);
        this.emit("difficulty", diff);
      }
      return;
    }
    if (msg.method === "mining.notify" && Array.isArray(msg.params)) {
      const [jobId, prevHashLEHex, coinb1, coinb2, merkleBranchBEHex, versionLEHex, nbitsLEHex, ntimeLEHex, cleanJobs] = msg.params as [
        string,
        string,
        string,
        string,
        string[],
        string,
        string,
        string,
        boolean,
      ];
      const job: MinerJob = {
        jobId,
        prevHashLEHex,
        coinb1,
        coinb2,
        merkleBranchBEHex: merkleBranchBEHex ?? [],
        versionLEHex,
        nbitsLEHex,
        ntimeLEHex,
        cleanJobs,
        extraNonce1Hex: this.extraNonce1Hex,
        extraNonce2Size: this.extraNonce2Size,
        shareTargetHex: this.shareTargetHex || difficultyToTargetHex(this.currentDifficulty),
      };
      this.emit("job", job);
      return;
    }
    // Responses to our requests.
    if (msg.id != null && typeof msg.result !== "undefined") {
      if (!this.subscribed && Array.isArray(msg.result)) {
        // subscribe response: [[subs...], extranonce1, extranonce2_size]
        const result = msg.result as [unknown, string, number];
        this.extraNonce1Hex = result[1];
        this.extraNonce2Size = result[2];
        this.subscribed = true;
        this.emit("subscribed", { extraNonce1Hex: this.extraNonce1Hex, extraNonce2Size: this.extraNonce2Size });
        this.send({
          id: this.nextId++,
          method: "mining.authorize",
          params: [this.opts.worker, this.opts.password],
        });
        return;
      }
      if (!this.authorized && msg.result === true) {
        this.authorized = true;
        this.emit("authorized");
        return;
      }
      if (this.authorized) {
        this.emit("share-response", { id: msg.id, ok: msg.result === true, error: msg.error });
      }
    }
  }

  private send(msg: Record<string, unknown>): void {
    this.sock?.write(JSON.stringify(msg) + "\n");
  }
}

function difficultyToTargetHex(difficulty: number): string {
  // pdiff_1_target = 0x00000000ffff0000... (256-bit)
  const pdiff1 = (0xffffn << 208n);
  const scaled = BigInt(Math.floor(difficulty * 0x100000000));
  if (scaled === 0n) throw new Error("difficulty too small");
  const target = (pdiff1 << 32n) / scaled;
  const max = (1n << 256n) - 1n;
  const clamped = target > max ? max : target;
  const buf = Buffer.alloc(32);
  let x = clamped;
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return buf.toString("hex");
}

// re-exported for callers that want the helper directly (mainly tests)
export { difficultyToTargetHex };
// keep import to silence unused-var lint when hexToBuf is referenced only in re-export
void hexToBuf;
