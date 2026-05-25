import { FastifyInstance } from "fastify";
import { scanXpub } from "@btc-platform/recovery";
import { AddressKind } from "@btc-platform/tx-engine";
import { config } from "../config";

/**
 * IMPORTANT: this endpoint accepts ONLY an xpub. Seed phrases must never leave
 * the browser. If a user wants to scan from a mnemonic, they should derive the
 * xpub locally and pass that here, OR run the recovery module client-side.
 */
export async function recoveryRoutes(app: FastifyInstance) {
  app.post("/api/recovery/scan", async (req, reply) => {
    const body = req.body as {
      xpub?: string;
      kind?: AddressKind;
      account?: number;
      gapLimit?: number;
    };
    if (!body?.xpub || typeof body.xpub !== "string") {
      return reply.code(400).send({ error: "xpub required" });
    }
    const kind: AddressKind = body.kind ?? "p2wpkh";
    if (!["legacy", "p2sh-p2wpkh", "p2wpkh", "p2tr"].includes(kind)) {
      return reply.code(400).send({ error: "invalid kind" });
    }
    try {
      const result = await scanXpub(body.xpub, kind, body.account ?? 0, {
        baseUrl: config.esploraApi,
        gapLimit: body.gapLimit ?? 20,
        network: "mainnet",
      });
      return result;
    } catch (err) {
      return reply.code(400).send({ error: String((err as Error).message) });
    }
  });
}
