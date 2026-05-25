export interface TxLike {
  txid: string;
  vin: Array<{ prevout?: { value: number } }>;
  vout: Array<{ value: number; scriptpubkey_address?: string }>;
  fee?: number;
}

export interface WhaleSignal {
  txid: string;
  totalOut: number; // sats
  isWhale: boolean;
  reason?: string;
}

const WHALE_SATS = 100 * 100_000_000; // 100 BTC

export function detectWhale(tx: TxLike): WhaleSignal {
  const totalOut = tx.vout.reduce((s, o) => s + o.value, 0);
  if (totalOut >= WHALE_SATS) {
    return { txid: tx.txid, totalOut, isWhale: true, reason: ">= 100 BTC moved" };
  }
  // Fan-out detection: 50+ outputs of >0.1 BTC each
  const bigOuts = tx.vout.filter((o) => o.value >= 0.1 * 100_000_000).length;
  if (bigOuts >= 50) {
    return {
      txid: tx.txid,
      totalOut,
      isWhale: true,
      reason: `fan-out of ${bigOuts} outputs >= 0.1 BTC`,
    };
  }
  return { txid: tx.txid, totalOut, isWhale: false };
}
