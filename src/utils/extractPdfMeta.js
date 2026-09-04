import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Given a PDF File, returns { title, year } extracted from the first page.
 * Uses font-size heuristics: the title is typically the text block with the
 * largest font on page 1; the year is a 4-digit number in [1990..2030].
 */
export async function extractPdfMeta(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    // First try the PDF document info
    const info = await pdf.getMetadata().catch(() => null)
    const docTitle = info?.info?.Title?.trim()

    const page = await pdf.getPage(1)
    const content = await page.getTextContent()

    // Group items by their rounded Y position (line)
    const lineMap = new Map()
    for (const item of content.items) {
      if (!item.str?.trim()) continue
      const y = Math.round(item.transform[5])
      const fontSize = Math.abs(item.transform[3]) || item.height || 0
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y).push({ text: item.str, fontSize, x: item.transform[4] })
    }

    // Sort lines top-to-bottom (higher Y = higher on page in PDF coords)
    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0]) // descending Y = top first
      .map(([y, items]) => {
        items.sort((a, b) => a.x - b.x)
        return {
          y,
          text: items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim(),
          fontSize: Math.max(...items.map(i => i.fontSize)),
        }
      })
      .filter(l => l.text.length > 1)

    // --- Title extraction ---
    let title = ''

    if (docTitle && docTitle.length > 4 && !/untitled/i.test(docTitle)) {
      title = docTitle
    } else {
      // Find the line(s) with the largest font size in the top 40% of lines
      const topLines = lines.slice(0, Math.max(10, Math.ceil(lines.length * 0.4)))
      const maxFont = Math.max(...topLines.map(l => l.fontSize))

      if (maxFont > 0) {
        // Collect consecutive lines that share the max (or near-max) font
        const threshold = maxFont * 0.85
        const titleLines = []
        for (const line of topLines) {
          if (line.fontSize >= threshold && line.text.length > 3) {
            titleLines.push(line.text)
          } else if (titleLines.length > 0) {
            break
          }
        }
        title = titleLines.join(' ').trim()
      }

      // Fallback: first long-enough line
      if (!title) {
        title = lines.find(l => l.text.length > 10)?.text || ''
      }
    }

    // Clean up the title
    title = title
      .replace(/\s+/g, ' ')
      .replace(/[*†‡§¶]/g, '')
      .trim()

    // --- Year extraction ---
    // Collect all text from first 2 pages
    const allText = [content]
    if (pdf.numPages >= 2) {
      const page2 = await pdf.getPage(2)
      allText.push(await page2.getTextContent())
    }
    const fullText = allText
      .flatMap(c => c.items.map(i => i.str))
      .join(' ')

    const yearMatches = [...fullText.matchAll(/\b(19[9]\d|20[0-3]\d)\b/g)]
    let year = ''
    if (yearMatches.length > 0) {
      // Prefer years after 2000; take the most frequent or last reasonable match
      const counts = {}
      for (const [, y] of yearMatches) counts[y] = (counts[y] || 0) + 1
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
      year = sorted[0]?.[0] || ''
    }

    return { title, year }
  } catch (err) {
    console.warn('PDF meta extraction failed:', err)
    return { title: '', year: '' }
  }
}
