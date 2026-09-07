import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'

test('Recovery links, session revocation and isolated backup round trip', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'vault-account-'))
  const database = join(dir, 'test.db')
  const mail = join(dir, 'mail')
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'development', PORT: '3198', PAPER_VAULT_DB: database, PAPER_VAULT_MAIL_DIR: mail }, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(async () => { server.kill(); await once(server, 'exit'); await rm(dir, { recursive: true, force: true }) })
  await once(server.stdout, 'data')
  const request = (path, body, cookie = '', method = 'POST') => fetch('http://127.0.0.1:3198/api' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const account = { name: 'Test Reader', email: 'reader@example.test', password: 'original-password' }
  const register = await request('/auth/register', account)
  const cookie = register.headers.get('set-cookie').split(';')[0]
  const user = (await register.json()).user
  assert.equal((await request('/backup', undefined, '', 'GET')).status, 401)
  const db = new DatabaseSync(database)
  t.after(() => db.close())
  const bytes = Buffer.from('%PDF-1.4\nTest fixture\n%%EOF')
  db.prepare('INSERT INTO studies VALUES (?, ?, ?, ?)').run('study-a', 'Pesquisa', new Date().toISOString(), user.id)
  db.prepare('INSERT INTO papers VALUES (?, ?, ?, ?, ?, ?)').run('paper-a', 'study-a', 'Paper.pdf', new Date().toISOString(), bytes, JSON.stringify({ highlights: [{ text: 'Anotação' }] }))
  const response = await request('/backup', undefined, cookie, 'GET')
  assert.match(response.headers.get('content-disposition'), /attachment/)
  const backup = await response.json()
  assert.equal(backup.papers.length, 1)
  assert.equal(Buffer.from(backup.papers[0].pdf, 'base64').compare(bytes), 0)
  assert.ok(!JSON.stringify(backup).includes('password'))
  const other = await request('/auth/register', { ...account, email: 'other@example.test' })
  const otherCookie = other.headers.get('set-cookie').split(';')[0]
  assert.equal((await (await request('/backup', undefined, otherCookie, 'GET')).json()).papers.length, 0)
  assert.equal((await request('/backup/restore', backup, otherCookie)).status, 200)
  const restored = await (await request('/backup', undefined, otherCookie, 'GET')).json()
  assert.deepEqual(restored.papers[0].meta, backup.papers[0].meta)
  assert.notEqual(restored.studies[0].id, backup.studies[0].id)
  assert.equal(restored.papers[0].pdf, backup.papers[0].pdf)
  backup.papers[0].sha256 = 'corrupt'
  assert.equal((await request('/backup/restore', backup, otherCookie)).status, 400)
  assert.equal((await (await request('/backup', undefined, otherCookie, 'GET')).json()).studies.length, 1)
  const unknown = await (await request('/auth/forgot-password', { email: 'missing@example.test' })).json()
  const known = await (await request('/auth/forgot-password', { email: account.email })).json()
  assert.deepEqual(known, unknown)
  assert.equal(known.token, undefined)
  const getToken = async count => {
    for (let i = 0; i < 100; i++) {
      const files = await readdir(mail).catch(() => [])
      if (files.length >= count) {
        const texts = await Promise.all(files.map(f => readFile(join(mail, f), 'utf8')))
        const tokens = texts.flatMap(text => { const match = text.match(/#reset=([\w-]+)/); return match ? [match[1]] : [] })
        if (tokens.length === count) return tokens
      }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw Error('No recovery message')
  }
  const [first] = await getToken(1)
  await request('/auth/forgot-password', { email: account.email })
  const second = (await getToken(2)).find(token => token !== first)
  const reset = token => request('/auth/reset-password', { token, password: 'replacement-password', confirmPassword: 'replacement-password' })
  assert.equal((await reset(first)).status, 400)
  assert.equal((await reset(second)).status, 200)
  assert.equal((await reset(second)).status, 400)
  assert.equal((await request('/auth/me', undefined, cookie, 'GET')).status, 401)
  assert.equal((await request('/auth/login', account)).status, 401)
  assert.equal((await request('/auth/login', { ...account, password: 'replacement-password' })).status, 200)
  await request('/auth/forgot-password', { email: account.email })
  const third = (await getToken(3)).find(token => ![first, second].includes(token))
  db.prepare('UPDATE password_reset_tokens SET expires_at = ? WHERE token_hash = ?').run('2000-01-01T00:00:00Z', createHash('sha256').update(third).digest('hex'))
  assert.equal((await reset(third)).status, 400)
})
