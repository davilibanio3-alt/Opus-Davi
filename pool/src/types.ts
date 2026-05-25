/**
 * Shared types for the Stratum V1 pool server.
 */

export interface BlockTemplate {
  version: number;
  /** previousblockhash (big-endian hex from bitcoind) */
  previousblockhash: string;
  /** target as hex (big-endian) */
  target: string;
  /** compact nbits (hex) */
  bits: string;
  /** unix timestamp recommended */
  curtime: number;
  /** mintime */
  mintime: number;
  /** maximum coinbase value (sats) — block subsidy + tx fees */
  coinbasevalue: number;
  /** non-coinbase transactions; each has .data (hex of full tx) and .txid (or .hash) */
  transactions: Array<{ data: string; txid?: string; hash?: string; fee?: number }>;
  /** segwit commitment scriptPubKey hex (push of 36 bytes) when segwit rule is active */
  default_witness_commitment?: string;
  /** height of this candidate block */
  height: number;
}

/** Job we hand to miners over Stratum. */
export interface StratumJob {
  jobId: string;
  /** little-endian, 4-byte version hex */
  version: string;
  /** little-endian (reversed from RPC) prevhash, split into 8 × 4-byte chunks for old miners */
  prevHashLEHex: string;
  /** raw coinbase split into coinb1 + extranonce1 + extranonce2 + coinb2 */
  coinb1: string;
  coinb2: string;
  /** merkle branch (hashes of merkle tree above coinbase), each 32 bytes hex BE */
  merkleBranch: string[];
  /** nbits (LE hex, 4 bytes) */
  nbitsLEHex: string;
  /** ntime (LE hex, 4 bytes) */
  ntimeLEHex: string;
  /** target for network block (big-endian hex, 32 bytes) — used to detect block found */
  networkTargetHex: string;
  /** template height */
  height: number;
  /** template snapshot used to assemble the candidate block when broadcasting */
  template: BlockTemplate;
  /** witness commitment script hex (for segwit blocks) */
  witnessCommitmentHex?: string;
  /** seconds since epoch when we created the job */
  createdAt: number;
  /** when true, miners must drop old jobs and switch to this one */
  cleanJobs: boolean;
}

/** Per-connection Stratum session. */
export interface StratumSession {
  id: string;
  /** assigned at subscribe — 4 bytes hex */
  extraNonce1Hex: string;
  /** miner's chosen extraNonce2 size — fixed at 4 bytes */
  extraNonce2Size: number;
  /** authorized worker name */
  worker?: string;
  /** current share target (BE hex, 32 bytes) */
  shareTargetHex: string;
  /** difficulty as a float (vardiff future, fixed for now) */
  difficulty: number;
  /** remote address for logs */
  remote: string;
  /** stats */
  sharesAccepted: number;
  sharesRejected: number;
  /** unix ts of last accepted share */
  lastShareAt: number;
  /** unix ts of subscribe */
  connectedAt: number;
  /** cumulative difficulty of accepted shares (used for hashrate estimation) */
  acceptedDifficultySum: number;
}

export interface ShareSubmission {
  jobId: string;
  extraNonce2Hex: string;
  /** ntime as sent by miner (LE hex, 4 bytes) */
  nTimeLEHex: string;
  /** nonce as sent by miner (LE hex, 4 bytes) */
  nonceLEHex: string;
}

export interface ShareResult {
  ok: boolean;
  /** reason code if rejected: "stale", "duplicate", "high-hash", "ntime-out-of-range", "bad-job", "bad-shapes" */
  reason?: string;
  /** when share also satisfies the network target, this is set to the block hash (BE hex) and the serialized block is submitted */
  blockHashBEHex?: string;
  /** computed header hash (BE hex) for telemetry */
  headerHashBEHex?: string;
}
