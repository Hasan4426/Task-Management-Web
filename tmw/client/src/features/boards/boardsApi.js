import { apiRequest } from '../../api/client.js'

export const listBoards = (signal) => apiRequest('/api/boards', { signal })
export const getBoard = (boardId, signal) => apiRequest(`/api/boards/${boardId}`, { signal })
export const createBoard = (body) => apiRequest('/api/boards', { method: 'POST', body })
export const updateBoard = (boardId, body) => apiRequest(`/api/boards/${boardId}`, { method: 'PATCH', body })
export const deleteBoard = (boardId) => apiRequest(`/api/boards/${boardId}`, { method: 'DELETE' })

export const listMembers = (boardId) => apiRequest(`/api/boards/${boardId}/members`)
export const removeMember = (boardId, userId) => apiRequest(`/api/boards/${boardId}/members/${userId}`, { method: 'DELETE' })
export const listBoardInvitations = (boardId) => apiRequest(`/api/boards/${boardId}/invitations`)
export const inviteToBoard = (boardId, email) => apiRequest(`/api/boards/${boardId}/invitations`, { method: 'POST', body: { email } })
export const cancelInvitation = (boardId, invitationId) =>
  apiRequest(`/api/boards/${boardId}/invitations/${invitationId}`, { method: 'DELETE' })

export const listMyInvitations = (signal) => apiRequest('/api/invitations', { signal })
export const acceptInvitation = (invitationId) => apiRequest(`/api/invitations/${invitationId}/accept`, { method: 'POST' })
export const declineInvitation = (invitationId) => apiRequest(`/api/invitations/${invitationId}/decline`, { method: 'POST' })
