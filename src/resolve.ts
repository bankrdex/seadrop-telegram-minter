import type { AppConfig, ChainInfo } from "./config.js";
import { chainFromSlug } from "./config.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export interface ResolvedCollection {
  nftContract: string;
  chain: ChainInfo;
  slug?: string;
  name?: string;
  source: "address" | "opensea-url" | "opensea-api";
}

export class ResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolveError";
  }
}

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

function normalizeAddress(value: string): string {
  return value.trim();
}

function parseOpenSeaUrl(raw: string): {
  slug?: string;
  address?: string;
  chain?: ChainInfo;
} | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "opensea.io") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const chainFromQuery = chainFromSlug(url.searchParams.get("chain") ?? undefined);

  // /collection/<slug>/...
  if (parts[0] === "collection" && parts[1] && !parts[1].startsWith("0x")) {
    return { slug: parts[1], chain: chainFromQuery };
  }

  // /assets/<chain>/<address>/...  or  /item/<chain>/<address>/...
  if ((parts[0] === "assets" || parts[0] === "item") && parts[1] && parts[2]) {
    const chain = chainFromSlug(parts[1]) ?? chainFromQuery;
    if (isAddress(parts[2])) {
      return { address: normalizeAddress(parts[2]), chain };
    }
  }

  // /<chain>/<address>
  if (parts[0] && parts[1] && isAddress(parts[1])) {
    return { address: normalizeAddress(parts[1]), chain: chainFromSlug(parts[0]) ?? chainFromQuery };
  }

  return { chain: chainFromQuery };
}

interface OpenSeaCollectionJson {
  name?: string;
  collection?: string;
  contracts?: Array<{ address?: string; chain?: string }>;
}

async function lookupSlug(
  slug: string,
  apiKey: string,
  preferred: ChainInfo,
): Promise<{ address: string; chain: ChainInfo; name?: string; slug: string }> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}`, {
    headers,
  });
  if (res.status === 404) {
    throw new ResolveError(`OpenSea has no collection slug "${slug}".`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ResolveError(
      "OpenSea rejected the collection lookup. Set OPENSEA_API_KEY or pass a 0x contract address.",
    );
  }
  if (!res.ok) {
    throw new ResolveError(`OpenSea lookup failed (HTTP ${res.status}). Pass a 0x contract instead.`);
  }

  const body = (await res.json()) as OpenSeaCollectionJson;
  const contracts = body.contracts ?? [];
  if (contracts.length === 0) {
    throw new ResolveError(`No contracts listed for "${slug}".`);
  }

  const wanted = preferred.opensea;
  const picked =
    contracts.find((c) => c.chain?.toLowerCase() === wanted && isAddress(c.address ?? "")) ??
    contracts.find((c) => isAddress(c.address ?? ""));

  if (!picked?.address || !isAddress(picked.address)) {
    throw new ResolveError(`No usable 0x contract on "${slug}".`);
  }

  const chain = chainFromSlug(picked.chain) ?? preferred;
  return {
    address: normalizeAddress(picked.address),
    chain,
    name: body.name,
    slug: body.collection ?? slug,
  };
}

/**
 * Resolve an OpenSea collection URL, a slug, or a 0x contract.
 * OpenSea API is optional and only used for slug → contract. Without a key,
 * a 0x address (+ CHAIN env or URL chain) is required.
 */
export async function resolveCollection(input: string, config: AppConfig): Promise<ResolvedCollection> {
  const raw = input.trim();
  if (!raw) throw new ResolveError("Pass an OpenSea collection URL or a 0x contract.");

  if (isAddress(raw)) {
    return { nftContract: normalizeAddress(raw), chain: config.chain, source: "address" };
  }

  const fromUrl = raw.includes("://") ? parseOpenSeaUrl(raw) : null;
  if (raw.includes("://") && !fromUrl) {
    throw new ResolveError("That URL is not an OpenSea collection or item link.");
  }

  if (fromUrl?.address) {
    return {
      nftContract: fromUrl.address,
      chain: fromUrl.chain ?? config.chain,
      source: "opensea-url",
    };
  }

  const slug = fromUrl?.slug ?? (!raw.includes("://") && !raw.startsWith("0x") ? raw : undefined);
  if (!slug) {
    throw new ResolveError("Could not find a collection slug or 0x address in that input.");
  }

  if (!config.openseaApiKey) {
    throw new ResolveError(
      "OPENSEA_API_KEY is not set, so slug lookup is disabled. Pass a 0x contract (and set CHAIN if it is not the default).",
    );
  }

  const found = await lookupSlug(slug, config.openseaApiKey, fromUrl?.chain ?? config.chain);
  return {
    nftContract: found.address,
    chain: found.chain,
    slug: found.slug,
    name: found.name,
    source: "opensea-api",
  };
}

export function parseCheckArgs(text: string): { target: string; qty: number } {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  // drop the command token if present
  if (parts[0]?.startsWith("/")) parts.shift();
  const target = parts[0] ?? "";
  const qtyRaw = parts[1];
  const qty = qtyRaw === undefined ? 1 : Number.parseInt(qtyRaw, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
    throw new ResolveError("Quantity must be an integer from 1 to 100.");
  }
  return { target, qty };
}
