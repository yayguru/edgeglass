// Day 1 heuristic only: map a Hyperliquid 1-minute return to a naive "fair"
// UP probability, then report how many cents the Polymarket UP mid sits away
// from that. This is not a model, not calibrated, and not advice.
// +0.4% on HL → +10c on the fair mid (scale 0.25).

const SCALE = 0.25

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function edgeCents(upMid: number | null, hl1mPct: number | null): number | null {
  if (upMid === null || hl1mPct === null) return null
  const fair = clamp(0.5 + hl1mPct * SCALE, 0.02, 0.98)
  return Math.round((upMid - fair) * 100)
}
