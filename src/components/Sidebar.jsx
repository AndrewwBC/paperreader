import { useState } from "react"
import styles from "./Sidebar.module.css"

export function Sidebar({
  studies,
  isHome,
  selectedStudyId,
  onSelectStudy,
  onCreateStudy,
  onHome,
  onAdd,
}) {
  const [creatingStudy, setCreatingStudy] = useState(false)
  const [studyName, setStudyName] = useState("")

  async function submitStudy(event) {
    event.preventDefault()
    const name = studyName.trim()
    if (!name) return
    await onCreateStudy(name)
    setStudyName("")
    setCreatingStudy(false)
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <button className={styles.logo} onClick={onHome} title="Home">
          <span className={styles.logoIcon}>&#9964;</span>
          <div>
            <span className={styles.logoTitle}>Paper Vault</span>
            <span className={styles.logoSub}>Home</span>
          </div>
        </button>
        <button className={styles.addBtn} onClick={onAdd} title="Adicionar PDFs" disabled={isHome}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <section className={styles.studies}>
        <div className={styles.sectionHead}>
          <span>Estudos</span>
          <button
            className={styles.smallIconBtn}
            onClick={() => setCreatingStudy(true)}
            title="Novo estudo"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>

        {creatingStudy && (
          <form className={styles.studyForm} onSubmit={submitStudy}>
            <input
              value={studyName}
              onChange={event => setStudyName(event.target.value)}
              placeholder="Nome do estudo"
              autoFocus
            />
            <button type="submit">Criar</button>
          </form>
        )}

        <div className={styles.studyList}>
          {studies.map(study => (
            <button
              key={study.id}
              className={`${styles.studyItem} ${study.id === selectedStudyId ? styles.studySelected : ""}`}
              onClick={() => onSelectStudy(study.id)}
            >
              <span className={styles.studyName}>{study.name}</span>
              <span className={styles.studyCount}>{study.paperCount}</span>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.homeHint}>
        {isHome ? "Selecione um estudo para ver seus papers." : "Os papers deste estudo aparecem na área principal."}
      </div>
    </aside>
  )
}
