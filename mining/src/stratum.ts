/**
 * Stratum V1 client — real TCP connection to a real Bitcoin mining pool.
 *
 * This module does NOT compute hashes itself (CPUs/GPUs in JS would be
 * embarrassingly slow on SHA-256d). It implements the pool protocol so that:
 *
 *   1. You can connect to your own ASIC's proxy (or a public pool) and observe
 *      real work, real difficulty, real shares, real submissions.
 *   2. If you wire a real hashing backend (an ASIC at home, a `cgminer`
 *      process, etc.) you can route shares through this client.
 *
 * No fake hashrate. No fake shares. If nothing is mining, the dashboard shows
 * "0 H/s — no miners connected", which is the truth.
 */

import { Socket, createConnection } from "net";
import { EventEmitter } from "events";

export interface StratumOptions {
  host: string;
  port: number;
  user: string;
  password?: string;
  /** Optional client version string sent in mining.subscribe. */
  userAgent?: string;
}

export interface StratumJob {
  jobId: string;
  prevHash: string;
  coinb1: string;
  coinb2: string;
  merkleBranch: string[];
  version: string;
  nbits: string;
  ntime: string;
  cleanJobs: boolean;
  /** Latest mining.set_difficulty value at the time this job was issued. */
  difficulty: number;
  /** Extranonce1 from mining.subscribe. */
  extranonce1: string;
  /** Extranonce2 size in bytes (from mining.subscribe). */
  extranonce2Size: number;
}

export interface ShareSubmission {
  jobId: string;
  extranonce2: string;
  ntime: string;
  nonce: string;
}

interface StratumEvents {
  connected: () => void;
  subscribed: (extranonce1: string, extranonce2Size: number) => void;
  authorized: (ok: boolean) => void;
  difficulty: (diff: number) => void;
  job: (job: StratumJob) => void;
  shareAccepted: (id: number) => void;
  shareRejected: (id: number, reason: string) => void;
  error: (err: Error) => void;
  close: () => void;
}

export declare interface StratumClient {
  on<E extends keyof StratumEvents>(event: E, listener: StratumEvents[E]): this;
  emit<E extends keyof StratumEvents>(event: E, ...args: Parameters<StratumEvents[E]>): boolean;
}

interface PendingShare {
  id: number;
  submission: ShareSubmission;
}

/**
 * Minimal but real Stratum V1 client. Connects, subscribes, authorizes, and
 * relays mining.notify + mining.set_difficulty events.
 */
export class StratumClient extends EventEmitter {
  private socket: Socket | null = null;
  private nextId = 1;
  private buffer = "";
  private extranonce1 = "";
  private extranonce2Size = 0;
  private difficulty = 1;
  private pending: Map<number, PendingShare> = new Map();
  private opts: StratumOptions;

  constructor(opts: StratumOptions) {
    super();
    this.opts = opts;
  }

  connect(): void {
    const sock = createConnection({ host: this.opts.host, port: this.opts.port });
    this.socket = sock;
    sock.setEncoding("utf8");
    sock.setKeepAlive(true, 60_000);

    sock.on("connect", () => {
      this.emit("connected");
      this.send("mining.subscribe", [this.opts.userAgent ?? "opus-davi-btc/0.1"]);
    });
    sock.on("data", (chunk: string) => this.onData(chunk));
    sock.on("error", (err) => this.emit("error", err));
    sock.on("close", () => this.emit("close"));
  }

  disconnect(): void {
    this.socket?.end();
    this.socket = null;
  }

  submitShare(submission: ShareSubmission): number {
    const id = this.nextId++;
    this.pending.set(id, { id, submission });
    this.sendRaw({
      id,
      method: "mining.submit",
      params: [
        this.opts.user,
        submission.jobId,
        submission.extranonce2,
        submission.ntime,
        submission.nonce,
      ],
    });
    return id;
  }

  private send(method: string, params: unknown[]): number {
    const id = this.nextId++;
    this.sendRaw({ id, method, params });
    return id;
  }

  private sendRaw(obj: { id: number; method: string; params: unknown[] }): void {
    if (!this.socket) throw new Error("not connected");
    this.socket.write(JSON.stringify(obj) + "\n");
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch (e) {
        this.emit("error", e as Error);
      }
    }
  }

  private onMessage(msg: {
    id?: number;
    method?: string;
    params?: unknown[];
    result?: unknown;
    error?: unknown;
  }): void {
    if (msg.method) {
      switch (msg.method) {
        case "mining.set_difficulty": {
          const diff = (msg.params as [number])[0];
          this.difficulty = diff;
          this.emit("difficulty", diff);
          return;
        }
        case "mining.notify": {
          const p = msg.params as [
            string, string, string, string, string[], string, string, string, boolean,
          ];
          const job: StratumJob = {
            jobId: p[0],
            prevHash: p[1],
            coinb1: p[2],
            coinb2: p[3],
            merkleBranch: p[4],
            version: p[5],
            nbits: p[6],
            ntime: p[7],
            cleanJobs: p[8],
            difficulty: this.difficulty,
            extranonce1: this.extranonce1,
            extranonce2Size: this.extranonce2Size,
          };
          this.emit("job", job);
          return;
        }
        case "mining.set_extranonce": {
          const p = msg.params as [string, number];
          this.extranonce1 = p[0];
          this.extranonce2Size = p[1];
          return;
        }
      }
      return;
    }

    if (msg.id === 1) {
      // mining.subscribe result: [ [["mining.set_difficulty", id], ["mining.notify", id]], extranonce1, extranonce2_size ]
      const r = msg.result as [unknown, string, number] | null;
      if (r) {
        this.extranonce1 = r[1];
        this.extranonce2Size = r[2];
        this.emit("subscribed", this.extranonce1, this.extranonce2Size);
        // Authorize next
        this.send("mining.authorize", [this.opts.user, this.opts.password ?? "x"]);
      } else {
        this.emit("error", new Error("subscribe failed: " + JSON.stringify(msg.error)));
      }
      return;
    }

    if (msg.id === 2) {
      const ok = msg.result === true;
      this.emit("authorized", ok);
      return;
    }

    // share submission result
    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      this.pending.delete(msg.id);
      if (msg.result === true) {
        this.emit("shareAccepted", msg.id);
      } else {
        const reason = Array.isArray(msg.error) ? String(msg.error[1] ?? "rejected") : "rejected";
        this.emit("shareRejected", msg.id, reason);
      }
    }
  }
}
