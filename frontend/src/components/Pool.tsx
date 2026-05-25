"use client";

/**
 * Self-hosted pool dashboard.
 *
 * Polls `/api/pool/stats` (which the backend in turn scrapes from the pool
 * server every ~2s). Every number on this screen is computed from
 * cryptographically verified Stratum shares submitted by real miners. There
 * is no "show fake EH/s for the demo" mode — if no miner is connected, the
 * screen honestly says so.
 */

import { useEffect, useMemo, useState } from "react";
import { api, config, type PoolStatsBridge, type PoolStatsSnapshot } from "@/lib/api";
import { fmtHashrate, fmtNumber, fmtSats, fmtTimeAgo, trunc } from "@/lib/format";

const POLL_MS = 2500;

export function PoolView() {
  const [data, setData] = useState<PoolStatsBridge | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await api.poolStats();
        if (cancelled) return;
        setData(d);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        setErr((e as Error).message);
      }
    }
    void load();
    const t = setInterval(() => {
      setTick((v) => v + 1);
      void load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const snapshot = data?.snapshot;

  return (
    <section className="space-y-6">
      <PoolHeader bridge={data} err={err} />
      {!config.BACKEND && <BackendMissing />}
      {data?.connected === false && <PoolOffline bridge={data} />}
      {snapshot && <PoolStatsBody snap={snapshot} tick={tick} />}
      <Honesty />
    </section>
  );
}

function PoolHeader({ bridge, err }: { bridge: PoolStatsBridge | null; err: string | null }) {
  const ok = bridge?.connected === true;
  return (
    <div className="card p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">Mining Pool</h1>
        <p className="text-sm text-muted">
          Self-hosted Stratum V1 pool talking to your <span className="font-mono">bitcoind</span> via JSON-RPC.
          Every share displayed here was verified by SHA-256d server-side.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-danger"}`} />
        <span className="text-sm">
          {ok ? "Pool online" : "Pool offline"}
          {bridge?.url && (
            <span className="ml-2 text-muted font-mono text-xs">{bridge.url}</span>
          )}
        </span>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </div>
  );
}

function BackendMissing() {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">
        This deployment doesn&apos;t have a backend URL configured
        (<span className="font-mono">NEXT_PUBLIC_BACKEND_URL</span>). Run the
        full stack locally with <span className="font-mono">docker compose up</span> or set
        the env var to point at your self-hosted backend.
      </p>
    </div>
  );
}

function PoolOffline({ bridge }: { bridge: PoolStatsBridge }) {
  return (
    <div className="card p-5 border-danger/30">
      <p className="text-sm">
        Backend reached, but the pool process did not respond.
      </p>
      <p className="text-xs text-muted mt-2">
        Reason: <span className="font-mono">{bridge.error || "unknown"}</span>
      </p>
      <p className="text-xs text-muted mt-1">
        Make sure the <span className="font-mono">pool</span> service is running and that
        <span className="font-mono"> POOL_STATS_URL</span> on the backend points to{" "}
        <span className="font-mono">http://pool:3334/stats</span> (or the host equivalent).
      </p>
    </div>
  );
}

