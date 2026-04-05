# Telegram bot (Cloudflare Workers)

This folder contains a small Telegram bot for collecting feature ideas and support requests.

## What it does
- Shows menu: **Предложить идею** / **Нужна помощь**
- Stores a short per-user state in **Workers KV** (10 minutes)
- Forwards the user's message to the admin chat
- Supports deep-links: `/?start=idea` and `/?start=help`, and `/cancel`

## Deploy (Cloudflare Workers)
1. Install Wrangler
2. Create KV namespace (for example: `FX_BOT_STATE`)
3. Configure variables:
   - `BOT_TOKEN` — Telegram bot token (BotFather)
   - `ADMIN_CHAT_ID` — your Telegram chat id (you can get it by sending `/start` to the bot and reading logs, or via helper bots)
4. Set webhook to your worker URL

The worker code lives in `src/worker.js`.
