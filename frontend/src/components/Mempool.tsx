"use client";

import { useEffect, useState } from "react";
import { api, type MempoolBlock, type MempoolStats } from "@/lib/api";
import { fmtSats } from "@/lib/format";

export function MempoolView() {
  const [stats, setStats] = useState<MempoolStats | null>(null);
  const [blocks, setBlocks] = useState<MempoolBlock[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [s, b] = await Promise.all([api.mempool().catch(() => null), api.mempoolBlocks().catch(() => [])]);
      if (!cancelled) {
        setStats(s);
        setBlocks(b);
      }
    }
    load();
    const t = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="card p-5 lg:col-span-4">
        <h3 className="text-sm font-semibold mb-3">Mempool snapshot</h3>
        {stats ? (
          <dl className="space-y-2 text-sm">
            <Row k="Transactions" v={stats.count.toLocaleString()} />
            <Row k="Virtual size" v={`${(stats.vsize / 1_000_000).toFixed(2)} MvB`} />
            <Row k="Total fees" v={fmtSats(stats.total_fee)} />
            <Row k="Avg fee" v={`${(stats.total_fee / Math.max(1, stats.vsize)).toFixed(2)} sat/vB`} />
          </dl>
        ) : <p className="text-muted">Loading mainnet mempool…</p>}
      </div>

      <div className="card p-5 lg:col-span-8">
        <h3 className="text-sm font-semibold mb-3">Projected next 8 blocks</h3>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr className="border-b border-border">
              <th className="py-2 text-left">#</th>
              <th className="py-2 text-left">Txs</th>
              <th className="py-2 text-left">VSize</th>
              <th className="py-2 text-left">Median fee</th>
              <th className="py-2 text-left">Fee range</th>
              <th className="py-2 text-left">Total fees</th>
            </tr>
          </thead>
          <tbody>
            {blocks.slice(0, 8).map((b, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="py-2 font-mono">+{i + 1}</td>
                <td className="py-2 tabular-nums">{b.nTx.toLocaleString()}</td>
                <td className="py-2 tabular-nums">{(b.blockVSize / 1000).toFixed(0)} kvB</td>
                <td className="py-2 tabular-nums text-accent">{Math.ceil(b.medianFee)} s/vB</td>
                <td className="py-2 tabular-nums text-xs text-muted">{b.feeRange?.map((f) => Math.ceil(f)).join(" / ")}</td>
                <td className="py-2 tabular-nums">{fmtSats(b.totalFees)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/60 py-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}
