/**
 * @btc-platform/ai-engine
 *
 * Honest behavioral analytics on real Bitcoin Mainnet data.
 *
 * No LLM, no hype. These are statistical estimators that operate on actual
 * mempool / block / address data and produce useful signals:
 *
 *  - Fee prediction (next 1 / 3 / 6 blocks) from mempool depth histogram
 *  - Whale tx detection (large BTC value or unusual fan-out)
 *  - Address risk score (heuristic: known sanctioned prefixes, mixer patterns,
 *    high churn — all configurable, no third-party data sources baked in)
 */

export * from "./fees";
export * from "./whales";
export * from "./risk";
