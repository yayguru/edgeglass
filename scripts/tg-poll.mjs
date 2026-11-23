#!/usr/bin/env node
// Long-poll Telegram and forward updates to the local Worker webhook.
// Uses EDGEGLASS_TG_BOT_TOKEN from the environment or worker/.dev.vars.
// Never prints the token, message text, or webhook secret.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const API = process.env.EDGEGLASS_API_BASE || 'http://127.0.0.1:8787'

function readDevVars() {
  const p = join(ROOT, 'worker/.dev.vars')
  const out = {}
  if (!existsSync(p)) return out
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i <= 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

const dev = readDevVars()
const token = process.env.EDGEGLASS_TG_BOT_TOKEN || dev.EDGEGLASS_TG_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || dev.TELEGRAM_WEBHOOK_SECRET
if (!token || !secret) {
  console.error('tg-poll: missing token or webhook secret in env / worker/.dev.vars')
  process.exit(1)
}

const tg = 'https://api.telegram.org/bot' + token
let offset = 0

async function loop() {
  console.log('tg-poll: forwarding updates to', API, 'as @EdgeGlass_bot')
  for (;;) {
    const url = `${tg}/getUpdates?timeout=25&offset=${offset}&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`
    let data
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn('tg-poll: getUpdates', res.status)
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      data = await res.json()
    } catch (err) {
      console.warn('tg-poll: getUpdates failed', err instanceof Error ? err.message : 'error')
      await new Promise(r => setTimeout(r, 2000))
      continue
    }
    if (!data.ok) {
      console.warn('tg-poll: getUpdates not ok')
      await new Promise(r => setTimeout(r, 2000))
      continue
    }
    for (const update of data.result ?? []) {
      offset = update.update_id + 1
      try {
        const res = await fetch(`${API}/telegram/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': secret,
          },
          body: JSON.stringify(update),
        })
        if (!res.ok) console.warn('tg-poll: webhook', res.status)
        else console.log('tg-poll: forwarded update', update.update_id)
      } catch (err) {
        console.warn('tg-poll: forward failed', err instanceof Error ? err.message : 'error')
      }
    }
  }
}

loop().catch(err => {
  console.error('tg-poll: exit', err instanceof Error ? err.message : 'error')
  process.exit(1)
})
