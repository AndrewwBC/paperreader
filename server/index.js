import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import express from 'express'
import multer from 'multer'
import db from './db.js'
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
const upload = multer({ storage: multer.memoryStorage() })
const authAttempts = new Map()

app.set('trust proxy', 1)
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

app.post('/api/auth/register', limitAuth, (req, res) => {
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
  res.status(201).json({ user: { id, name, email, createdAt } })
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

app.post('/api/auth/forgot-password', limitAuth, (req, res) => {
  const email = normalizeEmail(req.body?.email)
  if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' })

  const token = createPasswordResetToken(email)
  if (!token) {
    return res.json({ ok: true })
  }

  console.log(`Password reset token for ${email}: ${token}`)
  res.json({ ok: true, token })
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

app.put('/api/auth/me', requireAuth, (req, res) => {
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

  db.prepare(`
    UPDATE users
    SET name = ?, email = ?, password_hash = ?
    WHERE id = ?
  `).run(name, email, newPassword ? hashPassword(newPassword) : user.password_hash, user.id)

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  res.json({ user: publicUser(updatedUser) })
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

// List studies
app.get('/api/studies', (req, res) => {
  const studies = db.prepare(`
    SELECT
      s.id,
      s.name,
      s.created_at,
      COUNT(p.id) AS paper_count
    FROM studies s
    LEFT JOIN papers p ON p.study_id = s.id
    WHERE s.owner_id = ?
    GROUP BY s.id
    ORDER BY s.created_at ASC
  `).all(req.user.id)

  res.json(studies.map(s => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    paperCount: s.paper_count,
  })))
})


// Get a study
app.get('/api/studies/:id', (req, res) => {
  const study = db.prepare(`
    SELECT
      s.id,
      s.name,
      s.created_at,
      COUNT(p.id) AS paper_count
    FROM studies s
    LEFT JOIN papers p ON p.study_id = s.id
    WHERE s.id = ? AND s.owner_id = ?
    GROUP BY s.id
  `).get(req.params.id, req.user.id)

  if (!study) return res.status(404).json({ error: 'Study not found' })
  res.json({
    id: study.id,
    name: study.name,
    createdAt: study.created_at,
    paperCount: study.paper_count,
  })
})

// Create a study
app.post('/api/studies', (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Study name is required' })
  if (name.length > 80) return res.status(400).json({ error: 'Study name is too long' })

  const id = Date.now().toString()
  const createdAt = new Date().toISOString()

  db.prepare('INSERT INTO studies (id, name, created_at, owner_id) VALUES (?, ?, ?, ?)')
    .run(id, name, createdAt, req.user.id)

  res.json({ id, name, createdAt, paperCount: 0 })
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
    WHERE s.owner_id = ?
    ORDER BY p.added_at DESC
  `).all(req.user.id)
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
    WHERE p.id = ? AND s.owner_id = ?
  `).get(req.params.id, req.user.id)

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
const COMPRESS_TIMEOUT_MS = 120000

// Re-compress large PDFs with Ghostscript (downsamples images). Returns a
// smaller buffer or null when gs is unavailable, fails, or gains < 10%.
function compressPdf(buffer) {
  try {
    const result = spawnSync('gs', [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.5',
      '-dPDFSETTINGS=/ebook',
      '-dDetectDuplicateImages=true',
      '-dNOPAUSE', '-dQUIET', '-dBATCH',
      '-sOutputFile=-', '-',
    ], { input: buffer, timeout: COMPRESS_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 1024 })

    const out = result.stdout
    const looksLikePdf = out && out.length > 1024 && out[0] === 0x25 && out[1] === 0x50 // "%P"
    if (result.status !== 0 || !looksLikePdf) return null
    if (out.length >= buffer.length * 0.9) return null // not worth it
    return out
  } catch {
    return null
  }
}

app.post('/api/papers', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' })
  const id = Date.now().toString()
  const meta = req.body.meta ? JSON.parse(req.body.meta) : {}
  const studyId = String(req.body.studyId || '')
  const addedAt = new Date().toISOString()

  if (!studyId) return res.status(400).json({ error: 'Study is required' })
  const study = db.prepare('SELECT id FROM studies WHERE id = ? AND owner_id = ?')
    .get(studyId, req.user.id)
  if (!study) return res.status(400).json({ error: 'Study not found' })

  let pdfBuffer = req.file.buffer
  if (pdfBuffer.length > COMPRESS_THRESHOLD) {
    const optimized = compressPdf(pdfBuffer)
    if (optimized) {
      meta.compressed = true
      meta.originalSize = req.file.size
      pdfBuffer = optimized
    }
  }

  db.prepare(
    'INSERT INTO papers (id, study_id, file_name, added_at, pdf_data, meta) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, studyId, req.file.originalname, addedAt, pdfBuffer, JSON.stringify(meta))

  res.json({ id, studyId, fileName: req.file.originalname, addedAt, meta, blobUrl: null })
})

// Stream PDF bytes with range request support
app.get('/api/papers/:id/pdf', (req, res) => {
  const row = db.prepare(`
    SELECT p.pdf_data, p.file_name
    FROM papers p
    JOIN studies s ON s.id = p.study_id
    WHERE p.id = ? AND s.owner_id = ?
  `).get(req.params.id, req.user.id)
  if (!row) return res.status(404).json({ error: 'Not found' })

  const pdfData = Buffer.from(row.pdf_data)
  const fileSize = pdfData.length
  const range = req.headers.range
  const etag = `W/"${req.params.id}-${fileSize}"`

  res.set('ETag', etag)
  if (req.headers['if-none-match'] === etag) return res.status(304).end()
  res.set('Cache-Control', 'private, max-age=86400')
  res.set('Content-Type', 'application/pdf')
  res.set('Content-Disposition', `${req.query.dl ? 'attachment' : 'inline'}; filename="${row.file_name}"`)
  res.set('Accept-Ranges', 'bytes')

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    res.status(206)
    res.set('Content-Range', `bytes ${start}-${end}/${fileSize}`)
    res.set('Content-Length', chunkSize)
    res.send(pdfData.slice(start, end + 1))
  } else {
    res.set('Content-Length', fileSize)
    res.send(pdfData)
  }
})


// Update a paper
app.put('/api/papers/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.id, p.study_id, p.file_name, p.added_at, p.meta
    FROM papers p
    JOIN studies s ON s.id = p.study_id
    WHERE p.id = ? AND s.owner_id = ?
  `).get(req.params.id, req.user.id)
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
  const study = db.prepare('SELECT id FROM studies WHERE id = ? AND owner_id = ?')
    .get(studyId, req.user.id)
  if (!study) return res.status(400).json({ error: 'Study not found' })

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

// Update metadata
app.put('/api/papers/:id/meta', (req, res) => {
  const row = db.prepare(`
    SELECT p.meta
    FROM papers p
    JOIN studies s ON s.id = p.study_id
    WHERE p.id = ? AND s.owner_id = ?
  `).get(req.params.id, req.user.id)
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
      AND study_id IN (SELECT id FROM studies WHERE owner_id = ?)
  `).run(req.params.id, req.user.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Paper not found' })
  res.json({ ok: true })
})

if (process.env.NODE_ENV === 'production') {
  app.use((req, res) => {
    res.sendFile(join(__dirname, '..', 'dist', 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API server on http://localhost:${PORT}`))
