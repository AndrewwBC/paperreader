import { randomUUID } from 'node:crypto'
import { compressPdf, hasPdfHeader } from './pdf.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import express from 'express'
import multer from 'multer'
import db from './db.js'
import { recoveryAvailable, deliverRecovery } from './recovery.js'
import { sendVerification, verifyEmail } from './verification.js'
import { installBackupRoutes } from './backup.js'
import { installSharingRoutes, accessSql, editSql, studyPermission, studyDetails } from './sharing.js'
import {
  createPasswordResetToken,
  endSession,
  getSessionUser,
  hashPassword,
  publicUser,
  requireAuth,
  startSession,
  usePasswordResetToken,
  verifyPassword,
} from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const MAX_PDF_BYTES = 20 * 1024 * 1024

// Multer: accept a single PDF up to MAX_PDF_BYTES; larger files fail with 413.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
})
const authAttempts = new Map()

app.set('trust proxy', 1)
app.use('/api/backup/restore', requireAuth, express.json({ limit: '100mb' }))
app.use(express.json())

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '..', 'dist')))
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function limitAuth(req, res, next) {
  const now = Date.now()
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const recent = (authAttempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000)
  if (recent.length >= 10) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' })
  }
  recent.push(now)
  authAttempts.set(key, recent)
  next()
}

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req)
  if (!user) {
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
    return res.status(401).json({ user: null, setupRequired: userCount === 0 })
  }
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/register', limitAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')

  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: 'O nome deve ter entre 2 e 60 caracteres.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' })
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'A senha deve ter entre 8 e 128 caracteres.' })
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado.' })
  }

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const isFirstUser = db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0

  db.exec('BEGIN')
  try {
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, email, hashPassword(password), createdAt)

    if (isFirstUser) {
      db.prepare('UPDATE studies SET owner_id = ? WHERE owner_id IS NULL').run(id)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  authAttempts.delete(req.ip || req.socket.remoteAddress || 'unknown')
  startSession(req, res, id)
  res.status(201).json({ user: { id, name, email, createdAt, emailVerified: false } })
  await sendVerification({ id, email }, `${req.protocol}://${req.get('host')}`)
})

app.post('/api/auth/login', limitAuth, (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' })
  }

  authAttempts.delete(req.ip || req.socket.remoteAddress || 'unknown')
  startSession(req, res, user.id)
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', (req, res) => {
  endSession(req, res)
  res.json({ ok: true })
})

app.post('/api/auth/forgot-password', limitAuth, async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' })
  }
  if (!recoveryAvailable()) return res.status(503).json({ error: 'O envio de recuperação ainda não foi configurado. Entre em contato com o administrador.' })
  const token = createPasswordResetToken(email)
  // Delivery runs after the same response for existing and unknown accounts.
  res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.' })
  if (token) {
    try { await deliverRecovery(email, token, `${req.protocol}://${req.get('host')}`) }
    catch { console.error('Falha na entrega do e-mail de recuperação. Verifique a configuração SMTP.') }
  }
})

app.post('/api/auth/verify-email', limitAuth, (req, res) => {
  if (!verifyEmail(req.body?.token)) return res.status(400).json({ error: 'Link inválido, expirado ou já utilizado. Solicite uma nova confirmação na sua conta.' })
  res.json({ ok: true })
})

app.post('/api/auth/resend-verification', requireAuth, limitAuth, async (req, res) => {
  if (req.user.email_verified_at) return res.json({ ok: true, message: 'Seu e-mail já está confirmado.' })
  const sent = await sendVerification(req.user, `${req.protocol}://${req.get('host')}`)
  if (!sent) return res.status(503).json({ error: 'Não foi possível enviar a confirmação. Tente novamente mais tarde.' })
  res.json({ ok: true, message: 'Enviamos um novo link de confirmação. Confira seu e-mail e a pasta de spam.' })
})

