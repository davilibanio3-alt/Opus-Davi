/**
 * Byte / endianness helpers for Bitcoin block-header math.
 *
 * Bitcoin is inconsistent: hashes and targets are *displayed* big-endian but
 * *serialized* little-endian. Stratum then re-flips some fields again. We
 * centralize the flips here so the rest of the code stays readable.
 */

import crypto from "node:crypto";

export function hexToBuf(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

export function bufToHex(buf: Buffer): string {
  return buf.toString("hex");
}

/** Reverse bytes (big-endian hex <-> little-endian hex). */
export function reverseHex(hex: string): string {
  return reverseBuffer(hexToBuf(hex)).toString("hex");
}

export function reverseBuffer(buf: Buffer): Buffer {
  return Buffer.from(buf).reverse();
}

/** SHA-256(SHA-256(x)) — Bitcoin's double-SHA256. */
export function sha256d(buf: Buffer): Buffer {
  const a = crypto.createHash("sha256").update(buf).digest();
  return crypto.createHash("sha256").update(a).digest();
}

/** SHA-256(x) — single SHA-256. */
export function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

/** Bitcoin variable-length integer encoding. */
export function varint(n: number | bigint): Buffer {
  const v = typeof n === "bigint" ? n : BigInt(n);
  if (v < 0xfdn) return Buffer.from([Number(v)]);
  if (v <= 0xffffn) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(Number(v), 1);
    return b;
  }
  if (v <= 0xffffffffn) {
    const b = Buffer.alloc(5);
    b[0] = 0xfe;
    b.writeUInt32LE(Number(v), 1);
    return b;
  }
  const b = Buffer.alloc(9);
  b[0] = 0xff;
  b.writeBigUInt64LE(v, 1);
  return b;
}

/** Decode varint, returns { value, size }. */
export function readVarint(buf: Buffer, off: number): { value: bigint; size: number } {
  const first = buf[off];
  if (first < 0xfd) return { value: BigInt(first), size: 1 };
  if (first === 0xfd) return { value: BigInt(buf.readUInt16LE(off + 1)), size: 3 };
  if (first === 0xfe) return { value: BigInt(buf.readUInt32LE(off + 1)), size: 5 };
  return { value: buf.readBigUInt64LE(off + 1), size: 9 };
}

/** Compare two 32-byte buffers as big-endian unsigned ints. */
export function bufCmpBE(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) throw new Error("bufCmpBE: length mismatch");
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/** Big-endian 32-byte buffer to bigint. */
export function be32ToBigInt(buf: Buffer): bigint {
  if (buf.length !== 32) throw new Error("be32ToBigInt: expected 32 bytes");
  let v = 0n;
  for (const byte of buf) {
    v = (v << 8n) | BigInt(byte);
  }
  return v;
}

/** Build a 32-byte big-endian buffer from a bigint (pad/truncate). */
export function bigIntToBE32(v: bigint): Buffer {
  if (v < 0n) throw new Error("bigIntToBE32: negative");
  const out = Buffer.alloc(32);
  let x = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x !== 0n) throw new Error("bigIntToBE32: overflow");
  return out;
}

/** Convert nbits (compact target form, 4-byte hex BE) to a 32-byte BE target buffer. */
export function nbitsHexToTargetBE(nbitsHex: string): Buffer {
  const nbits = parseInt(nbitsHex, 16);
  const exponent = nbits >>> 24;
  const mantissa = nbits & 0x007fffff;
  const negative = (nbits & 0x00800000) !== 0;
  if (negative || mantissa === 0) return Buffer.alloc(32);
  let target = 0n;
  if (exponent <= 3) {
    target = BigInt(mantissa) >> BigInt(8 * (3 - exponent));
  } else {
    target = BigInt(mantissa) << BigInt(8 * (exponent - 3));
  }
  return bigIntToBE32(target);
}

/**
 * Convert a Stratum-style difficulty (float, where diff=1 maps to the
 * "pdiff" 0x00000000ffff...ff target) into a 32-byte BE target buffer.
 *
 * pdiff_1_target = 0x00000000ffff0000000000000000000000000000000000000000000000000000
 * target = pdiff_1_target / difficulty
 */
export function difficultyToTargetBE(difficulty: number): Buffer {
  if (!Number.isFinite(difficulty) || difficulty <= 0) throw new Error("difficultyToTargetBE: bad difficulty");
  const pdiff1 = (0xffffn << 208n);
  // multiply by 2^32 to keep precision, then divide
  const scaled = BigInt(Math.floor(difficulty * 0x100000000));
  if (scaled === 0n) throw new Error("difficultyToTargetBE: scaled difficulty too small");
  const target = (pdiff1 << 32n) / scaled;
  // clamp into 32 bytes (target must be < 2^256)
  const max = (1n << 256n) - 1n;
  return bigIntToBE32(target > max ? max : target);
}
