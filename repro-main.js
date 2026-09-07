import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

console.log('workerSrc:', workerUrl)
window.onerror = (m, s, l) => console.log('window.onerror:', m, '@', s, l)
window.onunhandledrejection = e => console.log('unhandledrejection:', e.reason?.message, e.reason?.stack?.split('\n')[1])

try {
  GlobalWorkerOptions.workerSrc = workerUrl
  for (const name of ['9706153v2.pdf','Fenmenos _de_ordenao.pdf','Sakthivadivel.pdf','kurata1995.pdf','magic_moments.pdf']) {
    try {
      const res = await fetch('/' + encodeURIComponent(name))
      const data = await res.arrayBuffer()
      console.log('fetched', name, data.byteLength)
      const pdf = await getDocument({ data }).promise
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1 })
      const tc = await page.getTextContent()
      console.log(`OK ${name}: pages=${pdf.numPages} size=${Math.round(viewport.width)}x${Math.round(viewport.height)} textItems=${tc.items.length}`)
    } catch (err) {
      console.log(`FAIL ${name}: ${err.message}`)
      console.log('stack:', err.stack?.split('\n').slice(0, 5).join(' | '))
    }
  }
  console.log('DONE')
} catch (err) {
  console.log('FATAL:', err.message, err.stack?.split('\n').slice(0, 5).join(' | '))
}
