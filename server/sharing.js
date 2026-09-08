import { createHash, randomBytes, randomUUID } from 'node:crypto'
import db from './db.js'
import { recoveryAvailable, deliverInvitation } from './recovery.js'

const hash = token => createHash('sha256').update(token).digest('hex')
const roleSql = `CASE WHEN s.owner_id = ? THEN 'owner' ELSE m.role END`
export const accessSql = `(s.owner_id = ? OR EXISTS (SELECT 1 FROM study_members sm WHERE sm.study_id = s.id AND sm.user_id = ?))`
export const editSql = `(s.owner_id = ? OR EXISTS (SELECT 1 FROM study_members sm WHERE sm.study_id = s.id AND sm.user_id = ? AND sm.role = 'editor'))`

export function studyPermission(studyId, userId) {
  return db.prepare(`SELECT s.id, s.name, ${roleSql} AS role FROM studies s
    LEFT JOIN study_members m ON m.study_id = s.id AND m.user_id = ?
    WHERE s.id = ? AND ${accessSql}`).get(userId, userId, studyId, userId, userId)
}

export function studyDetails(study) {
  return { id: study.id, name: study.name, createdAt: study.created_at, paperCount: study.paper_count,
    role: study.role, canEdit: study.role === 'owner' || study.role === 'editor', isOwner: study.role === 'owner' }
}

const invitationDetails = row => ({ id: row.id, email: row.email, role: row.role, createdAt: row.created_at, expiresAt: row.expires_at })

export function installSharingRoutes(app) {
  const attempts = new Map()
  function owner(req, res, next) {
    const study = db.prepare('SELECT * FROM studies WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id)
    if (!study) return res.status(403).json({ error: 'Somente o proprietário pode gerenciar o compartilhamento.' })
    req.study = study
    next()
  }

  app.get('/api/studies/:id/sharing', owner, (req, res) => {
    const members = db.prepare(`SELECT m.user_id AS userId, u.name, u.email, m.role, m.created_at AS createdAt
      FROM study_members m JOIN users u ON u.id = m.user_id WHERE m.study_id = ? ORDER BY m.created_at`).all(req.study.id)
    const invitations = db.prepare(`SELECT id, email, role, created_at, expires_at FROM study_invitations
      WHERE study_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at`).all(req.study.id, new Date().toISOString())
    res.json({ members, invitations: invitations.map(invitationDetails) })
  })

  app.post('/api/studies/:id/invitations', owner, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const role = req.body?.role ?? 'viewer'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Informe um e-mail válido.' })
    if (!['viewer', 'editor'].includes(role)) return res.status(400).json({ error: 'Escolha leitor ou editor.' })
    if (email === req.user.email.toLowerCase()) return res.status(400).json({ error: 'Você já é proprietário deste estudo.' })
    const member = db.prepare(`SELECT 1 FROM study_members m JOIN users u ON u.id = m.user_id WHERE m.study_id = ? AND u.email = ?`).get(req.study.id, email)
    if (member) return res.status(409).json({ error: 'Esta pessoa já participa do estudo. Remova o acesso antes de enviar um novo convite.' })
    if (!recoveryAvailable()) return res.status(503).json({ error: 'O envio de e-mail ainda não está configurado.' })
    const now = Date.now()
    const recent = (attempts.get(req.user.id) || []).filter(time => now - time < 3600000)
    if (recent.length >= 20) return res.status(429).json({ error: 'Limite de convites atingido. Tente novamente em uma hora.' })
    attempts.set(req.user.id, [...recent, now])
    const token = randomBytes(32).toString('hex')
    const invitation = { id: randomUUID(), email, role, created_at: new Date(now).toISOString(), expires_at: new Date(now + 7 * 86400000).toISOString() }
    db.prepare(`INSERT INTO study_invitations (id, study_id, email, role, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(invitation.id, req.study.id, email, role, hash(token), invitation.created_at, invitation.expires_at)
    try {
      await deliverInvitation(email, token, req.study.name, `${req.protocol}://${req.get('host')}`)
    } catch {
      db.prepare('DELETE FROM study_invitations WHERE id = ?').run(invitation.id)
      return res.status(503).json({ error: 'Não foi possível enviar o convite. Tente novamente.' })
    }
    // A new invitation replaces older outstanding links for this email/study.
    db.prepare('DELETE FROM study_invitations WHERE study_id = ? AND email = ? AND id <> ? AND used_at IS NULL').run(req.study.id, email, invitation.id)
    res.status(201).json({ invitation: invitationDetails(invitation), message: 'Convite enviado. O link é válido por 7 dias.' })
  })

  app.post('/api/invitations/accept', (req, res) => {
    const token = req.body?.token
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'Convite inválido ou expirado.' })
    const invitation = db.prepare(`SELECT i.*, s.owner_id FROM study_invitations i JOIN studies s ON s.id = i.study_id
      WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`).get(hash(token), new Date().toISOString())
    if (!invitation) return res.status(400).json({ error: 'Convite inválido, expirado, revogado ou já utilizado.' })
    if (invitation.email.toLowerCase() !== req.user.email.toLowerCase()) return res.status(403).json({ error: 'Entre com a conta do e-mail que recebeu este convite.' })
    db.exec('BEGIN')
    try {
      if (invitation.owner_id !== req.user.id) {
        db.prepare(`INSERT INTO study_members (study_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(study_id, user_id) DO NOTHING`).run(invitation.study_id, req.user.id, invitation.role, new Date().toISOString())
      }
      db.prepare('UPDATE study_invitations SET used_at = ? WHERE id = ?').run(new Date().toISOString(), invitation.id)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    res.json({ ok: true, studyId: invitation.study_id })
  })

  app.delete('/api/studies/:id/invitations/:invitationId', owner, (req, res) => {
    const result = db.prepare('DELETE FROM study_invitations WHERE id = ? AND study_id = ?').run(req.params.invitationId, req.study.id)
    if (!result.changes) return res.status(404).json({ error: 'Convite não encontrado.' })
    res.json({ ok: true })
  })

  app.delete('/api/studies/:id/members/:userId', owner, (req, res) => {
    const member = db.prepare(`SELECT u.email FROM study_members m JOIN users u ON u.id = m.user_id WHERE m.study_id = ? AND m.user_id = ?`).get(req.study.id, req.params.userId)
    if (!member) return res.status(404).json({ error: 'Participante não encontrado.' })
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM study_members WHERE study_id = ? AND user_id = ?').run(req.study.id, req.params.userId)
      db.prepare('DELETE FROM study_invitations WHERE study_id = ? AND email = ?').run(req.study.id, member.email)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    res.json({ ok: true })
  })
}
