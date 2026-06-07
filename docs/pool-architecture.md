# Pool architecture (Phase 2)

This document describes the *self-hosted* mining pool stack added in Phase 2:
a real Bitcoin Core full node, a real Stratum V1 server in TypeScript, and a
real CPU miner that closes the loop end-to-end.

## Process layout

```
                           ┌────────────────────────┐
                           │   Bitcoin Mainnet p2p  │
                           │     (other nodes)      │
                           └────────────┬───────────┘
                                        │ blocks / txs
                                        ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  node/  ─ bitcoind                                                 │
 │  • Validates the entire chain                                      │
 │  • Builds candidate templates via getblocktemplate                 │
 │  • Accepts found blocks via submitblock                            │
 │  • JSON-RPC on :8332 (auth via rpcauth=)                           │
 └─────────────┬─────────────────────────────────────┬────────────────┘
               │ RPC: getblocktemplate / submitblock │
               ▼                                     │
 ┌────────────────────────────────────┐              │
 │  pool/  ─ Stratum V1 server (TS)   │              │
 │  • Pulls templates ~ every 30 s    │              │
 │  • Builds coinbase + merkle branch │              │
 │  • Hands `mining.notify` to miners │              │
 │  • Validates SHA-256d shares       │              │
 │  • Submits found blocks back ──────┼──────────────┘
 │  • Exposes /stats on :3334         │
 │  • TCP Stratum on :3333            │
 └─────────────┬──────────────────────┘
               │ TCP                         scrape /stats
               ▼                                     ▲
 ┌────────────────────────────────────┐    ┌─────────┴────────────────┐
 │  miner/  ─ CPU miner (Node.js)     │    │  backend/  ─ Fastify     │
 │  • Connects via Stratum V1         │    │  • Public REST + WS API  │
 │  • Spawns worker_threads           │    │  • Bridges /api/pool/*   │
 │  • Hashes header SHA-256d          │    │    to the pool process   │
 │  • Submits real shares             │    └─────────┬────────────────┘
 └────────────────────────────────────┘              │ HTTP
                                                     ▼
                                          ┌──────────────────────┐
                                          │  frontend/ "Pool"    │
                                          │  • Live workers      │
                                          │  • Hashrate, shares  │
                                          │  • Current candidate │
                                          └──────────────────────┘
```

## Data flow for a single share

1. `pool` polls `bitcoind.getbestblockhash` every ~2 s and `getblocktemplate`
   every ~30 s or on tip change.
2. `pool` builds a coinbase containing
   `[BIP34 height push] || extraNonce1 || extraNonce2 || /opus-davi/`,
   reserving 8 bytes for the two extranonces, and computes the merkle branch
   over all other transactions in the template.
3. `pool` sends `mining.notify` to every authorized miner with the job and a
   `mining.set_difficulty` (default 0.001 ≈ one share per minute on a 50 MH/s
   CPU; you'll bump this for ASIC-class miners).
4. `miner` workers iterate `extraNonce2` (disjoint ranges per worker thread)
   and the 32-bit header nonce. Each iteration computes
   `SHA-256(SHA-256(80-byte-header))`, reverses to display order, and
   compares with the share target.
5. On a hit, the worker sends `{jobId, en2, ntime, nonce}` back to the main
   miner thread, which fires `mining.submit` to the pool.
6. The pool **re-runs the same computation server-side** to reject any
   tampered shares (`high-hash`, `stale`, `duplicate`, `ntime-out-of-range`,
   `bad-shapes`). Accepted shares roll into the worker's stats.
7. If the hash also satisfies the network target, the pool assembles the full
   block (header + coinbase-with-witness + remaining txs from the template)
   and ships it via `bitcoind.submitblock`. The frontend's "Blocks found"
   card then lights up.

## Honest expectations

| Hardware                  | Per-device hashrate | Time to 1 share at diff 0.001 | Time to 1 block on Mainnet |
| ------------------------- | ------------------- | ------------------------------ | -------------------------- |
| 1 CPU core (modern x86)   | ~ 1–5 MH/s          | < 1 minute                     | > 10^14 years              |
| 8-core VPS                | ~ 30–80 MH/s        | < 5 seconds                    | > 10^13 years              |
| NVIDIA RTX 4090 GPU       | ~ 10 GH/s (SHA-256) | < 1 ms (raise diff!)           | > 10^11 years              |
| Antminer S21 ASIC         | 200 TH/s            | < 1 µs (use diff 10⁶+)         | ~ 100 years                |
| 15 000 Antminer S21 farm  | 3 EH/s              | -                              | ~ 4 hours                  |
| Bitcoin network (2026)    | ~ 700 EH/s          | -                              | 10 minutes (consensus)     |

So this stack is **honest infrastructure**, not a money printer.
What you'll see on the Pool dashboard is real:
- real Stratum sessions
- real shares verified by SHA-256d
- real Mainnet block candidates from your bitcoind
- real bytes of mempool transactions in those candidates

Finding an actual block requires real ASIC hashpower pointed at the same
pool — the protocol is identical, so you can also plug an Antminer/Whatsminer
straight into `stratum+tcp://your-host:3333` if you ever decide to.

## Why solo-style, not PPLNS?

This is a single-operator pool: the coinbase pays the whole subsidy to
`POOL_PAYOUT_ADDRESS`, with no split. If you point a real ASIC at this pool,
**the entire reward goes to you** (the operator). Multi-miner PPLNS accounting
would require a payout queue + a wallet on the pool host; we keep it simple
and honest by leaving that out.

If you ever want to invite outside miners and share rewards fairly, swap the
coinbase output for a fanout and add a payouts ledger — the rest of the
Stratum + share validation code stays the same.
