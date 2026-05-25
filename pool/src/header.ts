/**
 * Bitcoin block header (de)serialization + hashing.
 *
 * Header layout (80 bytes total):
 *   version    : 4 bytes LE
 *   prev hash  : 32 bytes LE (reversed from RPC display form)
 *   merkle root: 32 bytes LE
 *   ntime      : 4 bytes LE
 *   nbits      : 4 bytes LE
 *   nonce      : 4 bytes LE
 *
 * Block hash = reverse(sha256d(header))  → big-endian "0000...abc" display form.
 */

import { hexToBuf, reverseBuffer, sha256d } from "./bytes.js";

export interface HeaderFields {
  /** little-endian version hex (4 bytes) */
  versionLEHex: string;
  /** little-endian prev hash hex (32 bytes) — already reversed from RPC */
  prevHashLEHex: string;
  /** little-endian merkle root hex (32 bytes) */
  merkleRootLEHex: string;
  /** little-endian ntime hex (4 bytes) */
  nTimeLEHex: string;
  /** little-endian nbits hex (4 bytes) */
  nBitsLEHex: string;
  /** little-endian nonce hex (4 bytes) */
  nonceLEHex: string;
}

export function serializeHeader(f: HeaderFields): Buffer {
  const buf = Buffer.concat([
    hexToBuf(f.versionLEHex),
    hexToBuf(f.prevHashLEHex),
    hexToBuf(f.merkleRootLEHex),
    hexToBuf(f.nTimeLEHex),
    hexToBuf(f.nBitsLEHex),
    hexToBuf(f.nonceLEHex),
  ]);
  if (buf.length !== 80) throw new Error(`serializeHeader: expected 80 bytes, got ${buf.length}`);
  return buf;
}

/** Compute SHA-256d(header) and return both LE (internal) and BE (display) hashes. */
export function hashHeader(f: HeaderFields): { hashLE: Buffer; hashBE: Buffer } {
  const header = serializeHeader(f);
  const hashLE = sha256d(header);
  const hashBE = reverseBuffer(hashLE);
  return { hashLE, hashBE };
}

/** Same as hashHeader, but given the raw 80-byte header buffer. */
export function hashHeaderBuf(header: Buffer): { hashLE: Buffer; hashBE: Buffer } {
  if (header.length !== 80) throw new Error("hashHeaderBuf: expected 80 bytes");
  const hashLE = sha256d(header);
  const hashBE = reverseBuffer(hashLE);
  return { hashLE, hashBE };
}
