import { request } from "undici";
import { config } from "./config";

/**
 * Thin upstream client for Bitcoin Mainnet data. Order of preference:
 *   1. Self-hosted Bitcoin Core RPC (if BITCOIN_RPC_URL is set)
 *   2. mempool.space (rich endpoints, includes /v1/* extras)
 *   3. Esplora (blockstream.info)
 *
 * For the MVP we proxy mempool.space directly because it already exposes
 * everything the dashboard needs.
 */

export async function mempoolGet<T>(path: string): Promise<T> {
  const url = `${config.mempoolApi}${path}`;
  const res = await request(url);
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`mempool ${res.statusCode}: ${text}`);
  }
  return (await res.body.json()) as T;
}

export async function mempoolGetText(path: string): Promise<string> {
  const url = `${config.mempoolApi}${path}`;
  const res = await request(url);
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`mempool ${res.statusCode}: ${text}`);
  }
  return await res.body.text();
}

export async function esploraGet<T>(path: string): Promise<T> {
  const url = `${config.esploraApi}${path}`;
  const res = await request(url);
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`esplora ${res.statusCode}: ${text}`);
  }
  return (await res.body.json()) as T;
}

interface RpcResp<T> {
  result: T;
  error: { code: number; message: string } | null;
  id: number | string;
}

export async function bitcoinRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  if (!config.bitcoinRpcUrl) {
    throw new Error("BITCOIN_RPC_URL not configured");
  }
  const auth = Buffer.from(`${config.bitcoinRpcUser}:${config.bitcoinRpcPassword}`).toString("base64");
  const res = await request(config.bitcoinRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({ jsonrpc: "1.0", id: "btc-platform", method, params }),
  });
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`bitcoin rpc ${res.statusCode}: ${text}`);
  }
  const j = (await res.body.json()) as RpcResp<T>;
  if (j.error) throw new Error(`bitcoin rpc ${j.error.code}: ${j.error.message}`);
  return j.result;
}
