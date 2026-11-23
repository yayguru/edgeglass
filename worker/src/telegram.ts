import { forgetUser, linkPairing, parseCode } from './pairing'
import { parseMarketKey, type MarketKey } from './types'
import { isEthAddress } from './positions-pm'

// Telegram text is parsed here and never forwarded to any AI, LLM, or STT service.
// Log command names and ids only — never message bodies or the bot token.

export type TgEnv = {
  EDGEGLASS_TG_BOT_TOKEN?: string
  TELEGRAM_WEBHOOK_SECRET?: string
  DB?: D1Database
}

type TgChat = { id: number }
type TgUser = { id: number; username?: string }
type TgMessage = {
  message_id: number
  chat: TgChat
  from?: TgUser
  text?: string
}
type TgUpdate = { update_id: number; message?: TgMessage }

type Parsed =
  | { kind: 'start' }
  | { kind: 'help' }
  | { kind: 'pair'; code: string }
  | { kind: 'wallet'; address: string }
  | { kind: 'hl'; address: string }
  | { kind: 'alert'; market: MarketKey; cents: number }
  | { kind: 'unalert'; market: MarketKey }
  | { kind: 'alerts' }
  | { kind: 'positions' }
  | { kind: 'forget' }
  | { kind: 'unknown' }

export function parseCommand(text: string): Parsed {
  const raw = text.trim()
  if (!raw) return { kind: 'unknown' }
  const code = parseCode(raw)
  if (code) return { kind: 'pair', code }
  const [head, ...rest] = raw.split(/\s+/)
  const cmd = head.replace(/^\//, '').split('@')[0].toLowerCase()
  const arg = rest.join(' ').trim()
  if (cmd === 'start') return { kind: 'start' }
  if (cmd === 'help') return { kind: 'help' }
  if (cmd === 'forget') return { kind: 'forget' }
  if (cmd === 'alerts') return { kind: 'alerts' }
  if (cmd === 'positions' || cmd === 'status') return { kind: 'positions' }
  if (cmd === 'wallet') {
    if (!isEthAddress(arg)) return { kind: 'unknown' }
    return { kind: 'wallet', address: arg }
  }
  if (cmd === 'hl') {
    if (!isEthAddress(arg)) return { kind: 'unknown' }
    return { kind: 'hl', address: arg }
  }
  if (cmd === 'unalert' || cmd === 'alertoff') {
    const market = parseMarketKey(arg)
    if (!market) return { kind: 'unknown' }
    return { kind: 'unalert', market }
  }
  if (cmd === 'alert') {
    // /alert btc15m 70   or  /alert btc-15m 70c
    const m = arg.match(/^([a-z0-9\-_]+)\s+(\d{1,3})c?$/i)
    if (!m) return { kind: 'unknown' }
    const market = parseMarketKey(m[1])
    const cents = Number(m[2])
    if (!market || !Number.isInteger(cents) || cents < 1 || cents > 99) return { kind: 'unknown' }
    return { kind: 'alert', market, cents }
  }
  return { kind: 'unknown' }
}

const HELP = [
  'EdgeGlass bot — pairing and alerts only. Not financial advice. Paper/testnet default.',
  '',
  'On the glasses: menu → Pair Telegram, then send the 6-character code to @EdgeGlass_bot.',
  '/wallet 0x…  — read-only Polymarket address',
  '/hl 0x…      — read-only Hyperliquid address',
  '/alert btc15m 70  — ping when UP mid reaches 70c',
  '/alerts  /unalert btc15m  /positions  /forget',
  '',
  'This bot never sends your messages to any AI.',
].join('\n')

async function sendText(env: TgEnv, chatId: number | string, text: string): Promise<void> {
  const token = env.EDGEGLASS_TG_BOT_TOKEN
  if (!token) throw new Error('bot token missing')
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!res.ok) {
    // Do not log the URL — it contains the token.
    console.warn('telegram sendMessage failed', res.status)
  }
}

