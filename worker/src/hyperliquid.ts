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
