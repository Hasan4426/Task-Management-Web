import express from 'express'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import cors from 'cors'
import helmet from 'helmet'
import { createAuthRouter, requireAuth } from './auth.js'
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from './config.js'
import { ApiError, logFailure, sendError } from './errors.js'

const bodyErrors = new Map([
  ['entity.parse.failed', new ApiError(400, 'INVALID_JSON', 'The request body contains invalid JSON.')],
  ['entity.too.large', new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.')],
  ['encoding.unsupported', new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The request encoding is unsupported.')],
  ['charset.unsupported', new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The request charset is unsupported.')],
  ['request.size.invalid', new ApiError(400, 'INVALID_JSON', 'The request body is incomplete.')],
  ['request.aborted', new ApiError(400, 'INVALID_JSON', 'The request body is incomplete.')],
])

export function createApp({ config, database, logger = console, registerRoutes }) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy)
  app.locals.database = database

  const store = MongoStore.create({
    client: database.client,
    dbName: config.mongodbDb,
    collectionName: 'sessions',
    ttl: SESSION_TTL_MS / 1000,
    autoRemove: 'disabled', // Startup creates the TTL index before accepting requests.
  })
  // A read must never extend the expiry of an absolute-lifetime session.
  store.touch = undefined
  const loadSession = session({
    name: SESSION_COOKIE_NAME,
    secret: config.sessionSecret,
    store,
    saveUninitialized: false,
    resave: false,
    cookie: { ...config.cookie, maxAge: SESSION_TTL_MS },
  })
  app.locals.requireAuth = [loadSession, requireAuth]

  app.use(helmet({ strictTransportSecurity: config.production ? undefined : false }))
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    res.vary('Origin')
    const origin = req.get('Origin')
    if (origin !== undefined && !config.allowedOrigins.has(origin)) {
      throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.')
    }
    next()
  })
  app.use('/api', cors({
    origin: (origin, callback) => callback(null, config.allowedOrigins.has(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy'],
  }))

  app.get('/api/health', async (_req, res) => {
    try {
      await database.db.command({ ping: 1 })
      res.json({ status: 'ok' })
    } catch (error) {
      logFailure(logger, 'readiness_failed', error)
      sendError(res, new ApiError(503, 'SERVICE_UNAVAILABLE', 'Service is temporarily unavailable.'))
    }
  })

  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
        throw new ApiError(403, 'CSRF_REQUIRED', 'The required request header is missing or invalid.')
      }
      if (config.cookie.secure && !req.secure) {
        throw new ApiError(403, 'HTTPS_REQUIRED', 'Use HTTPS for authentication.')
      }
    }
    next()
  })
  app.use('/api/auth', createAuthRouter({ config, database, loadSession, logger }))
  registerRoutes?.(app)

  app.use((_req, res) => sendError(res, new ApiError(404, 'NOT_FOUND', 'The requested endpoint was not found.')))
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error)
    if (error instanceof ApiError) return sendError(res, error)
    if (bodyErrors.has(error.type)) return sendError(res, bodyErrors.get(error.type))
    logFailure(logger, 'request_failed', error)
    return sendError(res, new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.'))
  })
  return app
}
