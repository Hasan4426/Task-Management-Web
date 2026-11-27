import React, { useRef, useState } from 'react'
import { useAuth } from './features/auth/AuthContext.jsx'
import AuthForm from './features/auth/AuthForm.jsx'

function Account() {
  const { user, logout } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  async function handleLogout() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try { await logout() } catch (failure) { setError(failure.message) }
    finally { pending.current = false; setBusy(false) }
  }
  return <section aria-labelledby="account-heading">
    <h2 id="account-heading">Welcome, {user.name}</h2>
    <p>You are signed in.</p>
    <dl><dt>Name</dt><dd>{user.name}</dd><dt>Email</dt><dd>{user.email}</dd></dl>
    {error && <p role="alert">Logout was not confirmed. {error}</p>}
    <button disabled={busy} onClick={handleLogout}>{busy ? 'Logging out…' : error ? 'Retry logout' : 'Log out'}</button>
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