function PoolStatsBody({ snap, tick }: { snap: PoolStatsSnapshot; tick: number }) {
  const upTime = useMemo(() => Math.max(0, snap.now - snap.startedAt), [snap.now, snap.startedAt]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Pool hashrate (5m)" value={fmtHashrate(snap.totalHashrate5m)} />
        <Stat label="Pool hashrate (1h)" value={fmtHashrate(snap.totalHashrate1h)} />
        <Stat label="Connected miners" value={fmtNumber(snap.miners.length, 0)} />
        <Stat label="Uptime" value={fmtDuration(upTime)} />
      </div>

      <CurrentJobCard snap={snap} tick={tick} />

      <div className="card p-0">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Workers</h2>
          <span className="text-xs text-muted">live</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr className="text-left">
                <th className="px-5 py-2 font-medium">Worker</th>
                <th className="px-5 py-2 font-medium">Remote</th>
                <th className="px-5 py-2 font-medium">Hashrate (5m)</th>
                <th className="px-5 py-2 font-medium">Diff</th>
                <th className="px-5 py-2 font-medium">Shares ✓</th>
                <th className="px-5 py-2 font-medium">Shares ✗</th>
                <th className="px-5 py-2 font-medium">Last share</th>
                <th className="px-5 py-2 font-medium">Connected</th>
              </tr>
            </thead>
            <tbody>
              {snap.miners.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-muted">
                    No miners connected. Point a Stratum V1 miner at <span className="font-mono">stratum+tcp://&lt;host&gt;:3333</span>.
                  </td>
                </tr>
              ) : (
                snap.miners.map((m) => (
                  <tr key={m.sessionId} className="border-t border-border">
                    <td className="px-5 py-2 font-mono">{m.worker || "(unauthorized)"}</td>
                    <td className="px-5 py-2 font-mono text-xs">{m.remote}</td>
                    <td className="px-5 py-2">{fmtHashrate(m.hashrate5m)}</td>
                    <td className="px-5 py-2">{fmtNumber(m.difficulty, 4)}</td>
                    <td className="px-5 py-2 text-success">{m.sharesAccepted.toLocaleString()}</td>
                    <td className="px-5 py-2 text-danger">{m.sharesRejected.toLocaleString()}</td>
                    <td className="px-5 py-2 text-muted text-xs">
                      {m.lastShareAt ? fmtTimeAgo(m.lastShareAt) : "—"}
                    </td>
                    <td className="px-5 py-2 text-muted text-xs">{fmtTimeAgo(m.connectedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BlocksFoundCard snap={snap} />
    </div>
  );
}

function CurrentJobCard({ snap, tick }: { snap: PoolStatsSnapshot; tick: number }) {
  if (!snap.currentJob) {
    return (
      <div className="card p-5">
        <p className="text-sm text-muted">No active job — pool is starting up or bitcoind hasn&apos;t handed out a template yet.</p>
      </div>
    );
  }
  const j = snap.currentJob;
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Current Block Candidate</h2>
        <span className="text-xs text-muted" key={tick}>refreshed {fmtTimeAgo(j.createdAt)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Cell label="Height" value={fmtNumber(j.height, 0)} mono />
        <Cell label="Job ID" value={`#${j.jobId}`} mono />
        <Cell label="Subsidy + fees" value={fmtSats(j.coinbaseValueSat)} mono />
        <Cell label="Tx count" value={fmtNumber(j.txCount, 0)} />
      </div>
      <div className="text-xs text-muted">
        nbits LE <span className="font-mono">{j.nbitsLEHex}</span> · network target{" "}
        <span className="font-mono">0x{j.networkTargetHex.slice(0, 16)}…</span>
      </div>
    </div>
  );
}

function BlocksFoundCard({ snap }: { snap: PoolStatsSnapshot }) {
  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">Blocks found</h2>
      {snap.blocksFound.length === 0 ? (
        <p className="text-sm text-muted">
          None yet. At the hashrate this pool currently has, finding a Mainnet block is{" "}
          <span className="font-mono">astronomically unlikely</span> — the network target requires roughly{" "}
          <span className="font-mono">2<sup>76</sup></span> hashes per block. Shares are real; blocks would be a miracle.
        </p>
      ) : (
        <ul className="space-y-2">
          {snap.blocksFound.map((b) => (
            <li key={b.hashBE} className="text-sm flex flex-col">
              <span>
                <span className="text-success font-semibold">BLOCK</span> @ {fmtNumber(b.height, 0)} —{" "}
                <span className="font-mono">{trunc(b.hashBE, 12, 12)}</span>
              </span>
              <span className="text-xs text-muted">found by {b.foundBy} · {fmtTimeAgo(b.foundAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Honesty() {
  return (
    <div className="card p-5 text-xs text-muted leading-relaxed">
      <p className="font-semibold text-text mb-2">Honest hashrate disclosure</p>
      <p>
        Bitcoin Mainnet is currently at ~700 EH/s and rising. ASICs (Antminer S21 ≈ 200 TH/s, ~$3k each)
        cover the vast majority of that hashpower. A CPU running this miner produces roughly{" "}
        <span className="font-mono">1–10 MH/s</span> per core; a single GPU produces around{" "}
        <span className="font-mono">1–15 GH/s</span>. To reach <span className="font-mono">3 EH/s</span> you would need on
        the order of 15 000 modern ASICs and tens of MW of power — no software in the world produces it.
        Anything advertising large-scale hashrate from a browser or VPS without ASICs is dishonest.
      </p>
      <p className="mt-2">
        What this dashboard does is real: it shows valid shares submitted by real miners over Stratum V1,
        validated by SHA-256d on the pool, with block candidates pulled live from{" "}
        <span className="font-mono">bitcoind getblocktemplate</span>. If we ever do find a block, the reward
        is paid to the address you configured as <span className="font-mono">POOL_PAYOUT_ADDRESS</span>.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-widest text-muted">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Cell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}
