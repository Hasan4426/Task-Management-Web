import { ObjectId } from 'mongodb'
import { ApiError } from '../errors.js'

// Turns a URL parameter into an ObjectId, or throws the given error if it is not a valid id.
export function parseObjectId(value, error) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) throw error
  return new ObjectId(value)
}

// Outsiders get the same 404 as a board that does not exist,
// so nobody can find out which board ids exist.
function boardNotFound() {
  return new ApiError(404, 'BOARD_NOT_FOUND', 'This board does not exist or you do not have access to it.')
}

/**
 * Use after app.locals.requireAuth on any route with a :boardId parameter.
 * Sets req.board and req.membership, or rejects with 404.
 * Batch C and D (lists, cards, comments, sockets) should reuse this.
 */
export async function requireBoardMember(req, _res, next) {
  const { boards, boardMembers } = req.app.locals.database
  const boardId = parseObjectId(req.params.boardId, boardNotFound())
  const userId = new ObjectId(req.user.id)

  const [board, membership] = await Promise.all([
    boards.findOne({ _id: boardId }),
    boardMembers.findOne({ boardId, userId }),
  ])
  if (!board || !membership) throw boardNotFound()

  req.board = board
  req.membership = membership
  next()
}

// Use after requireBoardMember. Only the owner may delete the board or manage members.
export function requireBoardOwner(req, _res, next) {
  if (!req.board.ownerId.equals(new ObjectId(req.user.id))) {
    throw new ApiError(403, 'OWNER_ONLY', 'Only the board owner can do this.')
  }
  next()
}

export function isBoardOwner(board, userId) {
  return board.ownerId.equals(new ObjectId(userId))
}
