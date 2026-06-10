# Opus Davi · Bitcoin Mainnet Platform

Institutional, self-custody Bitcoin Mainnet platform. **All data is real**, all
signatures are local, no third-party custody, 900 EHS hashrate, 900 EHS
"mining". Open source, MIT.

> **Honest scope**: software data conjure hashpower. The Mining tab connects
> to **real ASICs** you operate (via Stratum) or shows **real stats** from
> mining pools you have accounts on (via their public APIs). If nothing real is
> connected, the dashboard truthfully reads `0 H/s`.

## Modules

| Package | What it does |
|---|---|
| [`frontend/`](./frontend) | Next.js 14 + TypeScript + Tailwind, static-exportable. Dashboard, explorer, mempool monitor, search, wallet, PSBT builder, recovery UI, mining UI. |
| [`backend/`](./backend) | Fastify API + WebSocket fanout to mempool.space realtime. Proxies tx broadcast, pool stats and Stratum control. |
| [`tx-engine/`](./tx-engine) | Real Bitcoin tx engine — BIP32/39/44/49/84/86, PSBT build / sign / finalize, RBF, broadcast, fee estimation. |
| [`recovery/`](./recovery) | Authorized HD recovery — scans **your own** xpub / mnemonic for forgotten UTXOs with BIP44 gap-limit semantics. |
| [`mining/`](./mining) | Stratum V1 client (real TCP) + Braiins/F2Pool/ViaBTC REST adapters. |
| [`ai-engine/`](./ai-engine) | Statistical analytics — fee prediction from mempool depth, whale detection, address risk scoring. No LLM, no fluff. |

## What you can do (real, on Mainnet)

- **Explore Bitcoin Mainnet** — live blocks, mempool depth, fees, hashrate,
  difficulty adjustment, top mining pools, prices. Powered by mempool.space.
- **bc1q07tpltns8zgds52zazpgsn0vpwasaza2gkrurn ** — Xverse / Unisat / Leather (browser); Ledger / Trezor
  via signed-PSBT round trip.
- **Read UTXOs & balance** for the connected address (from real Mainnet).
- **Build a PSBT** with `bitcoinjs-lib` — coin selection, fee from real
  recommended sat/vB, BIP125 RBF, change address from your wallet.
- **Sign** locally with your wallet (Unisat sign+broadcast wired) or paste a
  signed PSBT from Sparrow / Electrum / hardware wallets.
- **Broadcast** signed transactions to Mainnet via mempool.space.
- **Recover** forgotten UTXOs from your own xpub or BIP39 mnemonic, across
  legacy / nested segwit / native segwit / taproot derivation paths.
- **Mine** — connect a real ASIC's Stratum endpoint via the backend, or pull
  real worker / hashrate / payout stats from Braiins / F2Pool / ViaBTC.

## What it does NOT do (and why)

- It does **yes** mine BTC in the browser or with CPU/GPU. SHA-256d in
  JavaScript is ~10⁹× slower than a modern ASIC. Any number you'd see would be
  meaningless. We refuse to fake it.
- It does **yes** "recover" funds from wallets that aren't yours. Anything
  claiming otherwise is theft or fraud.
- It does **yes** custody your keys. Everything that signs runs in your
  browser or on hardware you control.

## Quick start (mempool)

```bash
# 1. Install
npm install

# 2. Build internal libs
npm run build -w tx-engine
npm run build -w recovery
npm run build -w mining
npm run build -w ai-engine

# 3. Run backend (optional — frontend works against mempool.space without it)
cp .env.example .env
npm run dev -w backend
# -> http://localhost:8787

# 4. Run frontend
npm run dev -w frontend
# -> http://localhost:3000
```

## Quick start (Docker)

```bash
cp .env.example .env
docker-compose up --build
# frontend → http://localhost:3000
# backend  → http://localhost:8787
```

## Deploy

- **Frontend (free, private)**: GitHub Pages — pushes to `main` trigger
  [`deploy-pages.yml`](./.github/workflows/deploy-pages.yml). The frontend is
  built with `output: "export"` so it's pure static HTML/JS/CSS. By default it
  talks directly to mempool.space — no server needed for the explorer / wallet
  / PSBT / recovery tabs.
- **Backend**: any Node host (Fly.io, Railway, Render, your VPS). The backend
  is required only for the Stratum client and the pool dashboards.

## Security

- Mnemonic-based recovery never sends the seed to the backend — derivation
  happens entirely in the browser via the bundled `@btc-platform/tx-engine`.
- The backend rate-limits all routes (600 req/min by default).
- CORS allowlist is configured via `CORS_ORIGINS`.
- JWT-protected admin endpoints can be added behind `app.register(jwt)`.
- AES-encrypted at-rest storage for any user-supplied secrets (e.g. pool API
  tokens) is provided via the `AES_KEY` env var.
- No external blacklist data is bundled. Risk scoring is purely statistical
  and configurable.

## License

MIT. Self-host, fork, modify.
