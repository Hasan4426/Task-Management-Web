import React, { useState } from 'react'
import { backgroundColor } from './backgrounds.js'
import { acceptInvitation, declineInvitation } from './boardsApi.js'

export default function InvitationsList({ invitations, onAccepted, onRemoved }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  if (invitations.length === 0) return null

  async function respond(invitation, accept) {
    setBusyId(invitation.id)
    setError('')
    try {
      if (accept) {
        const { board } = await acceptInvitation(invitation.id)
        onAccepted(invitation, board)
      } else {
        await declineInvitation(invitation.id)
        onRemoved(invitation)
      }
    } catch (failure) {
      setError(failure.message)
      if (failure.status === 404) onRemoved(invitation)
    } finally {
      setBusyId(null)
    }
  }

  return <section className="dashboard-section" aria-labelledby="invitations-heading">
    <h2 id="invitations-heading" className="section-heading">Invitations</h2>
    {error && <p role="alert" className="form-error">{error}</p>}
    <ul className="invitation-list">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="invitation">
          <span className="invitation-color" style={{ background: backgroundColor(invitation.board.background) }} />
          <span className="invitation-text">
            <strong>{invitation.invitedBy.name}</strong> invited you to <strong>{invitation.board.title}</strong>
          </span>
          <button className="button primary" disabled={busyId === invitation.id} onClick={() => respond(invitation, true)}>
            Accept
          </button>
          <button className="button subtle" disabled={busyId === invitation.id} onClick={() => respond(invitation, false)}>
            Decline
          </button>
        </li>
      ))}
    </ul>
  </section>
}
