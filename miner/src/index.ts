/**
 * Opus-Davi CPU miner. Connects to a Stratum V1 pool, spawns one worker per
 * CPU core (overridable), and submits real SHA-256d shares.
 *
 * Honest hashrate: ~1–10 MH/s per CPU core via Node crypto on modern x86.
 * That's effectively zero chance of finding a Mainnet block, but the shares
 * you submit to your own pool are cryptographically valid and prove the
 * full proof-of-work path is real.
 */

import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { StratumClient } from "./stratum-client.js";
import type { FoundShare, MainToWorker, MinerJob, WorkerToMain } from "./types.js";

export { StratumClient } from "./stratum-client.js";
export type { MinerJob, FoundShare } from "./types.js";

interface MinerConfig {
  poolHost: string;
  poolPort: number;
  worker: string;
  password: string;
  threads: number;
}

function loadConfig(): MinerConfig {
  const poolHost = process.env.POOL_HOST ?? "127.0.0.1";
  const poolPort = Number(process.env.POOL_PORT ?? "3333");
  const worker = process.env.MINER_WORKER ?? "opus-davi.cpu";
  const password = process.env.MINER_PASSWORD ?? "x";
  const threads = Number(process.env.MINER_THREADS ?? String(os.cpus().length));
  return { poolHost, poolPort, worker, password, threads };
}

interface WorkerSlot {
  worker: Worker;
  id: number;
}

const HASHRATE_WINDOW_MS = 30_000;

function fmtHashrate(hPerSec: number): string {
  if (!Number.isFinite(hPerSec) || hPerSec <= 0) return "0 H/s";
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"];
  let i = 0;
  let v = hPerSec;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

function log(msg: string, extra: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), msg, ...extra })}\n`);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  log("miner starting", { pool: `${cfg.poolHost}:${cfg.poolPort}`, worker: cfg.worker, threads: cfg.threads });

  const workerScript = path.resolve(__dirname, "worker.js");
  const slots: WorkerSlot[] = [];
  const hashSamples: Array<{ ts: number; hashes: number }> = [];

  function pruneSamples(now: number): void {
    while (hashSamples.length && now - hashSamples[0].ts > HASHRATE_WINDOW_MS) hashSamples.shift();
  }

  function rollingHashrate(now: number): number {
    pruneSamples(now);
    if (hashSamples.length < 2) return 0;
    const elapsedMs = now - hashSamples[0].ts;
    const totalHashes = hashSamples.reduce((acc, s) => acc + s.hashes, 0);
    return (totalHashes / elapsedMs) * 1000;
  }

  for (let i = 0; i < cfg.threads; i++) {
    const w = new Worker(workerScript);
    slots.push({ worker: w, id: i });
    w.on("message", (msg: WorkerToMain) => {
      if (msg.type === "hashrate" && msg.hashrate) {
        const now = Date.now();
        hashSamples.push({ ts: now, hashes: msg.hashrate.hashes });
      }
      if (msg.type === "share" && msg.share) {
        const share = msg.share as FoundShare;
        log("found share", { worker: i, jobId: share.jobId, hashBE: share.hashBEHex });
        client.submitShare(share);
      }
    });
    w.on("error", (e) => log("worker error", { worker: i, error: e.message }));
    w.postMessage({ type: "job", workerId: i, workerCount: cfg.threads } satisfies MainToWorker);
  }

  // periodic hashrate reporter
  const ticker = setInterval(() => {
    const now = Date.now();
    log("hashrate", { rolling: fmtHashrate(rollingHashrate(now)) });
  }, 10_000);

  const client = new StratumClient({
    host: cfg.poolHost,
    port: cfg.poolPort,
    worker: cfg.worker,
    password: cfg.password,
  });
  client.on("connect", () => log("connected to pool", { host: cfg.poolHost, port: cfg.poolPort }));
  client.on("subscribed", (info) => log("subscribed", info));
  client.on("authorized", () => log("authorized", { worker: cfg.worker }));
  client.on("difficulty", (d: number) => log("set difficulty", { difficulty: d }));
  client.on("job", (job: MinerJob) => {
    log("new job", { jobId: job.jobId, clean: job.cleanJobs });
    for (const s of slots) {
      s.worker.postMessage({ type: "job", job, workerId: s.id, workerCount: cfg.threads } satisfies MainToWorker);
    }
  });
  client.on("share-response", (info) => log("share response", info));
  client.on("error", (e: Error) => log("pool error", { error: e.message }));
  client.on("close", () => log("pool closed"));
  client.connect();

  const shutdown = (sig: string): void => {
    log("shutting down", { signal: sig });
    clearInterval(ticker);
    for (const s of slots) s.worker.postMessage({ type: "stop" } satisfies MainToWorker);
    client.disconnect();
    setTimeout(() => process.exit(0), 250);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

const isDirect =
  typeof require !== "undefined" ? require.main === module : false;
if (isDirect) {
  main().catch((e: Error) => {
    process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), msg: "fatal", error: e.message })}\n`);
    process.exit(1);
  });
}
