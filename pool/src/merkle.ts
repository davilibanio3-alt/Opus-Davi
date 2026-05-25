/**
 * Merkle tree helpers for Bitcoin block templates.
 *
 * Stratum V1 ships a "merkle branch" — the sibling hashes you need to combine
 * with the coinbase txid in order to recompute the merkle root. We build that
 * once per template; for each share we only need O(log n) sha256d operations.
 */

import { sha256d } from "./bytes.js";

/**
 * Compute the merkle branch from the list of non-coinbase tx hashes
 * (already in internal little-endian byte order, raw 32-byte buffers).
 *
 * The branch elements are the hashes you concatenate (in order) with
 * `current = sha256d(current || branch[i])` starting from the coinbase txid.
 */
export function computeMerkleBranch(otherTxHashesLE: Buffer[]): Buffer[] {
  const branch: Buffer[] = [];
  // Each iteration: we sit at level L with `current` (which after combining
  // with branch[0] gives the level-L+1 ancestor of the coinbase). Compute the
  // sibling on this level, then build the next-level list.
  let level: (Buffer | null)[] = [null, ...otherTxHashesLE]; // index 0 = "coinbase slot"
  while (level.length > 1) {
    // Sibling of coinbase at this level is level[1] (or coinbase itself if
    // level has only 1 entry, which means no other txs at this level).
    const sibling = level[1] ?? level[0]!;
    branch.push(sibling);
    const next: (Buffer | null)[] = [null];
    // Combine pairs from level[2..], using last-element duplication.
    for (let i = 2; i < level.length; i += 2) {
      const a = level[i]!;
      const b = level[i + 1] ?? a;
      next.push(sha256d(Buffer.concat([a, b])));
    }
    level = next;
  }
  return branch;
}

/**
 * Recompute the merkle root from a coinbase txid and a branch.
 * Inputs are little-endian 32-byte buffers (internal byte order).
 */
export function rebuildMerkleRoot(coinbaseTxidLE: Buffer, branch: Buffer[]): Buffer {
  let current = coinbaseTxidLE;
  for (const sibling of branch) {
    current = sha256d(Buffer.concat([current, sibling]));
  }
  return current;
}
