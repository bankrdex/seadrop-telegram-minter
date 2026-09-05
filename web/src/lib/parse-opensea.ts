const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const CHAIN_SLUGS: Record<string, { label: string; id: number }> = {
  ethereum: { label: "Ethereum", id: 1 },
  eth: { label: "Ethereum", id: 1 },
  mainnet: { label: "Ethereum", id: 1 },
  base: { label: "Base", id: 8453 },
  robinhood: { label: "Robinhood", id: 4663 },
  rh: { label: "Robinhood", id: 4663 },
};

export interface ParsedTarget {
  kind: "address" | "url-address" | "slug" | "unknown";
  address?: string;
  slug?: string;
  chainLabel?: string;
  chainId?: number;
  note: string;
}

export function parseOperatorInput(raw: string, defaultChain = "base"): ParsedTarget {
  const input = raw.trim();
  if (!input) {
    return { kind: "unknown", note: "Paste an OpenSea collection URL or a 0x contract." };
  }
  if (ADDRESS_RE.test(input)) {
    const chain = CHAIN_SLUGS[defaultChain] ?? CHAIN_SLUGS.base;
    return {
      kind: "address",
      address: input,
      chainLabel: chain.label,
      chainId: chain.id,
      note: "Contract passed directly. Chain comes from the host CHAIN env unless the URL names one.",
    };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    if (!input.includes("/") && !input.startsWith("0x")) {
      return {
        kind: "slug",
        slug: input,
        note: "Slug lookup needs OPENSEA_API_KEY on the host. Without it, pass a 0x contract.",
      };
    }
    return { kind: "unknown", note: "Not an OpenSea URL or 0x address." };
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host !== "opensea.io") {
    return { kind: "unknown", note: "Only opensea.io collection or item links are resolved." };
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const qChain = CHAIN_SLUGS[(url.searchParams.get("chain") ?? "").toLowerCase()];

  if (parts[0] === "collection" && parts[1] && !parts[1].startsWith("0x")) {
    return {
      kind: "slug",
      slug: parts[1],
      chainLabel: qChain?.label,
      chainId: qChain?.id,
      note: "Collection slug. The bot calls OpenSea only if OPENSEA_API_KEY is set; otherwise pass the 0x contract.",
    };
  }

  if ((parts[0] === "assets" || parts[0] === "item") && parts[2] && ADDRESS_RE.test(parts[2])) {
    const chain = CHAIN_SLUGS[parts[1]?.toLowerCase() ?? ""] ?? qChain;
    return {
      kind: "url-address",
      address: parts[2],
      chainLabel: chain?.label,
      chainId: chain?.id,
      note: "Item URL already contains the NFT contract. No OpenSea API key required.",
    };
  }

  return { kind: "unknown", note: "Could not find a slug or 0x address in that OpenSea URL." };
}
