import { Bot, InlineKeyboard, type Context } from "grammy";
import { formatEther } from "ethers";
import type { AppConfig } from "./config.js";
import { redactRpcUrl } from "./config.js";
import { parseCheckArgs, resolveCollection, ResolveError } from "./resolve.js";
import { dropPhase, escapeHtml, formatDropSummary, formatIso } from "./seadrop.js";
import {
  assertMintCaps,
  broadcastMint,
  buildMintPlan,
  MintBlockedError,
  simulateMint,
  type MintPlan,
} from "./mint.js";
import { Watcher } from "./watch.js";
import { explorerAddressUrl, getWalletSnapshot, type ConnectedWallet } from "./wallet.js";

interface Pending {
  plan: MintPlan;
  name?: string;
  slug?: string;
}

export function createBot(config: AppConfig, connected: ConnectedWallet) {
  const bot = new Bot(config.telegramBotToken);
  const pending = new Map<number, Pending>();
  const startedAt = Date.now();

  const watcher = new Watcher(config, connected, ({ job, result, error }) => {
    const text = result
      ? `Armed mint filled.\nqty ${job.quantity}\n<a href="${result.explorer}">${result.hash}</a>`
      : `Armed mint failed.\n${escapeHtml(error ?? "unknown error")}`;
    void bot.api.sendMessage(config.ownerId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.ownerId) return;
    if (ctx.chat && ctx.chat.type !== "private") return;
    await next();
  });

  bot.catch((err) => {
    console.error("telegram handler error:", err.message ?? "unknown");
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "<b>SeaDrop Telegram Minter</b>",
        "",
        "Owner-only. Public <code>mintPublic</code> only. Burner wallet only.",
        "Never paste a private key, seed, OpenSea JWT, or API key in this chat.",
        "",
        "<b>Commands</b>",
        "/wallet — derived address + native balance (never the key)",
        "/check &lt;opensea url | 0x&gt; — read the public drop + simulate",
        "/arm &lt;url|0x&gt; [qty] — wait until startTime, then mint",
        "/mint &lt;url|0x&gt; [qty] — mint now if the public stage is live",
        "/cancel — cancel an armed watch",
        "/status — armed job + host health",
        "",
        "Confirm mint/arm with the buttons. A process restart cancels the arm (in-memory).",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.command("wallet", async (ctx) => {
    try {
      const snap = await getWalletSnapshot(connected);
      const chain = snap.rpcChain ?? config.chain;
      await ctx.reply(
        [
          "<b>Burner wallet</b>",
          `address: <code>${snap.address}</code>`,
          `balance: ${snap.balanceEth} ${chain.native}`,
          `rpc chain: ${chain.label} (${snap.rpcChainId})`,
          `<a href="${explorerAddressUrl(chain, snap.address)}">explorer</a>`,
        ].join("\n"),
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      );
    } catch (err) {
      await ctx.reply(userError(err));
    }
  });

  bot.command("status", async (ctx) => {
    const job = watcher.getJob();
    const uptime = formatUptime(Date.now() - startedAt);
    const snap = await getWalletSnapshot(connected).catch(() => null);
    const lines = [
      "<b>Host</b>",
      `uptime: ${uptime}`,
      `chain env: ${config.chain.label} (${config.chain.id})`,
      snap
        ? `rpc chain: ${snap.rpcChain?.label ?? snap.rpcChainId} · ${snap.balanceEth} ${config.chain.native}`
        : "rpc: unreachable",
      `rpc: <code>${escapeHtml(redactRpcUrl(config.rpcUrl))}</code>`,
      `max value: ${config.maxValueWei === 0n ? "0 (mint disabled)" : formatEther(config.maxValueWei) + " " + config.chain.native}`,
      `max gas: ${config.maxGasGwei} gwei`,
      `webhook: ${config.webhookUrl ? "on" : "long polling"}`,
      "",
      "<b>Armed job</b>",
      job
        ? [
            `status: ${job.status}`,
            `nft: <code>${job.nftContract}</code>`,
            `qty: ${job.quantity}`,
            `start: ${formatIso(job.startTime)}`,
            job.explorer ? `tx: <a href="${job.explorer}">${job.txHash}</a>` : "",
            job.lastError ? `error: ${escapeHtml(job.lastError)}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "none (in-memory — a restart clears this)",
    ];
    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command("cancel", async (ctx) => {
    const cancelled = watcher.cancel();
    pending.delete(config.ownerId);
    await ctx.reply(cancelled ? "Armed watch cancelled." : "Nothing was armed.");
  });

  bot.command("check", (ctx) => handleInspect(ctx, "check"));
  bot.command("arm", (ctx) => handleInspect(ctx, "arm"));
  bot.command("mint", (ctx) => handleInspect(ctx, "mint"));

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    if (data === "cancel") {
      watcher.cancel();
      pending.delete(config.ownerId);
      await ctx.reply("Cancelled.");
      return;
    }
    const held = pending.get(config.ownerId);
    if (!held) {
      await ctx.reply("Nothing pending. Run /check again.");
      return;
    }
    if (data === "check") {
      await replyCheck(ctx, held);
      return;
    }
    if (data === "arm") {
      await confirmArm(ctx, held);
      return;
    }
    if (data === "mint1") {
      try {
        const rebuilt = await buildMintPlan(connected, held.plan.nftContract, held.plan.chain, 1);
        const next = { ...held, plan: rebuilt };
        pending.set(config.ownerId, next);
        await confirmMint(ctx, next);
      } catch (err) {
        await ctx.reply(userError(err));
      }
    }
  });

  async function handleInspect(ctx: Context, mode: "check" | "arm" | "mint") {
    try {
      const { target, qty } = parseCheckArgs(ctx.message?.text ?? "");
      if (!target) {
        await ctx.reply(`Usage: /${mode} &lt;opensea collection url | 0x contract&gt; [qty]`, {
          parse_mode: "HTML",
        });
        return;
      }
      await ctx.reply("Resolving…");
      const resolved = await resolveCollection(target, config);
      if (resolved.chain.id !== config.chain.id) {
        await ctx.reply(
          `Collection chain is ${resolved.chain.label} (${resolved.chain.id}) but this host RPC is ${config.chain.label}. Point RPC_URL / CHAIN at the collection chain.`,
        );
        return;
      }
      const plan = await buildMintPlan(connected, resolved.nftContract, resolved.chain, qty);
      const held: Pending = { plan, name: resolved.name, slug: resolved.slug };
      pending.set(config.ownerId, held);

      if (mode === "check") {
        await replyCheck(ctx, held);
        return;
      }
      if (mode === "arm") {
        await confirmArm(ctx, held);
        return;
      }
      await ctx.reply(
        [
          formatDropSummary({
            chain: held.plan.chain,
            nftContract: held.plan.nftContract,
            drop: held.plan.drop,
            feeRecipient: held.plan.feeRecipient,
            feeSource: held.plan.feeSource,
            quantity: held.plan.quantity,
            name: held.name,
            slug: held.slug,
          }),
          "",
          "Tap <b>Mint 1</b> to broadcast (or Arm if the stage is still in the future).",
        ].join("\n"),
        {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: actionKeyboard(),
        },
      );
    } catch (err) {
      await ctx.reply(userError(err));
    }
  }

  async function replyCheck(ctx: Context, held: Pending) {
    const sim = await simulateMint(connected, held.plan);
    const text = [
      formatDropSummary({
        chain: held.plan.chain,
        nftContract: held.plan.nftContract,
        drop: held.plan.drop,
        feeRecipient: held.plan.feeRecipient,
        feeSource: held.plan.feeSource,
        quantity: held.plan.quantity,
        name: held.name,
        slug: held.slug,
      }),
      "",
      sim.ok ? `simulate: ${escapeHtml(sim.message)}` : `simulate: <b>FAIL</b> — ${escapeHtml(sim.message)}`,
    ].join("\n");
    await ctx.reply(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: actionKeyboard(),
    });
  }

  async function confirmArm(ctx: Context, held: Pending) {
    const phase = dropPhase(held.plan.drop);
    if (phase === "ended" || phase === "none") {
      await ctx.reply(phase === "ended" ? "Public stage has ended." : "No public drop to arm.");
      return;
    }
    if (phase === "live") {
      await ctx.reply(
        [
          "Public stage is already live.",
          formatDropSummary({
            chain: held.plan.chain,
            nftContract: held.plan.nftContract,
            drop: held.plan.drop,
            feeRecipient: held.plan.feeRecipient,
            feeSource: held.plan.feeSource,
            quantity: held.plan.quantity,
            name: held.name,
            slug: held.slug,
          }),
          "",
          "Mint now?",
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: actionKeyboard() },
      );
      return;
    }

    try {
      const sim = await simulateMint(connected, held.plan);
      const balance = await connected.provider.getBalance(connected.address);
      if (balance < held.plan.value) {
        throw new MintBlockedError(
          "funds",
          `Insufficient funds for mint price (${formatEther(held.plan.value)} ${held.plan.chain.native}).`,
        );
      }
      if (sim.gasLimit) {
        await assertMintCaps(config, connected, held.plan, sim.gasLimit);
      } else if (config.maxValueWei === 0n) {
        throw new MintBlockedError(
          "cap",
          "MAX_VALUE_WEI is 0, so minting is disabled. Set a wei cap before arming.",
        );
      } else if (held.plan.value > config.maxValueWei) {
        throw new MintBlockedError(
          "cap",
          `Mint value exceeds MAX_VALUE_WEI (${formatEther(config.maxValueWei)}).`,
        );
      }

      const job = watcher.arm({
        nftContract: held.plan.nftContract,
        chainLabel: held.plan.chain.label,
        quantity: held.plan.quantity,
        startTime: held.plan.drop.startTime,
      });
      await ctx.reply(
        [
          "<b>Armed</b> — this process will wait until startTime, then mintPublic.",
          `nft: <code>${job.nftContract}</code>`,
          `qty: ${job.quantity}`,
          `start: ${formatIso(job.startTime)}`,
          "A restart cancels this watch (in-memory only).",
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Cancel", "cancel") },
      );
    } catch (err) {
      await ctx.reply(userError(err));
    }
  }

  async function confirmMint(ctx: Context, held: Pending) {
    const phase = dropPhase(held.plan.drop);
    if (phase !== "live") {
      await ctx.reply(
        phase === "scheduled"
          ? "Not public yet. Use Arm to wait for startTime."
          : "Public stage is not live.",
        { reply_markup: actionKeyboard() },
      );
      return;
    }
    try {
      const result = await broadcastMint(config, connected, held.plan);
      await ctx.reply(
        `<b>Minted</b>\nqty ${held.plan.quantity}\n<a href="${result.explorer}">${result.hash}</a>`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      );
    } catch (err) {
      await ctx.reply(userError(err), { reply_markup: actionKeyboard() });
    }
  }

  return { bot, watcher };
}

function actionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Check", "check")
    .text("Arm", "arm")
    .text("Mint 1", "mint1")
    .text("Cancel", "cancel");
}

function userError(err: unknown): string {
  if (err instanceof ResolveError || err instanceof MintBlockedError) return err.message;
  if (err instanceof Error) {
    const msg = err.message;
    if (/private key|mnemonic|token/i.test(msg)) return "Request failed.";
    return msg.slice(0, 400);
  }
  return "Request failed.";
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}
