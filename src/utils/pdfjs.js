import { getDocument as loadDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export { TextLayer } from 'pdfjs-dist'

export function getDocument(options) {
  const base = import.meta.env.BASE_URL
  return loadDocument({
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    ...options,
  })
}
