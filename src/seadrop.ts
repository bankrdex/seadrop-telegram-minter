import { Contract, Interface, formatEther, type Provider } from "ethers";
import type { ChainInfo } from "./config.js";

/** SeaDrop 1.0 singleton — same address on Ethereum, Base, and Robinhood. */
export const SEADROP_ADDRESS = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";

/**
 * OpenSea's standard fee collector. Used only when the drop does not restrict
 * fee recipients (restrictFeeRecipients = false) and the on-chain allow list
 * is empty. SeaDrop reverts on address(0), so a real recipient is required.
 */
export const OPENSEA_FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PUBLIC_ABI = [
  "function mintPublic(address nftContract, address feeRecipient, address minterIfNotPayer, uint256 quantity) payable",
  "function getPublicDrop(address nftContract) view returns (tuple(uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxTotalMintableByWallet, uint16 feeBps, bool restrictFeeRecipients))",
  "function getAllowedFeeRecipients(address nftContract) view returns (address[])",
];

const ERROR_ABI = [
  "error NotActive(uint256 currentTimestamp, uint256 startTimestamp, uint256 endTimestamp)",
  "error MintQuantityCannotBeZero()",
  "error MintQuantityExceedsMaxMintedPerWallet(uint256 total, uint256 allowed)",
  "error MintQuantityExceedsMaxSupply(uint256 total, uint256 maxSupply)",
  "error MintQuantityExceedsMaxTokenSupplyForStage(uint256 total, uint256 maxTokenSupplyForStage)",
  "error FeeRecipientCannotBeZeroAddress()",
  "error FeeRecipientNotAllowed()",
  "error IncorrectPayment(uint256 got, uint256 want)",
  "error PayerNotAllowed()",
];

export const SEADROP_IFACE = new Interface(PUBLIC_ABI);
export const SEADROP_ERRORS = new Interface(ERROR_ABI);

export interface PublicDrop {
  mintPrice: bigint;
  startTime: number;
  endTime: number;
  maxTotalMintableByWallet: number;
  feeBps: number;
  restrictFeeRecipients: boolean;
}

export type DropPhase = "none" | "scheduled" | "live" | "ended";

export function dropPhase(drop: PublicDrop, nowSec = Math.floor(Date.now() / 1000)): DropPhase {
  if (drop.startTime === 0 && drop.endTime === 0) return "none";
  if (nowSec < drop.startTime) return "scheduled";
  if (nowSec >= drop.endTime) return "ended";
  return "live";
}

export function seadropContract(provider: Provider): Contract {
  return new Contract(SEADROP_ADDRESS, PUBLIC_ABI, provider);
}

export async function fetchPublicDrop(provider: Provider, nftContract: string): Promise<PublicDrop | null> {
  const seadrop = seadropContract(provider);
  try {
    const raw = await seadrop.getPublicDrop(nftContract);
    const drop: PublicDrop = {
      mintPrice: BigInt(raw.mintPrice),
      startTime: Number(raw.startTime),
      endTime: Number(raw.endTime),
      maxTotalMintableByWallet: Number(raw.maxTotalMintableByWallet),
      feeBps: Number(raw.feeBps),
      restrictFeeRecipients: Boolean(raw.restrictFeeRecipients),
    };
    if (drop.startTime === 0 && drop.endTime === 0 && drop.maxTotalMintableByWallet === 0) {
      return null;
    }
    return drop;
  } catch {
    return null;
  }
}

export async function resolveFeeRecipient(
  provider: Provider,
  nftContract: string,
  restricted: boolean,
): Promise<{ address: string; source: string }> {
  const seadrop = seadropContract(provider);
  let allowed: string[] = [];
  try {
    allowed = (await seadrop.getAllowedFeeRecipients(nftContract)) as string[];
  } catch {
    allowed = [];
  }

  const usable = allowed.filter((a) => a && a.toLowerCase() !== ZERO_ADDRESS.toLowerCase());
  if (usable.length > 0) {
    return { address: usable[0], source: "on-chain allow list" };
  }
  if (restricted) {
    throw new Error(
      "This drop restricts fee recipients and none are listed on-chain. Cannot build mintPublic.",
    );
  }
  return { address: OPENSEA_FEE_RECIPIENT, source: "OpenSea default (unrestricted drop)" };
}

export function encodeMintPublic(nftContract: string, feeRecipient: string, quantity: number): string {
  // minterIfNotPayer = address(0) → the payer (this wallet) is the minter.
  return SEADROP_IFACE.encodeFunctionData("mintPublic", [
    nftContract,
    feeRecipient,
    ZERO_ADDRESS,
    BigInt(quantity),
  ]);
}

