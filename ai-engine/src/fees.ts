/**
 * Fee prediction from mempool depth histogram.
 *
 * Input: mempool.space `/v1/fees/mempool-blocks` — an array of objects, each
 * representing a virtual "next block" with { blockSize, blockVSize, nTx, totalFees,
 * medianFee, feeRange: number[] }.
 *
 * Output: the median fee (sat/vB) required to be included within N blocks.
 */

export interface MempoolBlock {
  blockSize: number;
  blockVSize: number;
  nTx: number;
  totalFees: number;
  medianFee: number;
  feeRange: number[];
}

export function predictFeeForBlocks(blocks: MempoolBlock[], targetBlocks: number): number {
  if (blocks.length === 0) return 1;
  const idx = Math.max(0, Math.min(blocks.length - 1, targetBlocks - 1));
  // Use the minimum of the bottom fee-range bucket of the target block as a
  // conservative inclusion threshold.
  const range = blocks[idx].feeRange;
  if (!range || range.length === 0) return blocks[idx].medianFee;
  return Math.max(1, Math.ceil(range[0]));
}

export function predictionsByHorizon(blocks: MempoolBlock[]): {
  next: number;
  threeBlocks: number;
  sixBlocks: number;
  twentyBlocks: number;
} {
  return {
    next: predictFeeForBlocks(blocks, 1),
    threeBlocks: predictFeeForBlocks(blocks, 3),
    sixBlocks: predictFeeForBlocks(blocks, 6),
    twentyBlocks: predictFeeForBlocks(blocks, 20),
  };
}
