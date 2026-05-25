import "dotenv/config";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback === undefined) throw new Error(`missing env ${name}`);
    return fallback;
  }
  return v;
}

export const config = {
  host: env("HOST", "0.0.0.0"),
  port: Number(env("PORT", "8787")),
  nodeEnv: env("NODE_ENV", "development"),
  corsOrigins: env("CORS_ORIGINS", "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  mempoolApi: env("MEMPOOL_SPACE_API", "https://mempool.space/api"),
  esploraApi: env("ESPLORA_API", "https://blockstream.info/api"),
  bitcoinRpcUrl: process.env.BITCOIN_RPC_URL || "",
  bitcoinRpcUser: process.env.BITCOIN_RPC_USER || "",
  bitcoinRpcPassword: process.env.BITCOIN_RPC_PASSWORD || "",
  jwtSecret: env("JWT_SECRET", "dev-only-change-me"),
  stratum: {
    host: env("STRATUM_HOST", "stratum.braiins.com"),
    port: Number(env("STRATUM_PORT", "3333")),
    user: process.env.STRATUM_USER || "",
    password: process.env.STRATUM_PASSWORD || "x",
  },
};

export type AppConfig = typeof config;
