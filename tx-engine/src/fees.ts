/**
 * Live fee estimation against the public mempool.space API (Bitcoin Mainnet).
 * Returns sat/vB rates. All numbers come from a real node behind mempool.space —
 * no hard-coded or simulated values.
 */

export interface FeeRates {
  fastest: number;
  halfHour: number;
  hour: number;
  economy: number;
  minimum: number;
}

export async function fetchFeeRates(
  baseUrl = "https://mempool.space/api",
): Promise<FeeRates> {
  const r = await fetch(`${baseUrl}/v1/fees/recommended`);
  if (!r.ok) throw new Error(`fee fetch failed: ${r.status}`);
  const j = (await r.json()) as {
    fastestFee: number;
    halfHourFee: number;
    hourFee: number;
    economyFee: number;
    minimumFee: number;
  };
  return {
    fastest: j.fastestFee,
    halfHour: j.halfHourFee,
    hour: j.hourFee,
    economy: j.economyFee,
    minimum: j.minimumFee,
  };
}

/**
 * Coarse virtual-size estimator for an "average" tx of the given kind.
 * Used for first-pass fee selection in the UI — the actual fee is recomputed
 * after PSBT finalization using the real vsize.
 */
export function estimateVsize(
  inputs: number,
  outputs: number,
  kind: "legacy" | "p2sh-p2wpkh" | "p2wpkh" | "p2tr",
): number {
  // Per-input / per-output vbyte costs (rough).
  const overhead = 11;
  const inSize = { legacy: 148, "p2sh-p2wpkh": 91, p2wpkh: 68, p2tr: 57.5 }[kind];
  const outSize = 31; // assume p2wpkh-ish recipient; close enough for UX
  return Math.ceil(overhead + inputs * inSize + outputs * outSize);
}
