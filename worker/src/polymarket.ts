import type { MarketSpec } from './types'

const GAMMA = 'https://gamma-api.polymarket.com'
const CLOB = 'https://clob.polymarket.com'
const UA = 'edgeglass/0.1 (hackathon; read-only)'

export type PolymarketQuote = {
  slug: string
  upMid: number | null
  secondsLeft: number | null
  favored: 'UP' | 'DOWN' | 'EVEN' | null
}

function slugFor(spec: MarketSpec, windowStart: number): string {
  return `${spec.coin.toLowerCase()}-updown-${spec.window}-${windowStart}`
}

export function windowStarts(spec: MarketSpec, nowSec = Date.now() / 1000): number[] {
  const start = Math.floor(nowSec / spec.secs) * spec.secs
  // Current, next (pre-listed), previous (if we crossed a close).
  return [start, start + spec.secs, start - spec.secs]
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

type GammaMarket = {
  closed?: boolean
  acceptingOrders?: boolean
  endDate?: string
  outcomes?: string | string[]
  outcomePrices?: string | string[]
  clobTokenIds?: string | string[]
}

type GammaEvent = {
  slug?: string
  closed?: boolean
  markets?: GammaMarket[]
}

function asList(value: string | string[] | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

async function loadEvent(slug: string): Promise<GammaEvent | null> {
  const data = (await fetchJson(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`)) as GammaEvent[]
  return data[0] ?? null
}

async function clobMid(tokenId: string): Promise<number | null> {
  const data = (await fetchJson(`${CLOB}/midpoint?token_id=${encodeURIComponent(tokenId)}`)) as { mid?: string }
  const mid = data.mid !== undefined ? Number(data.mid) : NaN
  return Number.isFinite(mid) ? mid : null
}

function favoredFromUp(up: number | null): 'UP' | 'DOWN' | 'EVEN' | null {
  if (up === null) return null
  if (Math.abs(up - 0.5) < 0.02) return 'EVEN'
  return up > 0.5 ? 'UP' : 'DOWN'
}

export async function quotePolymarket(spec: MarketSpec, now = Date.now()): Promise<PolymarketQuote> {
  let lastSlug = slugFor(spec, windowStarts(spec, now / 1000)[0])
  for (const start of windowStarts(spec, now / 1000)) {
    const slug = slugFor(spec, start)
    lastSlug = slug
    const ev = await loadEvent(slug)
    const market = ev?.markets?.[0]
    if (!ev || !market) continue
    if (ev.closed || market.closed) continue

    const outcomes = asList(market.outcomes)
    const tokenIds = asList(market.clobTokenIds)
    const gammaPrices = asList(market.outcomePrices).map(Number)
    const upIndex = Math.max(0, outcomes.findIndex(o => o.toLowerCase() === 'up'))
    const upToken = tokenIds[upIndex]
    let upMid: number | null = null
    if (upToken) {
      try {
        upMid = await clobMid(upToken)
      } catch {
        upMid = null
      }
    }
    if (upMid === null && Number.isFinite(gammaPrices[upIndex])) {
      upMid = gammaPrices[upIndex]
    }

    const endMs = market.endDate ? Date.parse(market.endDate) : NaN
    const secondsLeft = Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - now) / 1000)) : null

    return {
      slug,
      upMid,
      secondsLeft,
      favored: favoredFromUp(upMid),
    }
  }

  return { slug: lastSlug, upMid: null, secondsLeft: null, favored: null }
}
