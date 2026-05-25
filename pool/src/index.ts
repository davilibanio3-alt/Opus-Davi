/**
 * Pool entrypoint — wires bitcoind RPC, job manager, Stratum server, stats.
 * Also exposes a small read-only HTTP endpoint (`GET /stats`) on the loopback
 * address that the backend polls to render the Pool dashboard. This keeps
 * the pool process self-contained and avoids coupling the pool to a
 * particular message bus.
 */

import http from "node:http";
import { loadConfig } from "./config.js";
import { JobManager } from "./jobs.js";
import { BitcoindRpc } from "./rpc.js";
import { StatsTracker } from "./stats.js";
import { StratumServer } from "./stratum.js";

export { JobManager } from "./jobs.js";
export { BitcoindRpc } from "./rpc.js";
export { StratumServer } from "./stratum.js";
export { StatsTracker } from "./stats.js";
export type { PoolStatsSnapshot, MinerStats } from "./stats.js";
export type { StratumJob, StratumSession, ShareSubmission, ShareResult } from "./types.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const log = (msg: string, extra: Record<string, unknown> = {}): void => {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), msg, ...extra })}\n`);
  };

  log("pool starting", { network: cfg.network, stratum: `${cfg.stratumHost}:${cfg.stratumPort}`, rpc: cfg.bitcoindRpc.url });

  const rpc = new BitcoindRpc({ url: cfg.bitcoindRpc.url, user: cfg.bitcoindRpc.user, password: cfg.bitcoindRpc.password });
  // Validate connectivity + payout address before opening the Stratum port.
  const netInfo = await rpc.getNetworkInfo();
  log("bitcoind connected", { version: netInfo.version, subversion: netInfo.subversion });
  const av = await rpc.validateAddress(cfg.payoutAddress);
  if (!av.isvalid) {
    throw new Error(`POOL_PAYOUT_ADDRESS ${cfg.payoutAddress} is not a valid address on this bitcoind`);
  }

  const stats = new StatsTracker();
  const jobs = new JobManager({
    rpc,
    payoutAddress: cfg.payoutAddress,
    network: cfg.network,
    poolTag: cfg.poolTag,
    extraNonce1Size: cfg.extraNonce1Size,
    extraNonce2Size: cfg.extraNonce2Size,
  });
  jobs.on("job", (job) => log("new job", { jobId: job.jobId, height: job.height, clean: job.cleanJobs, txs: job.template.transactions.length }));
  jobs.on("error", (e: Error) => log("jobs error", { error: e.message }));
  await jobs.start();

  const stratum = new StratumServer({
    host: cfg.stratumHost,
    port: cfg.stratumPort,
    jobs,
    stats,
    rpc,
    initialDifficulty: cfg.initialDifficulty,
  });
  stratum.on("listening", (info) => log("stratum listening", info));
  stratum.on("connection", (info) => log("miner connected", info));
  stratum.on("authorized", (info) => log("miner authorized", info));
  stratum.on("disconnect", (info) => log("miner disconnected", info));
  stratum.on("share-accepted", (info) => log("share accepted", info));
  stratum.on("share-rejected", (info) => log("share rejected", info));
  stratum.on("block-found", (info) => log("BLOCK FOUND", info));
  stratum.on("block-submit-error", (info) => log("block submit error", info));
  stratum.on("error", (info) => log("stratum error", info));
  stratum.start();

  // Stats HTTP — only on loopback by default so the backend can scrape it.
  const httpSrv = http.createServer((req, res) => {
    if (!req.url || !req.url.startsWith("/stats")) {
      res.writeHead(404).end("not found");
      return;
    }
    const job = jobs.getCurrentJob();
    const snap = stats.snapshot(
      stratum.getSessions(),
      job
        ? {
            jobId: job.jobId,
            height: job.height,
            networkTargetHex: job.networkTargetHex,
            nbitsLEHex: job.nbitsLEHex,
            txCount: job.template.transactions.length + 1,
            coinbaseValueSat: job.template.coinbasevalue,
            createdAt: job.createdAt,
          }
        : undefined,
    );
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(snap));
  });
  httpSrv.listen(cfg.statsHttp.port, cfg.statsHttp.host, () => {
    log("stats http listening", { host: cfg.statsHttp.host, port: cfg.statsHttp.port });
  });

  // Graceful shutdown
  const shutdown = (sig: string): void => {
    log("shutting down", { signal: sig });
    jobs.stop();
    stratum.stop();
    httpSrv.close();
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Run if invoked directly (works with both ts-node/tsx and compiled dist).
const isDirect =
  typeof require !== "undefined"
    ? require.main === module
    : false;
if (isDirect) {
  main().catch((e: Error) => {
    process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), msg: "fatal", error: e.message })}\n`);
    process.exit(1);
  });
}
