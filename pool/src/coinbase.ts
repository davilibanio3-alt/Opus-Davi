/**
 * Coinbase transaction construction for Stratum V1.
 *
 * In Stratum V1 the pool sends miners two byte-string fragments — coinb1 and
 * coinb2 — and assigns an extranonce1; the miner contributes an extranonce2.
 * The full coinbase tx for a given share is:
 *
 *     coinbase = coinb1 || extranonce1 || extranonce2 || coinb2
 *
 * coinb1/coinb2 are stable for the lifetime of a job; the miner iterates
 * extranonce2 (and the header nonce) to find shares. Because the coinbase
 * changes per share, the merkle root changes per share, so the pool can build
 * effectively unlimited unique work without rebuilding the template.
 *
 * We always emit a SegWit-aware coinbase whose final scriptSig is
 *     [BIP34 height push] || extraNonce1 || extraNonce2 || [tag]
 * and we add the mandatory witness commitment output when the block template
 * includes `default_witness_commitment`.
 *
 * The coinbase **txid** (used for merkle root computation) is the legacy
 * (witness-stripped) hash. The coinbase **wtxid** is the full hash including
 * witness, but for the merkle root we only need the legacy txid.
 */

import * as bitcoin from "bitcoinjs-lib";
import { bufToHex, hexToBuf, reverseBuffer, sha256d, varint } from "./bytes.js";

export interface CoinbaseSplit {
  /** coinb1 hex: version | inputCount | prevTxid(32 zeros) | prevVout(ffffffff) | scriptSigLen | heightPush */
  coinb1Hex: string;
  /** coinb2 hex: tag | sequence | outputCount | outputs | locktime — NO witness, NO marker/flag */
  coinb2Hex: string;
  /** total scriptSig length encoded in coinb1, which assumes EN1Size + EN2Size + tagSize after height push */
  expectedExtraNonce1Size: number;
  expectedExtraNonce2Size: number;
}

/**
 * Encode a number as a minimally-encoded script push (for BIP34 height).
 * Per BIP34: blockHeight serialized as a minimally-encoded signed-little-endian integer.
 */
function encodeHeightPush(height: number): Buffer {
  if (height < 0) throw new Error("encodeHeightPush: negative");
  if (height === 0) return Buffer.from([0x00]);
  // Build little-endian bytes
  const bytes: number[] = [];
  let n = height;
  while (n > 0) {
    bytes.push(n & 0xff);
    n >>>= 8;
  }
  // If top bit set, append 0 to keep it positive
  if ((bytes[bytes.length - 1] & 0x80) !== 0) bytes.push(0x00);
  const data = Buffer.from(bytes);
  return Buffer.concat([Buffer.from([data.length]), data]);
}

export interface BuildCoinbaseOptions {
  height: number;
  coinbaseValueSat: number;
  /** address to receive reward; must be valid on the same network bitcoind reports */
  payoutAddress: string;
  /** segwit commitment scriptPubKey hex (from default_witness_commitment) — optional */
  witnessCommitmentHex?: string;
  /** extra bytes after extranonce1+extranonce2 inside scriptSig — typically pool tag */
  tag?: Buffer;
  /** extranonce1 size in bytes — must match what we hand out at subscribe */
  extraNonce1Size: number;
  /** extranonce2 size in bytes — fixed per pool, communicated at subscribe */
  extraNonce2Size: number;
  /** bitcoinjs-lib network (use bitcoin.networks.bitcoin for Mainnet) */
  network: bitcoin.networks.Network;
}

