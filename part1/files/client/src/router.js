import { useEffect, useState } from 'react'

// A tiny hash router so we don't need an extra package yet:
//   #/            -> dashboard
//   #/b/<boardId> -> board page
// If the team adds react-router later, only this file and App.jsx need to change.
function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/'
}

export function navigate(path) {
  window.location.hash = path
}

export function useRoute() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const update = () => setPath(currentPath())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  const board = path.match(/^\/b\/([a-f0-9]{24})$/)
  if (board) return { name: 'board', boardId: board[1] }
  return { name: 'dashboard' }
}
