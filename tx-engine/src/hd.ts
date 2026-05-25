import * as bitcoin from "bitcoinjs-lib";
import BIP32Factory, { BIP32Interface } from "bip32";
import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";
import { getNetwork, NetworkName } from "./network";

const bip32 = BIP32Factory(ecc);
bitcoin.initEccLib(ecc);

export type AddressKind = "legacy" | "p2sh-p2wpkh" | "p2wpkh" | "p2tr";

/**
 * Standard BIP44/49/84/86 account-level paths for Bitcoin mainnet.
 * Use `accountPath(kind, account)` to get the parent xpub path of an account.
 */
export function accountPath(kind: AddressKind, account = 0): string {
  switch (kind) {
    case "legacy":
      return `m/44'/0'/${account}'`;
    case "p2sh-p2wpkh":
      return `m/49'/0'/${account}'`;
    case "p2wpkh":
      return `m/84'/0'/${account}'`;
    case "p2tr":
      return `m/86'/0'/${account}'`;
  }
}

/** Convert a BIP39 mnemonic + optional passphrase to a BIP32 root node. */
export function rootFromMnemonic(
  mnemonic: string,
  passphrase = "",
  network: NetworkName = "mainnet",
): BIP32Interface {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error("Invalid BIP39 mnemonic");
  }
  const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
  return bip32.fromSeed(seed, getNetwork(network));
}

/** Parse a BIP32 extended public key (xpub/ypub/zpub/...). */
export function nodeFromXpub(
  xpub: string,
  network: NetworkName = "mainnet",
): BIP32Interface {
  return bip32.fromBase58(xpub, getNetwork(network));
}

/** Derive an address for a given HD node + change/index pair. */
export function deriveAddress(
  node: BIP32Interface,
  kind: AddressKind,
  change: 0 | 1,
  index: number,
  network: NetworkName = "mainnet",
): { address: string; pubkey: Buffer; path: string } {
  const child = node.derive(change).derive(index);
  const net = getNetwork(network);
  const pubkey = child.publicKey;
  let address: string | undefined;

  switch (kind) {
    case "legacy":
      address = bitcoin.payments.p2pkh({ pubkey, network: net }).address;
      break;
    case "p2sh-p2wpkh":
      address = bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey, network: net }),
        network: net,
      }).address;
      break;
    case "p2wpkh":
      address = bitcoin.payments.p2wpkh({ pubkey, network: net }).address;
      break;
    case "p2tr": {
      // BIP86: x-only pubkey, no script tree
      const xOnly = pubkey.slice(1, 33);
      address = bitcoin.payments.p2tr({ internalPubkey: xOnly, network: net }).address;
      break;
    }
  }

  if (!address) throw new Error(`Failed to derive ${kind} address`);
  return { address, pubkey, path: `${change}/${index}` };
}

/** Convenience: derive a contiguous range of receiving addresses from an xpub. */
export function deriveRange(
  node: BIP32Interface,
  kind: AddressKind,
  change: 0 | 1,
  start: number,
  count: number,
  network: NetworkName = "mainnet",
): Array<{ address: string; index: number; path: string }> {
  const out: Array<{ address: string; index: number; path: string }> = [];
  for (let i = 0; i < count; i++) {
    const idx = start + i;
    const { address, path } = deriveAddress(node, kind, change, idx, network);
    out.push({ address, index: idx, path });
  }
  return out;
}
