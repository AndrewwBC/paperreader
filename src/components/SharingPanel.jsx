import { useEffect, useRef, useState } from 'react'
import styles from './SharingPanel.module.css'

async function sharingRequest(path, method = 'GET', body) {
  const response = await fetch(path, {
    method, credentials: 'include', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.')
  return data
}

function Dialog({ title, onClose, children, busy = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="sharing-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header className={styles.header}><h2 id="sharing-title">{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Fechar">×</button></header>
    <div className={styles.body}>{children}</div>
  </dialog>
}

const roleLabel = role => role === 'editor' ? 'Pode editar' : role === 'owner' ? 'Proprietário' : 'Somente leitura'

export function SharingPanel({ study, onClose }) {
  const [data, setData] = useState(null)
  const [possibleUsers, setPossibleUsers] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [removal, setRemoval] = useState(null)
  const base = `/api/studies/${encodeURIComponent(study.id)}`
  useEffect(() => {
    let cancelled = false
    Promise.all([sharingRequest(`${base}/sharing`), sharingRequest(`${base}/shareable-users`)]).then(([result, users]) => { if (!cancelled) { setData(result); setPossibleUsers(users.users) } }).catch(error => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true }
  }, [base])
  async function invite(event) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await sharingRequest(`${base}/invitations`, 'POST', { email, role })
      setEmail('')
      setData(await sharingRequest(`${base}/sharing`))
      setMessage(result.message || 'Convite enviado por e-mail.')
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  async function revoke() {
    setBusy(true); setError(''); setMessage('')
    try {
      await sharingRequest(`${base}/${removal.kind}/${encodeURIComponent(removal.id)}`, 'DELETE')
      setData(await sharingRequest(`${base}/sharing`))
      setRemoval(null)
      setMessage('Acesso revogado.')
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <Dialog title="Compartilhar estudo" onClose={onClose} busy={busy}>
    <p className={styles.studyName}>{study.name}</p>
    <p>Convide uma pessoa para acessar os PDFs e as anotações deste estudo.</p>
    <form className={styles.form} onSubmit={invite}>
      <label>E-mail da pessoa<input list="shareable-users" type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /><datalist id="shareable-users">{possibleUsers.map(user => <option key={user.id} value={user.email}>{user.name}</option>)}</datalist></label><p className={styles.hint}>{possibleUsers.length ? `${possibleUsers.length} usuário(s) cadastrado(s) disponível(is) para convite.` : "Nenhum outro usuário disponível no momento."}</p>
      <label>Permissão<select value={role} onChange={event => setRole(event.target.value)} disabled={busy}><option value="viewer">Somente leitura</option><option value="editor">Pode editar</option></select></label>
      <p className={styles.possibleUsers}>{possibleUsers.length ? <>Usuários disponíveis: {possibleUsers.map(user => <button type="button" key={user.id} onClick={() => setEmail(user.email)} disabled={busy}>{user.name || user.email}</button>)}</> : null}</p><p className={styles.hint}>{role === 'editor' ? 'Pode adicionar e excluir PDFs e alterar as anotações. Só você gerencia participantes e exclui o estudo.' : 'Pode ler e baixar PDFs e consultar anotações, sem alterar o estudo.'}</p>
      <button className={styles.primary} disabled={busy || !email.trim()}>{busy ? 'Aguarde…' : 'Enviar convite'}</button>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
    {!data && !error && <p role="status">Carregando participantes…</p>}
    {data && <>
      <section className={styles.section}><h3>Pessoas com acesso</h3>
        {data.members.length ? <ul>{data.members.map(member => <li key={member.userId}><div><strong>{member.name || member.email}</strong><span>{member.email} · {roleLabel(member.role)}</span></div>{member.role !== 'owner' && <button type="button" disabled={busy} onClick={() => setRemoval({ kind: 'members', id: member.userId, email: member.email })}>Remover</button>}</li>)}</ul> : <p>Somente você tem acesso.</p>}
      </section>
      <section className={styles.section}><h3>Convites pendentes</h3>
        {data.invitations.length ? <ul>{data.invitations.map(invitation => <li key={invitation.id}><div><strong>{invitation.email}</strong><span>{roleLabel(invitation.role)} · Expira em {new Date(invitation.expiresAt).toLocaleDateString('pt-BR')}</span></div><button type="button" disabled={busy} onClick={() => setRemoval({ kind: 'invitations', id: invitation.id, email: invitation.email })}>Revogar</button></li>)}</ul> : <p>Nenhum convite pendente.</p>}
      </section>
    </>}
    {removal && <div className={styles.confirm} role="group" aria-label="Confirmar revogação"><p>Revogar o acesso de <strong>{removal.email}</strong> a este estudo?</p><div className={styles.actions}><button disabled={busy} onClick={() => setRemoval(null)}>Cancelar</button><button className={styles.danger} disabled={busy} onClick={revoke}>Revogar acesso</button></div></div>}
  </Dialog>
}

export function InvitationPanel({ token, user, onAccepted, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function accept() {
    setBusy(true); setError('')
    try {
      const result = await sharingRequest('/api/invitations/accept', 'POST', { token })
      await onAccepted(result.studyId)
    } catch (error) { setError(error.message); setBusy(false) }
  }
  return <Dialog title="Convite para um estudo" onClose={onClose} busy={busy}>
    <p>Você está conectado como <strong>{user.email}</strong>. Para aceitar, use a conta com o mesmo e-mail que recebeu o convite.</p>
    <p>Ao aceitar, o estudo aparecerá na sua biblioteca com a permissão definida pelo proprietário.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button onClick={onClose} disabled={busy}>Agora não</button><button className={styles.primary} onClick={accept} disabled={busy}>{busy ? 'Aceitando…' : 'Aceitar convite'}</button></div>
  </Dialog>
}
