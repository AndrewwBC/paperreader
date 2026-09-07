import { useState } from 'react'
import styles from './AuthGate.module.css'

export function EmailVerification({ token, onBack }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível confirmar seu e-mail.')
      setDone(true)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return <section className={styles.panel} aria-labelledby="verification-title">
    <header className={styles.panelHeader}>
      <h1 id="verification-title">{done ? 'E-mail confirmado' : 'Confirme seu e-mail'}</h1>
      <p className={styles.help}>{done ? 'Seu endereço foi confirmado. Você já pode voltar à sua biblioteca.' : 'Confirme que este endereço de e-mail pertence a você. O link é válido por 24 horas.'}</p>
    </header>
    <div className={styles.form}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!done && !error && <button className={styles.submit} disabled={busy} onClick={confirm}>{busy ? 'Confirmando…' : 'Confirmar meu e-mail'}</button>}
      {error && <p className={styles.help}>Entre na sua conta e solicite um novo link em Gerenciar conta → Perfil.</p>}
      <button className={styles.secondaryAction} disabled={busy} onClick={onBack}>{done ? 'Ir para a biblioteca' : 'Voltar para entrar'}</button>
    </div>
  </section>
}

export function EmailStatus({ user }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  async function resend() {
    setBusy(true)
    setMessage('')
    setError(false)
    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o link.')
      setMessage(data.message)
    } catch (e) { setError(true); setMessage(e.message) }
    finally { setBusy(false) }
  }
  return <section className={styles.emailStatus} aria-label="Confirmação de e-mail">
    <strong>{user.emailVerified ? 'E-mail confirmado' : 'Confirmação de e-mail pendente'}</strong>
    {!user.emailVerified && <>
      <p>Confirme o endereço {user.email} pelo link enviado por e-mail. Você pode continuar usando a biblioteca.</p>
      <button type="button" className={styles.secondaryAction} disabled={busy} onClick={resend}>{busy ? 'Enviando…' : 'Reenviar confirmação'}</button>
    </>}
    {message && <p role="status" className={error ? styles.accountError : styles.accountSuccess}>{message}</p>}
  </section>
}
