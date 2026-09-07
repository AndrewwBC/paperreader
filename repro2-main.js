import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'

console.log('PATTERN: new URL(bare specifier, import.meta.url)')
window.onunhandledrejection = e => console.log('unhandledrejection:', e.reason?.message, e.reason?.stack?.split('\n').slice(0,3).join(' | '))
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
try {
  const res = await fetch('/test.pdf')
  const data = await res.arrayBuffer()
  const pdf = await getDocument({ data }).promise
  console.log('OK pages=' + pdf.numPages)
} catch (err) {
  console.log('FAIL:', err.message)
  console.log('stack:', err.stack?.split('\n').slice(0, 5).join(' | '))
}
console.log('DONE2')
