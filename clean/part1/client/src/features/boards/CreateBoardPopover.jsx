import React, { useEffect, useRef, useState } from 'react'
import { BACKGROUNDS } from './backgrounds.js'
import { createBoard } from './boardsApi.js'

export default function CreateBoardPopover({ onCreated, onClose }) {
  const [title, setTitle] = useState('')
  const [background, setBackground] = useState('blue')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)

  useEffect(() => {
    input.current?.focus()
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const { board } = await createBoard({ title: title.trim(), background })
      onCreated(board)
    } catch (failure) {
      setError(failure.fields?.title ?? failure.message)
      setBusy(false)
    }
  }

  return <div className="popover create-board-popover" role="dialog" aria-label="Create board">
    <div className="popover-header">
      <p className="popover-title">Create board</p>
      <button className="icon-button" aria-label="Close" onClick={onClose}>×</button>
    </div>
    <div className="board-preview" style={{ background: BACKGROUNDS[background] }}>
      <div className="board-preview-lists" aria-hidden="true"><span /><span /><span /></div>
    </div>
    <form onSubmit={handleSubmit}>
      <fieldset className="background-picker">
        <legend>Background</legend>
        {Object.entries(BACKGROUNDS).map(([name, color]) => (
          <button
            key={name}
            type="button"
            className={'swatch' + (name === background ? ' selected' : '')}
            style={{ background: color }}
            aria-label={name}
            aria-pressed={name === background}
            onClick={() => setBackground(name)}
          />
        ))}
      </fieldset>
      <label className="field-label" htmlFor="board-title">Board title <span className="required">*</span></label>
      <input
        id="board-title"
        ref={input}
        className="text-input"
        value={title}
        maxLength={100}
        onChange={(event) => setTitle(event.target.value)}
        aria-invalid={Boolean(error)}
      />
      {!title.trim() && <p className="hint">👋 Board title is required</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button primary full" disabled={!title.trim() || busy}>{busy ? 'Creating…' : 'Create'}</button>
    </form>
  </div>
}
