/**
 * Pool-wide stats — connected miners, accepted/rejected shares, rolling
 * hashrate, blocks found. Read by the backend over the unix socket / HTTP
 * exposed in `index.ts`, which forwards the data over WebSocket to the
 * frontend "Pool" tab.
 *
 * Honest accounting only — every number you see on the dashboard maps to
 * cryptographically verified shares submitted by real miners over Stratum.
 */

import type { StratumSession } from "./types.js";

export interface MinerStats {
  sessionId: string;
  worker: string | null;
  remote: string;
  difficulty: number;
  sharesAccepted: number;
  sharesRejected: number;
  /** Effective hashrate (H/s) over the last 5 minutes */
  hashrate5m: number;
  /** Effective hashrate (H/s) over the last 1 hour */
  hashrate1h: number;
  /** Unix seconds */
  connectedAt: number;
  lastShareAt: number;
}

export interface PoolStatsSnapshot {
  /** Pool hashrate aggregated across all miners (H/s, 5 min window) */
  totalHashrate5m: number;
  totalHashrate1h: number;
  /** Connected miner sessions */
  miners: MinerStats[];
  /** Block-finding history — best-effort, since this is real Mainnet most pools never find one */
  blocksFound: Array<{ height: number; hashBE: string; foundAt: number; foundBy: string }>;
  /** Current job snapshot */
  currentJob?: {
    jobId: string;
    height: number;
    networkTargetHex: string;
    nbitsLEHex: string;
    txCount: number;
    coinbaseValueSat: number;
    createdAt: number;
  };
  /** Uptime stats */
  startedAt: number;
  now: number;
}

interface ShareEvent {
  sessionId: string;
  difficulty: number;
  ts: number; // unix seconds
}

export class StatsTracker {
  private readonly recentShares: ShareEvent[] = [];
  private readonly blocks: PoolStatsSnapshot["blocksFound"] = [];
  private readonly maxAgeSec = 3600; // 1h window for hashrate
  private readonly startedAt = Math.floor(Date.now() / 1000);

  recordShare(sessionId: string, difficulty: number): void {
    const now = Math.floor(Date.now() / 1000);
    this.recentShares.push({ sessionId, difficulty, ts: now });
    this.prune(now);
  }

  recordBlock(height: number, hashBE: string, foundBy: string): void {
    this.blocks.unshift({ height, hashBE, foundAt: Math.floor(Date.now() / 1000), foundBy });
    if (this.blocks.length > 100) this.blocks.length = 100;
  }

  private prune(now: number): void {
    while (this.recentShares.length > 0 && now - this.recentShares[0].ts > this.maxAgeSec) {
      this.recentShares.shift();
    }
  }

  /** Compute hashrate for a session over `windowSec`. */
  hashrate(sessionId: string, windowSec: number): number {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - windowSec;
    let diffSum = 0;
    for (let i = this.recentShares.length - 1; i >= 0; i--) {
      const s = this.recentShares[i];
      if (s.ts < cutoff) break;
      if (s.sessionId === sessionId) diffSum += s.difficulty;
    }
    return (diffSum * 0x100000000) / windowSec;
  }

  /** Hashrate aggregated across all sessions. */
  totalHashrate(windowSec: number): number {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - windowSec;
    let diffSum = 0;
    for (let i = this.recentShares.length - 1; i >= 0; i--) {
      const s = this.recentShares[i];
      if (s.ts < cutoff) break;
      diffSum += s.difficulty;
    }
    return (diffSum * 0x100000000) / windowSec;
  }

  snapshot(sessions: Map<string, StratumSession>, currentJob: PoolStatsSnapshot["currentJob"]): PoolStatsSnapshot {
    const miners: MinerStats[] = [];
    for (const s of sessions.values()) {
      miners.push({
        sessionId: s.id,
        worker: s.worker ?? null,
        remote: s.remote,
        difficulty: s.difficulty,
        sharesAccepted: s.sharesAccepted,
        sharesRejected: s.sharesRejected,
        hashrate5m: this.hashrate(s.id, 300),
        hashrate1h: this.hashrate(s.id, 3600),
        connectedAt: s.connectedAt,
        lastShareAt: s.lastShareAt,
      });
    }
    return {
      totalHashrate5m: this.totalHashrate(300),
      totalHashrate1h: this.totalHashrate(3600),
      miners,
      blocksFound: [...this.blocks],
      currentJob,
      startedAt: this.startedAt,
      now: Math.floor(Date.now() / 1000),
    };
  }
}
