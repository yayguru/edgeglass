import type { GlancePayload, MarketKey } from './types'

export function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8787'
  return raw.replace(/\/$/, '')
}

export async function fetchGlance(key: MarketKey = 'btc-15m'): Promise<GlancePayload> {
  const url = `${apiBase()}/glance?market=${encodeURIComponent(key)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`glance ${res.status}`)
  return (await res.json()) as GlancePayload
}
