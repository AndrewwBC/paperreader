import { useRef, useState } from "react"
import styles from "./DropZone.module.css"

const MAX_FILE_BYTES = 20 * 1024 * 1024

export function DropZone({ onFiles }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState(0)
  const [tooLarge, setTooLarge] = useState([])

  function selectFiles(fileList) {
    const files = Array.from(fileList)
    const pdfs = files.filter(file =>
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    )
    setRejected(files.length - pdfs.length)
    const oversized = pdfs.filter(file => file.size > MAX_FILE_BYTES)
    setTooLarge(oversized.map(file => file.name))
    const acceptable = pdfs.filter(file => file.size <= MAX_FILE_BYTES)
    if (acceptable.length > 0) onFiles(acceptable)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    selectFiles(e.dataTransfer.files)
  }

  function handleChange(e) {
    selectFiles(e.target.files)
    e.target.value = ""
  }

  function openPicker() {
    inputRef.current?.click()
  }

  return (
    <div
      className={`${styles.zone} ${dragging ? styles.dragging : ""}`}
      role="button"
      tabIndex={0}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={openPicker}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") openPicker()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        style={{ display: "none" }}
        onChange={handleChange}
      />
      <div className={styles.icon}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
      </div>
      <p className={styles.title}>Arraste seus PDFs aqui</p>
      <p className={styles.sub}>ou clique para selecionar vários arquivos</p>
      {rejected > 0 && (
        <p className={styles.rejected}>
          {rejected} arquivo{rejected !== 1 ? "s" : ""} ignorado{rejected !== 1 ? "s" : ""}: apenas PDFs são aceitos.
        </p>
      )}
      {tooLarge.length > 0 && (
        <p className={styles.rejected}>
          {tooLarge.length} arquivo{tooLarge.length !== 1 ? "s" : ""} ignorado{tooLarge.length !== 1 ? "s" : ""} por exceder 20 MB:{" "}
          {tooLarge.join(", ")}
        </p>
      )}
    </div>
  )
}
