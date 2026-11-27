// Part 2: invitations and members.
//
// Mounted at /api/boards/:boardId
//   GET    /members                      list members                       (members)
//   DELETE /members/:userId              owner removes a member, or a member leaves
//   GET    /invitations                  pending invitations of the board   (owner)
//   POST   /invitations                  invite someone by email            (owner)
//   DELETE /invitations/:invitationId    cancel a pending invitation        (owner)
//
// Mounted at /api/invitations
//   GET    /                             my pending invitations
//   POST   /:invitationId/accept         join the board
//   POST   /:invitationId/decline        refuse the invitation
import { Router } from 'express'
import { MongoServerError, ObjectId } from 'mongodb'
import { ApiError } from '../../errors.js'
import { isBoardOwner, parseObjectId, requireBoardMember, requireBoardOwner } from '../../middleware/boardAccess.js'
import { readJson, requireJson } from '../../middleware/json.js'
import { INVITATION_TTL_MS, invitationInput, loadMembers, publicBoard, publicInvitation } from './boards.shared.js'

const isDuplicateKey = (error) => error instanceof MongoServerError && error.code === 11000

function invitationNotFound() {
  return new ApiError(404, 'INVITATION_NOT_FOUND', 'This invitation is no longer available.')
}

export function createBoardMembersRouter({ database, requireAuth }) {
  const router = Router({ mergeParams: true }) // mergeParams gives us req.params.boardId from the mount path
  const { db, users, boardMembers, boardInvitations } = database
  const member = [...requireAuth, requireBoardMember]
  const owner = [...member, requireBoardOwner]

  router.get('/members', member, async (req, res) => {
    res.json({ members: await loadMembers(database, req.board._id) })
  })

  router.delete('/members/:userId', member, async (req, res) => {
    const boardId = req.board._id
    const target = parseObjectId(req.params.userId, new ApiError(404, 'MEMBER_NOT_FOUND', 'This member was not found.'))
    const leavingMyself = target.equals(new ObjectId(req.user.id))

    if (target.equals(req.board.ownerId)) {
      throw new ApiError(400, 'OWNER_CANNOT_LEAVE', 'The owner cannot be removed. Delete the board instead.')
    }
    if (!leavingMyself && !isBoardOwner(req.board, req.user.id)) {
      throw new ApiError(403, 'OWNER_ONLY', 'Only the board owner can do this.')
    }

    const result = await boardMembers.deleteOne({ boardId, userId: target })
    if (result.deletedCount === 0) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'This member was not found.')

    // Team decision: a removed member is unassigned from this board's cards.
    // Agree the field name (assigneeIds) with Batch C.
    await db.collection('cards').updateMany({ boardId, assigneeIds: target }, { $pull: { assigneeIds: target } })
    res.status(204).end()
  })

  router.get('/invitations', owner, async (req, res) => {
    const invitations = await boardInvitations
      .find({ boardId: req.board._id, status: 'pending', expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .toArray()
    res.json({ invitations: invitations.map((inv) => publicInvitation(inv)) })
  })

  router.post('/invitations', owner, requireJson, readJson, async (req, res) => {
    const { email } = invitationInput(req.body)
    const boardId = req.board._id
    const now = new Date()

    // If this email already has an account and is a member, there is nothing to invite.
    const existingUser = await users.findOne({ email }, { projection: { _id: 1 } })
    if (existingUser && await boardMembers.findOne({ boardId, userId: existingUser._id })) {
      throw new ApiError(409, 'ALREADY_MEMBER', 'This person is already a member of the board.', { email: 'Already a member.' })
    }

    // An old pending invitation that expired should not block a new one.
    await boardInvitations.updateMany(
      { boardId, email, status: 'pending', expiresAt: { $lte: now } },
      { $set: { status: 'expired' } },
    )

    const invitation = {
      _id: new ObjectId(),
      boardId,
      email,
      invitedBy: new ObjectId(req.user.id),
      status: 'pending',
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    }
    try {
      await boardInvitations.insertOne(invitation)
    } catch (error) {
      // The unique index allows only one pending invitation per email per board,
      // even if the owner clicks "Invite" twice at the same time.
      if (isDuplicateKey(error)) {
        throw new ApiError(409, 'ALREADY_INVITED', 'This person already has a pending invitation.', { email: 'Already invited.' })
      }
      throw error
    }
    res.status(201).json({ invitation: publicInvitation(invitation) })
  })

  router.delete('/invitations/:invitationId', owner, async (req, res) => {
    const invitationId = parseObjectId(req.params.invitationId, invitationNotFound())
    const result = await boardInvitations.updateOne(
      { _id: invitationId, boardId: req.board._id, status: 'pending' },
      { $set: { status: 'revoked', respondedAt: new Date() } },
    )
    if (result.matchedCount === 0) throw invitationNotFound()
    res.status(204).end()
  })

  return router
}

export function createInvitationsRouter({ database, requireAuth }) {
  const router = Router()
  const { boards, users, boardMembers, boardInvitations } = database

  router.get('/', requireAuth, async (req, res) => {
    const invitations = await boardInvitations
      .find({ email: req.user.email, status: 'pending', expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()

    const [boardDocs, inviters] = await Promise.all([
      boards.find({ _id: { $in: invitations.map((inv) => inv.boardId) } }).toArray(),
      users.find({ _id: { $in: invitations.map((inv) => inv.invitedBy) } }, { projection: { name: 1 } }).toArray(),
    ])
    const boardsById = new Map(boardDocs.map((b) => [b._id.toHexString(), b]))
    const namesById = new Map(inviters.map((u) => [u._id.toHexString(), u.name]))

    res.json({
      invitations: invitations
        .filter((inv) => boardsById.has(inv.boardId.toHexString()))
        .map((inv) => {
          const board = boardsById.get(inv.boardId.toHexString())
          return publicInvitation(inv, {
            board: { id: board._id.toHexString(), title: board.title, background: board.background },
            invitedBy: { id: inv.invitedBy.toHexString(), name: namesById.get(inv.invitedBy.toHexString()) ?? 'Unknown' },
          })
        }),
    })
  })

  router.post('/:invitationId/accept', requireAuth, async (req, res) => {
    const invitationId = parseObjectId(req.params.invitationId, invitationNotFound())
    const now = new Date()

    // Atomic "claim": only one request can move this invitation from pending to accepted.
    // Matching on email means nobody can accept an invitation sent to someone else.
    const invitation = await boardInvitations.findOneAndUpdate(
      { _id: invitationId, email: req.user.email, status: 'pending', expiresAt: { $gt: now } },
      { $set: { status: 'accepted', respondedAt: now } },
      { returnDocument: 'after' },
    )
    if (!invitation) throw invitationNotFound()

    const board = await boards.findOne({ _id: invitation.boardId })
    if (!board) throw new ApiError(404, 'BOARD_NOT_FOUND', 'This board no longer exists.')

    const userId = new ObjectId(req.user.id)
    try {
      await boardMembers.insertOne({ boardId: board._id, userId, role: 'member', joinedAt: now })
    } catch (error) {
      // Already a member (for example two invitations) is fine; anything else rolls the invitation back.
      if (!isDuplicateKey(error)) {
        await boardInvitations.updateOne({ _id: invitation._id }, { $set: { status: 'pending' }, $unset: { respondedAt: '' } })
          .catch(() => {})
        throw error
      }
    }

    // If the board was deleted while we were joining, remove the orphan membership.
    if (!await boards.findOne({ _id: board._id }, { projection: { _id: 1 } })) {
      await boardMembers.deleteOne({ boardId: board._id, userId })
      throw new ApiError(404, 'BOARD_NOT_FOUND', 'This board no longer exists.')
    }
    res.json({ board: publicBoard(board, { role: 'member' }) })
  })

  router.post('/:invitationId/decline', requireAuth, async (req, res) => {
    const invitationId = parseObjectId(req.params.invitationId, invitationNotFound())
    const result = await boardInvitations.updateOne(
      { _id: invitationId, email: req.user.email, status: 'pending' },
      { $set: { status: 'declined', respondedAt: new Date() } },
    )
    if (result.matchedCount === 0) throw invitationNotFound()
    res.status(204).end()
  })

  return router
}
