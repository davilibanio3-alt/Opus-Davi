# Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js)                              │
│                                                                        │
│  Dashboard ─ Blocks ─ Mempool ─ Search ─ Wallet ─ Send ─ Recovery ─ Min │
│       │         │        │        │        │       │        │       │  │
│       └─────────┴────────┴────────┴────────┘       │        │       │  │
│              read-only mainnet data            wallet APIs  │       │  │
│                       │                             │       │       │  │
└───────────────────────┼─────────────────────────────┼───────┼───────┼──┘
                        │ HTTPS/WSS                   │       │       │
                        ▼                             │       │       │
              mempool.space / Esplora                 │       │       │
              (real BTC Mainnet)                      │       │       │
                                                     │       │       │
                                          PSBT build/sign  scan  Stratum
                                          (bitcoinjs-lib)  xpub  V1 TCP
                                                                  │
┌─────────────────────────────────────────────────────────────────┼──────┐
│                       Backend (Fastify)                         │      │
│                                                                 ▼      │
│  /api/* explorer proxy ─ /api/tx/broadcast ─ /api/mining/pools ─ /api/m│
│         /ws (mempool.space realtime fanout)                            │
│                              │                                         │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │
                  ┌────────────┼──────────────┐
                  ▼            ▼              ▼
        Bitcoin Core RPC   mempool.space   Mining pool REST
        (optional, your    public APIs     (Braiins / F2Pool
         own full node)                     / ViaBTC)
```

## Trust model

- **Frontend talks to your own backend OR directly to mempool.space**. The
  static GH Pages build defaults to mempool.space so no server is required for
  the read-only views.
- **Signing happens locally**. The site never receives a private key — wallets
  sign in the user's process, hardware wallets sign over USB / HID. Mnemonic
  recovery runs entirely in the browser (the recovery package is bundled in
  the frontend chunk via dynamic import).
- **Broadcast is just a POST** of the signed raw hex to mempool.space `/tx`.

## Why no own mining hashpower?

A modern ASIC (Antminer S21) does ~200 TH/s. JavaScript SHA-256d does
~1–5 MH/s. The ratio is ~40 million × in favor of the ASIC. Any browser
"miner" claiming meaningful hashrate is either (a) lying, (b) running a
hidden cloud-mining backend that holds your money, or (c) using your machine
to mine **someone else's** wallet. This project refuses to do any of those.

If you want hashrate to show up here, point a real ASIC at this backend's
Stratum proxy, or connect a real pool account.
