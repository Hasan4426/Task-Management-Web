import { ApiError } from '../../errors.js'
import { publicProjection, publicUser } from '../auth/auth.user.js'

export const BACKGROUNDS = ['blue', 'orange', 'green', 'red', 'purple', 'pink', 'lime', 'sky', 'grey']
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_TITLE_LENGTH = 100

export const BOARD_CHILD_COLLECTIONS = ['boardMembers', 'boardInvitations', 'lists', 'cards', 'labels', 'comments']

function requireObject(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Send a JSON object.')
  }
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The request contains unexpected fields.')
  }
}

export function boardInput(body, { partial }) {
  requireObject(body, ['title', 'background'])
  const fields = {}
  const result = {}

  if (body.title !== undefined || !partial) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title || [...title].length > MAX_TITLE_LENGTH) {
      fields.title = `Enter a board title of 1 to ${MAX_TITLE_LENGTH} characters.`
    } else {
      result.title = title
    }
  }
  if (body.background !== undefined) {
    if (!BACKGROUNDS.includes(body.background)) {
      fields.background = 'Choose one of the available backgrounds.'
    } else {
      result.background = body.background
    }
  } else if (!partial) {
    result.background = BACKGROUNDS[0]
  }

  if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Check the submitted fields.', fields)
  if (partial && Object.keys(result).length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Send a title or a background to change.')
  }
  return result
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function invitationInput(body) {
  requireObject(body, ['email'])
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !emailPattern.test(email)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Check the submitted fields.', { email: 'Enter a valid email address.' })
  }
  return { email }
}

export function publicBoard(board, { role, memberCount } = {}) {
  return {
    id: board._id.toHexString(),
    title: board.title,
    background: board.background,
    ownerId: board.ownerId.toHexString(),
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
    ...(role === undefined ? {} : { role }),
    ...(memberCount === undefined ? {} : { memberCount }),
  }
}

export function publicInvitation(invitation, extra = {}) {
  return {
    id: invitation._id.toHexString(),
    boardId: invitation.boardId.toHexString(),
    email: invitation.email,
    status: invitation.status,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    ...extra,
  }
}

export async function loadMembers(database, boardId) {
  const memberships = await database.boardMembers.find({ boardId }).sort({ joinedAt: 1 }).toArray()
  const users = await database.users
    .find({ _id: { $in: memberships.map((m) => m.userId) } }, { projection: publicProjection })
    .toArray()
  const usersById = new Map(users.map((user) => [user._id.toHexString(), user]))

  return memberships
    .filter((m) => usersById.has(m.userId.toHexString()))
    .map((m) => ({
      ...publicUser(usersById.get(m.userId.toHexString())),
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }))
    .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0))
}
