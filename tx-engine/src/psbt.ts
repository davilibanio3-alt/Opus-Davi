import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory, ECPairInterface } from "ecpair";
import { BIP32Interface } from "bip32";
import { getNetwork, NetworkName } from "./network";
import { AddressKind } from "./hd";
import { estimateVsize } from "./fees";

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

export interface Utxo {
  txid: string;
  vout: number;
  value: number; // sats
  scriptPubKey: string; // hex
  // For non-segwit inputs, the full previous tx hex is required.
  rawTxHex?: string;
}

export interface BuildPsbtOptions {
  network?: NetworkName;
  utxos: Utxo[];
  outputs: Array<{ address: string; value: number }>;
  changeAddress: string;
  feeRate: number; // sat/vB
  rbf?: boolean; // BIP125 signaling, default true
  // Address kind of the spending inputs — used for vsize estimation.
  inputKind?: AddressKind;
}

export interface BuildPsbtResult {
  psbtBase64: string;
  fee: number;
  vsize: number;
  change: number;
}

/**
 * Build an unsigned PSBT. The caller is responsible for selecting UTXOs —
 * this function does NOT do coin selection beyond consuming inputs in order
 * until the requested outputs + fee are covered.
 */
export function buildPsbt(opts: BuildPsbtOptions): BuildPsbtResult {
  const network = getNetwork(opts.network ?? "mainnet");
  const psbt = new bitcoin.Psbt({ network });
  const sequence = opts.rbf === false ? 0xffffffff : 0xfffffffd;

  const totalOut = opts.outputs.reduce((s, o) => s + o.value, 0);

  // First pass — estimate vsize for the fee
  let usedInputs = 0;
  let inputSum = 0;
  for (const u of opts.utxos) {
    usedInputs++;
    inputSum += u.value;
    const vsize = estimateVsize(usedInputs, opts.outputs.length + 1, opts.inputKind ?? "p2wpkh");
    const fee = Math.ceil(vsize * opts.feeRate);
    if (inputSum >= totalOut + fee) break;
  }

  const usedUtxos = opts.utxos.slice(0, usedInputs);
  inputSum = usedUtxos.reduce((s, u) => s + u.value, 0);
  if (inputSum < totalOut) {
    throw new Error(`Insufficient funds: have ${inputSum} sats, need at least ${totalOut} sats`);
  }

  // Add inputs
  for (const u of usedUtxos) {
    const input: Parameters<bitcoin.Psbt["addInput"]>[0] = {
      hash: u.txid,
      index: u.vout,
      sequence,
    };
    const scriptBuf = Buffer.from(u.scriptPubKey, "hex");
    // Heuristic: segwit scriptPubKeys start with OP_0..32 (00) or OP_1 (51) for taproot.
    const first = scriptBuf[0];
    const isSegwit = first === 0x00 || first === 0x51;
    if (isSegwit) {
      input.witnessUtxo = { script: scriptBuf, value: u.value };
    } else {
      if (!u.rawTxHex) {
        throw new Error(
          `UTXO ${u.txid}:${u.vout} is legacy — rawTxHex is required to spend it`,
        );
      }
      input.nonWitnessUtxo = Buffer.from(u.rawTxHex, "hex");
    }
    psbt.addInput(input);
  }

  for (const o of opts.outputs) {
    psbt.addOutput({ address: o.address, value: o.value });
  }

  // Recompute vsize with actual input count for fee
  const vsize = estimateVsize(usedInputs, opts.outputs.length + 1, opts.inputKind ?? "p2wpkh");
  const fee = Math.ceil(vsize * opts.feeRate);
  const change = inputSum - totalOut - fee;
  if (change < 0) throw new Error("Fee exceeds available change");
  // Dust threshold: 546 sats (Bitcoin Core default)
  if (change >= 546) {
    psbt.addOutput({ address: opts.changeAddress, value: change });
  }

  return { psbtBase64: psbt.toBase64(), fee, vsize, change };
}

/** Sign a PSBT in-place with an ECPair (single key) and return the new base64. */
export function signPsbtWithECPair(psbtBase64: string, wif: string, network: NetworkName = "mainnet"): string {
  const net = getNetwork(network);
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: net });
  const keyPair = ECPair.fromWIF(wif, net) as unknown as bitcoin.Signer;
  for (let i = 0; i < psbt.inputCount; i++) {
    psbt.signInput(i, keyPair);
  }
  return psbt.toBase64();
}

/** Sign a PSBT with a BIP32 node (derives children if input has bip32Derivation set). */
export function signPsbtWithBip32(psbtBase64: string, root: BIP32Interface, network: NetworkName = "mainnet"): string {
  const net = getNetwork(network);
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: net });
  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];
    if (input.bip32Derivation && input.bip32Derivation.length > 0) {
      const der = input.bip32Derivation[0];
      const child = root.derivePath(der.path);
      psbt.signInput(i, child as unknown as bitcoin.Signer);
    } else {
      // Best-effort: try signing with the root itself (unlikely to be valid)
      psbt.signInput(i, root as unknown as bitcoin.Signer);
    }
  }
  return psbt.toBase64();
}

/** Finalize a fully-signed PSBT and extract the network-ready hex tx. */
export function finalizePsbt(psbtBase64: string, network: NetworkName = "mainnet"): { txHex: string; txid: string } {
  const net = getNetwork(network);
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: net });
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { txHex: tx.toHex(), txid: tx.getId() };
}

export type { ECPairInterface };
