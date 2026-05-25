import { FastifyInstance } from "fastify";
import { broadcastTx } from "@btc-platform/tx-engine";
import { config } from "../config";

export async function broadcastRoutes(app: FastifyInstance) {
  /**
   * POST /api/tx/broadcast
   * body: { rawHex: string }
   *
   * Forwards a signed transaction to Bitcoin Mainnet via mempool.space.
   * The backend never holds a key — only proxies the broadcast.
   */
  app.post("/api/tx/broadcast", async (req, reply) => {
    const { rawHex } = (req.body as { rawHex?: string }) ?? {};
    if (!rawHex || typeof rawHex !== "string") {
      return reply.code(400).send({ error: "rawHex required" });
    }
    if (!/^[0-9a-fA-F]+$/.test(rawHex)) {
      return reply.code(400).send({ error: "rawHex must be hex" });
    }
    try {
      const txid = await broadcastTx(rawHex, config.mempoolApi);
      return { txid };
    } catch (err) {
      return reply.code(502).send({ error: String((err as Error).message) });
    }
  });
}
