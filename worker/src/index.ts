import { tickAlerts } from './alerts'
import { loadPositionRows, loadPositionsText } from './assemble-positions'
import { buildGlance, buildMarkets } from './feeds'
import { parseVoiceIntent } from './grammar'
import { PAPER_DEFAULT_USD, recordPaperFill } from './paper'
import { createPairing, getPairing, parseCode } from './pairing'
import { formatPositionLine, isEthAddress } from './positions-pm'
import { shareCardToTelegram } from './share'
import { transcribePcm } from './stt'
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
      const owner = url.searchParams.get('owner') ?? undefined
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
        const rows = await loadPositionRows(env.DB, { telegramUserId, owner, pm, hl })
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


    if (url.pathname === '/paper/fill' && request.method === 'POST') {
      if (!env.DB) return json({ error: 'no database' }, 503)
      let body: { owner?: string; market?: string; side?: string; sizeUsd?: number; price?: number | null }
      try {
        body = (await request.json()) as typeof body
      } catch {
        return json({ error: 'bad json' }, 400)
      }
      const owner = (body.owner || '').trim()
      const market = body.market || ''
      const side = (body.side || '').toUpperCase()
      const sizeUsd = Number(body.sizeUsd ?? PAPER_DEFAULT_USD)
      if (!owner || !market || !side) return json({ error: 'missing fields' }, 400)
      if (!['UP', 'DOWN', 'LONG', 'SHORT', 'CLOSE'].includes(side)) return json({ error: 'bad side' }, 400)
      const result = await recordPaperFill(env.DB, {
        owner,
        market,
        side,
        sizeUsd,
        price: body.price ?? null,
      })
      if ('error' in result) return json({ error: 'cap', spent: result.spent, cap: result.cap, disclaimer: DISCLAIMER }, 400)
      return json({ fill: result, disclaimer: DISCLAIMER })
    }

    if (url.pathname === '/intent' && request.method === 'POST') {
      let body: { text?: string }
      try {
        body = (await request.json()) as typeof body
      } catch {
        return json({ error: 'bad json' }, 400)
      }
      const textIn = (body.text || '').trim()
      if (!textIn) return json({ error: 'empty' }, 400)
      return json({ transcript: textIn, intent: parseVoiceIntent(textIn), disclaimer: DISCLAIMER })
    }

    if (url.pathname === '/stt' && request.method === 'POST') {
      try {
        const buf = new Uint8Array(await request.arrayBuffer())
        const transcript = await transcribePcm(env.AI, buf)
        return json({ transcript, intent: parseVoiceIntent(transcript), disclaimer: DISCLAIMER })
      } catch (err) {
        return json({ error: 'stt', message: err instanceof Error ? err.message : String(err) }, 503)
      }
    }

    if (url.pathname === '/telegram/share' && request.method === 'POST') {
      let body: { code?: string; text?: string }
      try {
        body = (await request.json()) as typeof body
      } catch {
        return json({ error: 'bad json' }, 400)
      }
      const code = parseCode(body.code || '')
      if (!code) return json({ error: 'bad code' }, 400)
      const card = (body.text || '').trim()
      if (!card) return json({ error: 'empty' }, 400)
      const result = await shareCardToTelegram(env, code, card)
      if (!result.ok) return json({ error: result.reason }, result.reason === 'no-token' ? 503 : 409)
      return json({ ok: true })
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
