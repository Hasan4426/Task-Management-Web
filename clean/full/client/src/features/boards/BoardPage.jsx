import React, { useCallback, useEffect, useState } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { navigate } from '../../router.js'
import { backgroundColor } from './backgrounds.js'
import { deleteBoard, getBoard, removeMember, updateBoard } from './boardsApi.js'
import ShareDialog from './ShareDialog.jsx'

export default function BoardPage({ boardId }) {
  const { user } = useAuth()
  const [state, setState] = useState({ status: 'loading', board: null, members: [], error: '' })
  const [sharing, setSharing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', board: null, members: [], error: '' })
    getBoard(boardId, controller.signal)
      .then(({ board, members }) => setState({ status: 'ready', board, members, error: '' }))
      .catch((failure) => {
        if (controller.signal.aborted) return
        setState({ status: failure.status === 404 ? 'missing' : 'error', board: null, members: [], error: failure.message })
      })
    return () => controller.abort()
  }, [boardId])

  const closeShare = useCallback(() => setSharing(false), [])

  if (state.status === 'loading') return <main className="board-page board-page-empty"><p role="status">Loading board…</p></main>
  if (state.status !== 'ready') {
    return <main className="board-page board-page-empty">
      <div className="empty-card">
        <h2>{state.status === 'missing' ? 'Board not found' : 'Something went wrong'}</h2>
        <p>{state.status === 'missing'
          ? 'This board may be private or deleted. If someone gave you a link, ask them to invite you.'
          : state.error}</p>
        <a className="button primary" href="#/">Back to boards</a>
      </div>
    </main>
  }

  const { board, members } = state
  const isOwner = board.role === 'owner'

  async function handleRename(title) {
    const trimmed = title.trim()
    if (!trimmed || trimmed === board.title) return
    const previous = board
    setState((s) => ({ ...s, board: { ...s.board, title: trimmed } }))
    try {
      const { board: saved } = await updateBoard(board.id, { title: trimmed })
      setState((s) => ({ ...s, board: { ...s.board, ...saved } }))
    } catch (failure) {
      setState((s) => ({ ...s, board: previous }))
      window.alert(failure.message)
    }
  }

  async function handleBackground(background) {
    setMenuOpen(false)
    try {
      const { board: saved } = await updateBoard(board.id, { background })
      setState((s) => ({ ...s, board: { ...s.board, ...saved } }))
    } catch (failure) { window.alert(failure.message) }
  }

  async function handleDelete() {
    setMenuOpen(false)
    if (!window.confirm(`Delete "${board.title}"? All lists, cards and comments on it will be deleted. This cannot be undone.`)) return
    try {
      await deleteBoard(board.id)
      navigate('/')
    } catch (failure) { window.alert(failure.message) }
  }

  async function handleLeave() {
    setMenuOpen(false)
    if (!window.confirm(`Leave "${board.title}"? You will lose access until you are invited again.`)) return
    try {
      await removeMember(board.id, user.id)
      navigate('/')
    } catch (failure) { window.alert(failure.message) }
  }

  return <main className="board-page" style={{ background: backgroundColor(board.background) }}>
    <div className="board-header">
      <BoardTitle title={board.title} onSave={handleRename} />
      <div className="board-header-right">
        <ul className="member-stack" aria-label="Board members">
          {members.slice(0, 5).map((member) => <li key={member.id}><Avatar name={member.name} size="sm" /></li>)}
          {members.length > 5 && <li className="avatar avatar-sm more">+{members.length - 5}</li>}
        </ul>
        <button className="button header-button share-button" onClick={() => setSharing(true)}>Share</button>
        <div className="menu-wrapper">
          <button className="button header-button" aria-label="Board menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>⋯</button>
          {menuOpen && <div className="popover board-menu" role="menu">
            <p className="popover-title">Menu</p>
            <p className="menu-label">Change background</p>
            <div className="background-picker compact">
              {['blue', 'orange', 'green', 'red', 'purple', 'pink', 'lime', 'sky', 'grey'].map((name) => (
                <button key={name} className={'swatch' + (name === board.background ? ' selected' : '')}
                  style={{ background: backgroundColor(name) }} aria-label={name} onClick={() => handleBackground(name)} />
              ))}
            </div>
            <hr />
            {isOwner
              ? <button className="menu-item danger" role="menuitem" onClick={handleDelete}>Delete board</button>
              : <button className="menu-item" role="menuitem" onClick={handleLeave}>Leave board</button>}
          </div>}
        </div>
      </div>
    </div>

    <div className="board-canvas">
      <div className="list-placeholder">
        <p>Lists and cards will appear here.</p>
      </div>
    </div>

    {sharing && <ShareDialog
      board={board}
      members={members}
      currentUser={user}
      onClose={closeShare}
      onMembersChanged={(next) => setState((s) => ({ ...s, members: next }))}
      onLeft={() => navigate('/')}
    />}
  </main>
}

function BoardTitle({ title, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  if (!editing) {
    return <h1 className="board-title">
      <button className="board-title-button" onClick={() => { setDraft(title); setEditing(true) }}>{title}</button>
    </h1>
  }
  return <input
    className="board-title-input"
    aria-label="Board title"
    value={draft}
    maxLength={100}
    autoFocus
    onFocus={(event) => event.target.select()}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => { setEditing(false); void onSave(draft) }}
    onKeyDown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur()
      if (event.key === 'Escape') { setDraft(title); setEditing(false) }
    }}
  />
}
