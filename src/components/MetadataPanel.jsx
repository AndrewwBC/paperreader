import { useState } from 'react'
import styles from './MetadataPanel.module.css'

const TASKS = ['', 'ABSA', 'SSA', 'DA']
const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink']
const HIGHLIGHT_LABELS = { yellow: 'Amarelo', green: 'Verde', blue: 'Azul', pink: 'Rosa' }

function TagInput({ value, onChange, placeholder, colorClass }) {
  const [input, setInput] = useState('')

  function add() {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
  }

  return (
    <div className={styles.tagInput}>
      <div className={styles.tags}>
        {value.map((tag, i) => (
          <span key={i} className={`${styles.tag} ${colorClass ? styles[colorClass] : ''}`}>
            {typeof tag === 'string' ? tag : tag?.name ?? JSON.stringify(tag)}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
        }}
        placeholder={value.length === 0 ? placeholder : 'Add more...'}
      />
    </div>
  )
}

function MetricRow({ metric, onUpdate, onDelete }) {
  return (
    <div className={styles.metricRow}>
      <input
        className={styles.metricName}
        value={metric.name}
        onChange={e => onUpdate({ ...metric, name: e.target.value })}
        placeholder="Metric (e.g. F1)"
      />
      <input
        className={styles.metricVal}
        value={metric.value}
        onChange={e => onUpdate({ ...metric, value: e.target.value })}
        placeholder="Value"
      />
      <input
        className={styles.metricDataset}
        value={metric.dataset || ''}
        onChange={e => onUpdate({ ...metric, dataset: e.target.value })}
        placeholder="Dataset"
      />
      <button className={styles.metricDelete} onClick={onDelete}>×</button>
    </div>
  )
}

function LinkRow({ link, onUpdate, onDelete }) {
  return (
    <div className={styles.linkRow}>
      <select
        value={link.type}
        onChange={e => onUpdate({ ...link, type: e.target.value })}
      >
        <option value="arxiv">arXiv</option>
        <option value="github">GitHub</option>
        <option value="website">Website</option>
        <option value="huggingface">HuggingFace</option>
        <option value="other">Other</option>
      </select>
      <input
        value={link.url}
        onChange={e => onUpdate({ ...link, url: e.target.value })}
        placeholder="URL"
      />
      <button className={styles.metricDelete} onClick={onDelete}>×</button>
    </div>
  )
}

function generateBibtex(meta, fileName) {
  const firstAuthor = meta.authors
    ? meta.authors.split(/,|and/)[0].trim().split(' ').pop()
    : fileName?.replace(/\.pdf$/i, '').split(/\s+/)[0] || 'unknown'
  const year = meta.year || 'XXXX'
  const key = (firstAuthor + year).replace(/[^a-zA-Z0-9]/g, '')

  const hasVenue = !!meta.venue
  const type = hasVenue ? '@inproceedings' : '@misc'

  const arxivLink = meta.links?.find(l => l.type === 'arxiv' && l.url)
  const doiMatch = arxivLink?.url?.match(/doi\.org\/(.+)/)
  const doi = doiMatch?.[1]
  const url = arxivLink?.url

  const lines = [`${type}{${key},`]
  if (meta.title)   lines.push(`  title     = {${meta.title}},`)
  if (meta.authors) lines.push(`  author    = {${meta.authors}},`)
  if (year !== 'XXXX') lines.push(`  year      = {${year}},`)
  if (hasVenue)     lines.push(`  booktitle = {${meta.venue}},`)
  if (doi)          lines.push(`  doi       = {${doi}},`)
  if (url && !doi)  lines.push(`  url       = {${url}},`)
  lines.push('}')

  return lines.join('\n')
}

export function MetadataPanel({ paper, onUpdate, onSelectHighlight }) {
  const meta = paper.meta
  const highlights = meta.highlights || []
  const set = (field, val) => onUpdate({ [field]: val })
  const [tab, setTab] = useState('reading')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const activeHighlightIndex = Math.min(highlightIndex, Math.max(0, highlights.length - 1))
  const activeHighlight = highlights[activeHighlightIndex]


  function openJson() {
    setJsonText(JSON.stringify(meta, null, 2))
    setJsonError(null)
    setTab('json')
  }

  function handleJsonChange(val) {
    setJsonText(val)
    try {
      JSON.parse(val)
      setJsonError(null)
    } catch (e) {
      setJsonError(e.message)
    }
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonText)
      onUpdate(parsed)
      setJsonError(null)
      setTab('form')
    } catch (e) {
      setJsonError(e.message)
    }
  }

  function copyJson() {
    navigator.clipboard.writeText(JSON.stringify(meta, null, 2))
  }

  function addMetric() {
    onUpdate({ metrics: [...meta.metrics, { id: Date.now(), name: '', value: '', dataset: '' }] })
  }
  function updateMetric(id, data) {
    onUpdate({ metrics: meta.metrics.map(m => m.id === id ? { ...m, ...data } : m) })
  }
  function deleteMetric(id) {
    onUpdate({ metrics: meta.metrics.filter(m => m.id !== id) })
  }

  function addLink() {
    onUpdate({ links: [...meta.links, { id: Date.now(), type: 'arxiv', url: '' }] })
  }
  function updateLink(id, data) {
    onUpdate({ links: meta.links.map(l => l.id === id ? { ...l, ...data } : l) })
  }
  function deleteLink(id) {
    onUpdate({ links: meta.links.filter(l => l.id !== id) })
  }

  function updateHighlight(id, updates) {
    set('highlights', highlights.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  function selectHighlight(index) {
    if (highlights.length === 0) return
    const nextIndex = Math.min(Math.max(index, 0), highlights.length - 1)
    setHighlightIndex(nextIndex)
    onSelectHighlight?.(highlights[nextIndex])
  }

  function openHighlights() {
    setTab('highlights')
    if (activeHighlight) onSelectHighlight?.(activeHighlight)
  }

  function removeHighlight(id) {
    const next = highlights.filter(item => item.id !== id)
    set('highlights', next)
    setHighlightIndex(current => Math.min(current, Math.max(0, next.length - 1)))
  }

  return (
    <div className={styles.panel}>
      <button
        className={`${styles.citedToggle} ${meta.cited ? styles.citedToggleActive : ''}`}
        onClick={() => set('cited', !meta.cited)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={meta.cited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        {meta.cited ? 'Citado' : 'Marcar como citado'}
      </button>

      <div className={styles.panelHeader}>
        <div className={styles.tabs}>
          <button
            className={[styles.tab, tab === "reading" ? styles.tabActive : ""].join(" ")}
            onClick={() => setTab("reading")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Leitura
          </button>
          <button
            className={[styles.tab, tab === "highlights" ? styles.tabActive : ""].join(" ")}
            onClick={openHighlights}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-7.5 7.5L4.5 9.5 12 2z"/>
            </svg>
            Trechos
            <span className={styles.tabCount}>{highlights.length}</span>
          </button>
          <button
            className={[styles.tab, tab === "form" ? styles.tabActive : ""].join(" ")}
            onClick={() => setTab("form")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Dados
          </button>
          <button
            className={[styles.tab, tab === "json" ? styles.tabActive : ""].join(" ")}
            onClick={openJson}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            JSON
          </button>
          <button
            className={[styles.tab, tab === "cite" ? styles.tabActive : ""].join(" ")}
            onClick={() => setTab("cite")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
              <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
            </svg>
            Citar
          </button>
        </div>
        {tab === "json" && (
          <div className={styles.jsonActions}>
            <button className={styles.jsonBtn} onClick={copyJson} title="Copiar JSON">Copiar</button>
            <button
              className={[styles.jsonBtn, styles.jsonBtnApply].join(" ")}
              onClick={applyJson}
              disabled={!!jsonError}
              title="Aplicar alterações"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>

      {tab === "reading" && (
        <div className={styles.writingView}>
          <header className={styles.writingHeader}>
            <h2>Resumo e insights</h2>
            <p>Registre sua síntese enquanto lê o paper.</p>
          </header>
          <label className={styles.writingField}>
            <span>Resumo</span>
            <textarea
              value={meta.summary || ""}
              onChange={event => set("summary", event.target.value)}
              placeholder="Síntese do problema, método e resultados..."
            />
          </label>
          <label className={styles.writingField}>
            <span>Insights</span>
            <textarea
              value={meta.insights || ""}
              onChange={event => set("insights", event.target.value)}
              placeholder="Conexões, hipóteses, limitações e ideias para testar..."
            />
          </label>
        </div>
      )}

      {tab === "highlights" && (
        <div className={styles.highlightsView}>
          <header className={styles.highlightsViewHeader}>
            <div>
              <h2>Trechos marcados</h2>
              <span>{highlights.length > 0 ? `${activeHighlightIndex + 1} / ${highlights.length}` : '0 / 0'}</span>
            </div>
            <div className={styles.highlightNavigation}>
              <button
                type="button"
                onClick={() => selectHighlight(activeHighlightIndex - 1)}
                disabled={activeHighlightIndex === 0}
                title="Trecho anterior"
                aria-label="Trecho anterior"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <button
                type="button"
                onClick={() => selectHighlight(activeHighlightIndex + 1)}
                disabled={highlights.length === 0 || activeHighlightIndex === highlights.length - 1}
                title="Próximo trecho"
                aria-label="Próximo trecho"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </header>

          {activeHighlight ? (
            <article className={styles.highlightItem}>
              <div className={styles.highlightItemHeader}>
                <span className={styles.highlightLocation}>
                  <i className={styles.highlightSwatch} data-color={activeHighlight.color || "yellow"} />
                  Trecho {String(activeHighlightIndex + 1).padStart(2, '0')}
                  {activeHighlight.rects?.[0]?.page ? ` · Página ${activeHighlight.rects[0].page}` : ''}
                </span>
                <div className={styles.highlightActions}>
                  <div className={styles.highlightColorChoices} aria-label="Cor do trecho marcado">
                    {HIGHLIGHT_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        className={`${styles.highlightColorChoice} ${activeHighlight.color === color || (!activeHighlight.color && color === "yellow") ? styles.highlightColorChoiceActive : ""}`}
                        data-color={color}
                        onClick={() => updateHighlight(activeHighlight.id, { color })}
                        title={HIGHLIGHT_LABELS[color]}
                        aria-label={`Alterar cor para ${HIGHLIGHT_LABELS[color]}`}
                      />
                    ))}
                  </div>
                  <button
                    className={styles.highlightRemove}
                    onClick={() => removeHighlight(activeHighlight.id)}
                    title="Remover trecho marcado"
                    aria-label="Remover trecho marcado"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
              <blockquote>{activeHighlight.text}</blockquote>
              <label className={styles.highlightComment}>
                <span>Comentário</span>
                <textarea
                  value={activeHighlight.comment || ''}
                  onChange={event => updateHighlight(activeHighlight.id, { comment: event.target.value })}
                  placeholder="Escreva sua análise deste trecho..."
                />
              </label>
            </article>
          ) : (
            <div className={styles.highlightsEmpty}>Nenhum trecho marcado</div>
          )}
        </div>
      )}

      {tab === "json" && (
        <div className={styles.jsonView}>
          {jsonError && <div className={styles.jsonError}>{jsonError}</div>}
          <textarea
            className={styles.jsonEditor}
            value={jsonText}
            onChange={event => handleJsonChange(event.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {tab === "cite" && (
        <div className={styles.jsonView}>
          <div className={styles.jsonActions} style={{ marginLeft: 0 }}>
            <button
              className={styles.jsonBtn}
              onClick={() => navigator.clipboard.writeText(meta.bibtex || generateBibtex(meta, paper.fileName))}
            >
              Copiar BibTeX
            </button>
            {meta.bibtex && (
              <button className={styles.jsonBtn} onClick={() => set("bibtex", "")}>Restaurar</button>
            )}
          </div>
          <textarea
            className={styles.jsonEditor}
            value={meta.bibtex || generateBibtex(meta, paper.fileName)}
            onChange={event => set("bibtex", event.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      <div className={styles.scroll} style={tab !== "form" ? { display: "none" } : {}}>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Identification
          </h3>

          <label className={styles.field}>
            <span>Title</span>
            <textarea
              rows={2}
              value={meta.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Full paper title..."
            />
          </label>

          <label className={styles.field}>
            <span>Authors</span>
            <input
              value={meta.authors}
              onChange={e => set('authors', e.target.value)}
              placeholder="Author A, Author B, ..."
            />
          </label>

          <div className={styles.row}>
            <label className={styles.field}>
              <span>Year</span>
              <input
                type="number"
                value={meta.year}
                onChange={e => set('year', e.target.value)}
                placeholder="2025"
                min="1900"
                max="2100"
              />
            </label>
            <label className={styles.field}>
              <span>Venue</span>
              <input
                value={meta.venue}
                onChange={e => set('venue', e.target.value)}
                placeholder="BRACIS, ACL, EMNLP..."
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
            </svg>
            Research
          </h3>

          <label className={styles.field}>
            <span>Task</span>
            <select value={meta.task} onChange={e => set('task', e.target.value)}>
              {TASKS.map(t => <option key={t} value={t}>{t || '— select —'}</option>)}
            </select>
          </label>

          <label className={styles.field}>
            <span>Problem / Research Question</span>
            <textarea
              rows={3}
              value={meta.problem}
              onChange={e => set('problem', e.target.value)}
              placeholder="What problem does this paper address?..."
            />
          </label>

          <label className={styles.field}>
            <span>Model / Method</span>
            <input
              value={meta.model}
              onChange={e => set('model', e.target.value)}
              placeholder="BERTimbau, GPT-4, LSTM..."
            />
          </label>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            </svg>
            Datasets
          </h3>
          <label className={styles.field}>
            <span>Used Datasets <small>(Enter to add)</small></span>
            <TagInput
              value={meta.datasets}
              onChange={val => set('datasets', val)}
              placeholder="e.g. HAREM, MilkCow..."
              colorClass="tagGreen"
            />
          </label>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Results
          </h3>
          <div className={styles.metricHeader}>
            <span className={styles.metricCol}>Metric</span>
            <span className={styles.metricCol}>Value</span>
            <span className={styles.metricCol}>Dataset</span>
          </div>
          {meta.metrics.map(m => (
            <MetricRow
              key={m.id}
              metric={m}
              onUpdate={data => updateMetric(m.id, data)}
              onDelete={() => deleteMetric(m.id)}
            />
          ))}
          <button className={styles.addRowBtn} onClick={addMetric}>
            + Add metric
          </button>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            Tags
          </h3>
          <div className={styles.tags}>
            {['ABSA', 'SSA', 'DA'].map(tag => {
              const active = meta.tags.includes(tag)
              return (
                <span
                  key={tag}
                  className={`${styles.tag} ${styles.tagPurple} ${active ? '' : styles.tagInactive}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => set('tags', active ? meta.tags.filter(t => t !== tag) : [...meta.tags, tag])}
                >
                  {tag}
                </span>
              )
            })}
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Links
          </h3>
          {meta.links.map(l => (
            <LinkRow
              key={l.id}
              link={l}
              onUpdate={data => updateLink(l.id, data)}
              onDelete={() => deleteLink(l.id)}
            />
          ))}
          <button className={styles.addRowBtn} onClick={addLink}>
            + Add link
          </button>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Notes
          </h3>
          <textarea
            rows={5}
            value={meta.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Observations, limitations, ideas..."
            className={styles.notes}
          />
        </section>

      </div>
    </div>
  )
}