export function splitCoinbase(opts: BuildCoinbaseOptions): CoinbaseSplit {
  const heightPush = encodeHeightPush(opts.height);
  const tag = opts.tag ?? Buffer.alloc(0);

  const scriptSigLen = heightPush.length + opts.extraNonce1Size + opts.extraNonce2Size + tag.length;
  if (scriptSigLen > 100) {
    // Consensus limit on coinbase scriptSig is 100 bytes.
    throw new Error(`splitCoinbase: scriptSig length ${scriptSigLen} > 100 (BIP34 + extranonces + tag too large)`);
  }

  // --- coinb1 ---
  const version = Buffer.alloc(4);
  version.writeUInt32LE(1, 0); // coinbase version 1 — fine for any segwit-active chain
  const inputCount = Buffer.from([0x01]);
  const prevTxid = Buffer.alloc(32); // coinbase input refers to no prior tx
  const prevVout = Buffer.from([0xff, 0xff, 0xff, 0xff]);
  const scriptSigLenVar = varint(scriptSigLen);
  const coinb1 = Buffer.concat([version, inputCount, prevTxid, prevVout, scriptSigLenVar, heightPush]);

  // --- coinb2 ---
  const sequence = Buffer.from([0xff, 0xff, 0xff, 0xff]);

  const outputs: Buffer[] = [];

  // reward output
  const rewardValue = Buffer.alloc(8);
  rewardValue.writeBigUInt64LE(BigInt(opts.coinbaseValueSat), 0);
  const rewardScriptPubKey = bitcoin.address.toOutputScript(opts.payoutAddress, opts.network);
  outputs.push(
    Buffer.concat([rewardValue, varint(rewardScriptPubKey.length), rewardScriptPubKey]),
  );

  // witness commitment output (if any)
  if (opts.witnessCommitmentHex && opts.witnessCommitmentHex.length > 0) {
    const wcScript = hexToBuf(opts.witnessCommitmentHex);
    const wcValue = Buffer.alloc(8); // value = 0
    outputs.push(Buffer.concat([wcValue, varint(wcScript.length), wcScript]));
  }

  const outputCount = varint(outputs.length);
  const locktime = Buffer.alloc(4); // 0

  const coinb2 = Buffer.concat([tag, sequence, outputCount, ...outputs, locktime]);

  return {
    coinb1Hex: bufToHex(coinb1),
    coinb2Hex: bufToHex(coinb2),
    expectedExtraNonce1Size: opts.extraNonce1Size,
    expectedExtraNonce2Size: opts.extraNonce2Size,
  };
}

/**
 * Assemble the full coinbase tx (no witness) given the split and extranonces.
 * Returns:
 *   - txBytes: the tx without witness data — used for txid + for serialized block construction
 *   - txidLE: little-endian txid bytes (used by merkle root)
 */
export function assembleCoinbaseNoWitness(
  coinb1Hex: string,
  extraNonce1Hex: string,
  extraNonce2Hex: string,
  coinb2Hex: string,
): { txBytes: Buffer; txidLE: Buffer } {
  const tx = Buffer.concat([
    hexToBuf(coinb1Hex),
    hexToBuf(extraNonce1Hex),
    hexToBuf(extraNonce2Hex),
    hexToBuf(coinb2Hex),
  ]);
  const txidLE = sha256d(tx); // already in internal (LE) byte order
  return { txBytes: tx, txidLE };
}

/**
 * Assemble the SegWit-serialized coinbase tx (with marker, flag, and witness).
 * The single witness item is the BIP141 "witness reserved value" — 32 zero
 * bytes — which is what every modern miner uses for the coinbase witness.
 *
 * This is the form that goes into the serialized block we submit to bitcoind.
 */
export function assembleCoinbaseWithWitness(
  coinb1Hex: string,
  extraNonce1Hex: string,
  extraNonce2Hex: string,
  coinb2Hex: string,
): Buffer {
  const coinb1 = hexToBuf(coinb1Hex);
  const coinb2 = hexToBuf(coinb2Hex);
  const en1 = hexToBuf(extraNonce1Hex);
  const en2 = hexToBuf(extraNonce2Hex);

  // coinb1 layout: version(4) | inputCount(1) | prevTxid(32) | prevVout(4) | scriptSigLen(var) | heightPush(var)
  // We need to splice marker(0x00) + flag(0x01) right after the version field.
  const version = coinb1.subarray(0, 4);
  const rest = coinb1.subarray(4);
  const marker = Buffer.from([0x00, 0x01]); // segwit marker + flag

  const witnessReserved = Buffer.alloc(32); // 32 zero bytes
  const witnessSection = Buffer.concat([
    Buffer.from([0x01]), // 1 stack item
    Buffer.from([0x20]), // length 32
    witnessReserved,
  ]);

  return Buffer.concat([
    version,
    marker,
    rest,
    en1,
    en2,
    coinb2.subarray(0, coinb2.length - 4), // tag | sequence | outputs (everything except locktime)
    witnessSection,
    coinb2.subarray(coinb2.length - 4), // locktime (last 4 bytes)
  ]);
}

/** Convenience: take little-endian txid buffer and produce the display-style big-endian txid hex. */
export function txidLEToDisplayHex(txidLE: Buffer): string {
  return bufToHex(reverseBuffer(txidLE));
}
