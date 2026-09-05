import type { AppConfig } from "./config.js";
import { buildMintPlan, broadcastMint, MintBlockedError, type MintSuccess } from "./mint.js";
import type { ConnectedWallet } from "./wallet.js";

const MAX_TIMEOUT_MS = 2_147_483_647;
const PREWAKE_MS = 8_000;

export type ArmedStatus = "waiting" | "minting" | "done" | "failed" | "cancelled";

export interface ArmedJob {
  nftContract: string;
  chainLabel: string;
  quantity: number;
  startTime: number;
  armedAt: number;
  status: ArmedStatus;
  lastError?: string;
  txHash?: string;
  explorer?: string;
}

type FireHandler = (event: { job: ArmedJob; result?: MintSuccess; error?: string }) => void;

export class Watcher {
  private job: ArmedJob | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly connected: ConnectedWallet,
    private readonly onFire: FireHandler,
  ) {}

  getJob(): ArmedJob | null {
    return this.job ? { ...this.job } : null;
  }

  isBusy(): boolean {
    return this.job?.status === "waiting" || this.job?.status === "minting";
  }

  cancel(): ArmedJob | null {
    if (!this.job || (this.job.status !== "waiting" && this.job.status !== "minting")) {
      return null;
    }
    this.generation += 1;
    this.clearTimer();
    this.job = { ...this.job, status: "cancelled" };
    return { ...this.job };
  }

  arm(input: { nftContract: string; chainLabel: string; quantity: number; startTime: number }): ArmedJob {
    if (this.isBusy()) {
      throw new Error("A job is already armed. /cancel it first.");
    }
    this.generation += 1;
    const gen = this.generation;
    this.job = {
      nftContract: input.nftContract,
      chainLabel: input.chainLabel,
      quantity: input.quantity,
      startTime: input.startTime,
      armedAt: Date.now(),
      status: "waiting",
    };
    this.schedule(gen);
    return { ...this.job };
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(gen: number) {
    this.clearTimer();
    if (!this.job || gen !== this.generation) return;

    const fireAt = this.job.startTime * 1000;
    const delay = fireAt - Date.now();

    if (delay <= 0) {
      void this.fire(gen);
      return;
    }

    const wait = Math.min(delay, MAX_TIMEOUT_MS);
    this.timer = setTimeout(() => {
      if (gen !== this.generation) return;
      if (Date.now() + PREWAKE_MS >= fireAt) {
        void this.fire(gen);
      } else {
        this.schedule(gen);
      }
    }, wait);
  }

  private async fire(gen: number) {
    if (!this.job || gen !== this.generation) return;
    this.clearTimer();
    this.job = { ...this.job, status: "minting" };
    const snapshot = { ...this.job };

    try {
      const remain = snapshot.startTime * 1000 - Date.now();
      if (remain > 0 && remain < 30_000) {
        await sleep(remain);
      }
      if (gen !== this.generation) return;

      let result: MintSuccess | undefined;
      for (let i = 0; i < 8; i++) {
        try {
          const plan = await buildMintPlan(
            this.connected,
            snapshot.nftContract,
            this.config.chain,
            snapshot.quantity,
          );
          result = await broadcastMint(this.config, this.connected, plan);
          break;
        } catch (err) {
          const kind = err instanceof MintBlockedError ? err.kind : "";
          if (kind === "not_live" && i < 7) {
            await sleep(400);
            continue;
          }
          throw err;
        }
      }
      if (!result) throw new Error("Mint failed.");
      if (gen !== this.generation) return;
      this.job = {
        ...snapshot,
        status: "done",
        txHash: result.hash,
        explorer: result.explorer,
      };
      this.onFire({ job: { ...this.job }, result });
    } catch (err) {
      if (gen !== this.generation) return;
      const message = err instanceof MintBlockedError || err instanceof Error ? err.message : "Mint failed.";
      this.job = { ...snapshot, status: "failed", lastError: message };
      this.onFire({ job: { ...this.job }, error: message });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
