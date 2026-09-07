import { createHash, randomBytes } from 'node:crypto'
import db from './db.js'
import { deliverVerification, recoveryAvailable } from './recovery.js'

const digest = token => createHash('sha256').update(token).digest('hex')

export async function sendVerification(user) {
  if (!recoveryAvailable()) return false
  const token = randomBytes(32).toString('base64url')
  const now = new Date().toISOString()
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ? OR expires_at <= ?').run(user.id, now)
  db.prepare('INSERT INTO email_verification_tokens (token_hash, user_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(digest(token), user.id, user.email, now, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
  try {
    await deliverVerification(user.email, token)
    return true
  } catch {
    console.error('Falha ao enviar confirmação de e-mail. Verifique a configuração SMTP.')
    return false
  }
}

export function verifyEmail(token) {
  if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return false
  const row = db.prepare(`SELECT v.user_id FROM email_verification_tokens v JOIN users u ON u.id = v.user_id
    WHERE v.token_hash = ? AND v.email = u.email AND v.expires_at > ?`).get(digest(token), new Date().toISOString())
  if (!row) return false
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(new Date().toISOString(), row.user_id)
    db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(row.user_id)
    db.exec('COMMIT')
    return true
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
