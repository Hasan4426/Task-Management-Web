import React from 'react'
import { useAuth } from './features/auth/AuthContext.jsx'
import AuthForm from './features/auth/AuthForm.jsx'
import AppHeader from './components/AppHeader.jsx'
import Dashboard from './features/boards/Dashboard.jsx'
import BoardPage from './features/boards/BoardPage.jsx'
import { useRoute } from './router.js'

// Signed-in part of the app: top bar + the page for the current URL.
function SignedInApp() {
  const route = useRoute()
  return <div className="app-shell">
    <AppHeader />
    {route.name === 'board' ? <BoardPage key={route.boardId} boardId={route.boardId} /> : <Dashboard />}
  </div>
}

export default function App() {
  const { status, error, restore } = useAuth()
  if (status === 'authenticated') return <SignedInApp />

  return <main className="auth-page">
    <h1>Task Management</h1>
    {status === 'loading' && <p role="status">Checking your session…</p>}
    {status === 'unavailable' && <section>
      <h2>Unable to check your session</h2>
      <p role="alert">{error}</p>
      <button onClick={() => void restore()}>Retry</button>
    </section>}
    {status === 'anonymous' && <AuthForm />}
  </main>
}
