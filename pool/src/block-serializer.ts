/**
 * Serialize a full block to submit via bitcoind submitblock.
 *
 *   block = header(80) || varint(txCount) || coinbase_tx_with_witness || tx1 || tx2 || ...
 *
 * The non-coinbase transactions come from getblocktemplate (each as `data`
 * hex) and are already serialized correctly (including witness data when
 * applicable).
 */

import { bufToHex, hexToBuf, varint } from "./bytes.js";

export function buildSerializedBlock(
  headerBytes: Buffer,
  coinbaseWithWitness: Buffer,
  otherTxsHex: string[],
): string {
  if (headerBytes.length !== 80) throw new Error("buildSerializedBlock: header must be 80 bytes");
  const txCount = otherTxsHex.length + 1;
  const parts: Buffer[] = [headerBytes, varint(txCount), coinbaseWithWitness];
  for (const txHex of otherTxsHex) {
    parts.push(hexToBuf(txHex));
  }
  return bufToHex(Buffer.concat(parts));
}
