import { randomUUID, createHash } from 'node:crypto'
import db from './db.js'
import { hasPdfHeader } from './pdf.js'

const checksum = bytes => createHash('sha256').update(bytes).digest('hex')

export function installBackupRoutes(app) {
  app.get('/api/backup', (req, res) => {
    const studies = db.prepare('SELECT id, name, created_at FROM studies WHERE owner_id = ?').all(req.user.id)
    const papers = db.prepare(`SELECT p.* FROM papers p JOIN studies s ON s.id = p.study_id WHERE s.owner_id = ?`).all(req.user.id)
    const backup = {
      format: 'paper-vault', version: 1, exportedAt: new Date().toISOString(),
      studies: studies.map(s => ({ id: s.id, name: s.name, createdAt: s.created_at })),
      papers: papers.map(p => ({ id: p.id, studyId: p.study_id, fileName: p.file_name, addedAt: p.added_at, meta: JSON.parse(p.meta), pdf: Buffer.from(p.pdf_data).toString('base64'), sha256: checksum(p.pdf_data) })),
    }
    res.set('Cache-Control', 'no-store')
    res.attachment(`paper-vault-${backup.exportedAt.slice(0, 10)}.json`).json(backup)
  })

  app.post('/api/backup/restore', (req, res) => {
    const b = req.body
    const validText = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
    const validDate = s => typeof s === 'string' && Number.isFinite(Date.parse(s))
    try {
      if (b?.format !== 'paper-vault' || b.version !== 1 || !Array.isArray(b.studies) || !Array.isArray(b.papers)) throw Error()
      const ids = new Set()
      for (const s of b.studies) {
        if (!validText(s.id, 200) || ids.has(s.id) || !validText(s.name, 80) || !validDate(s.createdAt)) throw Error()
        ids.add(s.id)
      }
      const paperIds = new Set()
      for (const p of b.papers) {
        if (!validText(p.id, 200) || paperIds.has(p.id) || !ids.has(p.studyId) || !validText(p.fileName, 255) || !validDate(p.addedAt) || !p.meta || typeof p.meta !== 'object' || Array.isArray(p.meta) || typeof p.pdf !== 'string') throw Error()
        paperIds.add(p.id)
        const bytes = Buffer.from(p.pdf, 'base64')
        if (bytes.length > 20 * 1024 * 1024 || bytes.toString('base64') !== p.pdf || !hasPdfHeader(bytes) || checksum(bytes) !== p.sha256) throw Error()
      }
    } catch {
      return res.status(400).json({ error: 'Backup inválido ou corrompido. Nenhum dado foi alterado.' })
    }
    db.exec('BEGIN')
    try {
      const ids = new Map()
      for (const s of b.studies) {
        const id = randomUUID()
        ids.set(s.id, id)
        db.prepare('INSERT INTO studies (id, name, created_at, owner_id) VALUES (?, ?, ?, ?)').run(id, s.name, s.createdAt, req.user.id)
      }
      for (const p of b.papers) {
        db.prepare('INSERT INTO papers (id, study_id, file_name, added_at, pdf_data, meta) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), ids.get(p.studyId), p.fileName, p.addedAt, Buffer.from(p.pdf, 'base64'), JSON.stringify(p.meta))
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    res.json({ ok: true, studies: b.studies.length, papers: b.papers.length })
  })
}
