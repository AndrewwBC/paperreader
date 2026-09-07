import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
let compressing = false

export function hasPdfHeader(buffer) {
  return /%PDF-\d\.\d/.test(buffer.subarray(0, 1024).toString('latin1'))
}

// One optimization at a time; other uploads keep their original bytes.
export async function compressPdf(buffer) {
  if (compressing) return null
  compressing = true
  let dir
  try {
    dir = await mkdtemp(join(tmpdir(), 'paperreader-pdf-'))
    const input = join(dir, 'input.pdf')
    const output = join(dir, 'output.pdf')
    await writeFile(input, buffer)
    await run('gs', [
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dPDFSETTINGS=/ebook',
      '-dDetectDuplicateImages=true', '-dPDFSTOPONERROR', '-dSAFER', '-dNOPAUSE', '-dQUIET', '-dBATCH',
      `-sOutputFile=${output}`, input,
    ], { timeout: 30000, maxBuffer: 1024 * 1024 })
    if ((await stat(output)).size >= buffer.length * 0.9) return null
    const out = await readFile(output)
    if (!hasPdfHeader(out) || !out.subarray(-1024).includes(Buffer.from('%%EOF')) || out.length >= buffer.length * 0.9) return null
    // Reject output Ghostscript cannot read completely.
    await run('gs', ['-sDEVICE=nullpage', '-dPDFSTOPONERROR', '-dSAFER', '-dNOPAUSE', '-dQUIET', '-dBATCH', output], {
      timeout: 15000, maxBuffer: 1024 * 1024,
    })
    return out
  } catch {
    return null
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
    compressing = false
  }
}
