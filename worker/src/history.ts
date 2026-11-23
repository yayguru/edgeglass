// 1-minute mid history: in-isolate ring plus optional D1 so production
// isolates (and the cron) still see a 60s baseline after a cold start.

type Sample = { t: number; value: number }

const WINDOW_MS = 90_000
const TARGET_MS = 60_000
const rings = new Map<string, Sample[]>()

export function recordMemory(key: string, value: number | null, now = Date.now()): void {
  if (value === null || !Number.isFinite(value)) return
  const ring = rings.get(key) ?? []
  ring.push({ t: now, value })
  rings.set(key, ring.filter(s => s.t >= now - WINDOW_MS))
}

function sampleNearMemory(key: string, target: number): Sample | null {
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
  if (!best || bestDist > 20_000) return null
  return best
}

export async function record(db: D1Database | undefined, key: string, value: number | null, now = Date.now()): Promise<void> {
  recordMemory(key, value, now)
  if (!db || value === null || !Number.isFinite(value)) return
  try {
    await db.prepare('INSERT OR REPLACE INTO samples (k, t, v) VALUES (?, ?, ?)').bind(key, now, value).run()
    await db.prepare('DELETE FROM samples WHERE t < ?').bind(now - WINDOW_MS).run()
  } catch {
    // Schema may not be applied yet in a fresh local D1 — memory ring still works.
  }
}

async function sampleNear(db: D1Database | undefined, key: string, target: number, now: number): Promise<Sample | null> {
  const mem = sampleNearMemory(key, target)
  if (mem) return mem
  if (!db) return null
  try {
    const row = await db
      .prepare('SELECT t, v AS value FROM samples WHERE k = ? AND t >= ? ORDER BY ABS(t - ?) ASC LIMIT 1')
      .bind(key, now - WINDOW_MS, target)
      .first<{ t: number; value: number }>()
    if (!row) return null
    if (Math.abs(row.t - target) > 20_000) return null
    return { t: row.t, value: row.value }
  } catch {
    return null
  }
}

export async function deltaCents(db: D1Database | undefined, key: string, current: number | null, now = Date.now()): Promise<number | null> {
  if (current === null) return null
  const prev = await sampleNear(db, key, now - TARGET_MS, now)
  if (!prev) return null
  return Math.round((current - prev.value) * 100)
}

export async function deltaPct(db: D1Database | undefined, key: string, current: number | null, now = Date.now()): Promise<number | null> {
  if (current === null) return null
  const prev = await sampleNear(db, key, now - TARGET_MS, now)
  if (!prev || prev.value === 0) return null
  return ((current - prev.value) / prev.value) * 100
}
