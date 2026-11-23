import type { ConfirmOrder, GlancePayload, PositionsPayload } from './types'

const HINT = '> tap: paper $5 · hold: voice · swipe markets'
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
  const sign = cents > 0 ? '+' : ''
  return `edge ${sign}${cents}c`
}

export function formatGlance(g: GlancePayload): string {
  const m = g.market
  const up = m.upMid === null ? '--' : fmtCents(m.upMid)
  const line1 = `${m.coin} ${m.window} UP ${up} ${fmtDeltaCents(m.upDelta1mCents)} · ${fmtTime(m.secondsLeft)}`
  const hl = g.hyperliquid
  const mid = hl.mid === null ? '--' : fmtPx(hl.mid)
  const div = g.divergenceCents === null ? '' : ` · div ${g.divergenceCents >= 0 ? '+' : ''}${g.divergenceCents}c`
  const line2 = `HL ${hl.coin} ${mid} ${fmtPct(hl.delta1mPct)} · ${fmtEdge(g.edgeCents)}${div}`
  const disclaimer = g.disclaimer || DISCLAIMER
  return `${line1}\n${line2}\n${HINT}\n${disclaimer}`
}

export function formatMovedLines(ranked: GlancePayload[]): string[] {
  const lines: string[] = []
  ranked.slice(0, 20).forEach((g, i) => {
    const m = g.market
    const up = m.upMid === null ? '--' : fmtCents(m.upMid)
    const d = fmtDeltaCents(m.upDelta1mCents)
    const e = g.edgeCents === null ? 'e--' : `e${g.edgeCents >= 0 ? '+' : ''}${g.edgeCents}`
    const line = `${i + 1} ${m.coin} ${m.window} UP ${up} ${d} ${e}`
    lines.push(line.slice(0, 64))
  })
  if (!lines.length) lines.push('No markets yet')
  return lines
}

export function formatPositionLines(p: PositionsPayload): string[] {
  if (!p.lines.length) return ['No positions yet · paper default', 'Pair Telegram, then /wallet and /hl']
  return p.lines.slice(0, 20).map(s => s.slice(0, 64))
}

export function formatPairing(code: string, status: string): string {
  const st = status === 'linked' ? 'Linked. Alerts will go to Telegram.' : 'Send this code to @EdgeGlass_bot.'
  return `Pair Telegram\n${code}\n${st}\n${DISCLAIMER}`
}

export { DISCLAIMER }

export function formatConfirm(order: ConfirmOrder, note?: string): string {
  const head =
    order.side === 'CLOSE'
      ? `CLOSE ${order.sizeUsd === 0 ? 'ALL' : order.market} (paper)`
      : `${order.side === 'DOWN' ? 'BUY DOWN' : 'BUY UP'} $${order.sizeUsd} @${order.price == null ? '--' : `${Math.round(order.price * 100)}c`} (paper)`
  const loss = order.side === 'CLOSE' ? 'tap=confirm  swipe=cancel' : `max loss $${order.sizeUsd} · tap=confirm  swipe=cancel`
  const src = order.source === 'voice' ? 'from voice · not advice' : 'Not financial advice · paper/testnet'
  return `${head}\n${loss}\n${note || src}\n${DISCLAIMER}`
}

export function formatShareResult(ok: boolean, reason?: string): string {
  if (ok) return `Sent to Telegram\nCurrent card posted to the linked chat.\n${DISCLAIMER}`
  if (reason === 'unlinked' || reason === 'bad code') {
    return `Not linked\nPair Telegram first, then send.\n${DISCLAIMER}`
  }
  if (reason === 'no-token') {
    return `Telegram not configured on the worker yet.\nPairing still works locally.\n${DISCLAIMER}`
  }
  return `Send failed\n${reason || 'unknown'}\n${DISCLAIMER}`
}