app.post('/api/auth/reset-password', limitAuth, (req, res) => {
  const token = String(req.body?.token || '')
  const password = String(req.body?.password || '')
  const confirmPassword = String(req.body?.confirmPassword || '')

  if (!token || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Token, senha e confirmação são obrigatórios.' })
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'As senhas não conferem.' })
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'A senha deve ter entre 8 e 128 caracteres.' })
  }

  const ok = usePasswordResetToken(token, password)
  if (!ok) {
    return res.status(400).json({ error: 'Token inválido ou expirado.' })
  }

  res.json({ ok: true })
})

app.put('/api/auth/me', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = normalizeEmail(req.body?.email)
  const currentPassword = String(req.body?.currentPassword || '')
  const newPassword = String(req.body?.newPassword || '')
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)

  if (user == null || verifyPassword(currentPassword, user.password_hash) === false) {
    return res.status(401).json({ error: 'A senha atual está incorreta.' })
  }
  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({ error: 'O nome deve ter entre 2 e 60 caracteres.' })
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) === false || email.length > 254) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' })
  }
  if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) {
    return res.status(400).json({ error: 'A nova senha deve ter entre 8 e 128 caracteres.' })
  }

  const emailOwner = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?')
    .get(email, user.id)
  if (emailOwner) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado.' })
  }

  const emailChanged = email !== user.email
  const passwordHash = newPassword ? hashPassword(newPassword) : user.password_hash
  db.exec('BEGIN')
  try {
    db.prepare(`UPDATE users SET name = ?, email = ?, password_hash = ?, email_verified_at = ? WHERE id = ?`)
      .run(name, email, passwordHash, emailChanged ? null : user.email_verified_at, user.id)
    if (emailChanged || newPassword) {
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id)
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
    }
    if (emailChanged) db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  if (emailChanged || newPassword) startSession(req, res, user.id)
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json({ user: publicUser(updatedUser) })
  if (emailChanged) await sendVerification(updatedUser, `${req.protocol}://${req.get('host')}`)
})

app.delete('/api/auth/me', requireAuth, (req, res) => {
  const password = String(req.body?.password || '')
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)

  if (user == null || verifyPassword(password, user.password_hash) === false) {
    return res.status(401).json({ error: 'A senha está incorreta.' })
  }

  const studyCount = db.prepare('SELECT COUNT(*) AS count FROM studies WHERE owner_id = ?')
    .get(user.id).count
  if (studyCount > 0) {
    return res.status(409).json({
      error: 'Exclua seus estudos antes de excluir a conta.',
    })
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id)
  endSession(req, res)
  res.json({ ok: true })
})

app.use('/api', requireAuth)
installBackupRoutes(app)
installSharingRoutes(app)

