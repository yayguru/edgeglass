import type { TgEnv } from './telegram'

export async function shareCardToTelegram(
  env: TgEnv,
  code: string,
  text: string,
): Promise<{ ok: true } | { ok: false; reason: 'unlinked' | 'no-token' | 'send-failed' }> {
  if (!env.EDGEGLASS_TG_BOT_TOKEN) return { ok: false, reason: 'no-token' }
  if (!env.DB) return { ok: false, reason: 'unlinked' }
  const row = await env.DB
    .prepare(
      'SELECT chat_id AS chatId FROM pairings WHERE code = ? AND linked_at IS NOT NULL AND chat_id IS NOT NULL',
    )
    .bind(code)
    .first<{ chatId: string }>()
  if (!row?.chatId) return { ok: false, reason: 'unlinked' }
  const card = text.slice(0, 1500) + (text.length > 1500 ? '…' : '')
  const res = await fetch(`https://api.telegram.org/bot${env.EDGEGLASS_TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: row.chatId, text: `${card}\n\nNot financial advice · paper/testnet` }),
  })
  if (!res.ok) {
    console.warn('share sendMessage failed', res.status)
    return { ok: false, reason: 'send-failed' }
  }
  console.log('share sent to linked chat, chars', card.length)
  return { ok: true }
}
