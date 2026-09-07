import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { compressPdf } from '../server/pdf.js'

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

test('PDF upload, delivery, compression and production browser rendering', { timeout: 180000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pdf-regression-'))
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '3197', PAPER_VAULT_DB: join(dir, 'test.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  server.stderr.on('data', chunk => { logs += chunk })
  t.after(async () => { server.kill(); if (server.exitCode === null && server.signalCode === null) await once(server, 'exit'); await rm(dir, { recursive: true, force: true }) })
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error(logs) })])
  const base = 'http://127.0.0.1:3197'
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
  assert.equal((await upload(Buffer.from('not a PDF'), 'bad.pdf')).status, 400)
  assert.equal((await upload(fixture(), 'bad.pdf', '{')).status, 400)
  assert.equal((await upload(Buffer.alloc(21 * 1024 * 1024), 'large.pdf')).status, 413)
  assert.equal(await compressPdf(Buffer.from('invalid')), null)
  const inputs = [['Unicode 日本語 “teste”.pdf', fixture()], ['Compressible.pdf', fixture(4 * 1024 * 1024)]]
  for (const name of await readdir('pdfs_errors_producao').catch(() => [])) {
    if (name.endsWith('.pdf')) inputs.push([name, await readFile(join('pdfs_errors_producao', name))])
  }
  const papers = []
  for (const [name, bytes] of inputs) {
    const pending = upload(bytes, name, JSON.stringify({ title: name, datasets: [], tags: [], metrics: [], links: [], highlights: [] }))
    const before = Date.now()
    assert.equal((await request('/api/studies')).status, 200)
    assert.ok(Date.now() - before < 2000, 'API remains responsive during compression')
    const response = await pending
    assert.equal(response.status, 200, await response.clone().text())
    const paper = await response.json()
    papers.push(paper)
    assert.equal(paper.fileName, name)
    if (name === 'Compressible.pdf') assert.equal(paper.meta.compressed, true)
    const url = `/api/papers/${paper.id}/pdf`
    const downloaded = await request(url)
    assert.equal(downloaded.status, 200)
    assert.match(downloaded.headers.get('content-type'), /application\/pdf/)
    const data = Buffer.from(await downloaded.arrayBuffer())
    if (!paper.meta.compressed) assert.deepEqual(data, bytes)
    else assert.ok(data.length < bytes.length * 0.9)
    for (const [range, start, end] of [['bytes=0-99', 0, 99], ['bytes=-100', data.length - 100, data.length - 1], [`bytes=${data.length - 100}-99999999`, data.length - 100, data.length - 1]]) {
      const part = await request(url, { headers: { Range: range } })
      assert.equal(part.status, 206)
      assert.deepEqual(Buffer.from(await part.arrayBuffer()), data.subarray(start, end + 1))
    }
    assert.equal((await request(url, { headers: { Range: `bytes=${data.length}-` } })).status, 416)
    assert.equal((await request(url, { headers: { Range: 'garbage' } })).status, 200)
    assert.equal((await request(url, { headers: { Range: 'items=99999999-' } })).status, 200)
    assert.equal((await request(url, { headers: { Range: 'bytes=99999999-', 'If-Range': '"stale"' } })).status, 200)
    assert.equal((await request(url, { headers: { 'If-None-Match': downloaded.headers.get('etag') } })).status, 304)
    t.diagnostic(`${name}: ${bytes.length} -> ${data.length} bytes`)
  }
  if (!process.env.PDF_BROWSER_TEST) return
  for (const asset of ['standard_fonts/LiberationSans-Regular.ttf', 'cmaps/Adobe-Japan1-UCS2.bcmap', 'wasm/openjpeg.wasm']) {
    const response = await request(`/${asset}`)
    assert.equal(response.status, 200)
    assert.ok(!response.headers.get('content-type')?.includes('text/html'), `${asset} must not return the SPA fallback`)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(join('node_modules/pdfjs-dist', asset)))
  }
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
    if (message.method === 'Network.loadingFailed') logs += JSON.stringify(message.params)
    if (message.method === 'Runtime.exceptionThrown') logs += JSON.stringify(message.params)
  })
  await send('Network.enable')
  const [cookieName, cookieValue] = cookie.split('=')
  await send('Network.setCookie', { name: cookieName, value: cookieValue, url: base })
  await send('Page.navigate', { url: base })
  await waitFor(`document.querySelector('button[title="Minha conta"]') || Array.from(document.querySelectorAll('button')).some(el => el.textContent.includes('PDF Test'))`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('PDF Test')).click()`)
  await waitFor(`document.querySelector('dialog[open]')`)
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(el => el.textContent === 'Backup').click()`)
  await waitFor(`document.body.innerText.includes('Baixar backup completo')`)
  const downloadPath = join(dir, 'downloads')
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath, eventsEnabled: true })
  await evaluate(`document.querySelector('dialog a[download]').click()`)
  let downloadedBackup
  for (let attempt = 0; attempt < 100; attempt++) {
    const files = await readdir(downloadPath).catch(() => [])
    const name = files.find(name => name.endsWith('.json'))
    if (name) { downloadedBackup = JSON.parse(await readFile(join(downloadPath, name), 'utf8')); break }
    await pause(100)
  }
  assert.ok(downloadedBackup, 'Backup was actually saved by Chrome from inside the modal: ' + await evaluate('document.body.innerText') + logs)
  assert.equal(downloadedBackup.papers.length, papers.length)
  assert.ok(downloadedBackup.papers.every(paper => paper.pdf && paper.sha256))
  t.diagnostic('Browser saved a downloadable backup containing all PDFs')
  const backupFile = (await readdir(downloadPath)).find(name => name.endsWith('.json'))
  const { root: backupRoot } = await send('DOM.getDocument')
  const { nodeId: backupInput } = await send('DOM.querySelector', { nodeId: backupRoot.nodeId, selector: 'dialog input[type="file"]' })
  await send('DOM.setFileInputFiles', { nodeId: backupInput, files: [join(downloadPath, backupFile)] })
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(el => el.textContent === 'Restaurar como novos estudos').click()`)
  await waitFor(`document.body.innerText.includes('PDFs restaurados')`)
  const restoredStudies = await (await request('/api/studies')).json()
  assert.equal(restoredStudies.length, 2)
  for (const copy of restoredStudies.filter(s => s.id !== study.id)) {
    assert.equal((await request('/api/studies/' + copy.id, { method: 'DELETE' })).status, 200)
  }
  t.diagnostic('Browser restored the downloaded backup without overwriting its source')
  for (const width of [390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
    assert.ok(await evaluate(`document.querySelector('dialog').getBoundingClientRect().right <= window.innerWidth`), 'Account fits viewport')
    await pause(250)
    const screenshot = await send('Page.captureScreenshot')
    await writeFile(`/tmp/paper-vault-backup-${width}.png`, Buffer.from(screenshot.data, 'base64'))
  }
  await evaluate(`document.querySelector('button[aria-label="Fechar"]').click()`)
  await send('Network.clearBrowserCookies')
  await send('Page.navigate', { url: base })
  await waitFor(`document.body.innerText.includes('Esqueci minha senha')`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Esqueci minha senha').click()`)
  await waitFor(`document.querySelector('#recovery-title')`)
  assert.equal(await evaluate(`document.querySelector('#recovery-title').textContent`), 'Recupere seu acesso')
  await send('Page.navigate', { url: base + '/#reset=invalid-test-token' })
  await send('Page.reload')
  await waitFor(`document.body.innerText.includes('Crie uma nova senha')`)
  await send('Network.setCookie', { name: cookieName, value: cookieValue, url: base })
  t.diagnostic('Account backup fits mobile and desktop; recovery and reset screens open')
  for (const paper of papers) {
    await send('Page.navigate', { url: base })
    await waitFor(`Array.from(document.querySelectorAll('h2')).some(el => el.textContent === 'PDF Regression')`)
    await evaluate(`Array.from(document.querySelectorAll('h2')).find(el => el.textContent === 'PDF Regression').closest('article').click()`)
    await waitFor(`document.querySelector('h2[title=' + CSS.escape(${JSON.stringify(paper.fileName)}) + ']')`)
    await evaluate(`document.querySelector('h2[title=' + CSS.escape(${JSON.stringify(paper.fileName)}) + ']').closest('article').click()`)
    await waitFor(`document.querySelector('[data-page-number="1"][data-rendered-scale="1.5"] > canvas') !== null`)
    assert.equal(await evaluate(`document.querySelector('[role="alert"]')?.textContent || ''`), '')
    assert.ok(await evaluate(`(() => { const c = document.querySelector('[data-page-number="1"] > canvas'); const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return data.some((v, i) => i % 4 !== 3 && v < 200) })()`), 'Canvas contains visible content')
    await evaluate(`document.querySelector('button[title="Aumentar zoom"]').click()`)
    await waitFor(`document.querySelector('[data-page-number="1"][data-rendered-scale="1.75"] > canvas') !== null`)
    await evaluate(`document.querySelector('[data-page-number]:last-child').scrollIntoView()`)
    await waitFor(`document.querySelector('[data-page-number]:last-child').dataset.renderedScale === '1.75'`)
    t.diagnostic(`Browser rendered, zoomed and reached last page: ${paper.fileName}`)
  }
  const browserFile = join(dir, 'browser-upload.pdf')
  await writeFile(browserFile, fixture())
  await evaluate(`document.querySelector('button[title="Adicionar PDFs"]').click()`)
  await waitFor(`document.querySelector('input[type="file"]') !== null`)
  const { root } = await send('DOM.getDocument')
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type="file"]' })
  await send('DOM.setFileInputFiles', { nodeId, files: [browserFile] })
  await waitFor(`document.body.innerText.includes('1 paper adicionado')`)
  const stored = await (await request('/api/papers')).json()
  assert.equal(stored.length, papers.length + 1)
  t.diagnostic('Browser file upload and metadata extraction completed')
})
