import { apiRequest } from '../../api/client.js'

export const listBoards = (signal) => apiRequest('/api/boards', { signal })
export const getBoard = (boardId, signal) => apiRequest(`/api/boards/${boardId}`, { signal })
export const createBoard = (body) => apiRequest('/api/boards', { method: 'POST', body })
export const updateBoard = (boardId, body) => apiRequest(`/api/boards/${boardId}`, { method: 'PATCH', body })
export const deleteBoard = (boardId) => apiRequest(`/api/boards/${boardId}`, { method: 'DELETE' })

