import type { GlancePayload } from './types'

const HINT = '> tap: paper UP $5 · hold: voice'
const DISCLAIMER = 'Not financial advice · paper/testnet'

export function loadingText(): string {
  return `EdgeGlass\nLoading Polymarket + Hyperliquid…\n${HINT}\n${DISCLAIMER}`
}

export function errorText(detail: string): string {
  return `EdgeGlass\nFeed error — retrying\n${detail}\n${DISCLAIMER}`
}

function fmtCents(mid: number): string {
  return `${Math.round(mid * 100)}c`
}

function fmtDeltaCents(d: number | null): string {
  if (d === null) return '--'
  if (d === 0) return '0'
  return d > 0 ? `▲${d}` : `▼${Math.abs(d)}`
}

function fmtTime(seconds: number | null): string {
  let s = seconds
  if (s === null || Number.isNaN(s)) return '-- left'
  if (s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')} left`
}

function fmtPx(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function fmtPct(p: number | null): string {
  if (p === null) return '--'
  const arrow = p > 0 ? '▲' : p < 0 ? '▼' : ''
  return `${arrow}${Math.abs(p).toFixed(1)}% 1m`
}

function fmtEdge(cents: number | null): string {
  if (cents === null) return 'edge --'
  const sign = cents > 0 ? '+' : cents < 0 ? '' : '+'
  return `edge ${sign}${cents}c`
}

export function formatGlance(g: GlancePayload): string {
  const m = g.market
  const up = m.upMid === null ? '--' : fmtCents(m.upMid)
  const line1 = `${m.coin} ${m.window} UP ${up} ${fmtDeltaCents(m.upDelta1mCents)} · ${fmtTime(m.secondsLeft)}`
  const hl = g.hyperliquid
  const mid = hl.mid === null ? '--' : fmtPx(hl.mid)
  const line2 = `HL ${hl.coin} ${mid} ${fmtPct(hl.delta1mPct)} · ${fmtEdge(g.edgeCents)}`
  const disclaimer = g.disclaimer || DISCLAIMER
  return `${line1}\n${line2}\n${HINT}\n${disclaimer}`
}
