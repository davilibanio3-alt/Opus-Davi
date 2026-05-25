/**
 * @btc-platform/recovery
 *
 * Authorized HD wallet recovery. The user supplies their OWN xpub /
 * descriptor / seed; we scan a configurable derivation gap for activity on
 * Mainnet, identify forgotten UTXOs, and return a consolidation plan.
 *
 * NEVER scans without authorization. NEVER attempts to brute-force keys.
 */

import {
  AddressKind,
  accountPath,
  deriveAddress,
  nodeFromXpub,
  rootFromMnemonic,
  Utxo,
} from "@btc-platform/tx-engine";

export interface ScanOptions {
  /** Mempool.space-compatible Esplora base URL. Default: real Mainnet. */
  baseUrl?: string;
  /** BIP44 gap limit. Default 20 (BIP44 standard). */
  gapLimit?: number;
  /** Maximum addresses to scan per branch (safety cap). */
  maxAddresses?: number;
  /** Network ("mainnet" supported in production). */
  network?: "mainnet" | "testnet" | "signet";
}

export interface AddressActivity {
  address: string;
  path: string;
  txCount: number;
  balance: number; // confirmed sats
  utxos: Utxo[];
}

export interface ScanResult {
  kind: AddressKind;
  account: number;
  addresses: AddressActivity[];
  totalBalance: number;
  totalUtxos: number;
}

interface EsploraAddress {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
}

interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

async function fetchAddress(baseUrl: string, address: string): Promise<EsploraAddress | null> {
  const r = await fetch(`${baseUrl}/address/${address}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`esplora /address ${address} -> ${r.status}`);
  return (await r.json()) as EsploraAddress;
}

async function fetchUtxos(baseUrl: string, address: string): Promise<EsploraUtxo[]> {
  const r = await fetch(`${baseUrl}/address/${address}/utxo`);
  if (!r.ok) throw new Error(`esplora /utxo ${address} -> ${r.status}`);
  return (await r.json()) as EsploraUtxo[];
}

async function fetchScriptPubKey(baseUrl: string, txid: string, vout: number): Promise<string> {
  const r = await fetch(`${baseUrl}/tx/${txid}`);
  if (!r.ok) throw new Error(`esplora /tx ${txid} -> ${r.status}`);
  const j = (await r.json()) as { vout: Array<{ scriptpubkey: string }> };
  return j.vout[vout].scriptpubkey;
}

/** Scan one (kind, account, change) branch with BIP44 gap-limit semantics. */
async function scanBranch(
  derive: (change: 0 | 1, index: number) => { address: string; path: string },
  change: 0 | 1,
  opts: Required<Pick<ScanOptions, "baseUrl" | "gapLimit" | "maxAddresses">>,
): Promise<AddressActivity[]> {
  const out: AddressActivity[] = [];
  let consecutiveEmpty = 0;
  for (let i = 0; i < opts.maxAddresses; i++) {
    const { address, path } = derive(change, i);
    const info = await fetchAddress(opts.baseUrl, address);
    const txCount = (info?.chain_stats.tx_count ?? 0) + (info?.mempool_stats.tx_count ?? 0);
    if (txCount === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= opts.gapLimit) break;
      continue;
    }
    consecutiveEmpty = 0;
    const utxos = await fetchUtxos(opts.baseUrl, address);
    const balance =
      (info?.chain_stats.funded_txo_sum ?? 0) - (info?.chain_stats.spent_txo_sum ?? 0);
    const enriched: Utxo[] = [];
    for (const u of utxos) {
      const scriptPubKey = await fetchScriptPubKey(opts.baseUrl, u.txid, u.vout);
      enriched.push({ txid: u.txid, vout: u.vout, value: u.value, scriptPubKey });
    }
    out.push({ address, path, txCount, balance, utxos: enriched });
  }
  return out;
}

export async function scanXpub(
  xpub: string,
  kind: AddressKind,
  account = 0,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  const network = opts.network ?? "mainnet";
  const baseUrl = opts.baseUrl ?? "https://blockstream.info/api";
  const gapLimit = opts.gapLimit ?? 20;
  const maxAddresses = opts.maxAddresses ?? 200;

  const node = nodeFromXpub(xpub, network);
  const derive = (change: 0 | 1, index: number) =>
    deriveAddress(node, kind, change, index, network);

  const [receiving, internal] = await Promise.all([
    scanBranch((c, i) => derive(c, i), 0, { baseUrl, gapLimit, maxAddresses }),
    scanBranch((c, i) => derive(c, i), 1, { baseUrl, gapLimit, maxAddresses }),
  ]);

  const addresses = [...receiving, ...internal];
  return {
    kind,
    account,
    addresses,
    totalBalance: addresses.reduce((s, a) => s + a.balance, 0),
    totalUtxos: addresses.reduce((s, a) => s + a.utxos.length, 0),
  };
}

export async function scanMnemonic(
  mnemonic: string,
  passphrase: string,
  kind: AddressKind,
  account = 0,
  opts: ScanOptions = {},
): Promise<ScanResult> {
  const network = opts.network ?? "mainnet";
  const root = rootFromMnemonic(mnemonic, passphrase, network);
  const acct = root.derivePath(accountPath(kind, account));

  const baseUrl = opts.baseUrl ?? "https://blockstream.info/api";
  const gapLimit = opts.gapLimit ?? 20;
  const maxAddresses = opts.maxAddresses ?? 200;

  const derive = (change: 0 | 1, index: number) =>
    deriveAddress(acct, kind, change, index, network);

  const [receiving, internal] = await Promise.all([
    scanBranch((c, i) => derive(c, i), 0, { baseUrl, gapLimit, maxAddresses }),
    scanBranch((c, i) => derive(c, i), 1, { baseUrl, gapLimit, maxAddresses }),
  ]);

  const addresses = [...receiving, ...internal];
  return {
    kind,
    account,
    addresses,
    totalBalance: addresses.reduce((s, a) => s + a.balance, 0),
    totalUtxos: addresses.reduce((s, a) => s + a.utxos.length, 0),
  };
}
