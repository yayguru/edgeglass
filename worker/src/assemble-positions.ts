import { DISCLAIMER, type MarketKey } from './types'
import { formatPositionLine, isEthAddress, polymarketPositions, type PositionRow } from './positions-pm'
import { hyperliquidPositions } from './hyperliquid'

export type PositionQuery = {
  telegramUserId?: string
  owner?: string
  pm?: string
  hl?: string
}

export async function loadPositionRows(db: D1Database | undefined, q: PositionQuery): Promise<PositionRow[]> {
  const rows: PositionRow[] = []
  let pm = q.pm
  let hl = q.hl
  let uid = q.telegramUserId

  const owner = q.owner
  if (db && !uid && !pm && !hl && !owner) {
    return rows
  }
  if (db && uid) {
    const w = await db
      .prepare('SELECT pm_address AS pm, hl_address AS hl FROM wallets WHERE telegram_user_id = ?')
      .bind(uid)
      .first<{ pm: string | null; hl: string | null }>()
    pm = pm || w?.pm || undefined
    hl = hl || w?.hl || undefined
  }
  if (db && (uid || owner)) {
    const { results } = await db
      .prepare(
        `SELECT market_key AS market, side, size_usd AS size, price FROM paper_fills
         WHERE owner = ? OR telegram_user_id = ?
         ORDER BY created_at DESC LIMIT 20`,
      )
      .bind(owner ?? uid, uid ?? owner)
      .all<{ market: MarketKey; side: string; size: number; price: number | null }>()
    for (const f of results) {
      rows.push({
        source: 'paper',
        title: f.market,
        detail: `${f.side} $${f.size}${f.price != null ? ` @${Math.round(f.price * 100)}c` : ''}`,
        pnl: null,
      })
    }
  }

  if (pm && isEthAddress(pm)) {
    rows.push(...(await polymarketPositions(pm)))
  }
  if (hl && isEthAddress(hl)) {
    const pos = await hyperliquidPositions(hl)
    for (const p of pos) {
      rows.push({
        source: 'hyperliquid',
        title: p.coin,
        detail: `${p.szi > 0 ? 'long' : 'short'} ${Math.abs(p.szi)}`,
        pnl: p.unrealizedPnl,
      })
    }
  }
  return rows.slice(0, 20)
}

export async function loadPositionsText(db: D1Database | undefined, q: PositionQuery): Promise<string> {
  const rows = await loadPositionRows(db, q)
  if (!rows.length) {
    return `No positions yet. Paper default; add /wallet and /hl after pairing.\n${DISCLAIMER}`
  }
  const lines = rows.map(formatPositionLine)
  return `${lines.join('\n')}\n${DISCLAIMER}`
}
