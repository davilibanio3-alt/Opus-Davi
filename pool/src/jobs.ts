/**
 * Job manager — pulls templates from bitcoind, builds Stratum jobs, and
 * notifies subscribers when a new template arrives.
 *
 * We poll `getbestblockhash` every ~2 seconds; when it changes we pull a
 * fresh template and emit a job with `cleanJobs=true`. We also refresh the
 * template every ~30 seconds to capture new mempool transactions, emitting
 * with `cleanJobs=false`. This is a deliberately simple strategy — pools at
 * scale use ZMQ + listblockhashes to react instantly, but for honest
 * small-pool operation this is plenty.
 */

import { EventEmitter } from "node:events";
import * as bitcoin from "bitcoinjs-lib";
import {
  bufToHex,
  hexToBuf,
  nbitsHexToTargetBE,
  reverseBuffer,
  reverseHex,
} from "./bytes.js";
import { assembleCoinbaseNoWitness, splitCoinbase } from "./coinbase.js";
import { computeMerkleBranch } from "./merkle.js";
import { BitcoindRpc } from "./rpc.js";
import type { BlockTemplate, StratumJob } from "./types.js";

interface JobManagerOptions {
  rpc: BitcoindRpc;
  payoutAddress: string;
  /** "main" or "test" or "signet" — controls bitcoinjs-lib network */
  network: "main" | "test" | "signet";
  poolTag?: string;
  /** Size of pool-assigned extraNonce1 in bytes */
  extraNonce1Size: number;
  /** Size of miner-chosen extraNonce2 in bytes (advertised at subscribe) */
  extraNonce2Size: number;
  /** How often to poll best-block-hash (ms) */
  tipPollMs?: number;
  /** How often to refresh the template even if tip didn't change (ms) */
  refreshMs?: number;
}

export class JobManager extends EventEmitter {
  private readonly opts: Required<JobManagerOptions>;
  private readonly bitcoinjsNet: bitcoin.networks.Network;
  private lastTipHash = "";
  private currentJob: StratumJob | null = null;
  private jobCounter = 0;
  private tipTimer?: NodeJS.Timeout;
  private refreshTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(opts: JobManagerOptions) {
    super();
    this.opts = {
      tipPollMs: 2000,
      refreshMs: 30_000,
      poolTag: "opus-davi",
      ...opts,
    };
    this.bitcoinjsNet =
      opts.network === "test"
        ? bitcoin.networks.testnet
        : opts.network === "signet"
        ? bitcoin.networks.testnet // signet uses same prefixes as testnet for our purposes
        : bitcoin.networks.bitcoin;
  }

  async start(): Promise<void> {
    await this.refresh(true);
    this.tipTimer = setInterval(() => {
      void this.pollTip();
    }, this.opts.tipPollMs);
    this.refreshTimer = setInterval(() => {
      void this.refresh(false);
    }, this.opts.refreshMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.tipTimer) clearInterval(this.tipTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  getCurrentJob(): StratumJob | null {
    return this.currentJob;
  }

  private async pollTip(): Promise<void> {
    if (this.stopped) return;
    try {
      const tip = await this.opts.rpc.getBestBlockHash();
      if (tip !== this.lastTipHash) {
        this.lastTipHash = tip;
        await this.refresh(true);
      }
    } catch (e) {
      this.emit("error", e);
    }
  }

  private async refresh(cleanJobs: boolean): Promise<void> {
    if (this.stopped) return;
    try {
      const template = (await this.opts.rpc.getBlockTemplate()) as BlockTemplate;
      const job = this.buildJob(template, cleanJobs);
      this.currentJob = job;
      this.emit("job", job);
    } catch (e) {
      this.emit("error", e);
    }
  }

  private buildJob(template: BlockTemplate, cleanJobs: boolean): StratumJob {
    this.jobCounter++;
    const jobId = this.jobCounter.toString(16);

    // --- coinbase ---
    const split = splitCoinbase({
      height: template.height,
      coinbaseValueSat: template.coinbasevalue,
      payoutAddress: this.opts.payoutAddress,
      witnessCommitmentHex: template.default_witness_commitment,
      tag: Buffer.from(`/${this.opts.poolTag}/`, "utf8"),
      extraNonce1Size: this.opts.extraNonce1Size,
      extraNonce2Size: this.opts.extraNonce2Size,
      network: this.bitcoinjsNet,
    });

    // --- merkle branch ---
    // Each non-coinbase tx has txid (BE display hex) or hash. We need LE internal bytes.
    const otherTxidsLE: Buffer[] = (template.transactions ?? []).map((tx) => {
      const display = tx.txid ?? tx.hash;
      if (!display) throw new Error("template tx missing txid/hash");
      return reverseBuffer(hexToBuf(display));
    });
    const branchLE = computeMerkleBranch(otherTxidsLE);
    // Stratum sends merkle branch as BE display hex strings.
    const merkleBranchBEHex = branchLE.map((b) => bufToHex(reverseBuffer(b)));

    // --- header fields ---
    const versionLEHex = leUint32Hex(template.version);
    const prevHashLEHex = reverseHex(template.previousblockhash);
    const nbitsHex = template.bits; // BE hex like "1d00ffff"
    const nbitsLEHex = reverseHex(nbitsHex);
    const ntimeLEHex = leUint32Hex(template.curtime);

    const networkTargetHex = template.target ?? bufToHex(nbitsHexToTargetBE(nbitsHex));

    return {
      jobId,
      version: versionLEHex,
      prevHashLEHex,
      coinb1: split.coinb1Hex,
      coinb2: split.coinb2Hex,
      merkleBranch: merkleBranchBEHex,
      nbitsLEHex,
      ntimeLEHex,
      networkTargetHex,
      height: template.height,
      template,
      witnessCommitmentHex: template.default_witness_commitment,
      createdAt: Math.floor(Date.now() / 1000),
      cleanJobs,
    };
  }
}

function leUint32Hex(n: number): string {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b.toString("hex");
}

/** Re-export so callers can also reconstruct coinbase txid from a share. */
export const _internals = { assembleCoinbaseNoWitness };
