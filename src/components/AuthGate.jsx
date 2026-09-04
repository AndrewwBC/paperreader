import { useEffect, useState } from 'react'
import styles from './AuthGate.module.css'

function AccountPanel({ user, onClose, onUserUpdated, onLogout, onDeleted }) {
  const [tab, setTab] = useState('profile')
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function readResponse(response) {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.')
    return data
  }

  async function saveProfile(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)

    try {
      const response = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, currentPassword, newPassword }),
      })
      const data = await readResponse(response)
      onUserUpdated(data.user)
      setCurrentPassword('')
      setNewPassword('')
      setMessage({ type: 'success', text: 'Conta atualizada.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)

    try {
      const response = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      await readResponse(response)
      onDeleted()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
      setBusy(false)
    }
  }

  return (
    <div className={styles.accountOverlay} onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={styles.accountPanel} role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header className={styles.accountHeader}>
          <div className={styles.accountIdentity}>
            <span className={styles.accountAvatar}>{user.name.trim().charAt(0).toUpperCase()}</span>
            <div>
              <h2 id="account-title">{user.name}</h2>
              <span>{user.email}</span>
            </div>
          </div>
          <button className={styles.iconButton} type="button" onClick={onClose} title="Fechar" aria-label="Fechar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>

        <nav className={styles.accountTabs} aria-label="Configurações da conta">
          <button
            type="button"
            className={tab === 'profile' ? styles.accountTabActive : ''}
            onClick={() => { setTab('profile'); setMessage(null) }}
          >
            Perfil
          </button>
          <button
            type="button"
            className={tab === 'account' ? styles.accountTabActive : ''}
            onClick={() => { setTab('account'); setMessage(null) }}
          >
            Conta
          </button>
        </nav>

        {tab === 'profile' ? (
          <form className={styles.accountBody} onSubmit={saveProfile}>
            <div className={styles.sectionHeading}>
              <span>Dados pessoais</span>
              <h3>Informações de acesso</h3>
            </div>
            <label className={styles.field}>
              <span>Nome</span>
              <input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={60} required />
            </label>
            <label className={styles.field}>
              <span>E-mail</span>
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required />
            </label>
            <div className={styles.passwordGrid}>
              <label className={styles.field}>
                <span>Senha atual</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Nova senha <small>opcional</small></span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                />
              </label>
            </div>
            {message && <div className={message.type === 'error' ? styles.accountError : styles.accountSuccess} role="status">{message.text}</div>}
            <footer className={styles.accountActions}>
              <button type="button" className={styles.secondaryAction} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.primaryAction} disabled={busy}>
                {busy ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </footer>
          </form>
        ) : (
          <div className={styles.accountBody}>
            <section className={styles.accountSection}>
              <div>
                <h3>Sessão atual</h3>
                <p>Conta criada em {new Date(user.createdAt).toLocaleDateString('pt-BR')}.</p>
              </div>
              <button type="button" className={styles.secondaryAction} onClick={onLogout}>Sair</button>
            </section>

            <section className={styles.dangerSection}>
              <div>
                <h3>Excluir conta</h3>
                <p>A conta só pode ser excluída depois que todos os estudos forem removidos.</p>
              </div>
              <form onSubmit={deleteAccount}>
                <label className={styles.field}>
                  <span>Confirme sua senha</span>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={event => setDeletePassword(event.target.value)}
                    autoComplete="current-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </label>
                {message && <div className={styles.accountError} role="alert">{message.text}</div>}
                <button type="submit" className={styles.deleteAction} disabled={busy}>
                  {busy ? 'Excluindo...' : 'Excluir conta'}
                </button>
              </form>
            </section>
          </div>
        )}
      </section>
    </div>
  )
}

export function AuthGate({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAccount, setShowAccount] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('theme') === 'dark' ? 'dark' : 'light',
    )

    fetch('/api/auth/me')
      .then(async response => {
        const data = await response.json()
        if (response.ok) {
          setUser(data.user)
        } else if (data.setupRequired) {
          setMode('register')
        }
      })
      .catch(() => setError('Não foi possível conectar ao servidor.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handleExpiredSession() {
      setShowAccount(false)
      setUser(null)
      setMode('login')
      setError('Sua sessão expirou. Entre novamente.')
    }

    window.addEventListener('paper-vault-auth-expired', handleExpiredSession)
    return () => window.removeEventListener('paper-vault-auth-expired', handleExpiredSession)
  }, [])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register' ? { name, email, password } : { email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.')
      setUser(data.user)
      setPassword('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
      setShowAccount(false)
      setMode('login')
      setPassword('')
    }
  }

  function selectMode(nextMode) {
    setMode(nextMode)
    setError('')
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.mark} aria-hidden="true">&#9964;</span>
        <span>Carregando biblioteca...</span>
      </div>
    )
  }

  if (user) {
    return (
      <>
        {children(user, () => setShowAccount(true))}
        {showAccount && (
          <AccountPanel
            user={user}
            onClose={() => setShowAccount(false)}
            onUserUpdated={setUser}
            onLogout={logout}
            onDeleted={() => {
              setShowAccount(false)
              setUser(null)
              setMode('register')
            }}
          />
        )}
      </>
    )
  }

  return (
    <main className={styles.page}>
      <header className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">&#9964;</span>
        <div>
          <strong>Paper Vault</strong>
          <span>Biblioteca de pesquisa</span>
        </div>
      </header>

      <section className={styles.panel} aria-labelledby="auth-title">
        <div className={styles.modeSwitch} aria-label="Acesso">
          <button
            type="button"
            className={mode === 'login' ? styles.modeActive : ''}
            onClick={() => selectMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={mode === 'register' ? styles.modeActive : ''}
            onClick={() => selectMode('register')}
          >
            Criar conta
          </button>
        </div>

        <header className={styles.panelHeader}>
          <span>{mode === 'register' ? 'Nova conta' : 'Acesso'}</span>
          <h1 id="auth-title">{mode === 'register' ? 'Crie sua biblioteca' : 'Entre na sua biblioteca'}</h1>
        </header>

        <form className={styles.form} onSubmit={submit}>
          {mode === 'register' && (
            <label>
              <span>Nome</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                autoComplete="name"
                minLength={2}
                maxLength={60}
                required
                autoFocus
              />
            </label>
          )}
          <label>
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              maxLength={254}
              required
              autoFocus={mode === 'login'}
            />
          </label>
          <label>
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              required
            />
          </label>

          {error && <div className={styles.error} role="alert">{error}</div>}

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? 'Aguarde...' : mode === 'register' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}
