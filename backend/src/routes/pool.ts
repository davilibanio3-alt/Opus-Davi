/**
 * Bridge between the in-cluster pool process and the frontend.
 *
 * The pool exposes a tiny read-only HTTP endpoint (`GET /stats`) on the
 * pool-stats port. We cache its last successful response for a few seconds
 * and serve it on `/api/pool/stats`, plus push every fresh snapshot to any
 * WebSocket client subscribed to `/ws/pool`.
 *
 * If POOL_STATS_URL is not set or the pool is unreachable, we still respond
 * to clients — with `{ connected: false }` — instead of returning 500s. The
 * frontend renders an honest "pool not running" state in that case.
 */

import type { FastifyInstance } from "fastify";
import { request } from "undici";
import { config } from "../config";

interface PoolStatsResponse {
  connected: boolean;
  fetchedAt: number;
  url: string;
  /** raw snapshot proxied from the pool */
  snapshot?: unknown;
  error?: string;
}

let cached: PoolStatsResponse = {
  connected: false,
  fetchedAt: 0,
  url: config.poolStatsUrl,
};
let lastFetch = 0;
const CACHE_MS = 2000;

async function fetchPoolStats(): Promise<PoolStatsResponse> {
  const now = Date.now();
  if (now - lastFetch < CACHE_MS) return cached;
  lastFetch = now;

  if (!config.poolStatsUrl) {
    cached = { connected: false, fetchedAt: now, url: "", error: "POOL_STATS_URL not set" };
    return cached;
  }
  try {
    const res = await request(config.poolStatsUrl, {
      method: "GET",
      headersTimeout: 1500,
      bodyTimeout: 1500,
    });
    if (res.statusCode !== 200) {
      cached = {
        connected: false,
        fetchedAt: now,
        url: config.poolStatsUrl,
        error: `pool responded ${res.statusCode}`,
      };
      return cached;
    }
    const snapshot = (await res.body.json()) as unknown;
    cached = { connected: true, fetchedAt: now, url: config.poolStatsUrl, snapshot };
    return cached;
  } catch (e) {
    cached = {
      connected: false,
      fetchedAt: now,
      url: config.poolStatsUrl,
      error: (e as Error).message,
    };
    return cached;
  }
}

export async function poolRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/pool/stats", async () => {
    return fetchPoolStats();
  });

  app.get("/api/pool/health", async () => {
    const s = await fetchPoolStats();
    return { ok: s.connected, fetchedAt: s.fetchedAt, error: s.error };
  });

  app.get("/api/pool/live", { websocket: true }, (socket: unknown) => {
    const s = socket as {
      send: (data: string) => void;
      on: (event: string, cb: () => void) => void;
    };
    let stopped = false;
    const push = async (): Promise<void> => {
      if (stopped) return;
      const snap = await fetchPoolStats();
      try {
        s.send(JSON.stringify({ type: "pool-stats", ...snap }));
      } catch {
        // socket may have closed between fetch + send; ignore
      }
    };
    void push();
    const timer = setInterval(() => {
      void push();
    }, 2000);
    s.on("close", () => {
      stopped = true;
      clearInterval(timer);
    });
  });
}
