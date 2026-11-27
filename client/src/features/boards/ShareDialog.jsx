import React, { useEffect, useRef, useState } from 'react'
import Avatar from '../../components/Avatar.jsx'
import { cancelInvitation, inviteToBoard, listBoardInvitations, removeMember } from './boardsApi.js'

export default function ShareDialog({ board, members, currentUser, onMembersChanged, onLeft, onClose }) {
  const isOwner = board.role === 'owner'
  const [email, setEmail] = useState('')
  const [invitations, setInvitations] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const input = useRef(null)

  useEffect(() => {
    input.current?.focus()
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!isOwner) return
    listBoardInvitations(board.id)
      .then(({ invitations: pending }) => setInvitations(pending))
      .catch((failure) => setMessage({ type: 'error', text: failure.message }))
  }, [board.id, isOwner])

  async function handleInvite(event) {
    event.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setMessage({ type: '', text: '' })
    try {
      const { invitation } = await inviteToBoard(board.id, email.trim())
      setInvitations((list) => [invitation, ...list])
      setEmail('')
      setMessage({ type: 'success', text: `Invitation sent to ${invitation.email}.` })
    } catch (failure) {
      setMessage({ type: 'error', text: failure.fields?.email ?? failure.message })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(member) {
    const leaving = member.id === currentUser.id
    const question = leaving ? `Leave "${board.title}"?` : `Remove ${member.name} from this board?`
    if (!window.confirm(question)) return
    setMessage({ type: '', text: '' })
    try {
      await removeMember(board.id, member.id)
      if (leaving) onLeft()
      else onMembersChanged(members.filter((m) => m.id !== member.id))
    } catch (failure) {
      setMessage({ type: 'error', text: failure.message })
    }
  }

  async function handleCancel(invitation) {
    try {
      await cancelInvitation(board.id, invitation.id)
      setInvitations((list) => list.filter((i) => i.id !== invitation.id))
    } catch (failure) {
      setMessage({ type: 'error', text: failure.message })
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-header">
        <h2 id="share-title">Share board</h2>
        <button className="icon-button" aria-label="Close" onClick={onClose}>×</button>
      </div>

      {isOwner && <form className="invite-form" onSubmit={handleInvite}>
        <label className="visually-hidden" htmlFor="invite-email">Email address</label>
        <input
          id="invite-email"
          ref={input}
          type="email"
          className="text-input"
          placeholder="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button className="button primary" disabled={!email.trim() || busy}>{busy ? 'Sharing…' : 'Share'}</button>
      </form>}
      {message.text && <p role={message.type === 'error' ? 'alert' : 'status'} className={message.type === 'error' ? 'form-error' : 'form-success'}>
        {message.text}
      </p>}

      <h3 className="dialog-subheading">Board members ({members.length})</h3>
      <ul className="member-list">
        {members.map((member) => {
          const isMe = member.id === currentUser.id
          const canRemove = member.role !== 'owner' && (isOwner || isMe)
          return <li key={member.id} className="member-row">
            <Avatar name={member.name} />
            <span className="member-info">
              <strong>{member.name}{isMe && ' (you)'}</strong>
              <span className="muted">{member.email}</span>
            </span>
            <span className="role-badge">{member.role === 'owner' ? 'Admin' : 'Member'}</span>
            {canRemove && <button className="button subtle small" onClick={() => handleRemove(member)}>
              {isMe ? 'Leave' : 'Remove'}
            </button>}
          </li>
        })}
      </ul>

      {isOwner && invitations.length > 0 && <>
        <h3 className="dialog-subheading">Pending invitations</h3>
        <ul className="member-list">
          {invitations.map((invitation) => <li key={invitation.id} className="member-row">
            <Avatar name={invitation.email} />
            <span className="member-info">
              <strong>{invitation.email}</strong>
              <span className="muted">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
            </span>
            <button className="button subtle small" onClick={() => handleCancel(invitation)}>Cancel</button>
          </li>)}
        </ul>
      </>}
    </div>
  </div>
}
