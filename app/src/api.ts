import type { GlancePayload, MarketKey, MarketsPayload, PositionsPayload } from './types'

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

export async function fetchMarkets(): Promise<MarketsPayload> {
  const res = await fetch(`${apiBase()}/markets`)
  if (!res.ok) throw new Error(`markets ${res.status}`)
  return (await res.json()) as MarketsPayload
}

export async function createPairing(): Promise<{ code: string; expiresAt: string }> {
  const res = await fetch(`${apiBase()}/pairing`, { method: 'POST' })
  if (!res.ok) throw new Error(`pairing ${res.status}`)
  return (await res.json()) as { code: string; expiresAt: string }
}

export async function fetchPairing(code: string): Promise<{ status: string; expiresAt?: string }> {
  const res = await fetch(`${apiBase()}/pairing/${encodeURIComponent(code)}`)
  if (!res.ok) throw new Error(`pairing status ${res.status}`)
  return (await res.json()) as { status: string; expiresAt?: string }
}

export async function fetchPositions(code?: string): Promise<PositionsPayload> {
  const q = code ? `?code=${encodeURIComponent(code)}` : ''
  const res = await fetch(`${apiBase()}/positions${q}`)
  if (!res.ok) throw new Error(`positions ${res.status}`)
  return (await res.json()) as PositionsPayload
}
