import { parseMarketKey, type MarketKey } from './types'

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

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  twentyfive: 25,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
}

function norm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9.$ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSize(tokens: string[]): number {
  for (const t of tokens) {
    const word = t.replace(/^\$/, '')
    if (WORDS[word] !== undefined) return WORDS[word]
    if (/^\d+(?:\.\d+)?$/.test(word)) {
      const n = Number(word)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return 5
}

function parseCoinMarket(text: string): MarketKey | null {
  const m = text.match(/\b(btc|eth|bitcoin|ethereum)(?:\s|-)?(5m|15m|five|fifteen)?\b/)
  if (!m) return parseMarketKey(text)
  const coin = m[1].startsWith('eth') ? 'eth' : 'btc'
  const win = m[2] && (m[2] === '5m' || m[2] === 'five') ? '5m' : '15m'
  return parseMarketKey(`${coin}-${win}`)
}

export function parseVoiceIntent(transcript: string): VoiceIntent {
  const text = norm(transcript)
  if (!text) return { kind: 'unknown', transcript }
  if (/^(what\s+moved|whatmoved|moved)$/.test(text) || text === 'what move') return { kind: 'moved' }
  if (/^positions?$/.test(text)) return { kind: 'positions' }
  if (/^resume/.test(text)) return { kind: 'resume' }
  if (/^pause/.test(text)) return { kind: 'pause' }
  if (/^send(\s+to\s+(group|telegram|chat))?$/.test(text)) return { kind: 'send' }

  const close = text.match(/^close(?:\s+(all|btc|eth|bitcoin|ethereum|(?:btc|eth)(?:\s|-)?(?:5m|15m)))?$/)
  if (close) {
    if (!close[1] || close[1] === 'all') return { kind: 'close', market: 'all' }
    const key = parseCoinMarket(close[1]) ?? 'btc-15m'
    return { kind: 'close', market: key }
  }

  const tokens = text.split(' ')
  const hasUp = tokens.includes('up')
  const hasDown = tokens.includes('down')
  const hasLong = tokens.includes('long')
  const hasShort = tokens.includes('short')
  const hasBuy = tokens.includes('buy')
  if (hasUp || hasDown || hasLong || hasShort || hasBuy) {
    const side: 'UP' | 'DOWN' = hasDown || hasShort ? 'DOWN' : 'UP'
    const market = parseCoinMarket(text)
    const sizeUsd = parseSize(tokens.filter(t => !['buy', 'long', 'short', 'up', 'down', 'btc', 'eth', 'bitcoin', 'ethereum', '5m', '15m'].includes(t)))
    return { kind: 'trade', market, side, sizeUsd }
  }

  const onlyMarket = parseCoinMarket(text)
  if (onlyMarket && text.replace(/bitcoin|ethereum|btc|eth|5m|15m|five|fifteen/g, '').trim() === '') {
    return { kind: 'market', key: onlyMarket }
  }

  return { kind: 'unknown', transcript }
}
