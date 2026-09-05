import { useState, type ReactNode } from "react";
import { Ban, Lock, Radio, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SetupChecklist } from "@/components/setup-checklist";
import { TelegramPhone, type ScriptKey } from "@/components/telegram-phone";
import { UrlLab } from "@/components/url-lab";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#overview", label: "Overview" },
  { href: "#setup", label: "Setup" },
  { href: "#commands", label: "Commands" },
  { href: "#mint", label: "Mint engine" },
  { href: "#hosts", label: "Hosts" },
  { href: "#risks", label: "Risks" },
] as const;

const COMMANDS: { key: ScriptKey; cmd: string; title: string; body: string }[] = [
  { key: "start", cmd: "/start", title: "Briefing", body: "Safety rules and the command list. No keys." },
  { key: "wallet", cmd: "/wallet", title: "Address", body: "Derived address + native balance. Never the private key." },
  { key: "check", cmd: "/check", title: "Read drop", body: "Resolve URL or 0x, read getPublicDrop, simulate with eth_call." },
  { key: "arm", cmd: "/arm", title: "Wait + mint", body: "If startTime is future, the process sleeps until it, then mintPublic." },
  { key: "mint", cmd: "/mint", title: "Mint now", body: "Tap Mint 1 to broadcast if the public stage is live." },
];

const HOSTS = [
  { name: "Railway", ok: true, note: "Fork → project from GitHub → root directory bot/ → Variables → npm start. Disable sleep." },
  { name: "Fly.io", ok: true, note: "One long-lived Node machine. fly.toml process: node dist/index.js." },
  { name: "Render", ok: true, note: "Background worker or web service that never sleeps. Build: npm run build in bot/." },
  { name: "VPS", ok: true, note: "systemd + Node 20+. Keep the process up. Long polling is the default." },
  { name: "Vercel", ok: false, note: "Serverless sleeps. /arm will miss startTime. Do not deploy the minter here." },
];

const TREE = [
  "bot/src/index.ts        process + health + polling/webhook",
  "bot/src/config.ts       fail-closed env, no key logs",
  "bot/src/telegram.ts     owner-only commands + buttons",
  "bot/src/resolve.ts      OpenSea URL / 0x → contract",
  "bot/src/seadrop.ts      getPublicDrop + fee recipient",
  "bot/src/mint.ts         simulate, caps, broadcast",
  "bot/src/watch.ts        in-memory arm (restart cancels)",
  "bot/src/wallet.ts       address + balance, never the key",
];

