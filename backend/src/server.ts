import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import jwt from "@fastify/jwt";
import { config } from "./config";
import { explorerRoutes } from "./routes/explorer";
import { broadcastRoutes } from "./routes/broadcast";
import { recoveryRoutes } from "./routes/recovery";
import { miningRoutes } from "./routes/mining";
import { wsRoutes } from "./routes/ws";

async function main() {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug",
    },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 600,
    timeWindow: "1 minute",
  });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(websocket);

  app.get("/healthz", async () => ({
    ok: true,
    network: "mainnet",
    time: new Date().toISOString(),
    version: "0.1.0",
  }));

  app.get("/", async () => ({
    name: "btc-platform backend",
    version: "0.1.0",
    network: "mainnet",
    endpoints: [
      "/healthz",
      "/api/blocks/tip/height",
      "/api/blocks",
      "/api/mempool",
      "/api/v1/fees/recommended",
      "/api/v1/fees/mempool-blocks",
      "/api/v1/mining/hashrate/3y",
      "/api/v1/difficulty-adjustment",
      "/api/tx/:txid",
      "/api/address/:address",
      "POST /api/tx/broadcast",
      "POST /api/recovery/scan",
      "POST /api/mining/pools/:pool",
      "POST /api/mining/stratum/connect",
      "GET  /api/mining/stratum/status",
      "WS   /ws",
    ],
  }));

  await app.register(explorerRoutes);
  await app.register(broadcastRoutes);
  await app.register(recoveryRoutes);
  await app.register(miningRoutes);
  await app.register(wsRoutes);

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    reply.code(err.statusCode ?? 500).send({ error: err.message });
  });

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`btc-platform backend listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
