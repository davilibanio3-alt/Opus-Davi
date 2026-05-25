/**
 * Read-only public Bitcoin Mainnet data, sourced directly from mempool.space.
 * The frontend can talk to its own backend (which proxies the same calls)
 * by setting NEXT_PUBLIC_BACKEND_URL — useful when you self-host. By default
 * the static build calls mempool.space directly so the demo works on GH Pages
 * without any server.
 */
const MEMPOOL_API =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEMPOOL_API) || "https://mempool.space/api";

const BACKEND =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL) || "";

function pickBase(path: string): string {
  // If a backend is configured AND the path is one we expose, prefer it.
  if (BACKEND && path.startsWith("/api/")) return BACKEND;
  // Otherwise, hit mempool.space directly.
  return MEMPOOL_API;
}

async function get<T>(path: string): Promise<T> {
  const base = pickBase(path);
  const url = base === MEMPOOL_API ? `${MEMPOOL_API}${path.replace(/^\/api/, "")}` : `${base}${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return (await r.json()) as T;
}

async function getText(path: string): Promise<string> {
  const base = pickBase(path);
  const url = base === MEMPOOL_API ? `${MEMPOOL_API}${path.replace(/^\/api/, "")}` : `${base}${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return (await r.text()).trim();
}

export interface BlockExtended {
  id: string;
  height: number;
  version: number;
  timestamp: number;
  bits: number;
  nonce: number;
  difficulty: number;
  merkle_root: string;
  tx_count: number;
  size: number;
  weight: number;
  previousblockhash: string;
  extras?: {
    pool?: { id: number; name: string; slug: string };
    totalFees?: number;
    medianFee?: number;
    feeRange?: number[];
    reward?: number;
    avgFee?: number;
    avgFeeRate?: number;
  };
}

export interface MempoolStats {
  count: number;
  vsize: number;
  total_fee: number;
  fee_histogram: [number, number][];
}

export interface FeeRates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export interface MempoolBlock {
  blockSize: number;
  blockVSize: number;
  nTx: number;
  totalFees: number;
  medianFee: number;
  feeRange: number[];
}

export interface DifficultyAdjustment {
  progressPercent: number;
  difficultyChange: number;
  estimatedRetargetDate: number;
  remainingBlocks: number;
  remainingTime: number;
  previousRetarget: number;
  nextRetargetHeight: number;
  timeAvg: number;
  timeOffset: number;
}

export interface PriceTicker {
  time: number;
  USD: number;
  EUR: number;
  GBP: number;
  CAD: number;
  CHF: number;
  AUD: number;
  JPY: number;
}

export const api = {
  tipHeight: () => getText("/api/blocks/tip/height").then((s) => Number(s)),
  recentBlocks: () => get<BlockExtended[]>("/api/v1/blocks"),
  block: (hash: string) => get<BlockExtended>(`/api/block/${hash}`),
  blockTxs: (hash: string) => get<unknown[]>(`/api/block/${hash}/txs`),
  tx: (txid: string) => get<unknown>(`/api/tx/${txid}`),
  address: (addr: string) => get<unknown>(`/api/address/${addr}`),
  addressTxs: (addr: string) => get<unknown[]>(`/api/address/${addr}/txs`),
  addressUtxos: (addr: string) =>
    get<Array<{ txid: string; vout: number; value: number; status: { confirmed: boolean } }>>(
      `/api/address/${addr}/utxo`,
    ),
  mempool: () => get<MempoolStats>("/api/mempool"),
  mempoolBlocks: () => get<MempoolBlock[]>("/api/v1/fees/mempool-blocks"),
  fees: () => get<FeeRates>("/api/v1/fees/recommended"),
  difficulty: () => get<DifficultyAdjustment>("/api/v1/difficulty-adjustment"),
  prices: () => get<PriceTicker>("/api/v1/prices"),
  hashrate: () => get<{ hashrates: Array<{ timestamp: number; avgHashrate: number }> }>("/api/v1/mining/hashrate/1y"),
  pools: () => get<{ pools: Array<{ poolId: number; name: string; blockCount: number; rank: number; slug: string }> }>("/api/v1/mining/pools/1w"),
  broadcastTx: async (rawHex: string): Promise<string> => {
    const url = BACKEND ? `${BACKEND}/api/tx/broadcast` : `${MEMPOOL_API}/tx`;
    if (BACKEND) {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawHex }),
      });
      const j = (await r.json()) as { txid?: string; error?: string };
      if (!r.ok || j.error) throw new Error(j.error || `broadcast ${r.status}`);
      return j.txid!;
    }
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: rawHex,
    });
    const text = (await r.text()).trim();
    if (!r.ok) throw new Error(`broadcast ${r.status}: ${text}`);
    return text;
  },
};

export const config = {
  MEMPOOL_API,
  BACKEND,
  WS_URL:
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEMPOOL_WS) ||
    "wss://mempool.space/api/v1/ws",
};
