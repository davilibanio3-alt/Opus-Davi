"use client";

import { useEffect, useState } from "react";
import { api, type BlockExtended } from "@/lib/api";
import { fmtSats, fmtTimeAgo, trunc } from "@/lib/format";

export function BlocksView({ onSelectBlock }: { onSelectBlock: (hash: string) => void }) {
  const [blocks, setBlocks] = useState<BlockExtended[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const b = await api.recentBlocks();
        if (!cancelled) setBlocks(b);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    }
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (err) return <div className="card p-6 text-danger">{err}</div>;

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold mb-3">Recent blocks · Bitcoin Mainnet</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr className="border-b border-border">
              <th className="py-2 text-left">Height</th>
              <th className="py-2 text-left">Hash</th>
              <th className="py-2 text-left">Pool</th>
              <th className="py-2 text-left">Txs</th>
              <th className="py-2 text-left">Size</th>
              <th className="py-2 text-left">Weight</th>
              <th className="py-2 text-left">Reward</th>
              <th className="py-2 text-left">Age</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.id} onClick={() => onSelectBlock(b.id)} className="border-b border-border/60 hover:bg-panel2/60 cursor-pointer">
                <td className="py-2 font-mono">{b.height.toLocaleString()}</td>
                <td className="py-2 font-mono text-xs text-accent">{trunc(b.id, 10, 8)}</td>
                <td className="py-2 text-muted">{b.extras?.pool?.name ?? "—"}</td>
                <td className="py-2 tabular-nums">{b.tx_count.toLocaleString()}</td>
                <td className="py-2 tabular-nums">{(b.size / 1024).toFixed(1)} KB</td>
                <td className="py-2 tabular-nums">{(b.weight / 4 / 1000).toFixed(1)} kWU</td>
                <td className="py-2 tabular-nums">{b.extras?.reward ? fmtSats(b.extras.reward) : "—"}</td>
                <td className="py-2 text-muted">{fmtTimeAgo(b.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
