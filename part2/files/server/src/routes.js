import { createBoardsRouter } from './features/boards/boards.routes.js'
import { createBoardMembersRouter, createInvitationsRouter } from './features/boards/invitations.routes.js'

// Every feature mounts its routes here. createApp() calls this before the 404 and error handlers.
// Batch C/D: add your routers below and reuse requireBoardMember from middleware/boardAccess.js.
export function registerRoutes(app) {
  const { database, requireAuth } = app.locals
  const deps = { database, requireAuth }

  app.use('/api/boards', createBoardsRouter(deps))
  app.use('/api/boards/:boardId', createBoardMembersRouter(deps))
  app.use('/api/invitations', createInvitationsRouter(deps))
}
