export type MarketKey = 'btc-5m' | 'btc-15m' | 'eth-5m' | 'eth-15m'

export type MarketSpec = {
  key: MarketKey
  coin: 'BTC' | 'ETH'
  window: '5m' | '15m'
  secs: 300 | 900
}

export const MARKET_SPECS: Record<MarketKey, MarketSpec> = {
  'btc-5m': { key: 'btc-5m', coin: 'BTC', window: '5m', secs: 300 },
  'btc-15m': { key: 'btc-15m', coin: 'BTC', window: '15m', secs: 900 },
  'eth-5m': { key: 'eth-5m', coin: 'ETH', window: '5m', secs: 300 },
  'eth-15m': { key: 'eth-15m', coin: 'ETH', window: '15m', secs: 900 },
}

export const DEFAULT_MARKET: MarketKey = 'btc-15m'

export type GlancePayload = {
  asOf: number
  market: {
    key: MarketKey
    coin: 'BTC' | 'ETH'
    window: '5m' | '15m'
    slug: string
    upMid: number | null
    upDelta1mCents: number | null
    secondsLeft: number | null
    favored: 'UP' | 'DOWN' | 'EVEN' | null
  }
  hyperliquid: {
    coin: 'BTC' | 'ETH'
    mid: number | null
    delta1mPct: number | null
  }
  edgeCents: number | null
  disclaimer: string
  sources: string[]
}

export const DISCLAIMER = 'Not financial advice · paper/testnet'
