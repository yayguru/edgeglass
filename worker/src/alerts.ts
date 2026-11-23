import { buildGlance } from './feeds'
import type { MarketKey } from './types'

type AlertRow = {
  id: number
  chat_id: string
  market_key: MarketKey
  threshold_cents: number
  last_fired_at: string | null
}

export async function tickAlerts(env: { EDGEGLASS_TG_BOT_TOKEN?: string; DB?: D1Database }): Promise<{ fired: number }> {
  if (!env.DB || !env.EDGEGLASS_TG_BOT_TOKEN) return { fired: 0 }
  const { results } = await env.DB
    .prepare(
      'SELECT id, chat_id, market_key, threshold_cents, last_fired_at FROM alerts WHERE paused = 0',
    )
    .all<AlertRow>()
  if (!results.length) return { fired: 0 }

  let fired = 0
  const seen = new Map<MarketKey, number | null>()
  for (const alert of results) {
    if (!seen.has(alert.market_key)) {
      try {
        const g = await buildGlance(env.DB, alert.market_key)
        seen.set(alert.market_key, g.market.upMid)
      } catch (err) {
        console.warn('alert glance failed', alert.market_key, err instanceof Error ? err.message : 'error')
        continue
      }
    }
    const mid = seen.get(alert.market_key)
    if (mid == null) continue
    const cents = Math.round(mid * 100)
    if (cents < alert.threshold_cents) continue
    // Re-arm if we already fired and the mid has not been below threshold since — skip until last_fired is cleared
    // by a later drop. Simple cooldown: do not refire until mid was last fired more than 30 min ago AND we only
    // fire when last_fired is empty. A drop of 5c below the threshold clears last_fired.
    if (alert.last_fired_at) continue
    const token = env.EDGEGLASS_TG_BOT_TOKEN
    const text = `EdgeGlass alert: ${alert.market_key} UP mid ${cents}c (threshold ${alert.threshold_cents}c). Not financial advice · paper/testnet.`
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: alert.chat_id, text }),
    })
    if (!res.ok) {
      console.warn('alert send failed', res.status)
      continue
    }
    await env.DB
      .prepare('UPDATE alerts SET last_fired_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), alert.id)
      .run()
    fired += 1
  }

  // Clear last_fired when mid is 5c below threshold so the alert can fire again on a later cross.
  for (const alert of results) {
    const mid = seen.get(alert.market_key)
    if (mid == null || !alert.last_fired_at) continue
    if (Math.round(mid * 100) <= alert.threshold_cents - 5) {
      await env.DB.prepare('UPDATE alerts SET last_fired_at = NULL WHERE id = ?').bind(alert.id).run()
    }
  }
  return { fired }
}
