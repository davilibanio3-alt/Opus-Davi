import crypto from "node:crypto";

export function hexToBuf(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

export function bufToHex(buf: Buffer): string {
  return buf.toString("hex");
}

export function reverseBuffer(buf: Buffer): Buffer {
  return Buffer.from(buf).reverse();
}

export function sha256d(buf: Buffer): Buffer {
  const a = crypto.createHash("sha256").update(buf).digest();
  return crypto.createHash("sha256").update(a).digest();
}

export function bufCmpBE(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) throw new Error("bufCmpBE: length mismatch");
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function leUint32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}
