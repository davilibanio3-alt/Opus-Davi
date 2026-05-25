"use client";

import { useEffect, useState } from "react";
import { api, type BlockExtended, type FeeRates, type MempoolStats, type DifficultyAdjustment, type PriceTicker, type MempoolBlock } from "@/lib/api";
import { fmtHashrate, fmtNumber, fmtSats, fmtTimeAgo, fmtUSD, trunc } from "@/lib/format";

interface Data {
  height: number | null;
  blocks: BlockExtended[];
  mempool: MempoolStats | null;
  fees: FeeRates | null;
  difficulty: DifficultyAdjustment | null;
  price: PriceTicker | null;
  mempoolBlocks: MempoolBlock[];
  hashrate: number | null;
}

export function Dashboard({ onSelectBlock }: { onSelectBlock: (hash: string) => void }) {
  const [d, setD] = useState<Data>({
    height: null,
    blocks: [],
    mempool: null,
    fees: null,
    difficulty: null,
    price: null,
    mempoolBlocks: [],
    hashrate: null,
  });
  const [err, setErr] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [height, blocks, mempool, fees, difficulty, price, mempoolBlocks, hr] = await Promise.all([
          api.tipHeight().catch(() => null),
          api.recentBlocks().catch(() => []),
          api.mempool().catch(() => null),
          api.fees().catch(() => null),
          api.difficulty().catch(() => null),
          api.prices().catch(() => null),
          api.mempoolBlocks().catch(() => []),
          api.hashrate().then((r) => r.hashrates?.at(-1)?.avgHashrate ?? null).catch(() => null),
        ]);
        if (cancelled) return;
        setD({ height, blocks, mempool, fees, difficulty, price, mempoolBlocks, hashrate: hr });
        setPulse((p) => p + 1);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (err) {
    return <div className="card p-6 text-danger">Error loading mainnet data: {err}</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Top stats row */}
      <StatCard label="Tip height" value={d.height !== null ? d.height.toLocaleString() : "…"} className="lg:col-span-3" pulse={pulse} />
      <StatCard
        label="BTC / USD"
        value={d.price ? fmtUSD(d.price.USD) : "…"}
        sub={d.price ? new Date(d.price.time * 1000).toUTCString() : ""}
        className="lg:col-span-3"
        pulse={pulse}
      />
      <StatCard
        label="Network hashrate"
        value={d.hashrate ? fmtHashrate(d.hashrate) : "…"}
        sub="7-day average"
        className="lg:col-span-3"
        pulse={pulse}
      />
      <StatCard
        label="Next difficulty"
        value={d.difficulty ? `${d.difficulty.difficultyChange >= 0 ? "+" : ""}${fmtNumber(d.difficulty.difficultyChange, 2)}%` : "…"}
        sub={d.difficulty ? `in ~${fmtNumber(d.difficulty.remainingBlocks)} blocks` : ""}
        className="lg:col-span-3"
        pulse={pulse}
      />

      {/* Fees */}
      <div className="card p-5 lg:col-span-4">
        <h3 className="text-sm font-semibold mb-3">Recommended fees (sat/vB)</h3>
        {d.fees ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <FeeBox label="Fast" value={d.fees.fastestFee} tone="accent" />
            <FeeBox label="½h" value={d.fees.halfHourFee} tone="text" />
            <FeeBox label="1h" value={d.fees.hourFee} tone="muted" />
            <FeeBox label="Econ." value={d.fees.economyFee} tone="info" />
            <FeeBox label="Min." value={d.fees.minimumFee} tone="muted" />
            <FeeBox label="Mempool" value={d.mempool ? d.mempool.count.toLocaleString() : "—"} tone="text" suffix="tx" />
          </div>
        ) : <Skel />}
      </div>

      {/* Mempool depth */}
      <div className="card p-5 lg:col-span-8">
        <h3 className="text-sm font-semibold mb-3">Next blocks (mempool depth)</h3>
        {d.mempoolBlocks.length > 0 ? (
          <div className="flex items-end gap-2 h-32">
            {d.mempoolBlocks.slice(0, 8).map((b, i) => {
              const maxVsize = Math.max(...d.mempoolBlocks.map((x) => x.blockVSize));
              const h = Math.max(8, Math.round((b.blockVSize / maxVsize) * 100));
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="depth-block w-full rounded-t-md" style={{ height: `${h}%` }} title={`${b.nTx} txs · ${b.blockVSize.toLocaleString()} vB`} />
                  <div className="text-[10px] text-muted whitespace-nowrap">~{Math.ceil(b.medianFee)} s/vB</div>
                  <div className="text-[10px] text-muted whitespace-nowrap">{b.nTx} tx</div>
                </div>
              );
            })}
          </div>
        ) : <Skel />}
      </div>

      {/* Recent blocks */}
      <div className="card p-5 lg:col-span-12">
        <h3 className="text-sm font-semibold mb-3">Recent blocks (Mainnet)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="py-2 text-left">Height</th>
                <th className="py-2 text-left">Pool</th>
                <th className="py-2 text-left">Txs</th>
                <th className="py-2 text-left">Size</th>
                <th className="py-2 text-left">Median fee</th>
                <th className="py-2 text-left">Reward</th>
                <th className="py-2 text-left">Hash</th>
                <th className="py-2 text-left">Age</th>
              </tr>
            </thead>
            <tbody>
              {d.blocks.slice(0, 12).map((b) => (
                <tr
                  key={b.id}
                  onClick={() => onSelectBlock(b.id)}
                  className="border-b border-border/60 hover:bg-panel2/60 cursor-pointer"
                >
                  <td className="py-2 font-mono">{b.height.toLocaleString()}</td>
                  <td className="py-2 text-muted">{b.extras?.pool?.name ?? "—"}</td>
                  <td className="py-2 tabular-nums">{b.tx_count.toLocaleString()}</td>
                  <td className="py-2 tabular-nums">{(b.size / 1024).toFixed(1)} KB</td>
                  <td className="py-2 tabular-nums">{b.extras?.medianFee ? `${Math.ceil(b.extras.medianFee)} s/vB` : "—"}</td>
                  <td className="py-2 tabular-nums">{b.extras?.reward ? fmtSats(b.extras.reward) : "—"}</td>
                  <td className="py-2 font-mono text-xs text-accent">{trunc(b.id, 8, 6)}</td>
                  <td className="py-2 text-muted">{fmtTimeAgo(b.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-[11px] text-muted">
          Source: live Bitcoin Mainnet via mempool.space. Click a row to open the block.
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, className, pulse }: { label: string; value: string; sub?: string; className?: string; pulse: number }) {
  return (
    <div className={`card p-5 ${className ?? ""}`}>
      <div className="stat-label">{label}</div>
      <div key={pulse} className="stat-value text-text mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

function FeeBox({ label, value, tone, suffix }: { label: string; value: number | string; tone: string; suffix?: string }) {
  const color =
    tone === "accent" ? "text-accent" :
    tone === "info" ? "text-info" :
    tone === "muted" ? "text-muted" :
    "text-text";
  return (
    <div className="rounded-md border border-border bg-panel2 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}{suffix ? <span className="text-xs text-muted ml-1">{suffix}</span> : null}</div>
    </div>
  );
}

function Skel() {
  return <div className="h-24 animate-pulse rounded-md bg-panel2" />;
}
