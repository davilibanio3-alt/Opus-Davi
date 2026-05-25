"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtSats, trunc } from "@/lib/format";
import type { ConnectedWallet } from "@/lib/wallet";

interface AddrStats {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
}

interface Utxo { txid: string; vout: number; value: number; status: { confirmed: boolean } }

export function WalletView() {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [stats, setStats] = useState<AddrStats | null>(null);
  const [utxos, setUtxos] = useState<Utxo[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("wallet");
      if (raw) setWallet(JSON.parse(raw));
    } catch { /* ignore */ }
    const onConn = (e: Event) => setWallet((e as CustomEvent<ConnectedWallet>).detail);
    const onDisc = () => { setWallet(null); setStats(null); setUtxos([]); };
    window.addEventListener("wallet:connected", onConn as EventListener);
    window.addEventListener("wallet:disconnected", onDisc);
    return () => {
      window.removeEventListener("wallet:connected", onConn as EventListener);
      window.removeEventListener("wallet:disconnected", onDisc);
    };
  }, []);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    async function load() {
      if (!wallet) return;
      try {
        const [s, u] = await Promise.all([api.address(wallet.address), api.addressUtxos(wallet.address)]);
        if (!cancelled) {
          setStats(s as AddrStats);
          setUtxos(u);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    }
    load();
    const t = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(t); };
  }, [wallet]);

  if (!wallet) {
    return (
      <div className="card p-6">
        <h3 className="font-semibold mb-2">No wallet connected</h3>
        <p className="text-sm text-muted">
          Click <span className="text-accent">Connect Wallet</span> in the header. Supported:
          Xverse, Unisat, Leather. Hardware wallets (Ledger / Trezor) can be used via the Send / PSBT tab.
        </p>
      </div>
    );
  }

  const balance = stats
    ? stats.chain_stats.funded_txo_sum - stats.chain_stats.spent_txo_sum
      + stats.mempool_stats.funded_txo_sum - stats.mempool_stats.spent_txo_sum
    : null;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Connected wallet</div>
            <div className="text-lg font-semibold">{wallet.kind}</div>
            <div className="font-mono text-sm text-accent">{wallet.address}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted">Balance</div>
            <div className="text-2xl font-semibold tabular-nums">{balance !== null ? fmtSats(balance) : "…"}</div>
          </div>
        </div>
        {err && <p className="mt-3 text-danger text-sm">{err}</p>}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-3">UTXOs ({utxos.length})</h3>
        {utxos.length === 0 ? (
          <p className="text-muted text-sm">No UTXOs.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="py-2 text-left">Outpoint</th>
                <th className="py-2 text-left">Value</th>
                <th className="py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {utxos.map((u) => (
                <tr key={`${u.txid}:${u.vout}`} className="border-b border-border/60">
                  <td className="py-2 font-mono text-xs text-accent">{trunc(u.txid, 10, 8)}:{u.vout}</td>
                  <td className="py-2 tabular-nums">{fmtSats(u.value)}</td>
                  <td className="py-2 text-xs">{u.status.confirmed ? <span className="text-success">confirmed</span> : <span className="text-info">pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
