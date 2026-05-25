/** Stratum job snapshot the worker thread needs to iterate. */
export interface MinerJob {
  jobId: string;
  prevHashLEHex: string;
  coinb1: string;
  coinb2: string;
  merkleBranchBEHex: string[];
  versionLEHex: string;
  nbitsLEHex: string;
  ntimeLEHex: string;
  cleanJobs: boolean;
  /** assigned at subscribe */
  extraNonce1Hex: string;
  /** chosen by pool at subscribe — # bytes the worker should fill */
  extraNonce2Size: number;
  /** share target as 32-byte big-endian hex */
  shareTargetHex: string;
}

/** Found share, sent worker -> main thread, then main thread -> pool. */
export interface FoundShare {
  jobId: string;
  extraNonce2Hex: string;
  ntimeLEHex: string;
  nonceLEHex: string;
  /** big-endian header hash (just for logs) */
  hashBEHex: string;
}

/** worker -> main: periodic hashrate report. */
export interface HashrateReport {
  workerId: number;
  hashes: number;
  ms: number;
}

export interface MainToWorker {
  type: "job" | "stop";
  job?: MinerJob;
  workerId?: number;
  workerCount?: number;
}

export interface WorkerToMain {
  type: "share" | "hashrate" | "ready";
  share?: FoundShare;
  hashrate?: HashrateReport;
}
