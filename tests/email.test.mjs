import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'

test('Email confirmation: delivery, authenticated resend, expiry and email changes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'vault-email-'))
  const database = join(dir, 'test.db')
  const mail = join(dir, 'mail')
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, NODE_ENV: 'development', PORT: '3199', PAPER_VAULT_DB: database, PAPER_VAULT_MAIL_DIR: mail, APP_URL: 'http://localhost:5173' }, stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit')
      server.kill()
      await exited
    }
    await rm(dir, { recursive: true, force: true })
  })
  await once(server.stdout, 'data')
  const request = (path, body, cookie = '', method = 'POST') => fetch('http://127.0.0.1:3199/api' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const account = { name: 'Email Reader', email: 'verify@example.test', password: 'original-password' }
  const register = await request('/auth/register', account)
  assert.equal(register.status, 201)
  let cookie = register.headers.get('set-cookie').split(';')[0]
  const registered = await register.json()
  assert.equal(registered.user.emailVerified, false)
  assert.equal(registered.token, undefined)
  const db = new DatabaseSync(database)
  t.after(() => db.close())
  const messages = async count => {
    for (let i = 0; i < 100; i++) {
      const files = await readdir(mail).catch(() => [])
      const contents = await Promise.all(files.map(file => readFile(join(mail, file), 'utf8')))
      const matches = contents.filter(text => /#verify=([\w-]+)/.test(text))
      if (matches.length === count) return matches.map(text => ({ text, token: text.match(/#verify=([\w-]+)/)[1] }))
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw Error(`Expected ${count} confirmation messages`)
  }
  const verify = token => request('/auth/verify-email', { token })
  const me = async () => (await (await request('/auth/me', undefined, cookie, 'GET')).json()).user
  const [first] = await messages(1)
  assert.match(first.text, /verify@example\.test/)
  assert.match(first.text, /http:\/\/127\.0\.0\.1:3199\/#verify=/)
  const stored = db.prepare('SELECT * FROM email_verification_tokens WHERE token_hash = ?').get(createHash('sha256').update(first.token).digest('hex'))
  assert.ok(stored)
  assert.ok(Date.parse(stored.expires_at) - Date.parse(stored.created_at) <= 24 * 60 * 60 * 1000 + 1000)
  assert.ok(Date.parse(stored.expires_at) - Date.now() > 23 * 60 * 60 * 1000)
  assert.equal((await request('/auth/resend-verification', {})).status, 401)
  assert.equal((await verify('invalid-token')).status, 400)
  assert.equal((await request('/auth/resend-verification', {}, cookie)).status, 200)
  const second = (await messages(2)).find(message => message.token !== first.token)
  assert.equal((await verify(first.token)).status, 400)
  assert.equal((await verify(second.token)).status, 200)
  assert.equal((await verify(second.token)).status, 400)
  assert.equal((await me()).emailVerified, true)
  assert.equal((await request('/auth/resend-verification', {}, cookie)).status, 200)
  const changeEmail = async email => {
    const previousCookie = cookie
    const response = await request('/auth/me', { name: account.name, email, currentPassword: account.password }, cookie, 'PUT')
    if (response.ok) {
      cookie = response.headers.get('set-cookie').split(';')[0]
      assert.equal((await request('/auth/me', undefined, previousCookie, 'GET')).status, 401)
    }
    return response
  }
  const changed = await changeEmail('changed@example.test')
  assert.equal(changed.status, 200)
  assert.equal((await changed.json()).user.emailVerified, false)
  const third = (await messages(3)).find(message => ![first.token, second.token].includes(message.token))
  assert.match(third.text, /changed@example\.test/)
  assert.equal((await changeEmail('final@example.test')).status, 200)
  const fourth = (await messages(4)).find(message => ![first.token, second.token, third.token].includes(message.token))
  assert.match(fourth.text, /final@example\.test/)
  assert.equal((await verify(third.token)).status, 400)
  db.prepare('UPDATE email_verification_tokens SET expires_at = ? WHERE token_hash = ?').run('2000-01-01T00:00:00Z', createHash('sha256').update(fourth.token).digest('hex'))
  assert.equal((await verify(fourth.token)).status, 400)
  assert.equal((await me()).emailVerified, false)
  assert.equal((await request('/auth/resend-verification', {}, cookie)).status, 200)
  const fifth = (await messages(5)).find(message => ![first.token, second.token, third.token, fourth.token].includes(message.token))
  assert.equal((await verify(fifth.token)).status, 200)
  assert.equal((await me()).emailVerified, true)
})