export function formatIso(unixSec: number): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toISOString().replace(".000Z", "Z");
}

export function formatDropSummary(opts: {
  chain: ChainInfo;
  nftContract: string;
  drop: PublicDrop;
  feeRecipient: string;
  feeSource: string;
  quantity: number;
  name?: string;
  slug?: string;
}): string {
  const phase = dropPhase(opts.drop);
  const value = opts.drop.mintPrice * BigInt(opts.quantity);
  const lines = [
    opts.name ? `<b>${escapeHtml(opts.name)}</b>` : "<b>Public SeaDrop</b>",
    opts.slug ? `slug: <code>${escapeHtml(opts.slug)}</code>` : "",
    `chain: ${escapeHtml(opts.chain.label)} (${opts.chain.id})`,
    `nft: <code>${opts.nftContract}</code>`,
    `seadrop: <code>${SEADROP_ADDRESS}</code>`,
    `phase: <b>${phase}</b>`,
    `price: ${formatEther(opts.drop.mintPrice)} ${opts.chain.native}  ·  qty ${opts.quantity} = ${formatEther(value)} ${opts.chain.native}`,
    `start: ${formatIso(opts.drop.startTime)}`,
    `end: ${formatIso(opts.drop.endTime)}`,
    `max per wallet: ${opts.drop.maxTotalMintableByWallet}`,
    `fee: ${opts.drop.feeBps} bps  ·  restrict recipients: ${opts.drop.restrictFeeRecipients}`,
    `fee recipient: <code>${opts.feeRecipient}</code> (${escapeHtml(opts.feeSource)})`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

export function humanRevert(err: unknown): { kind: string; message: string } {
  const anyErr = err as {
    shortMessage?: string;
    reason?: string;
    data?: string;
    info?: { error?: { data?: string; message?: string } };
    error?: { data?: string; message?: string };
    message?: string;
  };

  const data =
    (typeof anyErr?.data === "string" && anyErr.data.startsWith("0x") ? anyErr.data : undefined) ??
    (typeof anyErr?.info?.error?.data === "string" ? anyErr.info.error.data : undefined) ??
    (typeof anyErr?.error?.data === "string" ? anyErr.error.data : undefined);

  if (data && data !== "0x") {
    try {
      const decoded = SEADROP_ERRORS.parseError(data);
      if (!decoded) throw new Error("undecoded");
      switch (decoded.name) {
        case "NotActive": {
          const now = Number(decoded.args[0]);
          const start = Number(decoded.args[1]);
          const end = Number(decoded.args[2]);
          if (now < start) return { kind: "not_live", message: "Not public yet — startTime is still in the future." };
          if (now >= end) return { kind: "ended", message: "Public stage has ended." };
          return { kind: "not_live", message: "Public stage is not active." };
        }
        case "MintQuantityExceedsMaxMintedPerWallet":
          return { kind: "not_eligible", message: "Not eligible: this wallet already hit max per wallet." };
        case "MintQuantityExceedsMaxSupply":
        case "MintQuantityExceedsMaxTokenSupplyForStage":
          return { kind: "sold_out", message: "Sold out (max supply for this stage)." };
        case "IncorrectPayment":
          return { kind: "payment", message: "Incorrect payment — price on-chain does not match the value sent." };
        case "FeeRecipientNotAllowed":
        case "FeeRecipientCannotBeZeroAddress":
          return { kind: "fee", message: "Fee recipient was rejected by SeaDrop." };
        case "PayerNotAllowed":
          return { kind: "not_eligible", message: "This wallet is not an allowed payer for the drop." };
        case "MintQuantityCannotBeZero":
          return { kind: "qty", message: "Quantity cannot be zero." };
        default:
          return { kind: "revert", message: `Simulation reverted: ${decoded.name}.` };
      }
    } catch {
      // fall through
    }
  }

  const text = [anyErr?.shortMessage, anyErr?.reason, anyErr?.message].filter(Boolean).join(" ");
  const lower = text.toLowerCase();
  if (lower.includes("insufficient funds")) {
    return { kind: "funds", message: "Insufficient funds for price + gas." };
  }
  if (lower.includes("max fee") || lower.includes("underpriced")) {
    return { kind: "gas", message: "Network rejected the gas price." };
  }
  return { kind: "revert", message: "Simulation reverted. The public mint would fail right now." };
}
