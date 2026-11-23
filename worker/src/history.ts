// In-isolate ring of mids. Lives as long as the Worker isolate does
// (wrangler dev stays warm; production will move this to a Durable Object + WS).

type Sample = { t: number; value: number }

const WINDOW_MS = 90_000
const TARGET_MS = 60_000
const rings = new Map<string, Sample[]>()

export function record(key: string, value: number | null, now = Date.now()): void {
  if (value === null || !Number.isFinite(value)) return
  const ring = rings.get(key) ?? []
  ring.push({ t: now, value })
  const cut = now - WINDOW_MS
  const kept = ring.filter(s => s.t >= cut)
  rings.set(key, kept)
}

function sampleNear(key: string, target: number): Sample | null {
  const ring = rings.get(key)
  if (!ring || ring.length === 0) return null
  let best: Sample | null = null
  let bestDist = Infinity
  for (const s of ring) {
    const d = Math.abs(s.t - target)
    if (d < bestDist) {
      best = s
      bestDist = d
    }
  }
  // Need at least ~45s of history so a 4s-old point is not "1m ago".
  if (!best || bestDist > 20_000) return null
  return best
}

export function deltaCents(key: string, current: number | null, now = Date.now()): number | null {
  if (current === null) return null
  const prev = sampleNear(key, now - TARGET_MS)
  if (!prev) return null
  return Math.round((current - prev.value) * 100)
}

export function deltaPct(key: string, current: number | null, now = Date.now()): number | null {
  if (current === null) return null
  const prev = sampleNear(key, now - TARGET_MS)
  if (!prev || prev.value === 0) return null
  return ((current - prev.value) / prev.value) * 100
}
