# EdgeGlass

A glance-first trading-session HUD for **Even Realities G2** glasses: **Polymarket** short-timeframe crypto Up/Down markets (BTC/ETH 5m and 15m) plus **Hyperliquid** perp mids, with **Telegram** (`@EdgeGlass_bot`) for pairing, alerts-when-closed, and read-only wallet links.

This is a hackathon build for [Even Realities G2 × DoraHacks](https://dorahacks.io/hackathon/even-realities/detail). Tracks: **02 Crypto & DeFi** (main) and **01 Messaging & News**.

**Not financial advice.** Default write path is paper. No user funds, no mainnet deposits, no keys in the app or this repo.

## 5-minute setup

```bash
git clone https://github.com/yayguru/edgeglass.git
cd edgeglass
npm install
cp .env.example app/.env.local   # VITE_API_BASE=http://127.0.0.1:8787
cp worker/.dev.vars.example worker/.dev.vars  # add the bot token locally, never commit it
```

Terminal A — API worker (proxies Polymarket + Hyperliquid, adds CORS, Telegram webhook):

```bash
npm run dev:worker
```

Terminal B — G2 web app:

```bash
npm run dev:app
```

Terminal C — glasses simulator (needs the official Even Hub simulator):

```bash
npx evenhub-simulator http://127.0.0.1:5173
```

Headless smoke (Xvfb + automation port; Linux with `libwebkit2gtk-4.1-0`):

```bash
npm test && npm run smoke
```

On the glasses: swipe up/down cycles BTC/ETH 5m/15m in "what moved" order; the contextual menu opens What moved, Positions, and Pair Telegram. Double-tap on the glance card opens the system exit dialog; on other screens it goes back.

## Production Worker

Public API (free Cloudflare Worker + D1, paper/read-only):

https://edgeglass.merjkerm.workers.dev/health

`app.json` already whitelists that origin plus local `http://127.0.0.1:8787`. Telegram secrets are **not** stored in the repo. Until they are set on the Worker (`wrangler secret put EDGEGLASS_TG_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`, then set the webhook), `@EdgeGlass_bot` should be run against a local worker with `node scripts/tg-poll.mjs`.

## What talks to what

- The glasses WebView only calls **our Worker** (`VITE_API_BASE`). `app.json` whitelists that origin.
- The Worker is the only process that talks to:
  - Polymarket Gamma (`https://gamma-api.polymarket.com`) for `{btc|eth}-updown-{5m|15m}-{windowStart}` discovery
  - Polymarket CLOB (`https://clob.polymarket.com`) for UP-token midpoints
  - Polymarket Data API v2 (`https://data-api.polymarket.com/v2/positions`) for read-only positions
  - Hyperliquid info (`https://api.hyperliquid.xyz/info`, `allMids` and `clearinghouseState`) — mainnet **read-only**
  - Telegram Bot API, only to send our own replies and receive webhook/poll updates
- No CoinGecko, no Binance, no LLM, no other price oracles. **Telegram message bodies are never stored and never sent to any AI.**
- "Edge" and "divergence" are documented heuristics (UP mid vs a naive fair from the Hyperliquid 1-minute return). They are not a model and not advice. "What moved" ranks the four markets by those 1-minute moves.
- 1-minute history is kept in memory and in D1 so a cold isolate can still compute deltas.

## Telegram (`@EdgeGlass_bot`)

1. On the glasses, menu → **Pair Telegram** (6-character code, 15 minutes).
2. Send that code to `@EdgeGlass_bot`.
3. Optional: `/wallet 0x…` (Polymarket, read-only), `/hl 0x…` (Hyperliquid, read-only).
4. `/alert btc15m 70` — ping when the UP mid reaches 70c. `/alerts`, `/unalert`, `/positions`, `/forget`.

## Prior art (what existed before 23 Nov 2026 09:00 Europe/Warsaw)

App code in this repository starts at the official build window. Before that we only used:

- Official Even Hub tooling and docs: `@evenrealities/even_hub_sdk`, `evenhub-cli`, `evenhub-simulator`, and the official **minimal** / **asr** templates (event routing, `eventTypeOf` protobuf-zero gotcha, double-tap → `shutDownPageContainer(1)`).
- Public Polymarket and Hyperliquid HTTP APIs.
- Planning notes and PNG wireframes (not app code).

A 22 Nov simulator smoke used **only the stock official template** and is **not** in this repo.

## Safety

- Paper ledger is the default write path (Confirm card lands in a later day).
- Hyperliquid: read-only mids and optional read-only positions; testnet orders only if a funded testnet key is supplied later as a Worker secret, never in the app.
- Footer on the glance card: `Not financial advice · paper/testnet`.
- No secrets in the client bundle. `.env` / `.dev.vars` are gitignored.
- Telegram: the bot only sees chats it is added to; message text is parsed for commands/addresses and is not logged or forwarded to any AI. STT, when added, is an open-source Whisper model on our own backend.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev:worker` | Cloudflare Worker locally on :8787 |
| `npm run dev:app` | Vite app on :5173 |
| `npm test` | Command parser + edge heuristic unit tests |
| `npm run smoke` | Headless simulator: boot, live feeds, swipe, pairing, lit pixels, exit |
| `npm run pack` | `evenhub pack` → `.ehpk` (optional, later) |
| `node scripts/tg-poll.mjs` | Local Telegram long-poll → local worker webhook |

## License

MIT.
