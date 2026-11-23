# EdgeGlass

A glance-first trading-session HUD for **Even Realities G2** glasses: **Polymarket** short-timeframe crypto Up/Down markets (BTC/ETH 5m and 15m) plus **Hyperliquid** perp mids, with Telegram planned for pairing, alerts-when-closed, and share-to-chat (Day 2+).

This is a hackathon build for [Even Realities G2 × DoraHacks](https://dorahacks.io/hackathon/even-realities/detail). Tracks: **02 Crypto & DeFi** (main) and **01 Messaging & News**.

**Not financial advice.** Default write path is paper. No user funds, no mainnet deposits, no keys in the app or this repo.

## 5-minute setup

```bash
git clone https://github.com/yayguru/edgeglass.git
cd edgeglass
npm install
cp .env.example app/.env.local   # VITE_API_BASE=http://127.0.0.1:8787
```

Terminal A — API worker (proxies Polymarket + Hyperliquid, adds CORS):

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
npm run smoke
```

You should see a 576×288 glance card with a live Polymarket UP mid, a Hyperliquid mid, time left in the window, and the paper/testnet disclaimer. Double-tap opens the system exit dialog.

## What talks to what

- The glasses WebView only calls **our Worker** (`VITE_API_BASE`). `app.json` whitelists that origin.
- The Worker is the only process that talks to:
  - Polymarket Gamma (`https://gamma-api.polymarket.com`) for `{btc|eth}-updown-{5m|15m}-{windowStart}` discovery
  - Polymarket CLOB (`https://clob.polymarket.com`) for UP-token midpoints
  - Hyperliquid info (`https://api.hyperliquid.xyz/info`, `allMids`) — mainnet **read-only**
- No CoinGecko, no Binance, no LLM, no other price oracles. Telegram data, when added, is never sent to any AI.
- "Edge" on Day 1 is a documented heuristic (UP mid vs a naive fair from the Hyperliquid 1-minute return). It is not a model and not advice.

## Prior art (what existed before 23 Nov 2026 09:00 Europe/Warsaw)

App code in this repository starts at the official build window. Before that we only used:

- Official Even Hub tooling and docs: `@evenrealities/even_hub_sdk`, `evenhub-cli`, `evenhub-simulator`, and the official **minimal** / **asr** templates (event routing, `eventTypeOf` protobuf-zero gotcha, double-tap → `shutDownPageContainer(1)`).
- Public Polymarket and Hyperliquid HTTP APIs.
- Planning notes and PNG wireframes (not app code).

A 22 Nov simulator smoke used **only the stock official template** and is **not** in this repo.

## Safety

- Paper ledger is the default write path (Confirm card lands in a later day).
- Hyperliquid: read-only mids now; testnet orders only if a funded testnet key is supplied later as a Worker secret, never in the app.
- Footer on the glance card: `Not financial advice · paper/testnet`.
- No secrets in the client bundle. `.env` / `.dev.vars` are gitignored.
- Telegram (upcoming): the bot only sees chats it is added to; transcripts are not sent to any AI. STT, when added, is an open-source Whisper model on our own backend.

## Layout (Day 1)

One event-capture text container, 576×288, 4-bit green, no fill, no font-size/bold tricks:

```
BTC 15m UP 68c ▲27 · 4:12 left
HL BTC 60,705 ▲0.4% 1m · edge +9c
> tap: paper UP $5 · hold: voice
Not financial advice · paper/testnet
```

Root double-tap always opens the system exit dialog.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev:worker` | Cloudflare Worker locally on :8787 |
| `npm run dev:app` | Vite app on :5173 |
| `npm run smoke` | Headless simulator: boot, lit pixels, live feeds, exit dialog |
| `npm run pack` | `evenhub pack` → `.ehpk` (optional, later) |

## License

MIT.
