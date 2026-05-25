/**
 * Share validation.
 *
 * Reconstruct the candidate block header from the miner's submission, hash it,
 * and compare against:
 *   1. The pool's share target  (loose — every accepted share counts toward
 *      the worker's hashrate and earns a hypothetical payout in PPLNS mode).
 *   2. The Bitcoin network target (strict — if hit, we've found a block and
 *      submit it to bitcoind).
 *
 * We do NOT trust the miner-supplied ntime/nonce/etc beyond Stratum spec —
 * ntime must lie within [mintime, mintime+7200], and we deduplicate
 * (jobId, extraNonce2, ntime, nonce) tuples in the session.
 */

import {
  be32ToBigInt,
  bufCmpBE,
  hexToBuf,
  reverseBuffer,
} from "./bytes.js";
import { assembleCoinbaseNoWitness } from "./coinbase.js";
import { hashHeader } from "./header.js";
import { rebuildMerkleRoot } from "./merkle.js";
import type { ShareResult, ShareSubmission, StratumJob, StratumSession } from "./types.js";

interface ValidationContext {
  job: StratumJob;
  session: StratumSession;
  submission: ShareSubmission;
}

export function validateShare(ctx: ValidationContext): ShareResult & {
  /** present when block found OR for telemetry — full assembled header bytes */
  headerBytesHex?: string;
  /** coinbase tx hex (without witness) — used to compute coinbase txid for stats */
  coinbaseNoWitnessHex?: string;
} {
  const { job, session, submission } = ctx;

  // ntime sanity: within [mintime, mintime+7200]
  const ntime = parseLeUint32(submission.nTimeLEHex);
  if (
    ntime < job.template.mintime ||
    ntime > job.template.mintime + 7200 ||
    ntime > Math.floor(Date.now() / 1000) + 7200
  ) {
    return { ok: false, reason: "ntime-out-of-range" };
  }

  // shape checks
  if (submission.extraNonce2Hex.length !== session.extraNonce2Size * 2) {
    return { ok: false, reason: "bad-shapes" };
  }
  if (submission.nonceLEHex.length !== 8 || submission.nTimeLEHex.length !== 8) {
    return { ok: false, reason: "bad-shapes" };
  }

  // assemble coinbase
  const cb = assembleCoinbaseNoWitness(
    job.coinb1,
    session.extraNonce1Hex,
    submission.extraNonce2Hex,
    job.coinb2,
  );

  // rebuild merkle root
  // job.merkleBranch is BE display hex; convert to LE for combining
  const branchLE = job.merkleBranch.map((h) => reverseBuffer(hexToBuf(h)));
  const merkleRootLE = rebuildMerkleRoot(cb.txidLE, branchLE);

  // hash header
  const headerFields = {
    versionLEHex: job.version,
    prevHashLEHex: job.prevHashLEHex,
    merkleRootLEHex: merkleRootLE.toString("hex"),
    nTimeLEHex: submission.nTimeLEHex,
    nBitsLEHex: job.nbitsLEHex,
    nonceLEHex: submission.nonceLEHex,
  };
  const { hashBE } = hashHeader(headerFields);

  const shareTargetBuf = hexToBuf(session.shareTargetHex.padStart(64, "0"));
  const networkTargetBuf = hexToBuf(job.networkTargetHex.padStart(64, "0"));

  if (bufCmpBE(hashBE, shareTargetBuf) > 0) {
    return { ok: false, reason: "high-hash", headerHashBEHex: hashBE.toString("hex") };
  }

  // Share accepted. Is it also a block?
  const isBlock = bufCmpBE(hashBE, networkTargetBuf) <= 0;
  return {
    ok: true,
    headerHashBEHex: hashBE.toString("hex"),
    blockHashBEHex: isBlock ? hashBE.toString("hex") : undefined,
    coinbaseNoWitnessHex: cb.txBytes.toString("hex"),
  };
}

function parseLeUint32(leHex: string): number {
  if (leHex.length !== 8) throw new Error("parseLeUint32: bad length");
  return hexToBuf(leHex).readUInt32LE(0);
}

/** Estimate the implied hashrate from accepted-share difficulty over a window. */
export function impliedHashrate(acceptedDifficultySum: number, windowSeconds: number): number {
  if (windowSeconds <= 0) return 0;
  // Each share at difficulty D represents 2^32 * D expected hashes.
  return (acceptedDifficultySum * 0x100000000) / windowSeconds;
}

/** Convert an accepted share's difficulty into a hash count. */
export function difficultyToHashCount(difficulty: number): bigint {
  return BigInt(Math.floor(difficulty * 0x100000000));
}

/** For unit visibility, also expose the underlying header hash bigint. */
export function headerHashBigInt(hashBE: Buffer): bigint {
  return be32ToBigInt(hashBE);
}
