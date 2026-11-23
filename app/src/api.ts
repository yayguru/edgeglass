import type { GlancePayload, MarketKey, MarketsPayload, PositionsPayload, VoiceIntent } from './types'

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

export async function fetchPositionsFor(owner?: string, code?: string): Promise<PositionsPayload> {
  const q = new URLSearchParams()
  if (owner) q.set('owner', owner)
  if (code) q.set('code', code)
  const res = await fetch(`${apiBase()}/positions?${q.toString()}`)
  if (!res.ok) throw new Error(`positions ${res.status}`)
  return (await res.json()) as PositionsPayload
}

export async function postPaperFill(input: {
  owner: string
  market: string
  side: string
  sizeUsd: number
  price: number | null
}): Promise<{ fill?: { id: string }; error?: string; spent?: number; cap?: number }> {
  const res = await fetch(`${apiBase()}/paper/fill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return (await res.json()) as { fill?: { id: string }; error?: string; spent?: number; cap?: number }
}

export async function postIntent(text: string): Promise<{ transcript: string; intent: VoiceIntent }> {
  const res = await fetch(`${apiBase()}/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`intent ${res.status}`)
  return (await res.json()) as { transcript: string; intent: VoiceIntent }
}

export async function postStt(pcm: Uint8Array): Promise<{ transcript?: string; intent?: VoiceIntent; error?: string; message?: string }> {
  const copy = new Uint8Array(pcm.byteLength)
  copy.set(pcm)
  const res = await fetch(`${apiBase()}/stt`, { method: 'POST', body: copy.buffer })
  return (await res.json()) as { transcript?: string; intent?: VoiceIntent; error?: string; message?: string }
}

export async function shareToTelegram(code: string, text: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${apiBase()}/telegram/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, text }),
  })
  return (await res.json()) as { ok?: boolean; error?: string }
}

export function paperOwner(): string {
  const key = 'edgeglass-paper-owner'
  try {
    let id = localStorage.getItem(key)
    if (!id) {
      id = `glasses-${crypto.randomUUID()}`
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return 'glasses-anon'
  }
}
