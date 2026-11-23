# Production Telegram (do not put secrets in git)

The Worker is already at https://edgeglass.merjkerm.workers.dev (`telegram: false` on `/health` until secrets exist).

After `wrangler login` (account merjkerm):

```bash
cd worker
npx wrangler secret put EDGEGLASS_TG_BOT_TOKEN      # paste once, do not echo
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET     # same value as local worker/.dev.vars
```

Then set the webhook (a script should read the token from the environment and never print it):

```bash
# WEBHOOK_SECRET must match the Worker secret
curl -sS "https://api.telegram.org/bot${EDGEGLASS_TG_BOT_TOKEN}/setWebhook" \
  -d url=https://edgeglass.merjkerm.workers.dev/telegram/webhook \
  -d secret_token="${TELEGRAM_WEBHOOK_SECRET}" \
  -d drop_pending_updates=true \
  -d allowed_updates='["message"]'
```

Until that is done, run the bot against a local worker:

```bash
npm run dev:worker
node scripts/tg-poll.mjs
```