async function upsertWallet(
  db: D1Database,
  telegramUserId: string,
  field: 'pm_address' | 'hl_address',
  address: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO wallets (telegram_user_id, ${field}, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET ${field} = excluded.${field}, updated_at = excluded.updated_at`,
    )
    .bind(telegramUserId, address, now)
    .run()
}

async function requireLinked(
  db: D1Database,
  telegramUserId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT code FROM pairings WHERE telegram_user_id = ? AND linked_at IS NOT NULL LIMIT 1')
    .bind(telegramUserId)
    .first()
  return !!row
}

export async function handleTelegramUpdate(env: TgEnv, update: TgUpdate): Promise<void> {
  const msg = update.message
  const text = msg?.text
  if (!msg || !text || !env.DB) return
  const chatId = String(msg.chat.id)
  const uid = String(msg.from?.id ?? msg.chat.id)
  const parsed = parseCommand(text)
  console.log('tg cmd', parsed.kind, 'uid', uid)

  try {
    if (parsed.kind === 'start' || parsed.kind === 'help' || parsed.kind === 'unknown') {
      await sendText(env, chatId, HELP)
      return
    }
    if (parsed.kind === 'pair') {
      const result = await linkPairing(env.DB, parsed.code, uid, chatId)
      const replies: Record<typeof result, string> = {
        ok: 'Linked. Add a read-only /wallet 0x… and /hl 0x… if you want positions. /alert btc15m 70 for a threshold ping.',
        unknown: 'That code is not active. Open Pair Telegram on the glasses and send the new code.',
        expired: 'That code expired. Open Pair Telegram on the glasses for a fresh one.',
        taken: 'That code is already linked to another Telegram account.',
      }
      await sendText(env, chatId, replies[result])
      return
    }
    if (parsed.kind === 'forget') {
      await forgetUser(env.DB, uid)
      await sendText(env, chatId, 'Deleted your pairing, wallets and alerts. Message bodies were never stored.')
      return
    }
    if (parsed.kind === 'wallet') {
      await upsertWallet(env.DB, uid, 'pm_address', parsed.address)
      await sendText(env, chatId, 'Saved a read-only Polymarket address. /positions to refresh.')
      return
    }
    if (parsed.kind === 'hl') {
      await upsertWallet(env.DB, uid, 'hl_address', parsed.address)
      await sendText(env, chatId, 'Saved a read-only Hyperliquid address. /positions to refresh.')
      return
    }
    if (parsed.kind === 'alert') {
      await env.DB
        .prepare(
          'INSERT INTO alerts (telegram_user_id, chat_id, market_key, threshold_cents, paused, created_at) VALUES (?, ?, ?, ?, 0, ?)',
        )
        .bind(uid, chatId, parsed.market, parsed.cents, new Date().toISOString())
        .run()
      await sendText(
        env,
        chatId,
        `Alert set: ${parsed.market} UP mid ≥ ${parsed.cents}c. Paper/testnet only, not advice.`,
      )
      return
    }
    if (parsed.kind === 'unalert') {
      await env.DB
        .prepare('DELETE FROM alerts WHERE telegram_user_id = ? AND market_key = ?')
        .bind(uid, parsed.market)
        .run()
      await sendText(env, chatId, `Removed alerts for ${parsed.market}.`)
      return
    }
    if (parsed.kind === 'alerts') {
      const { results } = await env.DB
        .prepare('SELECT market_key AS market, threshold_cents AS cents, paused FROM alerts WHERE telegram_user_id = ?')
        .bind(uid)
        .all<{ market: string; cents: number; paused: number }>()
      if (!results.length) {
        await sendText(env, chatId, 'No alerts. Example: /alert btc15m 70')
        return
      }
      const lines = results.map(a => `${a.market} ≥ ${a.cents}c${a.paused ? ' (paused)' : ''}`)
      await sendText(env, chatId, lines.join('\n'))
      return
    }
    if (parsed.kind === 'positions') {
      const linked = await requireLinked(env.DB, uid)
      if (!linked) {
        await sendText(env, chatId, 'Pair first: send the 6-character code from the glasses.')
        return
      }
      const { loadPositionsText } = await import('./assemble-positions')
      const body = await loadPositionsText(env.DB, { telegramUserId: uid })
      await sendText(env, chatId, body)
    }
  } catch (err) {
    console.warn('tg handler failed', parsed.kind, err instanceof Error ? err.message : 'error')
    await sendText(env, chatId, 'Something broke on our side. Try again in a moment.')
  }
}

export function webhookSecretOk(env: TgEnv, request: Request): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET
  if (!expected) return false
  const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
  return got === expected
}
