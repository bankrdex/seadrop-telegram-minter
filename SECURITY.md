# Security Policy

## This is a burner-wallet minter

`seadrop-telegram-minter` is a **self-hosted, owner-only** Telegram bot. Each operator forks and deploys **their own** instance. It is not a shared mint service.

Use a **burner wallet**. Fund it with mint price + gas only. After a drop, sweep the NFT and leftover ETH, then rotate the key.

## Secrets

**Never commit, paste into GitHub, or send through Telegram:**

- `PRIVATE_KEY`
- `TELEGRAM_BOT_TOKEN`
- RPC URLs that embed API keys (Alchemy, QuickNode, Infura)
- `OPENSEA_API_KEY`

If a key is pasted into a public repository, assume the burner is already drained. Rotate immediately.

Store secrets only in the host's environment variables (Railway / Fly / Render / VPS). The committed file is `.env.example` with empty placeholders. `.env` is gitignored.

The bot **never** prints the private key. `/wallet` shows the derived address and native balance only.

## Threat model (what this bot will not do)

- No signed FCFS / `mintSigned` / browser JWT / SIWE session stealing
- No key import via Telegram chat
- No seed phrases
- No multi-wallet farming
- No OpenSea JWT pasting
- Owner-only: only `TELEGRAM_OWNER_ID` can run mint commands. Everyone else is ignored.

Public SeaDrop `mintPublic` only.

## Caps

`MAX_VALUE_WEI=0` (the default) **refuses to mint** until the operator sets a cap. That is intentional.

`MAX_GAS_GWEI` refuses to broadcast if the network fee is above the cap, so a fake “mint” cannot drain the burner on gas.

Every mint is `eth_call` simulated before broadcast.

## Reporting

This is a small public MIT project with no bounty program. If you find a vulnerability that can leak keys or drain a burner, open a GitHub issue **without** including secrets, or email the maintainer of your fork.

## After a compromise

1. Sweep remaining NFT + ETH from the burner if you still control it
2. Rotate `PRIVATE_KEY` and `TELEGRAM_BOT_TOKEN`
3. Revoke the old Telegram bot with BotFather
4. Treat the old RPC key as burned if it was committed
