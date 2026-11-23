import { divergenceCents, edgeCents, moveScore } from './edge'
import { deltaCents, deltaPct, record } from './history'
import { hyperliquidMids } from './hyperliquid'
import { quotePolymarket } from './polymarket'
import {
  DEFAULT_ORDER,
  DISCLAIMER,
  MARKET_KEYS,
  MARKET_SPECS,
  type GlancePayload,
  type MarketKey,
} from './types'

const CACHE_MS = 2000
const cache = new Map<string, { at: number; body: GlancePayload }>()
let lastBundle: { at: number; mids: Record<string, number> } | null = null

async function getMids(): Promise<Record<string, number>> {
  const now = Date.now()
  if (lastBundle && now - lastBundle.at < CACHE_MS) return lastBundle.mids
  const mids = await hyperliquidMids()
  lastBundle = { at: now, mids }
  return mids
}

export async function buildGlance(db: D1Database | undefined, key: MarketKey, now = Date.now()): Promise<GlancePayload> {
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.body

  const spec = MARKET_SPECS[key]
  const [pm, mids] = await Promise.all([quotePolymarket(spec, now), getMids()])
  const hlMid = mids[spec.coin] ?? null

  await record(db, `pm:${key}:up`, pm.upMid, now)
  await record(db, `hl:${spec.coin}`, hlMid, now)

  const upDelta1mCents = await deltaCents(db, `pm:${key}:up`, pm.upMid, now)
  const hlDelta1mPctRaw = await deltaPct(db, `hl:${spec.coin}`, hlMid, now)
  const hlDelta1mPct = hlDelta1mPctRaw === null ? null : Math.round(hlDelta1mPctRaw * 10) / 10
  const edge = edgeCents(pm.upMid, hlDelta1mPct)
  const divergence = divergenceCents(upDelta1mCents, hlDelta1mPct)
  const score = moveScore(upDelta1mCents, hlDelta1mPct, edge, divergence)

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
      delta1mPct: hlDelta1mPct,
    },
    edgeCents: edge,
    divergenceCents: divergence,
    moveScore: score,
    disclaimer: DISCLAIMER,
    sources: ['polymarket', 'hyperliquid'],
  }
  cache.set(key, { at: now, body })
  return body
}

export async function buildMarkets(db: D1Database | undefined, now = Date.now()): Promise<{
  asOf: number
  ranked: GlancePayload[]
  top: MarketKey
  disclaimer: string
}> {
  const markets = await Promise.all(MARKET_KEYS.map(k => buildGlance(db, k, now)))
  const ranked = [...markets].sort((a, b) => {
    if (b.moveScore !== a.moveScore) return b.moveScore - a.moveScore
    return DEFAULT_ORDER.indexOf(a.market.key) - DEFAULT_ORDER.indexOf(b.market.key)
  })
  const top = ranked[0]?.market.key ?? 'btc-15m'
  return { asOf: now, ranked, top, disclaimer: DISCLAIMER }
}
