"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtSats } from "@/lib/format";
import type { ConnectedWallet } from "@/lib/wallet";
import { signAndBroadcast } from "@/lib/wallet";

interface BackendUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

export function SendView() {
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [feeRate, setFeeRate] = useState(10);
  const [psbt, setPsbt] = useState<{ psbtBase64: string; fee: number; vsize: number; change: number } | null>(null);
  const [signedHex, setSignedHex] = useState("");
  const [txid, setTxid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recommendedFees, setRecommendedFees] = useState<{ fastestFee: number; halfHourFee: number; hourFee: number } | null>(null);

  useEffect(() => {
    try { const raw = sessionStorage.getItem("wallet"); if (raw) setWallet(JSON.parse(raw)); } catch { /* ignore */ }
    const onConn = (e: Event) => setWallet((e as CustomEvent<ConnectedWallet>).detail);
    const onDisc = () => setWallet(null);
    window.addEventListener("wallet:connected", onConn as EventListener);
    window.addEventListener("wallet:disconnected", onDisc);
    api.fees().then(setRecommendedFees).catch(() => null);
    return () => {
      window.removeEventListener("wallet:connected", onConn as EventListener);
      window.removeEventListener("wallet:disconnected", onDisc);
    };
  }, []);

  async function buildPsbt() {
    setErr(null);
    setPsbt(null);
    setBusy(true);
    try {
      if (!wallet) throw new Error("Connect a wallet first");
      const amountSats = Math.floor(parseFloat(amount) * 1e8);
      if (!amountSats || amountSats < 546) throw new Error("Amount too small (dust limit 546 sats)");
      // Dynamic import keeps bitcoinjs out of the initial bundle
      const txe = await import("@btc-platform/tx-engine");
      const utxos = (await api.addressUtxos(wallet.address)) as BackendUtxo[];
      if (utxos.length === 0) throw new Error("No UTXOs on this address");
      // Fetch scriptPubKey for each
      const enriched = await Promise.all(utxos.map(async (u) => {
        const tx = (await api.tx(u.txid)) as { vout: Array<{ scriptpubkey: string }> };
        return { txid: u.txid, vout: u.vout, value: u.value, scriptPubKey: tx.vout[u.vout].scriptpubkey };
      }));
      const result = txe.buildPsbt({
        network: "mainnet",
        utxos: enriched,
        outputs: [{ address: to, value: amountSats }],
        changeAddress: wallet.address,
        feeRate,
        rbf: true,
        inputKind: "p2wpkh",
      });
      setPsbt(result);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signWithWallet() {
    setErr(null);
    setTxid(null);
    setBusy(true);
    try {
      if (!wallet || !psbt) throw new Error("Build a PSBT first");
      const id = await signAndBroadcast(wallet, psbt.psbtBase64);
      setTxid(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function broadcastRaw() {
    setErr(null);
    setTxid(null);
    setBusy(true);
    try {
      if (!signedHex.trim()) throw new Error("Paste the signed raw tx hex");
      const id = await api.broadcastTx(signedHex.trim());
      setTxid(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="font-semibold mb-3">Build PSBT · Mainnet</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Recipient address">
            <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="bc1q… / bc1p… / 1… / 3…" />
          </Field>
          <Field label="Amount (BTC)">
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0001" />
          </Field>
          <Field label={`Fee rate (sat/vB) — ${recommendedFees ? `recommended ${recommendedFees.fastestFee} / ${recommendedFees.halfHourFee} / ${recommendedFees.hourFee}` : ""}`}>
            <input type="number" min={1} className="input" value={feeRate} onChange={(e) => setFeeRate(Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !wallet} onClick={buildPsbt}>Build PSBT</button>
          {psbt && wallet?.kind === "unisat" && (
            <button className="btn" disabled={busy} onClick={signWithWallet}>Sign &amp; broadcast with Unisat</button>
          )}
        </div>
        {!wallet && <p className="mt-3 text-xs text-muted">Connect a wallet (header) to populate the change address and UTXOs.</p>}
        {err && <p className="mt-3 text-danger text-sm">{err}</p>}
      </div>

      {psbt && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">PSBT (unsigned)</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
            <Stat k="Fee" v={fmtSats(psbt.fee)} />
            <Stat k="vSize" v={`${psbt.vsize} vB`} />
            <Stat k="Change" v={fmtSats(psbt.change)} />
            <Stat k="Fee rate" v={`${(psbt.fee / psbt.vsize).toFixed(2)} s/vB`} />
          </div>
          <textarea
            readOnly
            className="input mt-3 font-mono text-xs"
            rows={5}
            value={psbt.psbtBase64}
          />
          <p className="mt-2 text-xs text-muted">
            Copy this base64 PSBT into Sparrow / Electrum / Coldcard / Trezor / Ledger to sign. Then paste the signed raw tx hex below to broadcast.
          </p>
        </div>
      )}

      <div className="card p-5">
        <h3 className="font-semibold mb-3">Broadcast signed transaction</h3>
        <textarea
          className="input font-mono text-xs"
          rows={4}
          placeholder="0200000000010… (raw hex of the signed and finalized transaction)"
          value={signedHex}
          onChange={(e) => setSignedHex(e.target.value)}
        />
        <button className="btn-primary mt-3" disabled={busy} onClick={broadcastRaw}>Broadcast to Mainnet</button>
        {txid && (
          <p className="mt-3 text-sm">
            Broadcast OK. txid:&nbsp;
            <a href={`https://mempool.space/tx/${txid}`} target="_blank" rel="noopener noreferrer" className="text-accent font-mono break-all">{txid}</a>
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
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
