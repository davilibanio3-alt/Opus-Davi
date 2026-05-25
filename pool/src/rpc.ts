/**
 * Minimal Bitcoin Core JSON-RPC client.
 *
 * We avoid pulling a full RPC library; bitcoind only needs basic auth + a
 * single POST endpoint with `{method, params, id}` JSON-RPC 2.0 bodies. This
 * keeps the pool dependency-light and easy to audit.
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export interface RpcConfig {
  url: string;
  user: string;
  password: string;
  timeoutMs?: number;
}

export class BitcoindRpc {
  private readonly cfg: RpcConfig;
  private idCounter = 0;

  constructor(cfg: RpcConfig) {
    this.cfg = cfg;
  }

  async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const id = ++this.idCounter;
    const body = JSON.stringify({ jsonrpc: "1.0", id, method, params });
    const parsed = new URL(this.cfg.url);
    const transport = parsed.protocol === "https:" ? https : http;
    const auth = Buffer.from(`${this.cfg.user}:${this.cfg.password}`).toString("base64");

    return await new Promise<T>((resolve, reject) => {
      const req = transport.request(
        {
          method: "POST",
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: parsed.pathname || "/",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Authorization: `Basic ${auth}`,
          },
          timeout: this.cfg.timeoutMs ?? 30_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            try {
              const parsedBody = JSON.parse(raw) as { result: T; error: { code: number; message: string } | null };
              if (parsedBody.error) {
                reject(new Error(`bitcoind rpc ${method}: ${parsedBody.error.message} (${parsedBody.error.code})`));
                return;
              }
              resolve(parsedBody.result);
            } catch (e) {
              reject(new Error(`bitcoind rpc ${method}: invalid JSON (status ${res.statusCode}): ${raw.slice(0, 200)}`));
            }
          });
        },
      );
      req.on("error", (e) => reject(e));
      req.on("timeout", () => req.destroy(new Error(`bitcoind rpc ${method}: timeout`)));
      req.write(body);
      req.end();
    });
  }

  async getBestBlockHash(): Promise<string> {
    return this.call<string>("getbestblockhash");
  }

  async getBlockTemplate(): Promise<unknown> {
    return this.call("getblocktemplate", [{ rules: ["segwit"] }]);
  }

  async submitBlock(serializedHex: string): Promise<string | null> {
    return this.call<string | null>("submitblock", [serializedHex]);
  }

  async validateAddress(address: string): Promise<{ isvalid: boolean; address?: string }> {
    return this.call<{ isvalid: boolean; address?: string }>("validateaddress", [address]);
  }

  async getNetworkInfo(): Promise<{ version: number; subversion: string }> {
    return this.call<{ version: number; subversion: string }>("getnetworkinfo");
  }
}
