import React, { useState } from 'react'
import { useAuth } from '../features/auth/AuthContext.jsx'
import Avatar from './Avatar.jsx'

export default function AppHeader() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogout() {
    if (busy) return
    setBusy(true)
    setError('')
    try { await logout() } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }

  return <header className="app-header">
    <a className="app-logo" href="#/">
      <span className="app-logo-mark" aria-hidden="true"><span /><span /></span>
      Task Management
    </a>
    <nav className="app-nav"><a href="#/">Boards</a></nav>
    <div className="app-account">
      <button className="avatar-button" aria-label="Account" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Avatar name={user.name} />
      </button>
      {open && <div className="popover account-popover" role="dialog" aria-label="Account">
        <p className="popover-title">Account</p>
        <div className="account-summary">
          <Avatar name={user.name} size="lg" />
          <div><strong>{user.name}</strong><br /><span className="muted">{user.email}</span></div>
        </div>
        {error && <p role="alert" className="form-error">Logout was not confirmed. {error}</p>}
        <button className="menu-item" disabled={busy} onClick={handleLogout}>
          {busy ? 'Logging out…' : error ? 'Retry logout' : 'Log out'}
        </button>
      </div>}
    </div>
  </header>
}
