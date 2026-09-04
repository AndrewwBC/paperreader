import { useState, useEffect } from 'react'
import { usePapers } from './hooks/usePapers'
import { Sidebar } from './components/Sidebar'
import { PaperCard } from './components/PaperCard'
import { PaperViewer } from './components/PaperViewer'
import { MetadataPanel } from './components/MetadataPanel'
import { DropZone } from './components/DropZone'
import styles from './App.module.css'

export default function App({ user, onOpenAccount }) {
  const { studies, papers, createStudy, updateStudy, deleteStudy, addPapers, updateMeta, deletePaper, getBlobUrl, migrateFromLocalStorage } = usePapers()
  const [selectedId, setSelectedId] = useState(null)
  const [selectedStudyId, setSelectedStudyId] = useState(null)
  const [view, setView] = useState('home')
  const [showUpload, setShowUpload] = useState(false)
  const [showCreateStudy, setShowCreateStudy] = useState(false)
  const [studyDraft, setStudyDraft] = useState('')
  const [editingStudy, setEditingStudy] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [crudBusy, setCrudBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const [showPanel, setShowPanel] = useState(true)
  const [highlightFocus, setHighlightFocus] = useState(null)
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  // Migration state
  const [migrationCount, setMigrationCount] = useState(() => {
    try {
      const stored = localStorage.getItem('paper-vault-papers')
      return stored ? JSON.parse(stored).length : 0
    } catch { return 0 }
  })
  const [migrating, setMigrating] = useState(false)
  const [migrateProgress, setMigrateProgress] = useState(null) // { done, total }

  async function handleMigrate() {
    setMigrating(true)
    setMigrateProgress({ done: 0, total: migrationCount })
    await migrateFromLocalStorage((done, total) => setMigrateProgress({ done, total }))
    setMigrating(false)
    setMigrationCount(0)
  }

  const activeStudyId = studies.some(study => study.id === selectedStudyId)
    ? selectedStudyId
    : null
  const selectedStudy = studies.find(study => study.id === activeStudyId)
  const visiblePapers = papers.filter(p => p.studyId === activeStudyId)
  const selectedPaper = papers.find(p => p.id === selectedId && p.studyId === activeStudyId)
  const recentPapers = visiblePapers
    .filter(paper => paper.meta.lastOpenedAt)
    .sort((a, b) => new Date(b.meta.lastOpenedAt) - new Date(a.meta.lastOpenedAt))
    .slice(0, 5)

  function openUpload() {
    setUploadProgress(null)
    setUploadResult(null)
    setShowUpload(true)
  }

  function closeUpload() {
    if (adding) return
    setShowUpload(false)
    setUploadProgress(null)
    setUploadResult(null)
  }

  async function handleFiles(files) {
    if (!activeStudyId || files.length === 0) return
    setAdding(true)
    setUploadResult(null)
    setUploadProgress({ done: 0, total: files.length, fileName: files[0].name })

    try {
      const result = await addPapers(files, activeStudyId, progress => {
        setUploadProgress(progress)
      })
      setUploadResult(result)
    } finally {
      setAdding(false)
    }
  }


  async function handleCreateStudy(name) {
    const study = await createStudy(name)
    setSelectedStudyId(study.id)
    setSelectedId(null)
    setView('cards')
    return study
  }

  function handleSelectStudy(id) {
    setSelectedStudyId(id)
    setSelectedId(null)
    setView('cards')
  }

  function handleHome() {
    setSelectedStudyId(null)
    setSelectedId(null)
    setView('home')
  }

  async function submitHomeStudy(e) {
    e.preventDefault()
    const name = studyDraft.trim()
    if (!name) return
    await handleCreateStudy(name)
    setStudyDraft('')
    setShowCreateStudy(false)
  }


  function openCreateStudy() {
    setStudyDraft('')
    setEditingStudy(null)
    setShowCreateStudy(true)
  }

  function openEditStudy(study, event) {
    event?.stopPropagation()
    setStudyDraft(study.name)
    setEditingStudy(study)
    setShowCreateStudy(false)
  }

  async function submitStudyEdit(e) {
    e.preventDefault()
    const name = studyDraft.trim()
    if (!name || !editingStudy) return
    setCrudBusy(true)
    await updateStudy(editingStudy.id, name)
    setCrudBusy(false)
    setStudyDraft('')
    setEditingStudy(null)
  }

  function requestDeleteStudy(study, event) {
    event?.stopPropagation()
    setDeleteTarget({ type: 'study', item: study })
  }

  function requestDeletePaper(id) {
    const paper = papers.find(item => item.id === id)
    if (paper) setDeleteTarget({ type: 'paper', item: paper })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setCrudBusy(true)
    if (deleteTarget.type === 'study') {
      const studyId = deleteTarget.item.id
      await deleteStudy(studyId)
      if (activeStudyId === studyId) handleHome()
    } else {
      await deletePaper(deleteTarget.item.id)
      if (selectedId === deleteTarget.item.id) {
        setSelectedId(null)
        setView('cards')
      }
    }
    setCrudBusy(false)
    setDeleteTarget(null)
  }

  function handleSelect(id) {
    const paper = papers.find(item => item.id === id)
    if (!paper) return

    updateMeta(id, { lastOpenedAt: new Date().toISOString() })
    setHighlightFocus(null)
    setShowSidebar(false)
    setShowPanel(true)
    setSelectedStudyId(paper.studyId)
    setSelectedId(id)
    setView('editor')
  }

  function handleUpdateMeta(updates) {
    if (selectedId) updateMeta(selectedId, updates)
  }


  const blobUrl = selectedId ? getBlobUrl(selectedId) : null

  return (
    <div className={styles.app}>
      <div className={`${styles.sidebarWrap} ${showSidebar ? '' : styles.sidebarWrapCollapsed}`}>
        <Sidebar
          studies={studies}
          isHome={view === 'home'}
          selectedStudyId={activeStudyId}
          papers={visiblePapers}
          selectedId={selectedId}
          onSelectStudy={handleSelectStudy}
          onCreateStudy={handleCreateStudy}
          onHome={handleHome}
          onSelect={handleSelect}
          onAdd={() => activeStudyId && openUpload()}
          onDelete={requestDeletePaper}
        />
      </div>

      <main className={styles.main}>
        {/* Migration banner */}
        {migrationCount > 0 && (
          <div className={styles.migrationBanner}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {migrating ? (
              <span>Migrando... {migrateProgress?.done}/{migrateProgress?.total}</span>
            ) : (
              <span>{migrationCount} paper{migrationCount !== 1 ? 's' : ''} encontrado{migrationCount !== 1 ? 's' : ''} no localStorage</span>
            )}
            {!migrating && (
              <>
                <button className={styles.migrateBtn} onClick={handleMigrate}>
                  Migrar para o banco
                </button>
                <button className={styles.migrateDismiss} onClick={() => setMigrationCount(0)}>
                  Ignorar
                </button>
              </>
            )}
          </div>
        )}

        {/* Top bar */}
        <div className={styles.topbar}>
          <button className={styles.toggleBtn} onClick={() => setShowSidebar(v => !v)} title={showSidebar ? 'Recolher menu' : 'Abrir menu'} aria-label={showSidebar ? 'Recolher menu' : 'Abrir menu'} aria-expanded={showSidebar}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {showSidebar
                ? <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>
                : <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="13 8 17 12 13 16"/></>
              }
            </svg>
          </button>
          <button
            className={`${styles.homeBtn} ${view === 'home' ? styles.homeBtnActive : ''}`}
            onClick={handleHome}
            title="Home"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10.5 12 3l9 7.5"/>
              <path d="M5 10v10h14V10"/>
              <path d="M9 20v-6h6v6"/>
            </svg>
            Home
          </button>
          <div className={styles.viewSwitcher}>
            <button
              className={`${styles.viewBtn} ${view === 'cards' ? styles.active : ''}`}
              onClick={() => selectedStudy && setView('cards')}
              disabled={!selectedStudy}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
              Cards
            </button>
            <button
              className={`${styles.viewBtn} ${view === 'editor' ? styles.active : ''}`}
              onClick={() => selectedPaper && setView('editor')}
              disabled={!selectedPaper}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {selectedPaper ? (selectedPaper.meta.title || selectedPaper.fileName).split(/\s+/).filter(Boolean).slice(0, 5).join(' ') : 'Editor'}
            </button>
          </div>
          {view === 'editor' && selectedPaper && (
            <button className={styles.toggleBtn} onClick={() => setShowPanel(v => !v)} title={showPanel ? 'Recolher painel de leitura' : 'Abrir painel de leitura'} aria-label={showPanel ? 'Recolher painel de leitura' : 'Abrir painel de leitura'} aria-expanded={showPanel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showPanel
                  ? <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></>
                  : <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/><polyline points="11 8 7 12 11 16"/></>
                }
              </svg>
            </button>
          )}
          <button className={styles.toggleBtn} onClick={() => setDark(v => !v)} title="Toggle theme">
            {dark ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <button className={styles.newBtn} onClick={() => view === 'home' ? openCreateStudy() : openUpload()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {view === 'home' ? 'Novo estudo' : 'Adicionar PDFs'}
          </button>
          <button className={styles.userAccount} type="button" onClick={onOpenAccount} title="Gerenciar conta">
            <span className={styles.userAvatar}>{user.name.trim().charAt(0).toUpperCase()}</span>
            <span className={styles.userName}>{user.name}</span>
            <svg className={styles.accountChevron} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>

          {/* HOME VIEW */}
          {view === 'home' && (
            <section className={styles.homeView}>
              <header className={styles.homeHeader}>
                <div>
                  <span className={styles.homeEyebrow}>Paper Vault</span>
                  <h1>Estudos</h1>
                </div>
                <p>{studies.length} estudo{studies.length !== 1 ? 's' : ''} · {papers.length} paper{papers.length !== 1 ? 's' : ''}</p>
              </header>

              <div className={styles.studyGrid}>
                {studies.map((study, index) => (
                  <article
                    key={study.id}
                    className={styles.studyCard}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectStudy(study.id)}
                    onKeyDown={e => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') handleSelectStudy(study.id)
                    }}
                  >
                    <div className={styles.studyCardTop}>
                      <span className={styles.studyIndex}>{String(index + 1).padStart(2, '0')}</span>
                      <div className={styles.studyActions}>
                        <button
                          className={styles.studyAction}
                          onClick={e => openEditStudy(study, e)}
                          title="Editar estudo"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                          </svg>
                        </button>
                        <button
                          className={`${styles.studyAction} ${styles.studyActionDanger}`}
                          onClick={e => requestDeleteStudy(study, e)}
                          title="Excluir estudo"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className={styles.studyCardBody}>
                      <h2 title={study.name}>{study.name}</h2>
                      <p>{study.paperCount} paper{study.paperCount !== 1 ? 's' : ''}</p>
                    </div>
                    <div className={styles.studyCardFooter}>
                      <span>Criado em {new Intl.DateTimeFormat('pt-BR').format(new Date(study.createdAt))}</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                      </svg>
                    </div>
                  </article>
                ))}

                <button className={styles.newStudyCard} onClick={openCreateStudy}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span>Novo estudo</span>
                </button>
              </div>
            </section>
          )}

          {/* CARDS VIEW */}
          {view === 'cards' && (
            <div className={styles.cardsView}>
              {visiblePapers.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>&#9964;</div>
                  <h2>{selectedStudy?.name || 'Novo estudo'}</h2>
                  <p>Adicione o primeiro PDF deste estudo.<br />Os metadados, notas e citações ficam separados por estudo.</p>
                  <button className={styles.emptyBtn} onClick={() => openUpload()}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Adicionar PDFs
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.cardsHeader}>
                    <h1 className={styles.cardsTitle}>
                      {selectedStudy?.name || 'Estudo'} · {visiblePapers.length} paper{visiblePapers.length !== 1 ? 's' : ''}
                    </h1>
                  </div>
                  <section className={styles.recentSection} aria-labelledby="recent-papers-title">
                    <div className={styles.recentHeader}>
                      <div>
                        <span>Histórico do estudo</span>
                        <h2 id="recent-papers-title">Abertos recentemente</h2>
                      </div>
                      <span>Últimos 5</span>
                    </div>
                    {recentPapers.length > 0 ? (
                      <ol className={styles.recentList}>
                        {recentPapers.map((paper, index) => (
                          <li key={paper.id}>
                            <button
                              className={styles.recentPaper}
                              onClick={() => handleSelect(paper.id)}
                              title={`Abrir ${paper.meta.title || paper.fileName}`}
                            >
                              <span className={styles.recentIndex}>{String(index + 1).padStart(2, '0')}</span>
                              <span className={styles.recentPaperMain}>
                                <strong>{(paper.meta.title || paper.fileName).split(/\s+/).filter(Boolean).slice(0, 5).join(' ')}</strong>
                                <span>{paper.meta.authors || paper.fileName}</span>
                              </span>
                              <time dateTime={paper.meta.lastOpenedAt}>
                                {new Intl.DateTimeFormat('pt-BR', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }).format(new Date(paper.meta.lastOpenedAt))}
                              </time>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.recentEmpty}>Os papers abertos neste estudo aparecerão aqui.</p>
                    )}
                  </section>
                  <div className={styles.grid}>
                    {[...visiblePapers].sort((a, b) => {
                      if (a.meta.cited !== b.meta.cited) return a.meta.cited ? 1 : -1
                      return (parseInt(b.meta.year) || 0) - (parseInt(a.meta.year) || 0)
                    }).map(p => (
                      <PaperCard
                        key={p.id}
                        paper={p}
                        onClick={() => handleSelect(p.id)}
                        onToggleCited={() => updateMeta(p.id, { cited: !p.meta.cited })}
                        onEdit={() => handleSelect(p.id)}
                        onDelete={() => requestDeletePaper(p.id)}
                      />
                    ))}
                    {/* Add card */}
                    <button className={styles.addCard} onClick={() => openUpload()}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      <span>Adicionar PDFs</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* EDITOR VIEW */}
          {view === 'editor' && selectedPaper && (
            <div className={styles.editorView}>
              <PaperViewer
                key={selectedPaper.id}
                blobUrl={blobUrl}
                fileName={selectedPaper.fileName}
                highlights={selectedPaper.meta.highlights || []}
                onHighlightsChange={highlights => handleUpdateMeta({ highlights })}
                focusHighlightRequest={highlightFocus}
              />
              <div className={`${styles.panelWrap} ${showPanel ? '' : styles.panelWrapCollapsed}`}>
                <MetadataPanel
                  key={selectedPaper.id}
                  paper={selectedPaper}
                  onUpdate={handleUpdateMeta}
                  onSelectHighlight={highlight => setHighlightFocus({ id: highlight.id, requestedAt: Date.now() })}
                />
              </div>
            </div>
          )}

          {/* No paper selected in editor */}
          {view === 'editor' && !selectedPaper && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>&#128196;</div>
              <h2>No paper selected</h2>
              <p>Select a paper from the sidebar or add a new one.</p>
              <button className={styles.emptyBtn} onClick={() => openUpload()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Adicionar PDFs
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Study form modal */}
      {(showCreateStudy || editingStudy) && (
        <div
          className={styles.overlay}
          onClick={e => {
            if (e.target === e.currentTarget) {
              setShowCreateStudy(false)
              setEditingStudy(null)
            }
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span>{editingStudy ? 'Editar estudo' : 'Novo estudo'}</span>
              <button
                className={styles.closeBtn}
                onClick={() => {
                  setShowCreateStudy(false)
                  setEditingStudy(null)
                }}
                title="Fechar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <form className={styles.createStudyForm} onSubmit={editingStudy ? submitStudyEdit : submitHomeStudy}>
              <label htmlFor="study-name">Nome do estudo</label>
              <input
                id="study-name"
                value={studyDraft}
                onChange={e => setStudyDraft(e.target.value)}
                placeholder="Ex.: Annotation"
                maxLength={80}
                autoFocus
              />
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setShowCreateStudy(false)
                    setEditingStudy(null)
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={!studyDraft.trim() || crudBusy}>
                  {crudBusy ? 'Salvando...' : editingStudy ? 'Salvar' : 'Criar estudo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div className={styles.modal} role="alertdialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <span>{deleteTarget.type === 'study' ? 'Excluir estudo' : 'Excluir paper'}</span>
              <button className={styles.closeBtn} onClick={() => setDeleteTarget(null)} title="Fechar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className={styles.confirmBody}>
              <p>
                Tem certeza que deseja excluir <strong>
                  {deleteTarget.type === 'study'
                    ? deleteTarget.item.name
                    : deleteTarget.item.meta.title || deleteTarget.item.fileName}
                </strong>?
              </p>
              {deleteTarget.type === 'study' && deleteTarget.item.paperCount > 0 && (
                <p className={styles.warningText}>
                  Os {deleteTarget.item.paperCount} papers deste estudo também serão excluídos.
                </p>
              )}
              <div className={styles.formActions}>
                <button className={styles.secondaryBtn} onClick={() => setDeleteTarget(null)} disabled={crudBusy}>
                  Cancelar
                </button>
                <button className={styles.dangerBtn} onClick={confirmDelete} disabled={crudBusy}>
                  {crudBusy ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) closeUpload() }}>
          <div className={`${styles.modal} ${styles.batchModal}`}>
            <div className={styles.modalHeader}>
              <div>
                <span>Adicionar PDFs</span>
                <small>{selectedStudy?.name}</small>
              </div>
              <button className={styles.closeBtn} onClick={closeUpload} disabled={adding} title="Fechar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className={styles.modalBody}>
              {adding ? (
                <div className={styles.batchProgress}>
                  <div className={styles.batchProgressHead}>
                    <span>{uploadProgress?.done || 0}/{uploadProgress?.total || 0}</span>
                    <strong>Processando PDFs</strong>
                  </div>
                  <div className={styles.progressTrack} aria-hidden="true">
                    <span
                      style={{
                        width: ((uploadProgress?.done || 0) / (uploadProgress?.total || 1) * 100) + '%',
                      }}
                    />
                  </div>
                  <p>{uploadProgress?.fileName}</p>
                </div>
              ) : uploadResult ? (
                <div className={styles.batchResult}>
                  <div className={styles.resultIcon}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <h3>
                    {uploadResult.added.length} paper{uploadResult.added.length !== 1 ? 's' : ''} adicionado{uploadResult.added.length !== 1 ? 's' : ''}
                  </h3>
                  {uploadResult.failed.length > 0 && (
                    <>
                      <p className={styles.resultWarning}>
                        {uploadResult.failed.length} arquivo{uploadResult.failed.length !== 1 ? 's' : ''} não pôde{uploadResult.failed.length === 1 ? '' : 'ram'} ser processado{uploadResult.failed.length !== 1 ? 's' : ''}.
                      </p>
                      <ul className={styles.failedFiles}>
                        {uploadResult.failed.map(item => <li key={item.fileName}>{item.fileName}</li>)}
                      </ul>
                    </>
                  )}
                  <div className={styles.formActions}>
                    <button
                      className={styles.secondaryBtn}
                      onClick={() => {
                        setUploadResult(null)
                        setUploadProgress(null)
                      }}
                    >
                      Adicionar mais
                    </button>
                    <button className={styles.primaryBtn} onClick={closeUpload}>Concluir</button>
                  </div>
                </div>
              ) : (
                <DropZone onFiles={handleFiles} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
