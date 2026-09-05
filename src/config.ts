import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { Wallet } from "ethers";

loadDotenv();
loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "../.env") });

export type ChainName = "ethereum" | "base" | "robinhood";

export interface ChainInfo {
  id: bigint;
  name: ChainName;
  label: string;
  explorer: string;
  opensea: string;
  native: string;
}

export const CHAINS: Record<ChainName, ChainInfo> = {
  ethereum: {
    id: 1n,
    name: "ethereum",
    label: "Ethereum",
    explorer: "https://etherscan.io",
    opensea: "ethereum",
    native: "ETH",
  },
  base: {
    id: 8453n,
    name: "base",
    label: "Base",
    explorer: "https://basescan.org",
    opensea: "base",
    native: "ETH",
  },
  robinhood: {
    id: 4663n,
    name: "robinhood",
    label: "Robinhood",
    explorer: "https://explorer.mainnet.chain.robinhood.com",
    opensea: "robinhood",
    native: "ETH",
  },
};

export const CHAIN_BY_ID: Record<string, ChainInfo> = {
  "1": CHAINS.ethereum,
  "8453": CHAINS.base,
  "4663": CHAINS.robinhood,
};

const OPENSEA_SLUG_TO_CHAIN: Record<string, ChainName> = {
  ethereum: "ethereum",
  eth: "ethereum",
  mainnet: "ethereum",
  base: "base",
  robinhood: "robinhood",
  rh: "robinhood",
};

export function chainFromSlug(slug: string | undefined): ChainInfo | undefined {
  if (!slug) return undefined;
  const key = OPENSEA_SLUG_TO_CHAIN[slug.trim().toLowerCase()];
  return key ? CHAINS[key] : undefined;
}

export interface AppConfig {
  telegramBotToken: string;
  ownerId: number;
  privateKey: string;
  rpcUrl: string;
  openseaApiKey: string;
  chain: ChainInfo;
  maxValueWei: bigint;
  maxGasGwei: number;
  webhookUrl: string;
  port: number;
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    console.error(`Missing required env: ${key}. Refusing to start.`);
    process.exit(1);
  }
  return value;
}

function parsePositiveInt(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) {
    console.error(`${label} must be a positive integer.`);
    process.exit(1);
  }
  return Number(raw);
}

export function loadConfig(): AppConfig {
  const telegramBotToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const ownerId = parsePositiveInt(requireEnv("TELEGRAM_OWNER_ID"), "TELEGRAM_OWNER_ID");
  const privateKey = requireEnv("PRIVATE_KEY");
  const rpcUrl = requireEnv("RPC_URL");

  try {
    new Wallet(privateKey);
  } catch {
    console.error("PRIVATE_KEY is not a valid secp256k1 key. Refusing to start.");
    process.exit(1);
  }

  const chainKey = (process.env.CHAIN || "base").trim().toLowerCase();
  const chain = chainFromSlug(chainKey);
  if (!chain) {
    console.error(`Unknown CHAIN="${chainKey}". Use ethereum | base | robinhood.`);
    process.exit(1);
  }

  let maxValueWei: bigint;
  try {
    maxValueWei = BigInt((process.env.MAX_VALUE_WEI ?? "0").trim() || "0");
  } catch {
    console.error("MAX_VALUE_WEI must be an integer (wei).");
    process.exit(1);
  }
  if (maxValueWei < 0n) {
    console.error("MAX_VALUE_WEI cannot be negative.");
    process.exit(1);
  }

  const maxGasGwei = Number(process.env.MAX_GAS_GWEI || "50");
  if (!Number.isFinite(maxGasGwei) || maxGasGwei <= 0) {
    console.error("MAX_GAS_GWEI must be a positive number.");
    process.exit(1);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT must be a valid TCP port.");
    process.exit(1);
  }

  return {
    telegramBotToken,
    ownerId,
    privateKey,
    rpcUrl,
    openseaApiKey: process.env.OPENSEA_API_KEY?.trim() || "",
    chain,
    maxValueWei,
    maxGasGwei,
    webhookUrl: process.env.WEBHOOK_URL?.trim() || "",
    port,
  };
}

/** Redact API keys that often sit in RPC paths or userinfo. Never log the raw URL. */
export function redactRpcUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/***`;
  } catch {
    return "(rpc set)";
  }
}
