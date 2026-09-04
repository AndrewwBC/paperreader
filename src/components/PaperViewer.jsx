import { useEffect, useRef, useState, useCallback } from "react"
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist"
import styles from "./PaperViewer.module.css"

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href

GlobalWorkerOptions.standardFontDataUrl = new URL(
  "pdfjs-dist/standard_fonts/",
  import.meta.url
).href
GlobalWorkerOptions.cMapUrl = new URL("pdfjs-dist/cmaps/", import.meta.url).href
GlobalWorkerOptions.cMapPacked = true

const MIN_SCALE = 0.5
const MAX_SCALE = 3.0
const STEP = 0.25
const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"]
const HIGHLIGHT_LABELS = { yellow: "Amarelo", green: "Verde", blue: "Azul", pink: "Rosa" }

export function PaperViewer({
  blobUrl,
  fileName,
  highlights = [],
  onHighlightsChange,
  focusHighlightRequest,
}) {
  const containerRef = useRef(null)
  const scrollRef = useRef(null)
  const pdfRef = useRef(null)
  const scaleRef = useRef(1.5)
  const highlightsRef = useRef(highlights)
  const onHighlightsChangeRef = useRef(onHighlightsChange)
  const [scale, setScale] = useState(1.5)
  const [selectionCandidate, setSelectionCandidate] = useState(null)
  const [highlightColor, setHighlightColor] = useState("yellow")

  useEffect(() => {
    highlightsRef.current = highlights
  }, [highlights])

  useEffect(() => {
    onHighlightsChangeRef.current = onHighlightsChange
  }, [onHighlightsChange])

  useEffect(() => {
    if (focusHighlightRequest?.id == null) return

    const highlight = highlightsRef.current.find(item => item.id === focusHighlightRequest.id)
    const firstRect = highlight?.rects?.[0]
    const container = containerRef.current
    const scroll = scrollRef.current
    const page = container?.querySelector(`[data-page-number="${firstRect?.page}"]`)
    if (firstRect == null || page == null || scroll == null) return

    container.querySelectorAll(`.${styles.highlightMarkActive}`).forEach(mark => {
      mark.classList.remove(styles.highlightMarkActive)
    })
    container.querySelectorAll(`[data-highlight-id="${CSS.escape(String(highlight.id))}"]`).forEach(mark => {
      mark.classList.add(styles.highlightMarkActive)
    })

    const scrollBounds = scroll.getBoundingClientRect()
    const pageBounds = page.getBoundingClientRect()
    const target = scroll.scrollTop
      + pageBounds.top
      - scrollBounds.top
      + firstRect.y * pageBounds.height
      - scroll.clientHeight * 0.3

    scroll.scrollTo({
      top: Math.max(0, target),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [focusHighlightRequest])

  const removeHighlight = useCallback(id => {
    const next = highlightsRef.current.filter(highlight => highlight.id !== id)
    highlightsRef.current = next
    onHighlightsChangeRef.current?.(next)
  }, [])

  const renderHighlightOverlays = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    container.querySelectorAll(`.${styles.highlightLayer}`).forEach(layer => {
      layer.innerHTML = ""
    })

    container.querySelectorAll(`.${styles.highlightInkLayer}`).forEach(canvas => {
      canvas.remove()
    })

    for (const highlight of highlightsRef.current) {
      for (const rect of highlight.rects || []) {
        const page = container.querySelector(`[data-page-number="${rect.page}"]`)
        const layer = page?.querySelector(`.${styles.highlightLayer}`)
        if (!layer) continue

        const pageCanvas = page.querySelector(":scope > canvas")
        let inkCanvas = page.querySelector(`.${styles.highlightInkLayer}`)

        if (pageCanvas && !inkCanvas) {
          inkCanvas = document.createElement("canvas")
          inkCanvas.className = styles.highlightInkLayer
          inkCanvas.width = pageCanvas.width
          inkCanvas.height = pageCanvas.height
          inkCanvas.style.width = pageCanvas.style.width
          inkCanvas.style.height = pageCanvas.style.height
          page.appendChild(inkCanvas)
        }

        const mark = document.createElement("button")
        mark.type = "button"
        mark.className = styles.highlightMark
        mark.dataset.color = highlight.color || "yellow"
        mark.dataset.highlightId = highlight.id
        mark.style.left = `${rect.x * 100}%`
        mark.style.top = `${rect.y * 100}%`
        mark.style.width = `${rect.width * 100}%`
        mark.style.height = `${rect.height * 100}%`
        mark.title = "Remover marcação"
        mark.setAttribute("aria-label", `Remover marcação: ${highlight.text.slice(0, 80)}`)
        mark.addEventListener("click", event => {
          event.preventDefault()
          event.stopPropagation()
          removeHighlight(highlight.id)
        })
        layer.appendChild(mark)

        if (pageCanvas && inkCanvas) {
          const x = Math.max(0, Math.floor(rect.x * pageCanvas.width))
          const y = Math.max(0, Math.floor(rect.y * pageCanvas.height))
          const width = Math.min(pageCanvas.width - x, Math.ceil(rect.width * pageCanvas.width))
          const height = Math.min(pageCanvas.height - y, Math.ceil(rect.height * pageCanvas.height))

          if (width > 0 && height > 0) {
            inkCanvas.getContext("2d")?.drawImage(
              pageCanvas,
              x, y, width, height,
              x, y, width, height
            )
          }
        }
      }
    }
  }, [removeHighlight])

  const renderPages = useCallback(async (pdf, targetScale) => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ""
    const dpr = window.devicePixelRatio || 1

    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const viewport = page.getViewport({ scale: targetScale })
      const scaledVP = page.getViewport({ scale: targetScale * dpr })

      const pageDiv = document.createElement("div")
      pageDiv.className = styles.page
      pageDiv.dataset.pageNumber = String(n)
      pageDiv.style.setProperty("--total-scale-factor", String(targetScale))
      pageDiv.style.width = `${viewport.width}px`
      pageDiv.style.height = `${viewport.height}px`

      const canvas = document.createElement("canvas")
      canvas.width = scaledVP.width
      canvas.height = scaledVP.height
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const highlightDiv = document.createElement("div")
      highlightDiv.className = styles.highlightLayer


      const textDiv = document.createElement("div")
      textDiv.className = styles.textLayer

      pageDiv.appendChild(canvas)
      pageDiv.appendChild(highlightDiv)
      pageDiv.appendChild(textDiv)
      container.appendChild(pageDiv)

      await page.render({ canvasContext: canvas.getContext("2d"), viewport: scaledVP }).promise

      const textLayer = new TextLayer({
        textContentSource: await page.getTextContent(),
        container: textDiv,
        viewport,
      })
      await textLayer.render()
    }

    renderHighlightOverlays()
  }, [renderHighlightOverlays])

  useEffect(() => {
    if (!blobUrl) {
      pdfRef.current = null
      return
    }

    let cancelled = false
    getDocument({
      url: blobUrl,
      cMapUrl: new URL("pdfjs-dist/cmaps/", import.meta.url).href,
      cMapPacked: true,
    }).promise.then(pdf => {
      if (cancelled) return
      pdfRef.current = pdf
      renderPages(pdf, scaleRef.current)
    })

    return () => {
      cancelled = true
    }
  }, [blobUrl, renderPages])

  useEffect(() => {
    scaleRef.current = scale
    if (pdfRef.current) renderPages(pdfRef.current, scale)
  }, [scale, renderPages])

  useEffect(() => {
    renderHighlightOverlays()
  }, [highlights, renderHighlightOverlays])

  function captureSelection() {
    const selection = window.getSelection()
    const container = containerRef.current
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !container) {
      return
    }

    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      return
    }

    const text = selection.toString().replace(/\s+/g, " ").trim()
    if (!text) {
      return
    }

    const pages = Array.from(container.querySelectorAll("[data-page-number]")).map(page => ({
      page: Number(page.dataset.pageNumber),
      bounds: page.getBoundingClientRect(),
    }))

    function pageForRect(rect) {
      let bestPage = null
      let bestIntersection = 0

      for (const page of pages) {
        const left = Math.max(rect.left, page.bounds.left)
        const right = Math.min(rect.right, page.bounds.right)
        const top = Math.max(rect.top, page.bounds.top)
        const bottom = Math.min(rect.bottom, page.bounds.bottom)
        const intersection = Math.max(0, right - left) * Math.max(0, bottom - top)

        if (intersection > bestIntersection) {
          bestIntersection = intersection
          bestPage = page
        }
      }

      if (bestPage) return bestPage

      return pages.reduce((closest, page) => {
        const pageCenterX = page.bounds.left + page.bounds.width / 2
        const pageCenterY = page.bounds.top + page.bounds.height / 2
        const rectCenterX = rect.left + rect.width / 2
        const rectCenterY = rect.top + rect.height / 2
        const distance = Math.hypot(pageCenterX - rectCenterX, pageCenterY - rectCenterY)
        return !closest || distance < closest.distance
          ? { page, distance }
          : closest
      }, null)?.page
    }

    const rects = Array.from(range.getClientRects())
      .filter(rect => rect.width > 1 && rect.height > 1)
      .map(rect => {
        const page = pageForRect(rect)
        if (!page) return null

        const left = Math.max(0, Math.min(1, (rect.left - page.bounds.left) / page.bounds.width))
        const right = Math.max(left, Math.min(1, (rect.right - page.bounds.left) / page.bounds.width))
        const top = Math.max(0, Math.min(1, (rect.top - page.bounds.top) / page.bounds.height))
        const bottom = Math.max(top, Math.min(1, (rect.bottom - page.bounds.top) / page.bounds.height))

        return {
          page: page.page,
          x: left,
          y: top,
          width: Math.max(0.002, right - left),
          height: Math.max(0.002, bottom - top),
        }
      })
      .filter(Boolean)

    if (rects.length === 0) {
      return
    }

    const bounds = range.getBoundingClientRect()
    setSelectionCandidate({
      text,
      rects,
      left: Math.min(bounds.right, window.innerWidth - 150),
      top: Math.max(8, bounds.top - 42),
    })
  }

  function addHighlight() {
    if (!selectionCandidate) return

    const candidate = selectionCandidate
    setSelectionCandidate(null)
    window.getSelection()?.removeAllRanges()
    const next = [
      ...highlightsRef.current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text: candidate.text,
        color: highlightColor,
        comment: "",
        rects: candidate.rects,
        createdAt: new Date().toISOString(),
      },
    ]

    highlightsRef.current = next
    onHighlightsChangeRef.current?.(next)
    requestAnimationFrame(renderHighlightOverlays)
  }

  function zoom(delta) {
    setSelectionCandidate(null)
    setScale(current =>
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((current + delta) * 100) / 100))
    )
  }

  if (!blobUrl) {
    return (
      <div className={styles.loading}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Carregando...
      </div>
    )
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.toolbar}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span className={styles.toolbarName}>{fileName}</span>

        {highlights.length > 0 && (
          <span className={styles.highlightCount} title="Marcações neste paper">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-7.5 7.5L4.5 9.5 12 2z"/>
            </svg>
            {highlights.length}
          </span>
        )}

        <div className={styles.zoomControls}>
          <button className={styles.zoomBtn} onClick={() => zoom(-STEP)} disabled={scale <= MIN_SCALE} title="Diminuir zoom">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <span className={styles.zoomLevel}>{Math.round(scale * 100)}%</span>
          <button className={styles.zoomBtn} onClick={() => zoom(STEP)} disabled={scale >= MAX_SCALE} title="Aumentar zoom">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        <a href={blobUrl} download={fileName} className={styles.downloadBtn} title="Baixar PDF">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      </div>

      <div ref={scrollRef} className={styles.scroll} onScroll={() => setSelectionCandidate(null)}>
        <div
          ref={containerRef}
          className={styles.pagesContainer}
          onMouseUp={() => requestAnimationFrame(captureSelection)}
        />
      </div>

      {selectionCandidate && (
        <div
          className={styles.selectionMenu}
          onMouseDown={event => event.preventDefault()}
          style={{ left: selectionCandidate.left, top: selectionCandidate.top }}
        >
          <div className={styles.colorChoices} aria-label="Cor da marcação">
            {HIGHLIGHT_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className={`${styles.colorChoice} ${highlightColor === color ? styles.colorChoiceActive : ""}`}
                data-color={color}
                onClick={() => setHighlightColor(color)}
                title={HIGHLIGHT_LABELS[color]}
                aria-label={HIGHLIGHT_LABELS[color]}
              />
            ))}
          </div>
          <button onClick={addHighlight}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-7.5 7.5L4.5 9.5 12 2z"/>
            </svg>
            Marcar trecho
          </button>
        </div>
      )}
    </div>
  )
}
