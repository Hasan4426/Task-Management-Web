// Part 1: board CRUD.
//   POST   /api/boards            create a board (creator becomes owner)
//   GET    /api/boards            list boards I am a member of (paginated)
//   GET    /api/boards/:boardId   one board + its members        (members only)
//   PATCH  /api/boards/:boardId   rename / change background     (members only)
//   DELETE /api/boards/:boardId   delete board and its data      (owner only)
import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { ApiError } from '../../errors.js'
import { requireBoardMember, requireBoardOwner } from '../../middleware/boardAccess.js'
import { readJson, requireJson } from '../../middleware/json.js'
import { BOARD_CHILD_COLLECTIONS, boardInput, loadMembers, publicBoard } from './boards.shared.js'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

function pagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page)
  const limit = query.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.limit)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new ApiError(400, 'VALIDATION_ERROR', `page must be 1 or more and limit must be 1 to ${MAX_PAGE_SIZE}.`)
  }
  return { page, limit }
}

export function createBoardsRouter({ database, requireAuth }) {
  const router = Router()
  const { db, boards, boardMembers } = database
  const member = [...requireAuth, requireBoardMember]
  const owner = [...member, requireBoardOwner]

  router.post('/', requireAuth, requireJson, readJson, async (req, res) => {
    const { title, background } = boardInput(req.body, { partial: false })
    const now = new Date()
    const ownerId = new ObjectId(req.user.id)
    const board = { _id: new ObjectId(), title, background, ownerId, createdAt: now, updatedAt: now }

    await boards.insertOne(board)
    try {
      await boardMembers.insertOne({ boardId: board._id, userId: ownerId, role: 'owner', joinedAt: now })
    } catch (error) {
      // Without a transaction we undo the first write ourselves so no board is left without an owner.
      await boards.deleteOne({ _id: board._id }).catch(() => {})
      throw error
    }
    res.status(201).json({ board: publicBoard(board, { role: 'owner', memberCount: 1 }) })
  })

  router.get('/', requireAuth, async (req, res) => {
    const { page, limit } = pagination(req.query)
    const userId = new ObjectId(req.user.id)

    // Read one extra membership to know whether another page exists.
    const memberships = await boardMembers.find({ userId })
      .sort({ joinedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .toArray()
    const hasMore = memberships.length > limit
    const pageMemberships = memberships.slice(0, limit)
    const boardIds = pageMemberships.map((m) => m.boardId)

    const [boardDocs, counts] = await Promise.all([
      boards.find({ _id: { $in: boardIds } }).toArray(),
      boardMembers.aggregate([
        { $match: { boardId: { $in: boardIds } } },
        { $group: { _id: '$boardId', count: { $sum: 1 } } },
      ]).toArray(),
    ])
    const boardsById = new Map(boardDocs.map((b) => [b._id.toHexString(), b]))
    const countsById = new Map(counts.map((c) => [c._id.toHexString(), c.count]))

    const result = pageMemberships
      .filter((m) => boardsById.has(m.boardId.toHexString())) // skip a board that is being deleted
      .map((m) => publicBoard(boardsById.get(m.boardId.toHexString()), {
        role: m.role,
        memberCount: countsById.get(m.boardId.toHexString()) ?? 1,
      }))
    res.json({ boards: result, page, limit, hasMore })
  })

  router.get('/:boardId', member, async (req, res) => {
    const members = await loadMembers(database, req.board._id)
    res.json({
      board: publicBoard(req.board, { role: req.membership.role, memberCount: members.length }),
      members,
    })
  })

  router.patch('/:boardId', member, requireJson, readJson, async (req, res) => {
    const changes = boardInput(req.body, { partial: true })
    const board = await boards.findOneAndUpdate(
      { _id: req.board._id },
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!board) throw new ApiError(404, 'BOARD_NOT_FOUND', 'This board does not exist or you do not have access to it.')
    res.json({ board: publicBoard(board, { role: req.membership.role }) })
  })

  router.delete('/:boardId', owner, async (req, res) => {
    const boardId = req.board._id
    // Delete the board first: requireBoardMember checks the board exists,
    // so access is blocked immediately even while the cleanup below runs.
    await boards.deleteOne({ _id: boardId })
    await Promise.all(BOARD_CHILD_COLLECTIONS.map((name) => db.collection(name).deleteMany({ boardId })))
    res.status(204).end()
  })

  return router
}
