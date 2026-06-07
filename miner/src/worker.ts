/**
 * SHA-256d hashing worker.
 *
 * Each worker iterates extraNonce2 (8 bytes wide, indexed by workerId so two
 * workers never produce the same coinbase) and within each extraNonce2 sweeps
 * the 32-bit header nonce. For every nonce, it serializes the 80-byte header
 * and computes SHA-256d. When the hash beats the share target it posts the
 * share back to the main thread.
 *
 * Honest throughput note: Node's crypto.createHash is general-purpose and
 * around 1–10 MH/s per core on modern hardware. This is several orders of
 * magnitude below an ASIC. Don't expect to earn BTC — expect to prove that
 * the protocol works end-to-end.
 */

import { parentPort } from "node:worker_threads";
import { bufCmpBE, hexToBuf, reverseBuffer, sha256d } from "./bytes.js";
import type { MainToWorker, MinerJob, WorkerToMain } from "./types.js";

interface ActiveJob {
  job: MinerJob;
  /** target as 32-byte BE buffer */
  shareTarget: Buffer;
  /** prebuilt prefix used to rebuild the coinbase: coinb1 || en1 (this is static per job) */
  coinbasePrefix: Buffer;
  /** coinb2 bytes */
  coinb2: Buffer;
  /** merkle branch as LE 32-byte buffers (internal byte order) */
  branchLE: Buffer[];
  /** static header parts (LE) — version(4) || prevHash(32) [|| merkleRoot(32, swapped each share) || ntime(4) || nbits(4) || nonce(4)] */
  staticHeader: Buffer; // version || prevhash, 36 bytes
  ntime: Buffer; // 4 bytes LE
  nbits: Buffer; // 4 bytes LE
}

let active: ActiveJob | null = null;
let workerId = 0;
let workerCount = 1;
let stopFlag = false;

const HASHES_PER_REPORT = 50_000;

parentPort?.on("message", (msg: MainToWorker) => {
  if (msg.type === "stop") {
    stopFlag = true;
    return;
  }
  if (typeof msg.workerId === "number") workerId = msg.workerId;
  if (typeof msg.workerCount === "number") workerCount = Math.max(1, msg.workerCount);
  if (msg.type === "job" && msg.job) {
    active = prepareJob(msg.job);
    // start a fresh sweep
    setImmediate(() => mineLoop());
  }
});

parentPort?.postMessage({ type: "ready" } satisfies WorkerToMain);

function prepareJob(job: MinerJob): ActiveJob {
  const coinbasePrefix = Buffer.concat([hexToBuf(job.coinb1), hexToBuf(job.extraNonce1Hex)]);
  const coinb2 = hexToBuf(job.coinb2);
  const branchLE = job.merkleBranchBEHex.map((h) => reverseBuffer(hexToBuf(h)));
  const staticHeader = Buffer.concat([hexToBuf(job.versionLEHex), hexToBuf(job.prevHashLEHex)]);
  return {
    job,
    shareTarget: hexToBuf(job.shareTargetHex.padStart(64, "0")),
    coinbasePrefix,
    coinb2,
    branchLE,
    staticHeader,
    ntime: hexToBuf(job.ntimeLEHex),
    nbits: hexToBuf(job.nbitsLEHex),
  };
}

function rebuildMerkleRoot(coinbaseTxidLE: Buffer, branchLE: Buffer[]): Buffer {
  let current = coinbaseTxidLE;
  for (const sibling of branchLE) {
    current = sha256d(Buffer.concat([current, sibling]));
  }
  return current;
}

function mineLoop(): void {
  if (stopFlag || !active) return;
  const captured = active;

  // ExtraNonce2 strategy: workerId in the high half, sweep counter in the low half.
  // Each worker therefore explores a disjoint slice of the EN2 space.
  const en2Size = captured.job.extraNonce2Size;
  const en2Buf = Buffer.alloc(en2Size);
  // top 2 bytes (when en2Size >= 4) encode workerId so we stay disjoint
  if (en2Size >= 2) en2Buf.writeUInt16BE(workerId & 0xffff, 0);
  let en2Counter = 0;
  const en2CounterMax = en2Size >= 4 ? 0xffffffff : 0xffff;

  function rebuildHeaderTemplate(en2: Buffer): Buffer {
    const coinbase = Buffer.concat([captured.coinbasePrefix, en2, captured.coinb2]);
    const coinbaseTxidLE = sha256d(coinbase);
    const merkleRootLE = rebuildMerkleRoot(coinbaseTxidLE, captured.branchLE);
    // header layout: version(4) || prevHash(32) || merkleRoot(32) || ntime(4) || nbits(4) || nonce(4)
    return Buffer.concat([
      captured.staticHeader, // 36
      merkleRootLE, // 32
      captured.ntime, // 4
      captured.nbits, // 4
      Buffer.alloc(4), // nonce placeholder
    ]);
  }

  let header = rebuildHeaderTemplate(en2Buf);
  let nonce = 0;
  let hashes = 0;
  let tStart = process.hrtime.bigint();

  function chunk(): void {
    if (stopFlag || active !== captured) return;
    const end = nonce + HASHES_PER_REPORT;
    for (; nonce < end && nonce <= 0xffffffff; nonce++) {
      header.writeUInt32LE(nonce >>> 0, 76);
      const hashLE = sha256d(header);
      const hashBE = reverseBuffer(hashLE);
      if (bufCmpBE(hashBE, captured.shareTarget) <= 0) {
        parentPort?.postMessage({
          type: "share",
          share: {
            jobId: captured.job.jobId,
            extraNonce2Hex: en2Buf.toString("hex"),
            ntimeLEHex: captured.ntime.toString("hex"),
            nonceLEHex: header.subarray(76, 80).toString("hex"),
            hashBEHex: hashBE.toString("hex"),
          },
        } satisfies WorkerToMain);
      }
    }
    hashes += HASHES_PER_REPORT;
    const elapsedNs = Number(process.hrtime.bigint() - tStart);
    parentPort?.postMessage({
      type: "hashrate",
      hashrate: { workerId, hashes: HASHES_PER_REPORT, ms: elapsedNs / 1e6 },
    } satisfies WorkerToMain);
    tStart = process.hrtime.bigint();

    if (nonce > 0xffffffff) {
      // Exhausted nonce range for this en2; bump en2 and rebuild header.
      en2Counter = (en2Counter + 1) & en2CounterMax;
      if (en2Size >= 4) {
        en2Buf.writeUInt16BE((en2Counter >>> 16) & 0xffff, en2Size - 4);
        en2Buf.writeUInt16BE(en2Counter & 0xffff, en2Size - 2);
      } else {
        en2Buf.writeUInt16BE(en2Counter & 0xffff, en2Size - 2);
      }
      header = rebuildHeaderTemplate(en2Buf);
      nonce = 0;
    }
    setImmediate(chunk);
  }

  setImmediate(chunk);
}
