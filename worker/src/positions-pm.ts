import { DISCLAIMER } from './types'

const DATA_API = 'https://data-api.polymarket.com/v2'
const UA = 'edgeglass/0.2 (hackathon; read-only)'

export type PositionRow = {
  source: 'paper' | 'polymarket' | 'hyperliquid'
  title: string
  detail: string
  pnl: number | null
}

export function isEthAddress(raw: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(raw.trim())
}

export async function polymarketPositions(user: string): Promise<PositionRow[]> {
  const url = `${DATA_API}/positions?user=${encodeURIComponent(user)}&limit=20`
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } })
  if (!res.ok) throw new Error(`polymarket positions → ${res.status}`)
  const body = (await res.json()) as { data?: Array<Record<string, unknown>> }
  const rows: PositionRow[] = []
  for (const p of body.data ?? []) {
    const title = String(p.title ?? p.slug ?? 'market').slice(0, 40)
    const outcome = String(p.outcome ?? '')
    const size = Number(p.current_size)
    const pnl = Number(p.unrealized_pnl ?? p.total_pnl)
    const detail = [outcome, Number.isFinite(size) ? `sz ${trimNum(size)}` : '']
      .filter(Boolean)
      .join(' ')
    rows.push({
      source: 'polymarket',
      title,
      detail,
      pnl: Number.isFinite(pnl) ? pnl : null,
    })
  }
  return rows
}

export function formatPositionLine(row: PositionRow): string {
  const tag = row.source === 'paper' ? 'paper' : row.source === 'polymarket' ? 'PM' : 'HL'
  const pnl = row.pnl === null ? '' : ` ${row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(2)}`
  const line = `${tag} ${row.title} ${row.detail}${pnl}`.replace(/\s+/g, ' ').trim()
  return line.slice(0, 64)
}

function trimNum(n: number): string {
  if (Math.abs(n) >= 100) return n.toFixed(0)
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return String(n)
}

export function emptyDisclaimer(): string {
  return DISCLAIMER
}
