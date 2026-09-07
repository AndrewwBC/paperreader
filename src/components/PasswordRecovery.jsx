import { useState } from 'react'
import styles from './AuthGate.module.css'

export function PasswordRecovery({ token, onBack }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (token && password !== confirmPassword) { setError('As senhas não conferem.'); return }
    setBusy(true)
    try {
      const response = await fetch(`/api/auth/${token ? 'reset-password' : 'forgot-password'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token, password, confirmPassword } : { email }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.')
      setMessage(token ? 'Senha atualizada. Entre novamente com sua nova senha.' : data.message)
      setDone(true)
      setPassword('')
      setConfirmPassword('')
      if (token) window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return <section className={styles.panel} aria-labelledby="recovery-title">
    <header className={styles.panelHeader}>
      <h1 id="recovery-title">{token ? 'Crie uma nova senha' : 'Recupere seu acesso'}</h1>
      <p className={styles.help}>{token ? 'Use de 8 a 128 caracteres. O link é válido por uma hora.' : 'Informe o e-mail da sua conta para receber um link de recuperação.'}</p>
    </header>
    <form className={styles.form} onSubmit={submit}>
      {!done && (token ? <>
        <label><span>Nova senha</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label><span>Confirme a nova senha</span><input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
        <button type="button" className={styles.textAction} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Ocultar senhas' : 'Mostrar senhas'}</button>
      </> : <label><span>E-mail</span><input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></label>)}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.accountSuccess} role="status">{message}</p>}
      {!done && <button type="submit" className={styles.submit} disabled={busy}>{busy ? 'Aguarde…' : token ? 'Salvar nova senha' : 'Enviar link de recuperação'}</button>}
      {done && !token && <p className={styles.help}>Confira também a pasta de spam. O link expira em uma hora.</p>}
      <button type="button" className={styles.secondaryAction} disabled={busy} onClick={onBack}>Voltar para entrar</button>
    </form>
  </section>
}