export function FieldManual() {
  const [script, setScript] = useState<ScriptKey>("check");

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur-[2px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#overview" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-sm bg-primary text-primary-fg">
              <DropletMark />
            </span>
            <span className="font-mono text-2xs uppercase tracking-caps text-fg">SeaDrop minter</span>
          </a>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Sections">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted hover:text-fg"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <a href="#setup" className="hidden sm:block">
            <Button size="sm">Phone setup</Button>
          </a>
        </div>
      </header>

      <main>
        <section id="overview" className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">Public SeaDrop · owner-only</p>
            <h1 className="mt-4 font-display text-hero leading-tight tracking-tight text-fg">
              Mint from your phone.
              <span className="block italic text-primary"> Never share the bot.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
              A self-hosted Telegram bot that checks and mints public OpenSea SeaDrop drops with{" "}
              <code className="font-mono text-fg">mintPublic</code>. One operator. One burner. A long-lived Node process — not a serverless sniper.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#setup">
                <Button size="lg">Set it up</Button>
              </a>
              <a href="#hosts">
                <Button size="lg" variant="ghost">
                  Hosts that stay awake
                </Button>
              </a>
            </div>
            <ul className="mt-10 grid gap-3 sm:grid-cols-3">
              <Fact icon={<Lock className="size-4" />} label="Owner-only" value="TELEGRAM_OWNER_ID" />
              <Fact icon={<Radio className="size-4" />} label="On-chain" value="SeaDrop 1.0" />
              <Fact icon={<Ban className="size-4" />} label="Out of scope" value="No mintSigned" />
            </ul>
          </div>
          <TelegramPhone script={script} />
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-danger">Secrets</p>
            <h2 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
              Never commit PRIVATE_KEY, TELEGRAM_BOT_TOKEN, RPC URLs with keys, or OpenSea keys.
            </h2>
            <p className="mt-3 max-w-3xl text-muted">
              If you paste a key into GitHub you will get drained. Keys live only in the host environment.{" "}
              <code className="font-mono text-fg">.env</code> is gitignored. The committed file is{" "}
              <code className="font-mono text-fg">.env.example</code> with empty placeholders.
            </p>
          </div>
        </section>

        <Section id="scope" index="01" title="What this is, and is not">
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-border bg-surface p-6">
              <h3 className="font-display text-2xl">Is</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li>A fork-and-run bot for a single operator</li>
                <li>Public SeaDrop <code className="text-fg">mintPublic</code> only</li>
                <li>Burner wallet, funded with mint + gas</li>
                <li>Always-on Node (setTimeout against chain startTime)</li>
                <li>Ethereum, Base, Robinhood</li>
              </ul>
            </article>
            <article className="rounded-xl border border-border bg-surface p-6">
              <h3 className="font-display text-2xl">Is not</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li>A shared public mint service</li>
                <li>Signed FCFS, JWT, or SIWE session stealing</li>
                <li>A Vercel function that wakes for the drop</li>
                <li>Multi-wallet farming or key import via chat</li>
                <li>A place to paste an OpenSea JWT</li>
              </ul>
            </article>
          </div>
        </Section>

        <Section id="setup" index="02" title="Phone-first setup">
          <p className="mb-8 max-w-2xl text-muted">
            You will not mint from this page. This handbook is the map. The minter is the Node process in{" "}
            <code className="font-mono text-fg">bot/</code>. Tick the steps as you configure the host.
          </p>
          <SetupChecklist />
          <div className="mt-8 min-w-0 overflow-x-auto rounded-xl border border-border bg-raised p-4">
            <pre className="font-mono text-xs leading-relaxed text-primary sm:text-sm">{`cd bot
cp ../.env.example .env    # fill locally, never commit
npm install
npm run build
npm start                  # node dist/index.js`}</pre>
          </div>
        </Section>

        <Section id="commands" index="03" title="Commands">
          <p className="mb-6 max-w-2xl text-muted">
            Expensive actions confirm with inline buttons: Check / Arm / Mint 1 / Cancel. Everyone except the owner is ignored.
          </p>
          <div className="grid min-w-0 gap-8 lg:grid-cols-2">
            <ul className="flex flex-col gap-2">
              {COMMANDS.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setScript(item.key)}
                    className={cn(
                      "flex w-full items-start justify-between gap-4 rounded-lg border px-4 py-4 text-left transition-colors duration-[var(--motion-quick)]",
                      script === item.key ? "border-primary/50 bg-raised" : "border-border bg-surface hover:bg-raised",
                    )}
                  >
                    <span>
                      <span className="font-mono text-sm text-primary">{item.cmd}</span>
                      <span className="mt-1 block font-medium text-fg">{item.title}</span>
                      <span className="mt-1 block text-sm text-muted">{item.body}</span>
                    </span>
                    {script === item.key ? (
                      <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">live</span>
                    ) : null}
                  </button>
                </li>
              ))}
              <li className="rounded-lg border border-border bg-surface px-4 py-4">
                <p className="font-mono text-sm text-primary">/cancel</p>
                <p className="mt-1 text-sm text-muted">Cancel an armed watch. /status shows the in-memory job and host health.</p>
              </li>
            </ul>
            <TelegramPhone script={script} className="lg:sticky lg:top-24" />
          </div>
        </Section>

        <Section id="resolve" index="04" title="Resolve a collection">
          <p className="mb-6 max-w-2xl text-muted">
            OpenSea API is optional and only for slug → contract. Without a key, pass a 0x address and the right CHAIN. This demo parses locally — it does not call OpenSea and it does not mint.
          </p>
          <UrlLab />
        </Section>

        <Section id="mint" index="05" title="How public SeaDrop works">
          <p className="max-w-3xl text-muted">
            SeaDrop 1.0 sits at <code className="font-mono text-fg">0x00005EA00Ac477B1030CE78506496e8C2dE24bf5</code> on
            Ethereum, Base, and Robinhood. A public stage stores price, start, end, max per wallet, fee bps, and whether fee
            recipients are restricted. While the clock is inside the window, anyone may call payable{" "}
            <code className="font-mono text-fg">mintPublic(nft, feeRecipient, address(0), qty)</code>. If recipients are
            restricted, the bot uses the first on-chain allow-listed address; if not, it falls back to OpenSea{" "}
            <code className="font-mono text-fg">0x0000a26b00c1F0DF003000390027140000fAa719</code>. Every mint is{" "}
            <code className="font-mono text-fg">eth_call</code> simulated, then checked against{" "}
            <code className="font-mono text-fg">MAX_VALUE_WEI</code> and <code className="font-mono text-fg">MAX_GAS_GWEI</code>.{" "}
            <code className="font-mono text-fg">MAX_VALUE_WEI=0</code> refuses to mint until you set a cap.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <MonoCard k="SeaDrop" v="0x00005EA0…24bf5" />
            <MonoCard k="Default fee" v="0x0000a26b…Aa719" />
            <MonoCard k="minterIfNotPayer" v="address(0)" />
          </div>
        </Section>

        <Section id="hosts" index="06" title="Always-on hosts">
          <p className="mb-6 max-w-2xl text-muted">
            /arm is a timer in a long-lived Node process. If the host sleeps, the watch dies. A restart also cancels the arm — it is in-memory, no database.
          </p>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {HOSTS.map((host) => (
              <li key={host.name} className="grid min-w-0 gap-2 px-5 py-4 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] sm:items-baseline">
                <span className="font-medium text-fg">{host.name}</span>
                <span className="text-sm text-muted">{host.note}</span>
                <span
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-[0.16em]",
                    host.ok ? "text-primary" : "text-danger",
                  )}
                >
                  {host.ok ? "use" : "do not"}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="risks" index="07" title="Risks, then sweep">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["Sold out / revert", "Simulation can pass and the fill still reverts on-chain."],
              ["Scam collections", "The bot will mint any public SeaDrop you point it at. Read the contract."],
              ["Host sleep", "If Railway or Render sleeps, /arm misses startTime. Disable sleep."],
              ["Wrong phase", "If the real race is a signed OpenSea FCFS, this bot cannot mint it."],
              ["Fake mint drain", "Caps are the brakes. Leave MAX_VALUE_WEI and MAX_GAS_GWEI tight."],
              ["Hot key", "After the drop: sweep NFT + leftover ETH, rotate PRIVATE_KEY, stop the process."],
            ].map(([title, body]) => (
              <article key={title} className="rounded-lg border border-border bg-surface p-5">
                <h3 className="font-medium text-fg">{title}</h3>
                <p className="mt-2 text-sm text-muted">{body}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="source" index="08" title="Source">
          <p className="mb-6 max-w-2xl text-muted">
            MIT. Fail-closed if owner id, key, or RPC is missing. No key in logs. Deploy{" "}
            <code className="font-mono text-fg">bot/</code> only.
          </p>
          <pre className="min-w-0 overflow-x-auto rounded-xl border border-border bg-raised p-5 font-mono text-xs leading-7 text-primary sm:text-sm">
            {TREE.join("\n")}
          </pre>
          <p className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1 text-fg">
              README + SECURITY.md + LICENSE at the repo root
            </span>
            <span className="inline-flex items-center gap-1">
              <Server className="size-3.5" /> health on PORT · long polling by default
            </span>
          </p>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">MIT · burner wallet only</p>
          <p className="text-sm text-muted">Not a hosted mint service. Fork it. Run your own.</p>
        </div>
      </footer>
    </div>
  );
}

function Section({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-8 flex items-baseline gap-4 border-b border-border pb-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{index}</span>
        <h2 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <li className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-2 text-primary">{icon}</p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{label}</p>
      <p className="mt-1 text-sm text-fg">{value}</p>
    </li>
  );
}

function MonoCard({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{k}</p>
      <p className="mt-1 truncate font-mono text-sm text-fg">{v}</p>
    </div>
  );
}

function DropletMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <path fill="currentColor" d="M8 1.5C5.2 6.2 3.8 8.4 3.8 10.6c0 2.3 1.9 4.2 4.2 4.2s4.2-1.9 4.2-4.2c0-2.2-1.4-4.4-4.2-9.1z" />
    </svg>
  );
}
