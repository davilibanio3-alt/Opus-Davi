# Opus Davi · Bitcoin Mainnet Platform/**
 * btc-wallet-engine.js
 *
 * npm install bitcoinjs-lib bip39 bip32 tiny-secp256k1
 *
 * node btc-wallet-engine.js
 */

const bitcoin = require("bitcoinjs-lib");
const bip39 = require("bip39");
const ecc = require("tiny-secp256k1");
const { BIP32Factory } = require("bip32");

const bip32 = BIP32Factory(ecc);

class BTCWalletEngine {
  constructor() {
    this.network = bitcoin.networks.bitcoin;
    this.mnemonic = null;
    this.seed = null;
    this.root = null;
  }

  async createWallet() {
    this.mnemonic = bip39.generateMnemonic(256);

    this.seed = await bip39.mnemonicToSeed(this.mnemonic);

    this.root = bip32.fromSeed(this.seed, this.network);

    return this.exportWallet();
  }

  async importWallet(mnemonic) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Mnemonic inválida");
    }

    this.mnemonic = mnemonic;
    this.seed = await bip39.mnemonicToSeed(mnemonic);
    this.root = bip32.fromSeed(this.seed, this.network);

    return this.exportWallet();
  }

  deriveAddress(index = 0) {
    const node = this.root.derivePath(`m/84'/0'/0'/0/${index}`);

    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(node.publicKey),
      network: this.network,
    });

    return {
      index,
      address,
      publicKey: node.publicKey.toString("hex"),
    };
  }

  deriveChangeAddress(index = 0) {
    const node = this.root.derivePath(`m/84'/0'/0'/1/${index}`);

    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(node.publicKey),
      network: this.network,
    });

    return {
      index,
      address,
      publicKey: node.publicKey.toString("hex"),
    };
  }

  getXPUB() {
    return this.root.neutered().toBase58();
  }

  exportWallet() {
    const addresses = [];

    for (let i = 0; i < 5; i++) {
      addresses.push(this.deriveAddress(i));
    }

    return {
      mnemonic: this.mnemonic,
      xpub: this.getXPUB(),
      addresses,
    };
  }
}

async function main() {
  const wallet = new BTCWalletEngine();

  const data = await wallet.createWallet();

  console.log("\n=== BITCOIN WALLET ENGINE ===\n");

  console.log("Mnemonic:");
  console.log(data.mnemonic);

  console.log("\nXPUB:");
  console.log(data.xpub);

  console.log("\nAddresses:");
  console.table(data.addresses);

  console.log("\nChange Address:");
  console.log(wallet.deriveChangeAddress(0));
}

main().catch(console.error);

Institutional, self-custody Bitcoin Mainnet platform. **All data is real**, all
signatures are local, no third-party custody, no fake hashrate, no fake
"mining". Open source, MIT.

> **Honest scope**: software cannot conjure hashpower. The Mining tab connects
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
| [`node/`](./node) | **Phase 2** — containerized Bitcoin Core Mainnet full node (RPC + ZMQ). |
| [`pool/`](./pool) | **Phase 2** — real Stratum V1 pool server in TypeScript. Talks to bitcoind via JSON-RPC, builds block candidates, validates SHA-256d shares, ships found blocks via `submitblock`. |
| [`miner/`](./miner) | **Phase 2** — real CPU SHA-256d miner client. Worker_threads, Stratum V1, submits cryptographically valid shares. |

## What you can do (real, on Mainnet)

- **Explore Bitcoin Mainnet** — live blocks, mempool depth, fees, hashrate,
  difficulty adjustment, top mining pools, prices. Powered by mempool.space.
- **Connect a wallet** — Xverse / Unisat / Leather (browser); Ledger / Trezor
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
- **Run your own pool** (Phase 2) — a real Bitcoin Mainnet full node + a real
  Stratum V1 pool server you can point real ASICs (or this repo's CPU miner)
  at. The dashboard shows real connected workers, real validated shares, and
  real block candidates pulled live from `getblocktemplate`. See
  [`docs/pool-architecture.md`](./docs/pool-architecture.md) and
  [`docs/deploy.md`](./docs/deploy.md).

## What it does NOT do (and why)

- It does **not** mine BTC in the browser or with CPU/GPU. SHA-256d in
  JavaScript is ~10⁹× slower than a modern ASIC. Any number you'd see would be
  meaningless. We refuse to fake it.
- It does **not** "recover" funds from wallets that aren't yours. Anything
  claiming otherwise is theft or fraud.
- It does **not** custody your keys. Everything that signs runs in your
  browser or on hardware you control.

## Quick start (local)

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

## Quick start (Docker — full stack with self-hosted pool)

```bash
cp .env.example .env
# Edit .env: set BITCOIND_RPC_PASSWORD and POOL_PAYOUT_ADDRESS (a Mainnet
# address you control — the pool will pay block rewards there).

docker compose up -d --build
# bitcoind → 8333 p2p, 8332 RPC (loopback)
# pool     → 3333 Stratum V1, 3334 stats
# backend  → 8787 REST + WS
# frontend → 3000 — open http://localhost:3000 and click the Pool tab

# Add a CPU miner sidecar (optional, useful to verify the loop end-to-end):
docker compose --profile with-miner up -d miner
```

For production hosting and IBD sizing, see [`docs/deploy.md`](./docs/deploy.md).

## Honest hashrate disclosure (Phase 2)

The pool & miner shipped in Phase 2 are **real Bitcoin software**, not a
fantasy. Bitcoin Mainnet is currently at roughly **700 EH/s** of total
network hashpower — almost all of it from purpose-built ASIC chips. To
produce 1% of that (≈ 7 EH/s) you would need on the order of 30 000 modern
ASICs costing tens of millions of dollars plus tens of megawatts of power.

What this software actually does:

| Hardware                  | Approximate real hashrate |
| ------------------------- | ------------------------- |
| 1 CPU core (Node crypto)  | 1–10 MH/s                 |
| 8-core VPS                | 30–80 MH/s                |
| 1 GPU (RTX 4090, SHA-256) | ~ 10 GH/s                 |
| 1 Antminer S21 ASIC       | 200 TH/s                  |

Finding a Mainnet block at any of those scales is statistically *implausible*.
What you can verify is real on the Pool dashboard:

- Real Stratum sessions over TCP.
- Real SHA-256d-verified shares.
- Real Mainnet block candidates pulled from your bitcoind.
- Real transactions from the live mempool inside each candidate.

If you ever do point enough hashrate at the pool to find a block, the entire
coinbase reward goes to the address you set as `POOL_PAYOUT_ADDRESS`.

## Deploy

- **Frontend (free, public)**: GitHub Pages — pushes to `main` trigger
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
