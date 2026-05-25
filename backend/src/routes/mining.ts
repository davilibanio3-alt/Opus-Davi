import { FastifyInstance } from "fastify";
import { fetchPool, PoolName, StratumClient, StratumJob } from "@btc-platform/mining";
import { config } from "../config";

interface StratumState {
  client: StratumClient | null;
  connected: boolean;
  subscribed: boolean;
  authorized: boolean;
  difficulty: number;
  lastJob: StratumJob | null;
  acceptedShares: number;
  rejectedShares: number;
  startedAt: number;
  lastError: string | null;
}

const stratum: StratumState = {
  client: null,
  connected: false,
  subscribed: false,
  authorized: false,
  difficulty: 0,
  lastJob: null,
  acceptedShares: 0,
  rejectedShares: 0,
  startedAt: 0,
  lastError: null,
};

export async function miningRoutes(app: FastifyInstance) {
  app.post("/api/mining/pools/:pool", async (req, reply) => {
    const { pool } = req.params as { pool: string };
    const body = (req.body as { token?: string; user?: string }) ?? {};
    if (!["braiins", "f2pool", "viabtc"].includes(pool)) {
      return reply.code(400).send({ error: "unsupported pool" });
    }
    try {
      const stats = await fetchPool(pool as PoolName, body);
      return stats;
    } catch (err) {
      return reply.code(502).send({ error: String((err as Error).message) });
    }
  });

  app.get("/api/mining/stratum/status", async () => {
    return {
      connected: stratum.connected,
      subscribed: stratum.subscribed,
      authorized: stratum.authorized,
      difficulty: stratum.difficulty,
      acceptedShares: stratum.acceptedShares,
      rejectedShares: stratum.rejectedShares,
      uptimeSeconds: stratum.startedAt ? Math.floor((Date.now() - stratum.startedAt) / 1000) : 0,
      lastJob: stratum.lastJob
        ? {
            jobId: stratum.lastJob.jobId,
            prevHash: stratum.lastJob.prevHash,
            difficulty: stratum.lastJob.difficulty,
            cleanJobs: stratum.lastJob.cleanJobs,
            ntime: stratum.lastJob.ntime,
          }
        : null,
      host: stratum.client ? `${config.stratum.host}:${config.stratum.port}` : null,
      lastError: stratum.lastError,
    };
  });

  app.post("/api/mining/stratum/connect", async (req, reply) => {
    const body =
      (req.body as { host?: string; port?: number; user?: string; password?: string }) ?? {};
    if (stratum.client) {
      return reply.code(409).send({ error: "already connected — disconnect first" });
    }
    const host = body.host || config.stratum.host;
    const port = body.port || config.stratum.port;
    const user = body.user || config.stratum.user;
    if (!user) {
      return reply.code(400).send({ error: "stratum user required (pool worker name)" });
    }
    const client = new StratumClient({
      host,
      port,
      user,
      password: body.password || config.stratum.password,
      userAgent: "opus-davi-btc/0.1",
    });
    stratum.client = client;
    stratum.startedAt = Date.now();
    stratum.acceptedShares = 0;
    stratum.rejectedShares = 0;
    stratum.lastError = null;

    client.on("connected", () => { stratum.connected = true; });
    client.on("subscribed", () => { stratum.subscribed = true; });
    client.on("authorized", (ok) => { stratum.authorized = ok; });
    client.on("difficulty", (d) => { stratum.difficulty = d; });
    client.on("job", (j) => { stratum.lastJob = j; });
    client.on("shareAccepted", () => { stratum.acceptedShares += 1; });
    client.on("shareRejected", (_, reason) => {
      stratum.rejectedShares += 1;
      stratum.lastError = `share rejected: ${reason}`;
    });
    client.on("error", (e) => { stratum.lastError = e.message; });
    client.on("close", () => {
      stratum.connected = false;
      stratum.subscribed = false;
      stratum.authorized = false;
      stratum.client = null;
    });

    client.connect();
    return { ok: true, host, port, user };
  });

  app.post("/api/mining/stratum/disconnect", async () => {
    stratum.client?.disconnect();
    stratum.client = null;
    stratum.connected = false;
    return { ok: true };
  });
}