// List owned studies and accepted memberships.
app.get('/api/studies', (req, res) => {
  const studies = db.prepare(`SELECT s.id, s.name, s.created_at, COUNT(p.id) AS paper_count,
    CASE WHEN s.owner_id = ? THEN 'owner' ELSE m.role END AS role
    FROM studies s LEFT JOIN papers p ON p.study_id = s.id
    LEFT JOIN study_members m ON m.study_id = s.id AND m.user_id = ?
    WHERE ${accessSql} GROUP BY s.id ORDER BY s.created_at ASC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id)
  res.json(studies.map(studyDetails))
})

app.get('/api/studies/:id', (req, res) => {
  const study = db.prepare(`SELECT s.id, s.name, s.created_at, COUNT(p.id) AS paper_count,
    CASE WHEN s.owner_id = ? THEN 'owner' ELSE m.role END AS role
    FROM studies s LEFT JOIN papers p ON p.study_id = s.id
    LEFT JOIN study_members m ON m.study_id = s.id AND m.user_id = ?
    WHERE s.id = ? AND ${accessSql} GROUP BY s.id
  `).get(req.user.id, req.user.id, req.params.id, req.user.id, req.user.id)
  if (!study) return res.status(404).json({ error: 'Study not found' })
  res.json(studyDetails(study))
})

// Create a study
app.post('/api/studies', (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Study name is required' })
  if (name.length > 80) return res.status(400).json({ error: 'Study name is too long' })

  const id = randomUUID()
  const createdAt = new Date().toISOString()

  db.prepare('INSERT INTO studies (id, name, created_at, owner_id) VALUES (?, ?, ?, ?)')
    .run(id, name, createdAt, req.user.id)

  res.json({ id, name, createdAt, paperCount: 0, role: 'owner', canEdit: true, isOwner: true })
})


// Update a study
app.put('/api/studies/:id', (req, res) => {
  const study = db.prepare('SELECT id, created_at FROM studies WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id)
  if (!study) return res.status(404).json({ error: 'Study not found' })

  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Study name is required' })
  if (name.length > 80) return res.status(400).json({ error: 'Study name is too long' })

  db.prepare('UPDATE studies SET name = ? WHERE id = ?').run(name, req.params.id)
  const paperCount = db.prepare('SELECT COUNT(*) AS count FROM papers WHERE study_id = ?')
    .get(req.params.id).count

  res.json({
    id: req.params.id,
    name,
    createdAt: study.created_at,
    paperCount,
    role: 'owner', canEdit: true, isOwner: true,
  })
})

// Delete a study and all of its papers
app.delete('/api/studies/:id', (req, res) => {
  const study = db.prepare('SELECT id FROM studies WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id)
  if (!study) return res.status(404).json({ error: 'Study not found' })

  const paperCount = db.prepare('SELECT COUNT(*) AS count FROM papers WHERE study_id = ?')
    .get(req.params.id).count

  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM papers WHERE study_id = ?').run(req.params.id)
    db.prepare('DELETE FROM studies WHERE id = ?').run(req.params.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  res.json({ ok: true, deletedPaperCount: paperCount })
})

// List all papers (without PDF data)
app.get('/api/papers', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.study_id, p.file_name, p.added_at, p.meta
    FROM papers p
    JOIN studies s ON s.id = p.study_id
    WHERE ${accessSql}
    ORDER BY p.added_at DESC
  `).all(req.user.id, req.user.id)
  res.json(rows.map(r => ({
    id: r.id,
    studyId: r.study_id,
    fileName: r.file_name,
    addedAt: r.added_at,
    meta: JSON.parse(r.meta),
    blobUrl: null,
  })))
})


