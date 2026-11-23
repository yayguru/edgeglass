// Day 2 heuristic, still not a model and not advice.
// +0.4% on HL → +10c on the fair UP mid (scale 0.25).
// Divergence: Polymarket's 1-minute UP move vs that implied move.

const SCALE = 0.25

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function impliedMoveCents(hl1mPct: number | null): number | null {
  if (hl1mPct === null) return null
  return Math.round(hl1mPct * SCALE * 100)
}

export function edgeCents(upMid: number | null, hl1mPct: number | null): number | null {
  if (upMid === null || hl1mPct === null) return null
  const fair = clamp(0.5 + hl1mPct * SCALE, 0.02, 0.98)
  return Math.round((upMid - fair) * 100)
}

export function divergenceCents(upDelta1mCents: number | null, hl1mPct: number | null): number | null {
  const implied = impliedMoveCents(hl1mPct)
  if (upDelta1mCents === null || implied === null) return null
  return upDelta1mCents - implied
}

export function moveScore(
  upDelta1mCents: number | null,
  hl1mPct: number | null,
  edge: number | null,
  divergence: number | null,
): number {
  const odds = Math.abs(upDelta1mCents ?? 0)
  const px = Math.abs(hl1mPct ?? 0) * 10
  const e = Math.abs(edge ?? 0)
  const d = Math.abs(divergence ?? 0)
  return Math.round(Math.max(odds, px, e, d) * 10) / 10
}
