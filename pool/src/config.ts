/**
 * Runtime configuration loaded from env vars. The pool refuses to start
 * unless POOL_PAYOUT_ADDRESS is set — we never invent an address for the
 * operator, because any block we find (however unlikely) pays out to it.
 */

export interface PoolConfig {
  stratumHost: string;
  stratumPort: number;
  /** address to receive the block subsidy + fees if we ever find a block */
  payoutAddress: string;
  /** "main" | "test" | "signet" */
  network: "main" | "test" | "signet";
  poolTag: string;
  initialDifficulty: number;
  extraNonce1Size: number;
  extraNonce2Size: number;
  bitcoindRpc: {
    url: string;
    user: string;
    password: string;
  };
  statsHttp: {
    host: string;
    port: number;
  };
}

function envOrDefault(name: string, def: string): string {
  return process.env[name] ?? def;
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

export function loadConfig(): PoolConfig {
  const payoutAddress = process.env.POOL_PAYOUT_ADDRESS;
  if (!payoutAddress) {
    throw new Error(
      "POOL_PAYOUT_ADDRESS must be set to a Bitcoin address you control on the same network as your bitcoind. The pool will pay block rewards to this address. Refusing to start without it.",
    );
  }
  const network = (process.env.BTC_NETWORK ?? "main") as "main" | "test" | "signet";
  if (!["main", "test", "signet"].includes(network)) {
    throw new Error(`BTC_NETWORK must be one of main|test|signet (got ${network})`);
  }

  const rpcUser = envOrDefault("BITCOIND_RPC_USER", "rpcuser");
  const rpcPassword = process.env.BITCOIND_RPC_PASSWORD;
  if (!rpcPassword) {
    throw new Error("BITCOIND_RPC_PASSWORD must be set. Refusing to start without RPC credentials.");
  }

  return {
    stratumHost: envOrDefault("STRATUM_HOST", "0.0.0.0"),
    stratumPort: envInt("STRATUM_PORT", 3333),
    payoutAddress,
    network,
    poolTag: envOrDefault("POOL_TAG", "opus-davi"),
    initialDifficulty: Number(envOrDefault("POOL_INITIAL_DIFFICULTY", "0.001")),
    extraNonce1Size: envInt("POOL_EXTRANONCE1_SIZE", 4),
    extraNonce2Size: envInt("POOL_EXTRANONCE2_SIZE", 4),
    bitcoindRpc: {
      url: envOrDefault("BITCOIND_RPC_URL", "http://127.0.0.1:8332"),
      user: rpcUser,
      password: rpcPassword,
    },
    statsHttp: {
      host: envOrDefault("POOL_STATS_HOST", "127.0.0.1"),
      port: envInt("POOL_STATS_PORT", 3334),
    },
  };
}
