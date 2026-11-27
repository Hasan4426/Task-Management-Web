import React, { useCallback, useEffect, useState } from 'react'
import { navigate } from '../../router.js'
import { backgroundColor } from './backgrounds.js'
import { listBoards } from './boardsApi.js'
import CreateBoardPopover from './CreateBoardPopover.jsx'

// Part 1: "Your boards" page (the first page after login).
export default function Dashboard() {
  const [state, setState] = useState({ status: 'loading', boards: [], error: '' })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async (signal) => {
    setState((previous) => ({ ...previous, status: 'loading', error: '' }))
    try {
      const { boards } = await listBoards(signal)
      setState({ status: 'ready', boards, error: '' })
    } catch (failure) {
      if (signal?.aborted) return
      setState((previous) => ({ ...previous, status: 'error', error: failure.message }))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const closeCreate = useCallback(() => setCreating(false), [])

  return <main className="dashboard">
    {/* Sama: <InvitationsList /> goes here. */}

    <section className="dashboard-section" aria-labelledby="boards-heading">
      <h2 id="boards-heading" className="section-heading">Your boards</h2>

      {state.status === 'loading' && state.boards.length === 0 && <p role="status" className="muted">Loading boards…</p>}
      {state.status === 'error' && <div role="alert" className="form-error">
        {state.error} <button className="link-button" onClick={() => void load()}>Try again</button>
      </div>}

      <ul className="board-grid">
        {state.boards.map((board) => (
          <li key={board.id}>
            <a className="board-tile" href={`#/b/${board.id}`} style={{ background: backgroundColor(board.background) }}>
              <span className="board-tile-title">{board.title}</span>
              {board.role === 'member' && <span className="board-tile-badge">Shared with you</span>}
            </a>
          </li>
        ))}
        <li className="create-tile-wrapper">
          <button className="board-tile create-tile" aria-expanded={creating} onClick={() => setCreating(true)}>
            Create new board
          </button>
          {creating && <CreateBoardPopover onClose={closeCreate} onCreated={(board) => navigate(`/b/${board.id}`)} />}
        </li>
      </ul>
    </section>
  </main>
}
