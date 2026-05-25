export interface AddressActivity {
  address: string;
  txCount: number;
  totalReceived: number;
  totalSpent: number;
  uniqueCounterparties: number;
}

export interface RiskScore {
  address: string;
  score: number; // 0..100
  flags: string[];
}

/**
 * Heuristic risk score. NOT a substitute for compliance tooling — purely
 * statistical, no external blacklists are baked in.
 */
export function scoreAddress(a: AddressActivity): RiskScore {
  const flags: string[] = [];
  let score = 0;

  if (a.txCount > 1000) {
    flags.push("very-high-tx-count");
    score += 20;
  } else if (a.txCount > 100) {
    flags.push("high-tx-count");
    score += 10;
  }

  if (a.uniqueCounterparties > 500) {
    flags.push("very-high-counterparty-diversity");
    score += 25;
  } else if (a.uniqueCounterparties > 100) {
    flags.push("high-counterparty-diversity");
    score += 12;
  }

  const churn = a.totalSpent > 0 ? a.totalSpent / Math.max(1, a.totalReceived) : 0;
  if (churn > 0.95 && a.totalReceived > 1_000_000) {
    flags.push("pass-through-pattern");
    score += 15;
  }

  return { address: a.address, score: Math.min(100, score), flags };
}
