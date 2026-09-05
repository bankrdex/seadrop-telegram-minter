import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    id: "botfather",
    title: "BotFather token",
    body: "Create a bot in Telegram, copy the token into TELEGRAM_BOT_TOKEN on the host. Never into git.",
  },
  {
    id: "owner",
    title: "Numeric owner id",
    body: "Ask userinfobot for your Id. Only TELEGRAM_OWNER_ID can run mint commands.",
  },
  {
    id: "burner",
    title: "Burner wallet",
    body: "Fresh key. Fund mint price + gas on the drop chain. PRIVATE_KEY stays in host env.",
  },
  {
    id: "rpc",
    title: "Always-on RPC",
    body: "Alchemy / QuickNode / your node. CHAIN must match the RPC (ethereum, base, robinhood).",
  },
  {
    id: "caps",
    title: "Set the caps",
    body: "MAX_VALUE_WEI=0 refuses to mint. Set a wei cap. MAX_GAS_GWEI blocks a gas drain.",
  },
  {
    id: "host",
    title: "Long-lived host",
    body: "Railway / Fly / Render / VPS with sleep disabled. Root directory bot/. Not Vercel.",
  },
] as const;

const STORAGE_KEY = "seadrop-setup-checks";

export function SetupChecklist() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const count = STEPS.filter((s) => done[s.id]).length;

  return (
    <div>
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        {count} / {STEPS.length} marked
      </p>
      <ol className="flex flex-col gap-2">
        {STEPS.map((step, index) => {
          const on = Boolean(done[step.id]);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => toggle(step.id)}
                className={cn(
                  "flex w-full items-start gap-4 rounded-lg border px-4 py-4 text-left transition-colors duration-[var(--motion-quick)]",
                  on ? "border-primary/40 bg-raised" : "border-border bg-surface hover:bg-raised",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm border",
                    on ? "border-primary bg-primary text-primary-fg" : "border-border text-faint",
                  )}
                >
                  {on ? <Check className="size-3.5" strokeWidth={2.5} /> : <span className="font-mono text-[11px]">{index + 1}</span>}
                </span>
                <span>
                  <span className="block font-medium text-fg">{step.title}</span>
                  <span className="mt-1 block text-sm text-muted">{step.body}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
