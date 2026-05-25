"use client";

import { useEffect, useState } from "react";
import { connect, detectWallets, type ConnectedWallet, type WalletKind } from "@/lib/wallet";
import { trunc } from "@/lib/format";

interface Props {
  tab: string;
  onTab: (t: string) => void;
}

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "blocks", label: "Blocks" },
  { id: "mempool", label: "Mempool" },
  { id: "search", label: "Search" },
  { id: "wallet", label: "Wallet" },
  { id: "send", label: "Send / PSBT" },
  { id: "recovery", label: "Recovery" },
  { id: "mining", label: "Mining" },
];

export function Header({ tab, onTab }: Props) {
  const [available, setAvailable] = useState<Record<WalletKind, boolean>>({
    xverse: false,
    unisat: false,
    leather: false,
  });
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [menu, setMenu] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    detectWallets().then(setAvailable);
  }, []);

  async function onConnect(kind: WalletKind) {
    setErr(null);
    setMenu(false);
    try {
      const w = await connect(kind);
      setWallet(w);
      // Persist for other tabs
      try { sessionStorage.setItem("wallet", JSON.stringify(w)); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("wallet:connected", { detail: w }));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function onDisconnect() {
    setWallet(null);
    try { sessionStorage.removeItem("wallet"); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("wallet:disconnected"));
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center text-black font-black">₿</div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold tracking-tight">Opus Davi</span>
            <span className="text-[10px] uppercase tracking-widest text-muted">Bitcoin Mainnet</span>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1 md:flex-1 md:justify-center">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                tab === t.id
                  ? "bg-panel2 text-text border border-border"
                  : "text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="relative">
          {wallet ? (
            <button onClick={onDisconnect} className="btn">
              <span className="text-success">●</span>
              <span className="font-mono">{trunc(wallet.address, 6, 6)}</span>
              <span className="text-muted text-xs">({wallet.kind})</span>
            </button>
          ) : (
            <button onClick={() => setMenu((v) => !v)} className="btn-primary">
              Connect Wallet
            </button>
          )}
          {menu && !wallet && (
            <div className="absolute right-0 mt-2 w-56 card p-2 shadow-glow">
              <WalletOption name="Xverse" available={available.xverse} onClick={() => onConnect("xverse")} />
              <WalletOption name="Unisat" available={available.unisat} onClick={() => onConnect("unisat")} />
              <WalletOption name="Leather / Hiro" available={available.leather} onClick={() => onConnect("leather")} />
              <p className="px-2 py-2 text-[11px] text-muted">
                Hardware wallets (Ledger, Trezor) sign offline — use the Send / PSBT tab and import a signed PSBT.
              </p>
            </div>
          )}
          {err && <p className="absolute right-0 mt-2 text-xs text-danger">{err}</p>}
        </div>
      </div>
    </header>
  );
}

function WalletOption({ name, available, onClick }: { name: string; available: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!available}
      className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-panel2 disabled:opacity-50"
    >
      <span className="text-sm">{name}</span>
      <span className={`text-[10px] ${available ? "text-success" : "text-muted"}`}>
        {available ? "detected" : "not installed"}
      </span>
    </button>
  );
}
