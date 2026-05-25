/**
 * @btc-platform/tx-engine
 *
 * Real Bitcoin Mainnet PSBT engine. All operations are deterministic,
 * client-friendly and isomorphic (browser + Node). No private key ever leaves
 * the caller's process unless they explicitly export it.
 *
 * - Address derivation (BIP32/BIP44/BIP49/BIP84/BIP86)
 * - PSBT construction (legacy / segwit-v0 / taproot)
 * - Fee estimation against live mempool feerates
 * - RBF & CPFP helpers
 * - Local signing (ECPair / BIP32 nodes / external signers via PSBT)
 * - Broadcast to public mempool relays (mempool.space / blockstream.info)
 */

export * from "./network";
export * from "./hd";
export * from "./psbt";
export * from "./fees";
export * from "./broadcast";