// Get a paper without PDF data
app.get('/api/papers/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.id, p.study_id, p.file_name, p.added_at, p.meta
    FROM papers p
    JOIN studies s ON s.id = p.study_id
    WHERE p.id = ? AND ${accessSql}
  `).get(req.params.id, req.user.id, req.user.id)

  if (!row) return res.status(404).json({ error: 'Paper not found' })
  res.json({
    id: row.id,
    studyId: row.study_id,
    fileName: row.file_name,
    addedAt: row.added_at,
    meta: JSON.parse(row.meta),
    blobUrl: null,
  })
})

// Add a new paper
const COMPRESS_THRESHOLD = 3 * 1024 * 1024
app.post('/api/papers', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' })
  if (!hasPdfHeader(req.file.buffer)) return res.status(400).json({ error: 'Arquivo PDF inválido.' })
  const id = randomUUID()
  // Multipart filenames from browsers arrive decoded as Latin-1 by Busboy.
  let fileName = req.file.originalname
  if ([...fileName].every(char => char.codePointAt(0) <= 255)) {
    try { fileName = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(fileName, 'latin1')) } catch { /* Keep legacy Latin-1 names. */ }
  }
  let meta
  try {
    meta = req.body.meta ? JSON.parse(req.body.meta) : {}
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('Invalid metadata')
  } catch {
    return res.status(400).json({ error: 'Metadados inválidos.' })
  }
  delete meta.compressed
  delete meta.originalSize
  const studyId = String(req.body.studyId || '')
  const addedAt = new Date().toISOString()

  if (!studyId) return res.status(400).json({ error: 'Study is required' })
  const study = studyPermission(studyId, req.user.id)
  if (!study || study.role === 'viewer') return res.status(403).json({ error: 'Você não tem permissão para editar este estudo.' })

  let pdfBuffer = req.file.buffer
  if (pdfBuffer.length > COMPRESS_THRESHOLD) {
    const optimized = await compressPdf(pdfBuffer)
    if (optimized) {
      meta.compressed = true
      meta.originalSize = req.file.size
      pdfBuffer = optimized
    }
  }

  const currentAccess = studyPermission(studyId, req.user.id)
  if (!currentAccess || currentAccess.role === 'viewer') return res.status(403).json({ error: 'Seu acesso de edição foi revogado.' })

  db.prepare(
    'INSERT INTO papers (id, study_id, file_name, added_at, pdf_data, meta) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, studyId, fileName, addedAt, pdfBuffer, JSON.stringify(meta))

  res.json({ id, studyId, fileName, addedAt, meta, blobUrl: null })
})

// Stream PDF bytes with range request support
app.get('/api/papers/:id/pdf', (req, res) => {
  const row = db.prepare(`
    SELECT p.pdf_data, p.file_name
    FROM papers p
    JOIN studies s ON s.id = p.study_id
    WHERE p.id = ? AND ${accessSql}
  `).get(req.params.id, req.user.id, req.user.id)
  if (!row) return res.status(404).json({ error: 'Not found' })

  const pdfData = Buffer.from(row.pdf_data)
  const fileSize = pdfData.length
  const etag = `W/"${req.params.id}-${fileSize}"`

  res.set('ETag', etag)
  if (req.headers['if-none-match'] === etag) return res.status(304).end()
  res.set('Cache-Control', 'private, no-cache')
  res.attachment(row.file_name)
  res.type('application/pdf')
  if (!req.query.dl) res.set('Content-Disposition', res.get('Content-Disposition').replace(/^attachment/, 'inline'))
  res.set('Accept-Ranges', 'bytes')

  const ranges = !req.headers['if-range'] && /^bytes=/.test(req.headers.range || '')
    ? req.range(fileSize)
    : undefined
  if (ranges === -1) {
    return res.status(416).set('Content-Range', `bytes */${fileSize}`).end()
  }
  // Ignore malformed/multipart ranges and If-Range without a strong validator.
  if (Array.isArray(ranges) && ranges.type === 'bytes' && ranges.length === 1) {
    const { start, end } = ranges[0]
    return res.status(206)
      .set('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      .send(pdfData.subarray(start, end + 1))
  }
  res.send(pdfData)
})


// Update a paper
app.put('/api/papers/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.id, p.study_id, p.file_name, p.added_at, p.meta
    FROM papers p
    JOIN studies s ON s.id = p.study_id
    WHERE p.id = ? AND ${editSql}
  `).get(req.params.id, req.user.id, req.user.id)
  if (!row) return res.status(404).json({ error: 'Paper not found' })

  const studyId = req.body?.studyId === undefined
    ? row.study_id
    : String(req.body.studyId || '')
  const fileName = req.body?.fileName === undefined
    ? row.file_name
    : String(req.body.fileName || '').trim()
  const meta = req.body?.meta && typeof req.body.meta === 'object'
    ? { ...JSON.parse(row.meta), ...req.body.meta }
    : JSON.parse(row.meta)

  if (!fileName) return res.status(400).json({ error: 'File name is required' })
  const study = studyPermission(studyId, req.user.id)
  if (!study || study.role === 'viewer') return res.status(403).json({ error: 'Você não tem permissão para editar este estudo.' })

  db.prepare('UPDATE papers SET study_id = ?, file_name = ?, meta = ? WHERE id = ?')
    .run(studyId, fileName, JSON.stringify(meta), req.params.id)

  res.json({
    id: row.id,
    studyId,
    fileName,
    addedAt: row.added_at,
    meta,
    blobUrl: null,
  })
})

