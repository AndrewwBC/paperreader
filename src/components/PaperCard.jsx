import styles from './PaperCard.module.css'

const LINK_ICONS = {
  arxiv: '📄',
  github: '',
  huggingface: '🤗',
  website: '🔗',
  other: '🔗',
}

function GithubIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

export function PaperCard({ paper, onClick, onToggleCited, onEdit, onDelete }) {
  const { meta, fileName, addedAt } = paper
  const title = (meta.title || fileName).split(/\s+/).filter(Boolean).slice(0, 5).join(" ")
  const date = new Date(addedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <article className={`${styles.card} ${meta.cited ? styles.cited : ''}`} onClick={onClick}>
      {/* Cited flag */}
      <button
        className={`${styles.citedBtn} ${meta.cited ? styles.citedBtnActive : ''}`}
        onClick={e => { e.stopPropagation(); onToggleCited() }}
        title={meta.cited ? 'Remover citação' : 'Marcar como citado'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={meta.cited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        {meta.cited ? 'Citado' : 'Citar'}
      </button>

      {/* Header strip */}
      <div className={styles.header}>
        <div className={styles.pdfIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <div className={styles.headerMeta}>
          {meta.venue && <span className={styles.venue}>{meta.venue}</span>}
          {meta.year && <span className={styles.year}>{meta.year}</span>}
        </div>
      </div>

      {/* Title */}
      <h2 className={styles.title} title={meta.title || fileName}>{title}</h2>

      {/* Authors */}
      {meta.authors && (
        <p className={styles.authors}>{meta.authors}</p>
      )}

      {/* Problem */}
      {meta.problem && (
        <p className={styles.problem}>{meta.problem}</p>
      )}

      {/* Citation */}
      {(meta.authors || meta.year || meta.venue) && (
        <cite className={styles.cite}>
          {[
            meta.authors,
            meta.year && `(${meta.year})`,
            meta.venue,
          ].filter(Boolean).join(' · ')}
        </cite>
      )}

      {/* Chips row */}
      <div className={styles.chips}>
        {meta.task && (
          <span className={`${styles.chip} ${styles.chipTask}`}>{meta.task}</span>
        )}
        {meta.model && (
          <span className={`${styles.chip} ${styles.chipModel}`}>{meta.model}</span>
        )}
        {meta.datasets.map((d, i) => (
          <span key={i} className={`${styles.chip} ${styles.chipDataset}`}>
            {typeof d === 'string' ? d : d?.name ?? JSON.stringify(d)}
          </span>
        ))}
        {meta.tags.map((t, i) => (
          <span key={i} className={`${styles.chip} ${styles.chipTag}`}>
            {typeof t === 'string' ? t : JSON.stringify(t)}
          </span>
        ))}
      </div>

      {/* Metrics preview */}
      {meta.metrics.filter(m => m.name && m.value).length > 0 && (
        <div className={styles.metrics}>
          {meta.metrics.filter(m => m.name && m.value).slice(0, 4).map(m => (
            <div key={m.id} className={styles.metric}>
              <span className={styles.metricVal}>{m.value}</span>
              <span className={styles.metricName}>{m.name}{m.dataset ? ` · ${m.dataset}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.date}>{date}</span>
        <div className={styles.links}>
          {meta.links.filter(l => l.url).slice(0, 3).map(l => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className={styles.link}
              title={l.type}
            >
              {l.type === 'github' ? <GithubIcon /> : <span>{LINK_ICONS[l.type] || '🔗'}</span>}
            </a>
          ))}
        </div>
        <div className={styles.paperActions}>
          <button
            className={styles.paperAction}
            onClick={e => { e.stopPropagation(); onEdit() }}
            title="Editar paper"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button
            className={`${styles.paperAction} ${styles.paperActionDanger}`}
            onClick={e => { e.stopPropagation(); onDelete() }}
            title="Excluir paper"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
        <span className={styles.openBtn}>Abrir &rarr;</span>
      </div>
    </article>
  )
}
