import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

// Valid one-page fixture, without redistributing the production documents.
function fixture(padding = 0) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
    '<< /Length 19 >>\nstream\n10 10 100 100 re f\nendstream']
  let text = '%PDF-1.4\n' + (padding ? '%' + ' '.repeat(padding) + '\n' : '')
  const offsets = [0]
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(text))
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`
  }
  const xref = Buffer.byteLength(text)
  text += 'xref\n0 5\n0000000000 65535 f \n'
  text += offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')
  return Buffer.from(text + `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

test('persistent paper and annotation browser navigation', { skip: !process.env.NAVIGATION_BROWSER_TEST, timeout: 60000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pdf-regression-'))
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '3198', PAPER_VAULT_DB: join(dir, 'test.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  server.stderr.on('data', chunk => { logs += chunk })
  t.after(async () => { server.kill(); if (server.exitCode === null && server.signalCode === null) await once(server, 'exit'); await rm(dir, { recursive: true, force: true }) })
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error(logs) })])
  const base = 'http://127.0.0.1:3198'
  let cookie = ''
  const request = (path, options = {}) => fetch(base + path, { ...options, headers: { Cookie: cookie, ...options.headers } })
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const register = await request('/api/auth/register', json({ name: 'PDF Test', email: 'pdf@example.test', password: 'test-pdf-password' }))
  assert.equal(register.status, 201)
  cookie = register.headers.get('set-cookie').split(';')[0]
  const study = await (await request('/api/studies', json({ name: 'PDF Regression' }))).json()
  const upload = (bytes, name, meta = '{}') => {
    const body = new FormData()
    body.append('pdf', new Blob([bytes], { type: 'application/pdf' }), name)
    body.append('studyId', study.id)
    body.append('meta', meta)
    return request('/api/papers', { method: 'POST', body })
  }
  const metadata = { title: 'Navigation test', datasets: [], tags: [], metrics: [], links: [], highlights: [
    { id: 17042, text: 'First annotation', comment: 'First note', color: 'yellow', rects: [{ page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.1 }] },
    { id: 17043, text: 'Second annotation', comment: 'Second note', color: 'green', rects: [{ page: 1, x: 0.1, y: 0.5, width: 0.2, height: 0.1 }] },
  ] }
  const paper = await (await upload(fixture(), 'Navigation.pdf', JSON.stringify(metadata))).json()
  const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${join(dir, 'chrome')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  t.after(async () => { chrome.kill(); if (chrome.exitCode === null && chrome.signalCode === null) await once(chrome, 'exit') })
  let port
  for (let i = 0; i < 100; i++) {
    port = await readFile(join(dir, 'chrome', 'DevToolsActivePort'), 'utf8').catch(() => '')
    if (port) break
    await pause(100)
  }
  assert.ok(port, 'Chrome started')
  const targets = await (await fetch(`http://127.0.0.1:${port.split('\n')[0]}/json`)).json()
  const ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await once(ws, 'open')
  t.after(() => ws.close())
  let id = 0
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id
    const handler = event => {
      const message = JSON.parse(event.data)
      if (message.id === mid) { ws.removeEventListener('message', handler); if (message.error) reject(message.error); else resolve(message.result) }
    }
    ws.addEventListener('message', handler)
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async expression => {
    for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100) }
    assert.fail(`Browser timeout: ${expression}; ${await evaluate('document.body.innerText')}; ${logs}`)
  }
  await send('Runtime.enable')
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') logs += JSON.stringify(message.params)
  })
  await send('Network.enable')
  const [cookieName, cookieValue] = cookie.split('=')
  await send('Network.setCookie', { name: cookieName, value: cookieValue, url: base })
  const url = `${base}/?study=${study.id}&paper=${paper.id}&annotation=17043`
  await send('Page.navigate', { url })
  await waitFor(`document.body.innerText.includes('Second annotation') && document.querySelector('[data-highlight-id="17043"]')`)
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('annotation')`), '17043')
  await send('Page.reload')
  await waitFor(`document.body.innerText.includes('Second annotation') && document.querySelector('[data-page-number="1"] > canvas')`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.title === 'Trecho anterior' || el.getAttribute('aria-label') === 'Trecho anterior').click()`)
  await waitFor(`new URLSearchParams(location.search).get('annotation') === '17042' && document.body.innerText.includes('First annotation')`)
  await evaluate('history.back()')
  await waitFor(`new URLSearchParams(location.search).get('annotation') === '17043' && document.body.innerText.includes('Second annotation')`)
  await evaluate('history.forward()')
  await waitFor(`new URLSearchParams(location.search).get('annotation') === '17042' && document.body.innerText.includes('First annotation')`)
  await send('Page.navigate', { url: `${base}/?paper=${paper.id}&tab=form` })
  await waitFor(`document.body.innerText.includes('Dados') && document.querySelector('[data-page-number="1"] > canvas')`)
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('paper')`), paper.id)
  await send('Page.navigate', { url: base + '/?study=missing&paper=missing' })
  await waitFor(`document.body.innerText.includes('Paper indisponível')`)
  assert.equal(await evaluate('location.search'), '?study=missing&paper=missing')
  t.diagnostic('Deep links, reload, annotation back/forward, paper-only links and unavailable resources verified')
})
