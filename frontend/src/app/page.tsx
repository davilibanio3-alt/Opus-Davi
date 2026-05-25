"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Dashboard } from "@/components/Dashboard";
import { BlocksView } from "@/components/Blocks";
import { MempoolView } from "@/components/Mempool";
import { SearchView } from "@/components/Search";
import { WalletView } from "@/components/Wallet";
import { SendView } from "@/components/Send";
import { RecoveryView } from "@/components/Recovery";
import { MiningView } from "@/components/Mining";
import { PoolView } from "@/components/Pool";

export default function Page() {
  const [tab, setTab] = useState("dashboard");

  return (
    <>
      <Header tab={tab} onTab={setTab} />
      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {tab === "dashboard" && (
          <Dashboard
            onSelectBlock={() => { setTab("search"); }}
          />
        )}
        {tab === "blocks" && (
          <BlocksView onSelectBlock={() => { setTab("search"); }} />
        )}
        {tab === "mempool" && <MempoolView />}
        {tab === "search" && <SearchView />}
        {tab === "wallet" && <WalletView />}
        {tab === "send" && <SendView />}
        {tab === "recovery" && <RecoveryView />}
        {tab === "mining" && <MiningView />}
        {tab === "pool" && <PoolView />}
      </main>
      <footer className="mx-auto max-w-7xl px-4 py-10 text-center text-xs text-muted">
        Opus Davi · Bitcoin Mainnet platform · Self-custody · No third-party custody, ever
      </footer>
    </>
  );
}
