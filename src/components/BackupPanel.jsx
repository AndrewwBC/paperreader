import { useState } from 'react'
import styles from './AuthGate.module.css'

export function BackupPanel() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [file, setFile] = useState(null)
  const [restored, setRestored] = useState(false)

  async function run(action) {
    setBusy(true)
    setMessage(null)
    try { await action() }
    catch (error) { setMessage({ error: true, text: error.message }) }
    finally { setBusy(false) }
  }

  async function restore() {
    if (file.size > 100 * 1024 * 1024) throw new Error('Selecione um backup de até 100 MB.')
    const response = await fetch('/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await file.text() })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Não foi possível restaurar o backup.')
    setRestored(true)
    setFile(null)
    setMessage({ text: `${data.studies} estudos e ${data.papers} PDFs restaurados. Abra a biblioteca para ver os dados.` })
  }

  return <div className={styles.accountBody}>
    <section className={styles.accountSection}>
      <div><h3>Uma cópia da sua biblioteca</h3><p>Baixe todos os estudos, PDFs, metadados e anotações em um arquivo JSON. Guarde-o em um local seguro; ele contém seus documentos.</p></div>
      <a href="/api/backup" download className={`${styles.primaryAction} ${styles.downloadAction}`}>Baixar backup completo</a>
    </section>
    <section className={styles.accountSection}>
      <div><h3>Restaurar um backup</h3><p>Os estudos serão adicionados como novas cópias. Seus dados atuais serão preservados. Importar novamente cria duplicatas. Limite: 100 MB.</p></div>
      <label className={styles.field}><span>Arquivo de backup (.json)</span><input type="file" accept=".json,application/json" disabled={busy} onChange={e => { setFile(e.target.files[0] || null); setMessage(null) }} /></label>
      <button className={styles.secondaryAction} disabled={busy || !file} onClick={() => run(restore)}>Restaurar como novos estudos</button>
    </section>
    {message && <p role="status" className={message.error ? styles.accountError : styles.accountSuccess}>{message.text}</p>}
    {restored && <button className={styles.primaryAction} onClick={() => window.location.reload()}>Abrir biblioteca atualizada</button>}
  </div>
}
