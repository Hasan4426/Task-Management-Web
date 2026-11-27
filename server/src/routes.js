import { createBoardsRouter } from './features/boards/boards.routes.js'

export function registerRoutes(app) {
  const { database, requireAuth } = app.locals
  const deps = { database, requireAuth }

  app.use('/api/boards', createBoardsRouter(deps))
}
