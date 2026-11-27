import { createBoardsRouter } from './features/boards/boards.routes.js'
import { createBoardMembersRouter, createInvitationsRouter } from './features/boards/invitations.routes.js'

export function registerRoutes(app) {
  const { database, requireAuth } = app.locals
  const deps = { database, requireAuth }

  app.use('/api/boards', createBoardsRouter(deps))
  app.use('/api/boards/:boardId', createBoardMembersRouter(deps))
  app.use('/api/invitations', createInvitationsRouter(deps))
}
