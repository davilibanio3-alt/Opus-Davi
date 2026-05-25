import { FastifyInstance } from "fastify";
import { mempoolGet, mempoolGetText } from "../upstream";

export async function explorerRoutes(app: FastifyInstance) {
  app.get("/api/blocks/tip/height", async () => {
    const text = await mempoolGetText("/blocks/tip/height");
    return { height: Number(text) };
  });

  app.get("/api/blocks/tip/hash", async () => {
    const text = await mempoolGetText("/blocks/tip/hash");
    return { hash: text };
  });

  app.get("/api/blocks", async (req) => {
    const { startHeight } = req.query as { startHeight?: string };
    const path = startHeight ? `/v1/blocks/${startHeight}` : "/v1/blocks";
    return await mempoolGet(path);
  });

  app.get("/api/block/:hash", async (req) => {
    const { hash } = req.params as { hash: string };
    return await mempoolGet(`/block/${hash}`);
  });

  app.get("/api/block/:hash/txs", async (req) => {
    const { hash } = req.params as { hash: string };
    const { startIndex } = req.query as { startIndex?: string };
    const suffix = startIndex ? `/${startIndex}` : "";
    return await mempoolGet(`/block/${hash}/txs${suffix}`);
  });

  app.get("/api/tx/:txid", async (req) => {
    const { txid } = req.params as { txid: string };
    return await mempoolGet(`/tx/${txid}`);
  });

  app.get("/api/tx/:txid/status", async (req) => {
    const { txid } = req.params as { txid: string };
    return await mempoolGet(`/tx/${txid}/status`);
  });

  app.get("/api/address/:address", async (req) => {
    const { address } = req.params as { address: string };
    return await mempoolGet(`/address/${address}`);
  });

  app.get("/api/address/:address/txs", async (req) => {
    const { address } = req.params as { address: string };
    return await mempoolGet(`/address/${address}/txs`);
  });

  app.get("/api/address/:address/utxo", async (req) => {
    const { address } = req.params as { address: string };
    return await mempoolGet(`/address/${address}/utxo`);
  });

  app.get("/api/mempool", async () => {
    return await mempoolGet("/mempool");
  });

  app.get("/api/mempool/recent", async () => {
    return await mempoolGet("/mempool/recent");
  });

  app.get("/api/v1/fees/recommended", async () => {
    return await mempoolGet("/v1/fees/recommended");
  });

  app.get("/api/v1/fees/mempool-blocks", async () => {
    return await mempoolGet("/v1/fees/mempool-blocks");
  });

  app.get("/api/v1/mining/pools/:period", async (req) => {
    const { period } = req.params as { period: string };
    return await mempoolGet(`/v1/mining/pools/${period}`);
  });

  app.get("/api/v1/mining/hashrate/:period", async (req) => {
    const { period } = req.params as { period: string };
    return await mempoolGet(`/v1/mining/hashrate/${period}`);
  });

  app.get("/api/v1/difficulty-adjustment", async () => {
    return await mempoolGet("/v1/difficulty-adjustment");
  });

  app.get("/api/v1/prices", async () => {
    return await mempoolGet("/v1/prices");
  });
}
