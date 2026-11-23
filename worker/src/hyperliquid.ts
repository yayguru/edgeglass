const HL_INFO = 'https://api.hyperliquid.xyz/info'
const UA = 'edgeglass/0.1 (hackathon; read-only)'

export async function hyperliquidMids(): Promise<Record<string, number>> {
  const res = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ type: 'allMids' }),
  })
  if (!res.ok) throw new Error(`hyperliquid allMids → ${res.status}`)
  const data = (await res.json()) as Record<string, string>
  const out: Record<string, number> = {}
  for (const [coin, raw] of Object.entries(data)) {
    const n = Number(raw)
    if (Number.isFinite(n)) out[coin] = n
  }
  return out
}


export type HlPosition = {
  coin: string
  szi: number
  entryPx: number | null
  unrealizedPnl: number | null
  mid: number | null
}

export async function hyperliquidPositions(user: string): Promise<HlPosition[]> {
  const res = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ type: 'clearinghouseState', user }),
  })
  if (!res.ok) throw new Error(`hyperliquid clearinghouseState → ${res.status}`)
  const data = (await res.json()) as {
    assetPositions?: Array<{ position?: Record<string, unknown> }>
  }
  const out: HlPosition[] = []
  for (const ap of data.assetPositions ?? []) {
    const p = ap.position ?? {}
    const szi = Number(p.szi)
    if (!Number.isFinite(szi) || szi === 0) continue
    out.push({
      coin: String(p.coin ?? '?'),
      szi,
      entryPx: numOrNull(p.entryPx),
      unrealizedPnl: numOrNull(p.unrealizedPnl),
      mid: null,
    })
  }
  return out
}

function numOrNull(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