// Discussions attached to a shared annotation.
app.get('/api/papers/:id/discussions', (req, res) => {
  const annotationId = String(req.query.annotationId || '').trim()
  const paper = db.prepare(`SELECT p.id FROM papers p JOIN studies s ON s.id = p.study_id WHERE p.id = ? AND ${accessSql}`).get(req.params.id, req.user.id, req.user.id)
  if (!paper) return res.status(404).json({ error: 'Paper not found' })
  if (!annotationId) return res.status(400).json({ error: 'Annotation is required' })
  const rows = db.prepare(`SELECT d.id, d.annotation_id, d.body, d.created_at, d.updated_at, u.id AS user_id, u.name, u.email
    FROM annotation_discussions d JOIN users u ON u.id = d.user_id WHERE d.paper_id = ? AND d.annotation_id = ? ORDER BY d.created_at`).all(req.params.id, annotationId)
  res.json(rows.map(row => ({ id: row.id, annotationId: row.annotation_id, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at, user: { id: row.user_id, name: row.name, email: row.email }, canDelete: row.user_id === req.user.id })))
})

app.post('/api/papers/:id/discussions', (req, res) => {
  const annotationId = String(req.body?.annotationId || '').trim()
  const body = String(req.body?.body || '').trim()
  const paper = db.prepare(`SELECT p.meta FROM papers p JOIN studies s ON s.id = p.study_id WHERE p.id = ? AND ${accessSql}`).get(req.params.id, req.user.id, req.user.id)
  if (!paper) return res.status(404).json({ error: 'Paper not found' })
  if (!annotationId || body.length < 1 || body.length > 5000) return res.status(400).json({ error: 'Escreva uma mensagem de 1 a 5.000 caracteres.' })
  let meta
  try { meta = JSON.parse(paper.meta) } catch { meta = {} }
  if (!Array.isArray(meta.highlights) || !meta.highlights.some(item => String(item.id) === annotationId)) return res.status(404).json({ error: 'Anotação não encontrada.' })
  const now = new Date().toISOString(), id = randomUUID()
  db.prepare('INSERT INTO annotation_discussions (id, paper_id, annotation_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.id, annotationId, req.user.id, body, now, now)
  res.status(201).json({ id, annotationId, body, createdAt: now, updatedAt: now, user: { id: req.user.id, name: req.user.name, email: req.user.email }, canDelete: true })
})

app.delete('/api/papers/:id/discussions/:discussionId', (req, res) => {
  const result = db.prepare('DELETE FROM annotation_discussions WHERE id = ? AND paper_id = ? AND user_id = ?').run(req.params.discussionId, req.params.id, req.user.id)
  if (!result.changes) return res.status(404).json({ error: 'Discussão não encontrada.' })
  res.json({ ok: true })
})

// Update metadata
app.put('/api/papers/:id/meta', (req, res) => {
  const row = db.prepare(`
    SELECT p.meta
    FROM papers p
    JOIN studies s ON s.id = p.study_id
    WHERE p.id = ? AND ${editSql}
  `).get(req.params.id, req.user.id, req.user.id)
  if (!row) return res.status(404).json({ error: 'Not found' })
  const updated = { ...JSON.parse(row.meta), ...req.body }
  db.prepare('UPDATE papers SET meta = ? WHERE id = ?').run(JSON.stringify(updated), req.params.id)
  res.json({ ok: true })
})

// Delete a paper
app.delete('/api/papers/:id', (req, res) => {
  const result = db.prepare(`
    DELETE FROM papers
    WHERE id = ?
      AND study_id IN (SELECT s.id FROM studies s WHERE ${editSql})
  `).run(req.params.id, req.user.id, req.user.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Paper not found' })
  res.json({ ok: true })
})

// Upload error handler — returns JSON instead of Express's default HTML page
app.use((error, req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'O PDF excede o limite de 20 MB.' })
  }
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'O arquivo excede o limite de 100 MB.' })
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' })
  console.error(error)
  res.status(500).json({ error: 'Erro interno do servidor.' })
})

if (process.env.NODE_ENV === 'production') {
  app.use((req, res) => {
    res.sendFile(join(__dirname, '..', 'dist', 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API server on http://localhost:${PORT}`))
