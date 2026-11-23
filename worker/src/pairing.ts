const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TTL_MS = 15 * 60 * 1000

export function randomCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

// Alphabet excludes 0/O/1/I.
export function parseCode(raw: string): string | null {
  const c = raw.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(c)) return null
  if (![...c].every(ch => ALPHABET.includes(ch))) return null
  return c
}

export async function createPairing(db: D1Database): Promise<{ code: string; expiresAt: string }> {
  const expires = new Date(Date.now() + TTL_MS).toISOString()
  for (let i = 0; i < 5; i++) {
    const code = randomCode()
    try {
      await db
        .prepare('INSERT INTO pairings (code, created_at, expires_at) VALUES (?, ?, ?)')
        .bind(code, new Date().toISOString(), expires)
        .run()
      return { code, expiresAt: expires }
    } catch {
      continue
    }
  }
  throw new Error('could not allocate pairing code')
}

export async function getPairing(db: D1Database, code: string): Promise<{
  status: 'pending' | 'linked' | 'expired' | 'unknown'
  expiresAt?: string
}> {
  const row = await db
    .prepare('SELECT expires_at AS expiresAt, linked_at AS linkedAt FROM pairings WHERE code = ?')
    .bind(code)
    .first<{ expiresAt: string; linkedAt: string | null }>()
  if (!row) return { status: 'unknown' }
  if (row.linkedAt) return { status: 'linked', expiresAt: row.expiresAt }
  if (Date.parse(row.expiresAt) < Date.now()) return { status: 'expired', expiresAt: row.expiresAt }
  return { status: 'pending', expiresAt: row.expiresAt }
}

export async function linkPairing(
  db: D1Database,
  code: string,
  telegramUserId: string,
  chatId: string,
): Promise<'ok' | 'unknown' | 'expired' | 'taken'> {
  const row = await db
    .prepare('SELECT expires_at AS expiresAt, telegram_user_id AS uid FROM pairings WHERE code = ?')
    .bind(code)
    .first<{ expiresAt: string; uid: string | null }>()
  if (!row) return 'unknown'
  if (Date.parse(row.expiresAt) < Date.now()) return 'expired'
  if (row.uid && row.uid !== telegramUserId) return 'taken'
  await db
    .prepare('UPDATE pairings SET telegram_user_id = ?, chat_id = ?, linked_at = ? WHERE code = ?')
    .bind(telegramUserId, chatId, new Date().toISOString(), code)
    .run()
  return 'ok'
}

export async function forgetUser(db: D1Database, telegramUserId: string): Promise<void> {
  await db.prepare('DELETE FROM alerts WHERE telegram_user_id = ?').bind(telegramUserId).run()
  await db.prepare('DELETE FROM wallets WHERE telegram_user_id = ?').bind(telegramUserId).run()
  await db.prepare('DELETE FROM paper_fills WHERE telegram_user_id = ?').bind(telegramUserId).run()
  await db.prepare('DELETE FROM pairings WHERE telegram_user_id = ?').bind(telegramUserId).run()
}
