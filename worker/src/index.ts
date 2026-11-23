import { tickAlerts } from './alerts'
import { loadPositionRows, loadPositionsText } from './assemble-positions'
import { buildGlance, buildMarkets } from './feeds'
import { createPairing, getPairing, parseCode } from './pairing'
import { formatPositionLine, isEthAddress } from './positions-pm'
import { handleTelegramUpdate, webhookSecretOk } from './telegram'
import { DEFAULT_MARKET, DISCLAIMER, isMarketKey } from './types'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Bot-Api-Secret-Token, X-EdgeGlass-Tick',
  'Access-Control-Max-Age': '86400',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  })
}

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } })
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'edgeglass',
        paper: true,
        telegram: Boolean(env.EDGEGLASS_TG_BOT_TOKEN),
      })
    }

    if (url.pathname === '/glance' && request.method === 'GET') {
      const raw = url.searchParams.get('market') ?? DEFAULT_MARKET
      if (!isMarketKey(raw)) return json({ error: 'unknown market' }, 400)
      try {
        return json(await buildGlance(env.DB, raw))
      } catch (err) {
        return json({ error: 'upstream', message: err instanceof Error ? err.message : String(err) }, 502)
      }
    }

    if (url.pathname === '/markets' && request.method === 'GET') {
      try {
        return json(await buildMarkets(env.DB))
      } catch (err) {
        return json({ error: 'upstream', message: err instanceof Error ? err.message : String(err) }, 502)
      }
    }

    if (url.pathname === '/pairing' && request.method === 'POST') {
      if (!env.DB) return json({ error: 'no database' }, 503)
      try {
        return json(await createPairing(env.DB))
      } catch (err) {
        return json({ error: 'pairing', message: err instanceof Error ? err.message : String(err) }, 500)
      }
    }

    if (url.pathname.startsWith('/pairing/') && request.method === 'GET') {
      if (!env.DB) return json({ error: 'no database' }, 503)
      const code = parseCode(url.pathname.slice('/pairing/'.length))
      if (!code) return json({ error: 'bad code' }, 400)
      return json(await getPairing(env.DB, code))
    }

    if (url.pathname === '/positions' && request.method === 'GET') {
      const pm = url.searchParams.get('pm') ?? undefined
      const hl = url.searchParams.get('hl') ?? undefined
      const code = parseCode(url.searchParams.get('code') ?? '')
      let telegramUserId: string | undefined
      if (code && env.DB) {
        const row = await env.DB
          .prepare('SELECT telegram_user_id AS uid FROM pairings WHERE code = ? AND linked_at IS NOT NULL')
          .bind(code)
          .first<{ uid: string | null }>()
        telegramUserId = row?.uid ?? undefined
      }
      if (pm && !isEthAddress(pm)) return json({ error: 'bad pm address' }, 400)
      if (hl && !isEthAddress(hl)) return json({ error: 'bad hl address' }, 400)
      try {
        const rows = await loadPositionRows(env.DB, { telegramUserId, pm, hl })
        return json({
          asOf: Date.now(),
          lines: rows.map(formatPositionLine),
          count: rows.length,
          disclaimer: DISCLAIMER,
        })
      } catch (err) {
        return json({ error: 'upstream', message: err instanceof Error ? err.message : String(err) }, 502)
      }
    }

    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      if (!webhookSecretOk(env, request)) return json({ error: 'unauthorized' }, 401)
      let update: { update_id?: number; message?: { text?: string } }
      try {
        update = (await request.json()) as typeof update
      } catch {
        return json({ error: 'bad json' }, 400)
      }
      // Do not log message text.
      ctx.waitUntil(handleTelegramUpdate(env, update as Parameters<typeof handleTelegramUpdate>[1]))
      return json({ ok: true })
    }

    if (url.pathname === '/internal/tick' && request.method === 'POST') {
      const hdr = request.headers.get('X-EdgeGlass-Tick')
      if (!env.TELEGRAM_WEBHOOK_SECRET || hdr !== env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ error: 'unauthorized' }, 401)
      }
      const result = await tickAlerts(env)
      return json({ ok: true, ...result })
    }

    if (url.pathname === '/positions.txt' && request.method === 'GET') {
      const body = await loadPositionsText(env.DB, {
        pm: url.searchParams.get('pm') ?? undefined,
        hl: url.searchParams.get('hl') ?? undefined,
      })
      return text(body)
    }

    return json({ error: 'not found' }, 404)
  },

  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(tickAlerts(env).then(r => console.log('cron alerts', r.fired)))
  },
}
