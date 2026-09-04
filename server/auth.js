import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import db from './db.js'

const SESSION_COOKIE = 'paper_vault_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function digestToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '').split(';')
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=')
    if (separator === -1) continue
    if (cookie.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
    maxAge: SESSION_TTL_MS,
  }
}

export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = stored.split(':')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
    return expected.length > 0 && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at,
  }
}

export function getSessionUser(req) {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return null

  const tokenHash = digestToken(token)
  const session = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash)

  if (!session) return null
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
    return null
  }

  return session
}

export function requireAuth(req, res, next) {
  const user = getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'Autenticação necessária' })
  req.user = user
  next()
}

export function startSession(req, res, userId) {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = digestToken(token)
  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(createdAt)
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, createdAt, expiresAt)

  res.cookie(SESSION_COOKIE, token, cookieOptions(req))
}

export function endSession(req, res) {
  const token = readCookie(req, SESSION_COOKIE)
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digestToken(token))
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: '/',
  })
}
