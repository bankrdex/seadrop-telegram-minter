# seadrop-telegram-minter

**Never commit `PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, RPC URLs with keys, or OpenSea keys. If you paste a key into GitHub you will get drained.**

Self-hosted Telegram bot for **one operator** to check and mint **public OpenSea SeaDrop** NFT drops from a phone. Fork it. Deploy your own instance. It is not a shared mint service.

The long-lived Node process is this repository. **Deploy it to an always-on host — Railway, Fly, Render, or a VPS. Not Vercel.**

The operator field manual website lives in [`web/`](web/) and is hosted on Vercel for sharing (docs only — the minter bot cannot run on Vercel).

## What this is

A burner-wallet minter that talks to Telegram and to a single RPC. It reads `getPublicDrop(nftContract)` on SeaDrop `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5` and, when you confirm, broadcasts payable `mintPublic(nftContract, feeRecipient, address(0), quantity)`.

Owner-only: only `TELEGRAM_OWNER_ID` can run mint commands. Everyone else is ignored. The private key is never printed.

## What this is not

- **Not** signed FCFS / `mintSigned` / browser JWT / SIWE session stealing. Public `mintPublic` only.
- **Not** a hosted public bot. You run your own copy.
- **Not** a Vercel sniper. Vercel serverless cannot stay awake for `startTime`. Use Railway, Fly, Render, or a VPS.
- **Not** multi-wallet farming, key import via chat, seed phrases, or “paste your OpenSea JWT”.

## Burner wallet only

Generate a fresh key. Fund **mint price + gas**, nothing else. After the drop, sweep the NFT and leftover ETH, then rotate the key. Treat this process as hostile: it holds a hot key for as long as it is running.

## Secrets

Keys live **only** in the host’s environment variables. Never in git.

- Copy `.env.example` locally. Do not commit `.env`.
- `.gitignore` already covers `.env`, `*.pem`, `keys/`, `wallets.json`, and logs.
- `/wallet` shows the derived address and native balance. It will never print the private key.
- If `MAX_VALUE_WEI=0` (the default), the bot **refuses to mint** until you set a cap. That is intentional.

## Phone-first setup

### 1. Telegram bot token

1. Open [@BotFather](https://t.me/BotFather) on your phone.
2. `/newbot` → copy the token.
3. Put it in `TELEGRAM_BOT_TOKEN`. Never paste it into git or a chat that is not BotFather.

### 2. Your numeric user id

1. Open [@userinfobot](https://t.me/userinfobot) (or `@raw_data_bot`).
2. Copy the numeric `Id`.
3. Put it in `TELEGRAM_OWNER_ID`. Only this id can mint.

### 3. Burner wallet

Create a new wallet (MetaMask throwaway, `cast wallet new`, etc.). Put the **private key** in `PRIVATE_KEY` on the host. Fund it with mint + gas on the drop’s chain. Do not import this key into Telegram.

### 4. RPC

Use Alchemy, QuickNode, or your own node. Put the HTTPS URL in `RPC_URL`. If the URL contains a key, it is a secret — same rules as the private key.

Set `CHAIN` to `ethereum`, `base`, or `robinhood`. It must match the RPC’s chain id (1 / 8453 / 4663). The process refuses to start on a mismatch.

`OPENSEA_API_KEY` is optional and **only** used to turn a collection slug into a contract. Without it, pass a `0x` address (and the right `CHAIN`).

### 5. Caps

```
MAX_VALUE_WEI=0          # refuse mint until you set a wei cap (price × qty)
MAX_GAS_GWEI=50          # refuse broadcast if the network fee is above this
```

Pick `MAX_VALUE_WEI` as `price_in_wei * quantity` plus nothing else. Example: a 0.01 ETH mint is `10000000000000000`.

### 6. Deploy (Railway)

Vercel cannot host this minter. Serverless sleeps; `/arm` would miss `startTime`.

**Railway**

1. Fork this repo.
2. New project → deploy from GitHub.
3. Variables tab → paste the keys from `.env.example` (values only in the host UI).
4. Build command: `npm run build`. Start command: `npm start`.
5. Disable sleep / set the service always-on.
6. Open the bot in Telegram, `/start`, then `/wallet` and confirm the address matches the burner you funded.

**Fly.io / Render / a VPS** — same idea: one long-lived Node process, `node dist/index.js` after `npm run build`, env vars on the host, no git secrets. Optional: set `WEBHOOK_URL` and `PORT` if you prefer webhooks over long polling. Long polling is the default and is enough.

Local:

```bash
cp .env.example .env      # fill values locally; never commit
npm install
npm run dev               # tsx src/index.ts
# or
npm run build && npm start
```

A process restart **cancels** an armed watch. The job is in-memory on purpose. No database in v1.

## Commands

| Command | What it does |
| --- | --- |
| `/start` | Safety briefing + command list |
| `/wallet` | Derived address + native balance. Never the key. |
| `/check <opensea collection url \| 0x>` | Resolve collection, read public drop on-chain, print chain / contract / price / start / end / max per wallet / fee recipient, then `eth_call` simulate |
| `/arm <url\|0x> [qty]` | If `startTime` is in the future, wait on the server until it, then mint. If already live, confirm and mint. |
| `/mint <url\|0x> [qty]` | Show the drop; tap **Mint 1** to broadcast if the public stage is live |
| `/cancel` | Cancel an armed watch |
| `/status` | Armed job + host health |

Expensive actions confirm with inline buttons: **Check / Arm / Mint 1 / Cancel**.

## How public SeaDrop works

OpenSea SeaDrop 1.0 is a singleton at `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5`. A collection that configured a **public** stage stores `(mintPrice, startTime, endTime, maxTotalMintableByWallet, feeBps, restrictFeeRecipients)` on that contract. Anyone can call `mintPublic` while the clock is inside `[startTime, endTime)`, paying `mintPrice * quantity`. If the drop restricts fee recipients, the bot uses the first on-chain allowed recipient; if unrestricted, it falls back to OpenSea’s fee collector `0x0000a26b00c1F0DF003000390027140000fAa719`. Signed phases, allow lists, and token-gated stages are out of scope.

## Risks

- **Sold out / revert** — simulation can pass seconds before a fill and still revert on-chain.
- **Not public yet** — `/mint` will refuse; `/arm` waits. Clock skew is retried a few times at open.
- **Scam collections** — this bot will mint any public SeaDrop you point it at. Read the contract.
- **Host sleep** — if Railway/Render sleeps, `/arm` dies. Disable sleep. A restart cancels the arm.
- **Missed FCFS** — if the drop’s real race is a **signed** OpenSea phase, this bot will not see it and cannot mint it. Public `mintPublic` only.
- **Drain via fake mint** — `MAX_VALUE_WEI` and `MAX_GAS_GWEI` are the brakes. Leave them tight.
- **Hot key** — the host can sign anything the code allows. Keep the wallet a burner.

## After a drop

1. Sweep the NFT to a cold or vault wallet.
2. Sweep leftover ETH.
3. Rotate `PRIVATE_KEY`.
4. `/cancel` is unnecessary once the process is stopped; kill the service if you are done.

## Chains

| Name | id | `CHAIN` |
| --- | --- | --- |
| Ethereum | 1 | `ethereum` |
| Base | 8453 | `base` |
| Robinhood | 4663 | `robinhood` |

## License

MIT. See [LICENSE](LICENSE) and [SECURITY.md](SECURITY.md).
