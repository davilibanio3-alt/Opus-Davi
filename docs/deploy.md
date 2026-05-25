# Deployment guide (Phase 2)

This stack — Bitcoin Core + Stratum pool + miner + backend + frontend — is
designed for a single Linux box with enough disk for the chain. Any provider
works as long as you can attach ~ 1 TB of storage and have inbound TCP open.

## Recommended host sizes

| Provider | Plan                                | RAM | Disk         | Bandwidth          | Notes                                  |
| -------- | ----------------------------------- | --- | ------------ | ------------------ | -------------------------------------- |
| Hetzner  | CX41 (with attached Volume 1 TB)    | 16  | 1 TB SSD     | 20 TB/month        | Best cost/perf in EU; ~ €20/month base |
| Contabo  | VPS XL (1 TB NVMe)                  | 16  | 1 TB NVMe    | unmetered          | Cheap, oversold; fine for one node     |
| DO       | Premium AMD 4vCPU + 1 TB block      | 16  | 1 TB block   | 6 TB/month         | Easy snapshots                         |
| AWS      | t3.xlarge + 1 TB gp3                | 16  | 1 TB gp3     | metered            | Pricey egress; use Reserved Instances  |
| GCP      | e2-standard-4 + 1 TB pd-standard    | 16  | 1 TB pd      | metered            | Similar to AWS                         |
| Bare metal | Any home/colo box with 1 TB SSD   | any | 1 TB SSD     | 50 Mbps            | Best privacy, lowest cost long-term    |

## 0. Prerequisites

- Linux box (Debian 12 / Ubuntu 24.04 / Fedora 40 — anything supported by
  Docker Engine works).
- Open inbound TCP ports: **8333** (Bitcoin p2p) and **3333** (Stratum). If
  you want the frontend reachable on the public Internet, also open **3000**
  and **8787** behind a reverse proxy (or skip and only use it locally).
- A Bitcoin Mainnet address you control (e.g. a `bc1q…` from any wallet) for
  block payouts.

## 1. Install Docker + Compose

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

## 2. Clone + configure

```bash
git clone https://github.com/davilibanio3-alt/Opus-Davi.git
cd Opus-Davi
cp .env.example .env
```

Edit `.env`:

```ini
BITCOIND_RPC_USER=opusrpc
BITCOIND_RPC_PASSWORD=$(openssl rand -hex 32)
POOL_PAYOUT_ADDRESS=bc1q...your-address...
# (Optional, for the CPU miner sidecar)
MINER_THREADS=4
```

Sanity-check the address. The pool refuses to start with an invalid one:

```bash
docker run --rm --network host \
  -e BITCOIND_RPC_USER -e BITCOIND_RPC_PASSWORD --env-file .env \
  bitcoincore/bitcoin:27.0 bitcoin-cli -conf=/dev/null \
  -rpcconnect=127.0.0.1 -rpcuser=$BITCOIND_RPC_USER -rpcpassword=$BITCOIND_RPC_PASSWORD \
  validateaddress $POOL_PAYOUT_ADDRESS
```

## 3. Bring up bitcoind (IBD)

```bash
docker compose up -d bitcoind
docker compose logs -f bitcoind
```

Expected timeline (Mainnet, late 2026):

| Phase                | Time on NVMe       | Time on HDD      |
| -------------------- | ------------------ | ---------------- |
| Headers              | 30 minutes         | 1 hour           |
| Block download       | 12–18 hours        | 2–4 days         |
| Reindex / verify     | 4–8 hours          | 12–24 hours      |
| **Total IBD**        | ~ 1 day            | 3–5 days         |

Check progress:

```bash
docker exec opus-davi-node bitcoin-cli -datadir=/data getblockchaininfo \
  | jq '{blocks, headers, verificationprogress}'
```

`verificationprogress: 0.9999…` means done.

## 4. Bring up the pool + backend + frontend

```bash
docker compose up -d pool backend frontend
docker compose logs -f pool
```

Watch for:

```
{"msg":"bitcoind connected","version":270000,…}
{"msg":"new job","jobId":"1","height":950926,"clean":true,"txs":3107}
{"msg":"stratum listening","host":"0.0.0.0","port":3333}
{"msg":"stats http listening","host":"0.0.0.0","port":3334}
```

Visit `http://YOUR_HOST:3000/`, click the **Pool** tab. It should say *Pool online*
with the live block-candidate height matching mempool.space.

## 5. Add real hashpower

### 5a. The bundled CPU miner

The easiest sanity check is to spin up the sidecar miner:

```bash
docker compose --profile with-miner up -d miner
docker compose logs -f miner
```

You'll see `connected to pool`, `set difficulty: 0.001`, `new job`, then a
steady stream of `found share` lines. Refresh the Pool dashboard — your CPU
worker shows up under Workers.

Expected hashrate: ~ 1–10 MH/s per thread (Node.js + crypto module).

### 5b. A real ASIC

Set the miner's pool URL to `stratum+tcp://YOUR_HOST:3333`, worker name to
anything (e.g. `opus.worker1`), password `x`. The pool accepts any name —
shares are validated cryptographically.

Bump the share difficulty for an ASIC so the dashboard doesn't drown in
shares: edit `.env`:

```ini
POOL_INITIAL_DIFFICULTY=1024
```

and restart `pool`: `docker compose restart pool`.

A 200 TH/s Antminer S21 at diff 1024 will submit on the order of 50 shares
per second, and the pool will validate them all server-side.

### 5c. A GPU miner

The bundled miner is CPU only. To point a GPU miner at the pool, use
[`bzminer`](https://www.bzminer.com/) or `nicehash-quickminer` configured for
SHA-256 against `stratum+tcp://YOUR_HOST:3333`. Expect ~ 1–15 GH/s per modern
GPU.

## 6. Make the dashboard public (optional)

You'll want a reverse proxy with TLS — for example
[Caddy](https://caddyserver.com):

```caddy
pool.example.com {
  reverse_proxy localhost:3000
}
api.example.com {
  reverse_proxy localhost:8787
}
```

Then on the frontend container set
`NEXT_PUBLIC_BACKEND_URL=https://api.example.com` so the browser stops
hitting `localhost`.

## 7. Snapshots, monitoring, backups

- `docker compose exec bitcoind bitcoin-cli -datadir=/data getmininginfo` — quick health check.
- `du -sh /var/lib/docker/volumes/opus-davi_bitcoin-data` — disk usage.
- `docker compose logs --since=1h pool | grep "share accepted" | wc -l` — shares/hour.
- For monitoring stacks (Prometheus, Grafana), scrape `GET /stats` on the
  pool — it returns JSON suitable for `json_exporter`.

## Tearing it down

```bash
docker compose down
# To also wipe the chain (you will lose the 1 TB of synced data):
docker volume rm opus-davi_bitcoin-data
```

## Troubleshooting

**`bitcoind` keeps restarting**
Usually low disk or `BITCOIND_RPC_PASSWORD` not set. Check `docker logs opus-davi-node`.

**Pool says `bitcoind rpc getblocktemplate: not connected`**
bitcoind is still doing IBD. Wait for `verificationprogress > 0.999`.

**Miners connect but every share rejected with `stale`**
The miner was given an old job before the latest `mining.notify` arrived.
This is normal at low rates (< 1%). If it happens for every share, your
clock may be drifting — sync with NTP.

**`block submit error: bad-cb-amount`**
The coinbase value didn't match the template (e.g. you found a block right
on a halving boundary and the template was stale). Restart the pool —
it'll pull a fresh template and resume.
