export type MarketKey = 'btc-5m' | 'btc-15m' | 'eth-5m' | 'eth-15m'

export const MARKET_ORDER: MarketKey[] = ['btc-15m', 'btc-5m', 'eth-15m', 'eth-5m']

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
  divergenceCents: number | null
  moveScore: number
  disclaimer: string
  sources: string[]
}

export type MarketsPayload = {
  asOf: number
  ranked: GlancePayload[]
  top: MarketKey
  disclaimer: string
}

export type PositionsPayload = {
  asOf: number
  lines: string[]
  count: number
  disclaimer: string
}

export type Screen = 'glance' | 'moved' | 'positions' | 'pairing' | 'confirm'

export type ConfirmOrder = {
  market: MarketKey
  side: 'UP' | 'DOWN' | 'CLOSE'
  sizeUsd: number
  price: number | null
  source: 'tap' | 'voice'
}

export type VoiceIntent =
  | { kind: 'moved' }
  | { kind: 'positions' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'send' }
  | { kind: 'market'; key: MarketKey }
  | { kind: 'trade'; market: MarketKey | null; side: 'UP' | 'DOWN'; sizeUsd: number }
  | { kind: 'close'; market: MarketKey | 'all' }
  | { kind: 'unknown'; transcript: string }
