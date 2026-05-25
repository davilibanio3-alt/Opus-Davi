"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { fmtSats, fmtTimeAgo, trunc } from "@/lib/format";

type Result =
  | { kind: "tx"; data: TxData }
  | { kind: "address"; data: AddressData }
  | { kind: "block"; data: BlockData }
  | { kind: "height"; data: BlockData };

interface TxData {
  txid: string;
  size: number;
  vsize: number;
  weight: number;
  fee: number;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vin: Array<{ prevout?: { value?: number; scriptpubkey_address?: string } }>;
  vout: Array<{ value: number; scriptpubkey_address?: string }>;
}

interface AddressData {
  address: string;
  chain_stats: { funded_txo_count: number; funded_txo_sum: number; spent_txo_count: number; spent_txo_sum: number; tx_count: number };
  mempool_stats: { funded_txo_count: number; funded_txo_sum: number; spent_txo_count: number; spent_txo_sum: number; tx_count: number };
}

interface BlockData {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
  size: number;
  weight: number;
}

export function SearchView() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function go(query: string) {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const v = query.trim();
      if (/^[0-9a-fA-F]{64}$/.test(v)) {
        // could be tx or block hash. try block first (cheap), fall back to tx.
        try {
          const block = (await api.block(v)) as unknown as BlockData;
          setResult({ kind: "block", data: block });
          return;
        } catch {
          /* try tx */
        }
        const tx = (await api.tx(v)) as TxData;
        setResult({ kind: "tx", data: tx });
        return;
      }
      if (/^\d+$/.test(v)) {
        const r = await fetch(`https://mempool.space/api/block-height/${v}`);
        if (r.ok) {
          const hash = (await r.text()).trim();
          const block = (await api.block(hash)) as unknown as BlockData;
          setResult({ kind: "height", data: block });
          return;
        }
      }
      // assume address
      const addr = (await api.address(v)) as AddressData;
      setResult({ kind: "address", data: addr });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-3">Global search · Mainnet</h3>
        <form
          onSubmit={(e) => { e.preventDefault(); go(q); }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input flex-1"
            placeholder="txid, block hash, block height or BTC address (bc1…, 1…, 3…, bc1p…)"
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={loading || !q}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        {err && <p className="mt-3 text-danger text-sm">{err}</p>}
      </div>

      {result?.kind === "tx" && <TxResult d={result.data} />}
      {(result?.kind === "block" || result?.kind === "height") && <BlockResult d={result.data} />}
      {result?.kind === "address" && <AddressResult d={result.data} />}
    </div>
  );
}

function TxResult({ d }: { d: TxData }) {
  return (
    <div className="card p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Transaction</h4>
        <span className={`text-xs rounded-full px-2 py-0.5 ${d.status.confirmed ? "bg-success/15 text-success" : "bg-info/15 text-info"}`}>
          {d.status.confirmed ? `confirmed @ ${d.status.block_height}` : "in mempool"}
        </span>
      </div>
      <p className="font-mono text-xs break-all text-accent">{d.txid}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <Stat k="Fee" v={fmtSats(d.fee)} />
        <Stat k="vSize" v={`${d.vsize.toLocaleString()} vB`} />
        <Stat k="Size" v={`${d.size.toLocaleString()} B`} />
        <Stat k="Fee rate" v={`${(d.fee / d.vsize).toFixed(2)} s/vB`} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <h5 className="text-xs uppercase tracking-wider text-muted mb-2">Inputs ({d.vin.length})</h5>
          <ul className="space-y-1 text-xs font-mono">
            {d.vin.slice(0, 10).map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span className="text-muted truncate">{i.prevout?.scriptpubkey_address ?? "coinbase"}</span>
                <span className="text-text">{fmtSats(i.prevout?.value ?? 0)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="text-xs uppercase tracking-wider text-muted mb-2">Outputs ({d.vout.length})</h5>
          <ul className="space-y-1 text-xs font-mono">
            {d.vout.slice(0, 10).map((o, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span className="text-muted truncate">{o.scriptpubkey_address ?? "(non-standard)"}</span>
                <span className="text-text">{fmtSats(o.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function BlockResult({ d }: { d: BlockData }) {
  return (
    <div className="card p-5 space-y-3">
      <h4 className="font-semibold">Block #{d.height.toLocaleString()}</h4>
      <p className="font-mono text-xs break-all text-accent">{d.id}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <Stat k="Txs" v={d.tx_count.toLocaleString()} />
        <Stat k="Size" v={`${(d.size / 1024).toFixed(1)} KB`} />
        <Stat k="Weight" v={`${(d.weight / 1000).toFixed(1)} kWU`} />
        <Stat k="Age" v={fmtTimeAgo(d.timestamp)} />
      </div>
    </div>
  );
}

function AddressResult({ d }: { d: AddressData }) {
  const balance = d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum + d.mempool_stats.funded_txo_sum - d.mempool_stats.spent_txo_sum;
  return (
    <div className="card p-5 space-y-3">
      <h4 className="font-semibold">Address</h4>
      <p className="font-mono text-sm break-all text-accent">{d.address}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
        <Stat k="Balance" v={fmtSats(balance)} />
        <Stat k="Total received" v={fmtSats(d.chain_stats.funded_txo_sum)} />
        <Stat k="Total spent" v={fmtSats(d.chain_stats.spent_txo_sum)} />
        <Stat k="Tx count" v={(d.chain_stats.tx_count + d.mempool_stats.tx_count).toLocaleString()} />
      </div>
      <p className="text-xs text-muted">{trunc(d.address, 12, 12)} · Mainnet</p>
    </div>
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
