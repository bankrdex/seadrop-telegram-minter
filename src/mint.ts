import { formatEther, formatUnits, parseUnits, type TransactionReceipt } from "ethers";
import type { AppConfig, ChainInfo } from "./config.js";
import {
  SEADROP_ADDRESS,
  dropPhase,
  encodeMintPublic,
  fetchPublicDrop,
  humanRevert,
  resolveFeeRecipient,
  type PublicDrop,
} from "./seadrop.js";
import { explorerTxUrl, type ConnectedWallet } from "./wallet.js";

export class MintBlockedError extends Error {
  kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
    this.name = "MintBlockedError";
  }
}

export interface MintPlan {
  nftContract: string;
  chain: ChainInfo;
  quantity: number;
  drop: PublicDrop;
  feeRecipient: string;
  feeSource: string;
  data: string;
  value: bigint;
  phase: ReturnType<typeof dropPhase>;
}

export interface SimResult {
  ok: boolean;
  message: string;
  kind?: string;
  gasLimit?: bigint;
}

export interface MintSuccess {
  hash: string;
  explorer: string;
  receipt: TransactionReceipt;
}

export async function buildMintPlan(
  connected: ConnectedWallet,
  nftContract: string,
  chain: ChainInfo,
  quantity: number,
): Promise<MintPlan> {
  const drop = await fetchPublicDrop(connected.provider, nftContract);
  if (!drop) {
    throw new MintBlockedError(
      "no_drop",
      "No public SeaDrop on this contract. It is not a public mintPublic drop (or uses a different SeaDrop).",
    );
  }
  if (quantity > drop.maxTotalMintableByWallet) {
    throw new MintBlockedError(
      "qty",
      `Quantity ${quantity} exceeds max per wallet (${drop.maxTotalMintableByWallet}).`,
    );
  }
  const fee = await resolveFeeRecipient(connected.provider, nftContract, drop.restrictFeeRecipients);
  return {
    nftContract,
    chain,
    quantity,
    drop,
    feeRecipient: fee.address,
    feeSource: fee.source,
    data: encodeMintPublic(nftContract, fee.address, quantity),
    value: drop.mintPrice * BigInt(quantity),
    phase: dropPhase(drop),
  };
}

export async function simulateMint(connected: ConnectedWallet, plan: MintPlan): Promise<SimResult> {
  try {
    await connected.provider.call({
      to: SEADROP_ADDRESS,
      from: connected.address,
      data: plan.data,
      value: plan.value,
    });
    const gasLimit = await connected.provider.estimateGas({
      to: SEADROP_ADDRESS,
      from: connected.address,
      data: plan.data,
      value: plan.value,
    });
    return { ok: true, message: `eth_call passed  ·  estimate ${gasLimit.toString()} gas`, gasLimit };
  } catch (err) {
    const decoded = humanRevert(err);
    return { ok: false, message: decoded.message, kind: decoded.kind };
  }
}

export async function assertMintCaps(
  config: AppConfig,
  connected: ConnectedWallet,
  plan: MintPlan,
  gasLimit: bigint,
): Promise<{ maxFeePerGas: bigint; gasCost: bigint; total: bigint }> {
  if (config.maxValueWei === 0n) {
    throw new MintBlockedError(
      "cap",
      "MAX_VALUE_WEI is 0, so minting is disabled. Set a wei cap (price × qty) in the host env before arming or minting.",
    );
  }
  if (plan.value > config.maxValueWei) {
    throw new MintBlockedError(
      "cap",
      `Mint value ${formatEther(plan.value)} ${plan.chain.native} exceeds MAX_VALUE_WEI (${formatEther(config.maxValueWei)}).`,
    );
  }

  const feeData = await connected.provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (!maxFeePerGas || maxFeePerGas <= 0n) {
    throw new MintBlockedError("gas", "RPC did not return a gas price.");
  }
  const cap = parseUnits(String(config.maxGasGwei), "gwei");
  if (maxFeePerGas > cap) {
    throw new MintBlockedError(
      "gas",
      `Network fee ${formatUnits(maxFeePerGas, "gwei")} gwei exceeds MAX_GAS_GWEI (${config.maxGasGwei}).`,
    );
  }

  const paddedGas = (gasLimit * 12n) / 10n; // 20% headroom
  const gasCost = paddedGas * maxFeePerGas;
  const total = plan.value + gasCost;
  const balance = await connected.provider.getBalance(connected.address);
  if (balance < total) {
    throw new MintBlockedError(
      "funds",
      `Insufficient funds: need ~${formatEther(total)} ${plan.chain.native} (mint ${formatEther(plan.value)} + gas), have ${formatEther(balance)}.`,
    );
  }
  return { maxFeePerGas, gasCost, total };
}

export async function broadcastMint(
  config: AppConfig,
  connected: ConnectedWallet,
  plan: MintPlan,
): Promise<MintSuccess> {
  if (plan.phase !== "live") {
    throw new MintBlockedError(
      "not_live",
      plan.phase === "scheduled"
        ? "Not public yet. Use /arm to wait for startTime."
        : plan.phase === "ended"
          ? "Public stage has ended."
          : "No live public stage.",
    );
  }

  const sim = await simulateMint(connected, plan);
  if (!sim.ok || !sim.gasLimit) {
    throw new MintBlockedError(sim.kind ?? "revert", sim.message);
  }

  const fees = await assertMintCaps(config, connected, plan, sim.gasLimit);
  const gasLimit = (sim.gasLimit * 12n) / 10n;

  try {
    const tx = await connected.wallet.sendTransaction({
      to: SEADROP_ADDRESS,
      data: plan.data,
      value: plan.value,
      gasLimit,
      maxFeePerGas: fees.maxFeePerGas,
    });
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new MintBlockedError("revert", `Transaction failed on-chain. ${explorerTxUrl(plan.chain, tx.hash)}`);
    }
    return {
      hash: receipt.hash,
      explorer: explorerTxUrl(plan.chain, receipt.hash),
      receipt,
    };
  } catch (err) {
    if (err instanceof MintBlockedError) throw err;
    const decoded = humanRevert(err);
    throw new MintBlockedError(decoded.kind, decoded.message);
  }
}
