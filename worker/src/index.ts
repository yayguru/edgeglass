import { edgeCents } from './edge'
import { deltaCents, deltaPct, record } from './history'
import { hyperliquidMids } from './hyperliquid'
import { quotePolymarket } from './polymarket'
import {
  DEFAULT_MARKET,
  DISCLAIMER,
  MARKET_SPECS,
  type GlancePayload,
  type MarketKey,
} from './types'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

const CACHE_MS = 2000
const cache = new Map<string, { at: number; body: GlancePayload }>()

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  })
}

function isMarketKey(value: string | null): value is MarketKey {
  return !!value && value in MARKET_SPECS
}

async function buildGlance(key: MarketKey): Promise<GlancePayload> {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && now - hit.at < CACHE_MS) return hit.body

  const spec = MARKET_SPECS[key]
  const [pm, mids] = await Promise.all([quotePolymarket(spec, now), hyperliquidMids()])
  const hlMid = mids[spec.coin] ?? null

  record(`pm:${key}:up`, pm.upMid, now)
  record(`hl:${spec.coin}`, hlMid, now)

  const upDelta1mCents = deltaCents(`pm:${key}:up`, pm.upMid, now)
  const hlDelta1mPct = deltaPct(`hl:${spec.coin}`, hlMid, now)
  const edge = edgeCents(pm.upMid, hlDelta1mPct)

  const body: GlancePayload = {
    asOf: now,
    market: {
      key,
      coin: spec.coin,
      window: spec.window,
      slug: pm.slug,
      upMid: pm.upMid,
      upDelta1mCents,
      secondsLeft: pm.secondsLeft,
      favored: pm.favored,
    },
    hyperliquid: {
      coin: spec.coin,
      mid: hlMid,
      delta1mPct: hlDelta1mPct === null ? null : Math.round(hlDelta1mPct * 10) / 10,
    },
    edgeCents: edge,
    disclaimer: DISCLAIMER,
    sources: ['polymarket', 'hyperliquid'],
  }
  cache.set(key, { at: now, body })
  return body
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405)
    }

    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'edgeglass', paper: true })
    }
    if (url.pathname === '/glance') {
      const raw = url.searchParams.get('market') ?? DEFAULT_MARKET
      if (!isMarketKey(raw)) return json({ error: 'unknown market' }, 400)
      try {
        return json(await buildGlance(raw))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return json({ error: 'upstream', message }, 502)
      }
    }
    if (url.pathname === '/markets') {
      try {
        const keys = Object.keys(MARKET_SPECS) as MarketKey[]
        const markets = await Promise.all(keys.map(k => buildGlance(k)))
        return json({ asOf: Date.now(), markets, disclaimer: DISCLAIMER })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return json({ error: 'upstream', message }, 502)
      }
    }

    return json({ error: 'not found' }, 404)
  },
}
