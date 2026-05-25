# `node/` — Bitcoin Core Mainnet full node

This is the upstream Bitcoin Core binary, containerized for the Opus-Davi pool.

## What it does
- Validates every Mainnet block since genesis (~ 950 000 blocks as of 2026)
- Tracks the mempool
- Exposes JSON-RPC on `:8332` (auth via `rpcauth=`)
- Exposes the p2p port on `:8333` for header / block / tx propagation
- Optional ZMQ notifications on `:28332` (hashblock) and `:28333` (hashtx)

## Resource expectations (Mainnet, 2026)
| Resource | Value |
|---|---|
| Disk (full + txindex) | ~ 800 GB and growing ~ 8 GB/month |
| Disk (pruned to 10 GB) | ~ 15 GB |
| RAM | 4 GB minimum, 8 GB recommended |
| Bandwidth | 5 GB / day average after IBD |
| IBD time | 1–4 days depending on CPU + disk |

The pool uses `getblocktemplate`, which works on **both** pruned and full nodes.
We default to txindex=1 for easier debugging; comment it out and set `prune=10000`
in `bitcoin.conf` if you want a minimal node.

## Environment variables (required)
- `BITCOIND_RPC_USER` — RPC username
- `BITCOIND_RPC_PASSWORD` — RPC password

The entrypoint renders an `rpcauth=` line at startup so the plaintext password
is never persisted on disk.

## Manually checking from inside the container
```
docker exec -it opus-davi-node bitcoin-cli -datadir=/data getblockchaininfo
docker exec -it opus-davi-node bitcoin-cli -datadir=/data getmininginfo
```

## Honest caveats
- Bitcoin Core does not "mine" anything by itself. It produces work via
  `getblocktemplate`; the actual SHA-256 hashing happens in `pool/` + `miner/`
  (or in real ASICs you can point at the pool).
- IBD is bandwidth- and disk-heavy. Do not start it on a metered connection
  or a tiny VPS unless you've sized the disk for at least 800 GB.
