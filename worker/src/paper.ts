import { type MarketKey } from './types'

export const PAPER_DAILY_CAP_USD = 50
export const PAPER_DEFAULT_USD = 5

export type PaperFill = {
  id: string
  owner: string
  market: MarketKey | string
  side: string
  sizeUsd: number
  price: number | null
  createdAt: string
}

function newId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function paperSpentToday(db: D1Database, owner: string, now = Date.now()): Promise<number> {
  const dayStart = new Date(now)
  dayStart.setUTCHours(0, 0, 0, 0)
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(size_usd), 0) AS spent
       FROM paper_fills
       WHERE owner = ? AND created_at >= ? AND side != 'CLOSE'`,
    )
    .bind(owner, dayStart.toISOString())
    .first<{ spent: number }>()
  return Number(row?.spent ?? 0)
}

export async function recordPaperFill(
  db: D1Database,
  input: { owner: string; market: string; side: string; sizeUsd: number; price: number | null },
): Promise<PaperFill | { error: 'cap'; spent: number; cap: number }> {
  const sizeUsd = Math.round(input.sizeUsd * 100) / 100
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0 || sizeUsd > PAPER_DAILY_CAP_USD) {
    return { error: 'cap', spent: 0, cap: PAPER_DAILY_CAP_USD }
  }
  const spent = await paperSpentToday(db, input.owner)
  if (input.side !== 'CLOSE' && spent + sizeUsd > PAPER_DAILY_CAP_USD) {
    return { error: 'cap', spent, cap: PAPER_DAILY_CAP_USD }
  }
  const fill: PaperFill = {
    id: newId(),
    owner: input.owner,
    market: input.market,
    side: input.side,
    sizeUsd,
    price: input.price,
    createdAt: new Date().toISOString(),
  }
  await db
    .prepare(
      'INSERT INTO paper_fills (id, owner, market_key, side, size_usd, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(fill.id, fill.owner, fill.market, fill.side, fill.sizeUsd, fill.price, fill.createdAt)
    .run()
  return fill
}
