"use client";

import { useEffect, useState } from "react";
import { fmtHashrate, fmtNumber, fmtTimeAgo } from "@/lib/format";

type PoolName = "braiins" | "f2pool" | "viabtc";

interface PoolAccountStats {
  pool: string;
  user: string;
  hashrate5m: number;
  hashrate1h?: number;
  hashrate24h?: number;
  workers: Array<{ name: string; hashrate5m: number; hashrate1h?: number; hashrate24h?: number; lastShareAt?: number; state: string }>;
  unpaidBalance?: number;
  totalPaid?: number;
}

interface StratumStatus {
  connected: boolean;
  subscribed: boolean;
  authorized: boolean;
  difficulty: number;
  acceptedShares: number;
  rejectedShares: number;
  uptimeSeconds: number;
  lastJob: { jobId: string; prevHash: string; difficulty: number; ntime: string; cleanJobs: boolean } | null;
  host: string | null;
  lastError: string | null;
}

const BACKEND = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL) || "";

export function MiningView() {
  const [pool, setPool] = useState<PoolName>("braiins");
  const [token, setToken] = useState("");
  const [user, setUser] = useState("");
  const [stats, setStats] = useState<PoolAccountStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [stratum, setStratum] = useState<StratumStatus | null>(null);
  const [stHost, setStHost] = useState("stratum.braiins.com");
  const [stPort, setStPort] = useState(3333);
  const [stUser, setStUser] = useState("");
  const [stPass, setStPass] = useState("x");

  useEffect(() => {
    if (!BACKEND) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`${BACKEND}/api/mining/stratum/status`);
        if (r.ok && !cancelled) setStratum((await r.json()) as StratumStatus);
      } catch { /* ignore */ }
    }
    load();
    const t = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  async function fetchPool() {
    setBusy(true);
    setErr(null);
    setStats(null);
    try {
      if (!BACKEND) throw new Error("Pool dashboards require the backend (NEXT_PUBLIC_BACKEND_URL). Self-host with docker-compose to enable.");
      const body: { token?: string; user?: string } = {};
      if (pool === "braiins" || pool === "viabtc") body.token = token;
      if (pool === "f2pool") body.user = user;
      const r = await fetch(`${BACKEND}/api/mining/pools/${pool}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `pool ${r.status}`);
      setStats(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stConnect() {
    setErr(null);
    if (!BACKEND) return setErr("Stratum requires the backend (self-host).");
    const r = await fetch(`${BACKEND}/api/mining/stratum/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: stHost, port: stPort, user: stUser, password: stPass }),
    });
    const j = await r.json();
    if (!r.ok) setErr(j?.error || `connect ${r.status}`);
  }

  async function stDisconnect() {
    if (!BACKEND) return;
    await fetch(`${BACKEND}/api/mining/stratum/disconnect`, { method: "POST" });
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-semibold">Mining is real or it doesn&apos;t exist</h3>
        <p className="text-sm text-muted mt-2">
          This dashboard does <span className="text-text">not</span> simulate hashrate. It shows what is actually happening on
          your own ASICs, connected either via:
        </p>
        <ul className="list-disc list-inside text-sm text-muted mt-2 space-y-1">
          <li>A <span className="text-text">real mining pool</span> account (Braiins / F2Pool / ViaBTC) — paste your own API token or username below.</li>
          <li>A <span className="text-text">real Stratum V1 connection</span> from this backend to your ASIC or to a public pool — you must be running the backend (self-host via docker-compose).</li>
        </ul>
        <p className="text-xs text-muted mt-2">
          Browser-based SHA-256d hashing has zero economic value vs. modern ASICs. We do not pretend otherwise.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Pool dashboard (REST)</h3>
          <Field label="Pool">
            <select className="input" value={pool} onChange={(e) => setPool(e.target.value as PoolName)}>
              <option value="braiins">Braiins Pool</option>
              <option value="f2pool">F2Pool</option>
              <option value="viabtc">ViaBTC</option>
            </select>
          </Field>
          {(pool === "braiins" || pool === "viabtc") && (
            <Field label="API token (your own)">
              <input className="input font-mono" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
            </Field>
          )}
          {pool === "f2pool" && (
            <Field label="Username">
              <input className="input" value={user} onChange={(e) => setUser(e.target.value)} />
            </Field>
          )}
          <button className="btn-primary mt-3" disabled={busy} onClick={fetchPool}>
            {busy ? "Fetching…" : "Fetch real stats"}
          </button>
          {err && <p className="mt-3 text-danger text-sm">{err}</p>}

          {stats && (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat k="Hashrate (5m)" v={fmtHashrate(stats.hashrate5m)} />
                <Stat k="Hashrate (1h)" v={stats.hashrate1h !== undefined ? fmtHashrate(stats.hashrate1h) : "—"} />
                <Stat k="Hashrate (24h)" v={stats.hashrate24h !== undefined ? fmtHashrate(stats.hashrate24h) : "—"} />
              </div>
              {stats.workers.length > 0 && (
                <table className="w-full text-sm mt-3">
                  <thead className="text-[11px] uppercase tracking-wider text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 text-left">Worker</th>
                      <th className="py-2 text-left">5m</th>
                      <th className="py-2 text-left">State</th>
                      <th className="py-2 text-left">Last share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.workers.map((w) => (
                      <tr key={w.name} className="border-b border-border/60">
                        <td className="py-2 font-mono">{w.name}</td>
                        <td className="py-2 tabular-nums">{fmtHashrate(w.hashrate5m)}</td>
                        <td className="py-2"><span className={w.state === "online" ? "text-success" : w.state === "offline" ? "text-danger" : "text-muted"}>{w.state}</span></td>
                        <td className="py-2 text-muted">{w.lastShareAt ? fmtTimeAgo(w.lastShareAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold mb-3">Stratum V1 client (backend)</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pool host"><input className="input" value={stHost} onChange={(e) => setStHost(e.target.value)} /></Field>
            <Field label="Port"><input type="number" className="input" value={stPort} onChange={(e) => setStPort(Number(e.target.value))} /></Field>
            <Field label="Worker (user.worker)"><input className="input" value={stUser} onChange={(e) => setStUser(e.target.value)} placeholder="myuser.rig01" /></Field>
            <Field label="Password"><input className="input" value={stPass} onChange={(e) => setStPass(e.target.value)} /></Field>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary" onClick={stConnect}>Connect</button>
            <button className="btn" onClick={stDisconnect}>Disconnect</button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat k="Connected" v={stratum?.connected ? "yes" : "no"} />
            <Stat k="Authorized" v={stratum?.authorized ? "yes" : "no"} />
            <Stat k="Difficulty" v={stratum?.difficulty ? fmtNumber(stratum.difficulty) : "—"} />
            <Stat k="Uptime" v={stratum?.uptimeSeconds ? `${stratum.uptimeSeconds}s` : "—"} />
            <Stat k="Accepted shares" v={stratum?.acceptedShares?.toString() ?? "0"} />
            <Stat k="Rejected shares" v={stratum?.rejectedShares?.toString() ?? "0"} />
          </div>
          {stratum?.lastJob && (
            <div className="mt-3 text-xs text-muted">
              Last job <span className="font-mono text-accent">{stratum.lastJob.jobId}</span> · ntime <span className="font-mono">{stratum.lastJob.ntime}</span> · clean: {String(stratum.lastJob.cleanJobs)}
            </div>
          )}
          {stratum?.lastError && <p className="mt-2 text-xs text-danger">last error: {stratum.lastError}</p>}
          {!BACKEND && <p className="mt-2 text-xs text-muted">Backend not configured — set NEXT_PUBLIC_BACKEND_URL and self-host the backend to enable Stratum.</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2">
      <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-border bg-panel2 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{k}</div>
      <div className="text-base font-semibold tabular-nums">{v}</div>
    </div>
  );
}
