import { cn } from "@/lib/utils";

export type ScriptKey = "start" | "wallet" | "check" | "arm" | "mint";

interface Bubble {
  from: "you" | "bot";
  text: string;
  buttons?: string[];
}

const SCRIPTS: Record<ScriptKey, Bubble[]> = {
  start: [
    { from: "you", text: "/start" },
    {
      from: "bot",
      text: "SeaDrop Telegram Minter\n\nOwner-only. Public mintPublic only. Burner wallet only.\nNever paste a private key, seed, OpenSea JWT, or API key in this chat.\n\n/wallet  /check  /arm  /mint  /cancel  /status",
    },
  ],
  wallet: [
    { from: "you", text: "/wallet" },
    {
      from: "bot",
      text: "Burner wallet\naddress: 0xA11C…91e2\nbalance: 0.042 ETH\nrpc chain: Base (8453)",
    },
  ],
  check: [
    { from: "you", text: "/check https://opensea.io/collection/example" },
    {
      from: "bot",
      text: "Public SeaDrop\nchain: Base (8453)\nnft: 0x1234…abcd\nphase: scheduled\nprice: 0.01 ETH  ·  qty 1\nstart: 2026-09-05T18:00:00Z\nmax per wallet: 2\nfee recipient: 0x0000a26b…Aa719\nsimulate: Not public yet — startTime is still in the future.",
      buttons: ["Check", "Arm", "Mint 1", "Cancel"],
    },
  ],
  arm: [
    { from: "you", text: "/arm 0x1234…abcd 1" },
    {
      from: "bot",
      text: "Armed — this process will wait until startTime, then mintPublic.\nqty: 1\nstart: 2026-09-05T18:00:00Z\nA restart cancels this watch (in-memory only).",
      buttons: ["Cancel"],
    },
  ],
  mint: [
    { from: "you", text: "Mint 1" },
    {
      from: "bot",
      text: "Minted\nqty 1\nbasescan.org/tx/0x8f…c2",
    },
  ],
};

export function TelegramPhone({ script, className }: { script: ScriptKey; className?: string }) {
  const bubbles = SCRIPTS[script];
  return (
    <figure
      className={cn(
        "relative mx-auto w-full max-w-sm min-w-0 rounded-xl border border-border bg-surface p-3 shadow-none",
        className,
      )}
    >
      <div className="rounded-lg bg-bg px-3 pb-4 pt-3">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Telegram</p>
            <p className="font-display text-lg leading-tight text-fg">SeaDrop minter</p>
          </div>
          <span className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">
            owner
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          {bubbles.map((bubble, i) => (
            <div key={`${script}-${i}`} className={cn("flex", bubble.from === "you" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[min(100%,20rem)] break-words rounded-md px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  bubble.from === "you"
                    ? "bg-primary text-primary-fg"
                    : "bg-raised text-fg border border-border",
                )}
              >
                {bubble.text}
                {bubble.buttons ? (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {bubble.buttons.map((label) => (
                      <span
                        key={label}
                        className="rounded-sm border border-border bg-surface px-2 py-1.5 text-center text-[11px] font-medium text-fg"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-2 px-1 font-mono text-[11px] text-faint">
        Sample thread. The real bot ignores everyone except TELEGRAM_OWNER_ID.
      </figcaption>
    </figure>
  );
}
