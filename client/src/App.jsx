import React, { useRef, useState } from 'react'
import { useAuth } from './features/auth/AuthContext.jsx'
import AuthForm from './features/auth/AuthForm.jsx'

function Account() {
  const { user, logout, updateName } = useAuth()
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState('')
  const [logoutError, setLogoutError] = useState('')
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  const pending = useRef(false)

  async function handleSave(event) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy('save')
    setSaveError(null)
    setSaved(false)
    try {
      if (await updateName(draft ?? user.name)) {
        setDraft(null)
        setSaved(true)
      }
    } catch (error) {
      setSaveError(error)
    } finally {
      pending.current = false
      setBusy('')
    }
  }

  async function handleLogout() {
    if (pending.current) return
    pending.current = true
    setBusy('logout')
    setLogoutError('')
    try { await logout() } catch (failure) { setLogoutError(failure.message) }
    finally { pending.current = false; setBusy('') }
  }

  const nameError = saveError?.fields?.name
  return <section aria-labelledby="account-heading">
    <h2 id="account-heading">Welcome, {user.name}</h2>
    <p>You are signed in.</p>
    <form onSubmit={handleSave} aria-busy={busy === 'save'}>
      <p>
        <label htmlFor="display-name">Display name</label>{' '}
        <input id="display-name" name="name" type="text" autoComplete="name" required
          value={draft ?? user.name} readOnly={Boolean(busy)}
          aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'display-name-error' : undefined}
          onChange={event => {
            setDraft(event.target.value)
            setSaveError(null)
            setSaved(false)
          }} />
      </p>
      {nameError && <p id="display-name-error" role="alert">{nameError}</p>}
      {saveError && !nameError && <p role="alert">Could not save your display name. {saveError.message}</p>}
      <button type="submit" disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save name'}</button>
    </form>
    {saved && <p role="status">Display name saved.</p>}
    <dl><dt>Email</dt><dd>{user.email}</dd></dl>
    {logoutError && <p role="alert">Logout was not confirmed. {logoutError}</p>}
    <button type="button" disabled={Boolean(busy)} onClick={handleLogout}>{busy === 'logout' ? 'Logging out…' : logoutError ? 'Retry logout' : 'Log out'}</button>
  </section>
}

export default function App() {
  const { status, error, restore } = useAuth()
  return <main>
    <h1>Task Management</h1>
    {status === 'loading' && <p role="status">Checking your session…</p>}
    {status === 'unavailable' && <section>
      <h2>Unable to check your session</h2>
      <p role="alert">{error}</p>
      <button onClick={() => void restore()}>Retry</button>
    </section>}
    {status === 'anonymous' && <AuthForm />}
    {status === 'authenticated' && <Account />}
  </main>
}
