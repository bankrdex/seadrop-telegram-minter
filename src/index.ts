import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { webhookCallback } from "grammy";
import { loadConfig, redactRpcUrl } from "./config.js";
import { createBot } from "./telegram.js";
import { connectWallet, getWalletSnapshot } from "./wallet.js";

const config = loadConfig();
const connected = connectWallet(config);
const { bot, watcher } = createBot(config, connected);

const startedAt = Date.now();

function healthPayload() {
  const job = watcher.getJob();
  return {
    ok: true,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    chain: config.chain.name,
    chainId: config.chain.id.toString(),
    rpc: redactRpcUrl(config.rpcUrl),
    webhook: Boolean(config.webhookUrl),
    maxValueWei: config.maxValueWei.toString(),
    armed: job
      ? {
          status: job.status,
          nftContract: job.nftContract,
          quantity: job.quantity,
          startTime: job.startTime,
        }
      : null,
  };
}

async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "/";
  if (req.method === "GET" && (url === "/" || url === "/health" || url === "/status")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(healthPayload()));
    return;
  }
  if (config.webhookUrl && req.method === "POST") {
    const handler = webhookCallback(bot, "http");
    await handler(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
}

const server = createServer((req, res) => {
  void handleHttp(req, res).catch(() => {
    if (!res.writableEnded) {
      res.writeHead(500);
      res.end();
    }
  });
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`health listening on 0.0.0.0:${config.port}`);
});

async function main() {
  const snap = await getWalletSnapshot(connected);
  if (snap.rpcChainId !== config.chain.id) {
    console.error(
      `RPC chain id ${snap.rpcChainId} does not match CHAIN=${config.chain.name} (${config.chain.id}). Refusing to start.`,
    );
    process.exit(1);
  }

  console.log("seadrop-telegram-minter");
  console.log(`owner ${config.ownerId}`);
  console.log(`wallet ${snap.address}`);
  console.log(`chain ${config.chain.label} (${config.chain.id})`);
  console.log(`rpc ${redactRpcUrl(config.rpcUrl)}`);
  console.log(`max value wei ${config.maxValueWei.toString()} · max gas gwei ${config.maxGasGwei}`);
  if (config.maxValueWei === 0n) {
    console.log("minting disabled until MAX_VALUE_WEI is set");
  }

  if (config.webhookUrl) {
    await bot.api.setWebhook(config.webhookUrl);
    console.log("webhook mode");
  } else {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("long polling (set WEBHOOK_URL to switch)");
    await bot.start({
      onStart: (info) => {
        console.log(`polling as @${info.username}`);
      },
    });
  }
}

function shutdown() {
  watcher.cancel();
  void bot.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "startup failed";
  if (/private key|mnemonic|TELEGRAM_BOT_TOKEN/i.test(message)) {
    console.error("startup failed");
  } else {
    console.error(message);
  }
  process.exit(1);
});
