/**
 * Real mining-pool REST adapters. The user supplies their OWN API key /
 * username at runtime. We forward the request, normalize the response, and
 * return real hashrate / worker / payout data.
 *
 * No fake numbers. If the pool returns nothing, we return nothing.
 */

export interface WorkerStat {
  name: string;
  hashrate5m: number; // H/s
  hashrate1h?: number;
  hashrate24h?: number;
  lastShareAt?: number; // unix seconds
  state: "online" | "offline" | "unknown";
}

export interface PoolAccountStats {
  pool: string;
  user: string;
  hashrate5m: number;
  hashrate1h?: number;
  hashrate24h?: number;
  workers: WorkerStat[];
  unpaidBalance?: number; // BTC
  totalPaid?: number; // BTC
}

/**
 * Braiins Pool (formerly Slush Pool) — public REST API.
 * https://pool.braiins.com/accounts/profile/json/btc/
 * Auth header: SlushPool-Auth-Token
 */
export async function fetchBraiins(apiToken: string): Promise<PoolAccountStats> {
  const r = await fetch("https://pool.braiins.com/accounts/profile/json/btc/", {
    headers: { "SlushPool-Auth-Token": apiToken },
  });
  if (!r.ok) throw new Error(`braiins ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as {
    btc?: {
      username: string;
      hash_rate_5m: number;
      hash_rate_60m: number;
      hash_rate_24h: number;
      workers: Record<
        string,
        {
          hash_rate_5m: number;
          hash_rate_60m: number;
          hash_rate_24h: number;
          last_share: number;
          state: string;
        }
      >;
      unconfirmed_reward: string;
      confirmed_reward: string;
    };
  };
  const btc = j.btc;
  if (!btc) throw new Error("braiins: no btc account");
  const workers: WorkerStat[] = Object.entries(btc.workers).map(([name, w]) => ({
    name,
    hashrate5m: w.hash_rate_5m,
    hashrate1h: w.hash_rate_60m,
    hashrate24h: w.hash_rate_24h,
    lastShareAt: w.last_share,
    state: w.state === "OK" ? "online" : w.state === "DEAD" ? "offline" : "unknown",
  }));
  return {
    pool: "braiins",
    user: btc.username,
    hashrate5m: btc.hash_rate_5m,
    hashrate1h: btc.hash_rate_60m,
    hashrate24h: btc.hash_rate_24h,
    workers,
    unpaidBalance: Number(btc.unconfirmed_reward),
    totalPaid: Number(btc.confirmed_reward),
  };
}

/**
 * F2Pool — public REST. Endpoint: https://api.f2pool.com/bitcoin/<user>
 * Returns { hashrate, hashrate_history, workers: [[name, hashrate, hashrate1h, hashrate24h, rejects, lastShare]] }
 */
export async function fetchF2Pool(user: string): Promise<PoolAccountStats> {
  const r = await fetch(`https://api.f2pool.com/bitcoin/${encodeURIComponent(user)}`);
  if (!r.ok) throw new Error(`f2pool ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as {
    hashrate?: number;
    hashrate_1h_average?: number;
    hashrate_24h_average?: number;
    workers?: Array<[string, number, number, number, unknown, number]>;
    balance?: number;
    paid?: number;
  };
  const workers: WorkerStat[] = (j.workers ?? []).map((w) => ({
    name: w[0],
    hashrate5m: w[1],
    hashrate1h: w[2],
    hashrate24h: w[3],
    lastShareAt: w[5],
    state: w[1] > 0 ? "online" : "offline",
  }));
  return {
    pool: "f2pool",
    user,
    hashrate5m: j.hashrate ?? 0,
    hashrate1h: j.hashrate_1h_average,
    hashrate24h: j.hashrate_24h_average,
    workers,
    unpaidBalance: j.balance,
    totalPaid: j.paid,
  };
}

/**
 * ViaBTC — public account stats endpoint.
 * https://www.viabtc.com/res/openapi/v1/hashrate?coin=BTC
 */
export async function fetchViaBTC(apiKey: string): Promise<PoolAccountStats> {
  const r = await fetch("https://www.viabtc.com/res/openapi/v1/hashrate?coin=BTC", {
    headers: { "X-API-KEY": apiKey },
  });
  if (!r.ok) throw new Error(`viabtc ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as {
    data?: {
      hashrate_10min: string;
      hashrate_1hour: string;
      hashrate_1day: string;
      reject_percent: string;
      workers_active: number;
      workers_inactive: number;
    };
  };
  const d = j.data;
  if (!d) throw new Error("viabtc: no data");
  return {
    pool: "viabtc",
    user: "self",
    hashrate5m: Number(d.hashrate_10min),
    hashrate1h: Number(d.hashrate_1hour),
    hashrate24h: Number(d.hashrate_1day),
    workers: [],
  };
}

export type PoolName = "braiins" | "f2pool" | "viabtc";

export async function fetchPool(
  pool: PoolName,
  creds: { token?: string; user?: string },
): Promise<PoolAccountStats> {
  switch (pool) {
    case "braiins":
      if (!creds.token) throw new Error("braiins requires an API token");
      return fetchBraiins(creds.token);
    case "f2pool":
      if (!creds.user) throw new Error("f2pool requires a username");
      return fetchF2Pool(creds.user);
    case "viabtc":
      if (!creds.token) throw new Error("viabtc requires an API key");
      return fetchViaBTC(creds.token);
  }
}
