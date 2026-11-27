import { apiRequest } from '../../api/client.js'

// Every call the boards feature makes to the server, in one place.
// Responses match server/src/features/boards/*.routes.js

// Part 1: boards
export const listBoards = (signal) => apiRequest('/api/boards', { signal })
export const getBoard = (boardId, signal) => apiRequest(`/api/boards/${boardId}`, { signal })
export const createBoard = (body) => apiRequest('/api/boards', { method: 'POST', body })
export const updateBoard = (boardId, body) => apiRequest(`/api/boards/${boardId}`, { method: 'PATCH', body })
export const deleteBoard = (boardId) => apiRequest(`/api/boards/${boardId}`, { method: 'DELETE' })

// Part 2 (Sama) adds members and invitations calls here.
