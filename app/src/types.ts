export type MarketKey = 'btc-5m' | 'btc-15m' | 'eth-5m' | 'eth-15m'

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
