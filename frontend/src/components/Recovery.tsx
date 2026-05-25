"use client";

import { useState } from "react";
import { fmtSats, trunc } from "@/lib/format";
import type { AddressKind } from "@btc-platform/tx-engine";

export function RecoveryView() {
  const [mode, setMode] = useState<"xpub" | "mnemonic">("xpub");
  const [xpub, setXpub] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [kind, setKind] = useState<AddressKind>("p2wpkh");
  const [account, setAccount] = useState(0);
  const [gapLimit, setGapLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    kind: AddressKind;
    totalBalance: number;
    totalUtxos: number;
    addresses: Array<{ address: string; path: string; txCount: number; balance: number }>;
  }>(null);

  async function scan() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const rec = await import("@btc-platform/recovery");
      let r;
      if (mode === "xpub") {
        if (!xpub) throw new Error("Provide an xpub / ypub / zpub");
        r = await rec.scanXpub(xpub.trim(), kind, account, { gapLimit, network: "mainnet" });
      } else {
        if (!mnemonic) throw new Error("Provide your BIP39 mnemonic");
        r = await rec.scanMnemonic(mnemonic.trim(), passphrase, kind, account, { gapLimit, network: "mainnet" });
      }
      setResult({
        kind: r.kind,
        totalBalance: r.totalBalance,
        totalUtxos: r.totalUtxos,
        addresses: r.addresses.map((a) => ({ address: a.address, path: a.path, txCount: a.txCount, balance: a.balance })),
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-semibold mb-1">Authorized HD recovery</h3>
        <p className="text-xs text-muted mb-4">
          This tool scans <span className="text-text">your own</span> wallet for forgotten UTXOs across multiple derivation paths.
          The xpub / mnemonic <span className="text-accent">stays in your browser</span> — it is never sent to the backend when you pick &quot;mnemonic&quot; mode.
          Never paste keys from a wallet you don&apos;t own.
        </p>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode("xpub")} className={`tab ${mode === "xpub" ? "active" : ""}`}>xpub / descriptor</button>
          <button onClick={() => setMode("mnemonic")} className={`tab ${mode === "mnemonic" ? "active" : ""}`}>BIP39 mnemonic (local only)</button>
        </div>

        {mode === "xpub" ? (
          <Field label="Extended public key">
            <textarea className="input font-mono" rows={2} value={xpub} onChange={(e) => setXpub(e.target.value)} placeholder="xpub… / ypub… / zpub…" />
          </Field>
        ) : (
          <>
            <Field label="BIP39 mnemonic (12 / 18 / 24 words)">
              <textarea className="input font-mono" rows={2} value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} placeholder="abandon abandon abandon …" />
            </Field>
            <Field label="Passphrase (optional, BIP39 25th word)">
              <input className="input font-mono" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </Field>
          </>
        )}

        <div className="grid gap-3 md:grid-cols-3 mt-3">
          <Field label="Address kind">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AddressKind)}>
              <option value="p2wpkh">Native SegWit (bc1q… / BIP84)</option>
              <option value="p2sh-p2wpkh">Nested SegWit (3… / BIP49)</option>
              <option value="legacy">Legacy (1… / BIP44)</option>
              <option value="p2tr">Taproot (bc1p… / BIP86)</option>
            </select>
          </Field>
          <Field label="Account">
            <input type="number" className="input" value={account} onChange={(e) => setAccount(Number(e.target.value))} min={0} />
          </Field>
          <Field label="Gap limit">
            <input type="number" className="input" value={gapLimit} onChange={(e) => setGapLimit(Number(e.target.value))} min={1} max={100} />
          </Field>
        </div>

        <button className="btn-primary mt-4" disabled={busy} onClick={scan}>
          {busy ? "Scanning Mainnet…" : "Scan mainnet"}
        </button>
        {err && <p className="mt-3 text-danger text-sm">{err}</p>}
      </div>

      {result && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Result · {result.kind}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat k="Total balance" v={fmtSats(result.totalBalance)} />
            <Stat k="UTXOs" v={result.totalUtxos.toString()} />
            <Stat k="Addresses w/ activity" v={result.addresses.length.toString()} />
          </div>
          {result.addresses.length > 0 && (
            <table className="w-full text-sm mt-4">
              <thead className="text-[11px] uppercase tracking-wider text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 text-left">Path</th>
                  <th className="py-2 text-left">Address</th>
                  <th className="py-2 text-left">Tx count</th>
                  <th className="py-2 text-left">Balance</th>
                </tr>
              </thead>
              <tbody>
                {result.addresses.map((a) => (
                  <tr key={a.path + a.address} className="border-b border-border/60">
                    <td className="py-2 font-mono text-xs">{a.path}</td>
                    <td className="py-2 font-mono text-xs text-accent">{trunc(a.address, 12, 8)}</td>
                    <td className="py-2 tabular-nums">{a.txCount}</td>
                    <td className="py-2 tabular-nums">{fmtSats(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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
