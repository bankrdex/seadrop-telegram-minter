import { useMemo, useState } from "react";
import { parseOperatorInput } from "@/lib/parse-opensea";

export function UrlLab() {
  const [value, setValue] = useState("https://opensea.io/collection/example");
  const parsed = useMemo(() => parseOperatorInput(value), [value]);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <label htmlFor="target" className="block font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        Operator input
      </label>
      <input
        id="target"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="OpenSea URL or 0x contract"
        className="mt-2 h-11 w-full rounded-md border border-border bg-bg px-3 font-mono text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-primary/70"
      />
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Row label="Kind" value={parsed.kind} />
        <Row label="Chain" value={parsed.chainLabel ? `${parsed.chainLabel} (${parsed.chainId})` : "host CHAIN"} />
        <Row label="Contract" value={parsed.address ?? "needs lookup"} />
        <Row label="Slug" value={parsed.slug ?? "—"} />
      </dl>
      <p className="mt-4 text-sm text-muted">{parsed.note}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg px-3 py-2">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{label}</dt>
      <dd className="mt-1 truncate font-mono text-sm text-fg">{value}</dd>
    </div>
  );
}
