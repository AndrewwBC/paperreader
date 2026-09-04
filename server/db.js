import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '../data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(process.env.PAPER_VAULT_DB || join(dataDir, 'papers.db'))

db.exec('PRAGMA foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS studies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    owner_id TEXT,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    study_id TEXT,
    file_name TEXT NOT NULL,
    added_at TEXT NOT NULL,
    pdf_data BLOB NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (study_id) REFERENCES studies(id) ON DELETE SET NULL
  )
`)

const studyColumns = db.prepare('PRAGMA table_info(studies)').all()
if (!studyColumns.some(col => col.name === 'owner_id')) {
  db.exec('ALTER TABLE studies ADD COLUMN owner_id TEXT')
}
db.exec('CREATE INDEX IF NOT EXISTS studies_owner_id_idx ON studies(owner_id)')

const paperColumns = db.prepare('PRAGMA table_info(papers)').all()
if (!paperColumns.some(col => col.name === 'study_id')) {
  db.exec('ALTER TABLE papers ADD COLUMN study_id TEXT')
}

const legacyPaperCount = db.prepare(`
  SELECT COUNT(*) AS count
  FROM papers
  WHERE study_id IS NULL OR study_id = '' OR study_id = 'default-study'
`).get().count

if (legacyPaperCount > 0) {
  let annotationStudy = db.prepare('SELECT id FROM studies WHERE LOWER(name) = ?').get('annotation')
  if (!annotationStudy) {
    annotationStudy = { id: 'annotation-study' }
    db.prepare('INSERT INTO studies (id, name, created_at) VALUES (?, ?, ?)')
      .run(annotationStudy.id, 'Annotation', new Date().toISOString())
  }

  db.prepare(`
    UPDATE papers
    SET study_id = ?
    WHERE study_id IS NULL OR study_id = '' OR study_id = 'default-study'
  `).run(annotationStudy.id)
}

db.prepare('DELETE FROM studies WHERE id = ?').run('default-study')

function shortenedPaperName(metaText, currentName) {
  try {
    const title = JSON.parse(metaText)?.title?.trim()
    if (!title) return currentName
    const base = title.split(/\s+/).filter(Boolean).slice(0, 5).join(" ")
      .replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim()
    return base ? `${base}.pdf` : currentName
  } catch {
    return currentName
  }
}

const namedPapers = db.prepare("SELECT id, file_name, meta FROM papers").all()
const updatePaperName = db.prepare("UPDATE papers SET file_name = ? WHERE id = ?")
for (const paper of namedPapers) {
  const fileName = shortenedPaperName(paper.meta, paper.file_name)
  if (fileName !== paper.file_name) updatePaperName.run(fileName, paper.id)
}

export default db
