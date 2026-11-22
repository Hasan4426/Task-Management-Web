import { Router, json } from 'express'
import { rateLimit } from 'express-rate-limit'
import { MongoServerError, ObjectId } from 'mongodb'
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from './config.js'
import { ApiError, logFailure, sendError } from './errors.js'
import { hashPassword, verifyPassword } from './password.js'

const readJson = json({ limit: '8kb', inflate: false })
const publicProjection = { _id: 1, name: 1, email: 1, createdAt: 1 }
const emailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function publicUser(user) {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  }
}

function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send a JSON request body.')
  }
  next()
}

function credentials(body, register) {
  const allowed = register ? ['name', 'email', 'password'] : ['email', 'password']
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Send a JSON object.')
  }
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The request contains unexpected fields.')
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const passwordLength = [...password].length
  const fields = {}

  if (register && (!name || [...name].length > 80 || !name.isWellFormed())) {
    fields.name = 'Enter a name of 1 to 80 characters.'
  }
  if (email.length > 254 || email.indexOf('@') > 64 || !emailPattern.test(email)) {
    fields.email = 'Enter a valid email address.'
  }
  if (passwordLength < 15 || passwordLength > 128 || !password.isWellFormed()) {
    fields.password = 'Enter a password of 15 to 128 characters.'
  }
  if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Check the submitted fields.', fields)

  return { name, email, password }
}

function sessionOperation(req, operation) {
  return new Promise((resolve, reject) => {
    req.session[operation]((error) => error ? reject(error) : resolve())
  })
}

async function startSession(req, userId) {
  await sessionOperation(req, 'regenerate')
  req.session.userId = userId.toHexString()
  req.session.expiresAt = Date.now() + SESSION_TTL_MS
  try {
    await sessionOperation(req, 'save')
  } catch (error) {
    // Prevent express-session from sending a cookie for a session whose save failed.
    await sessionOperation(req, 'destroy').catch(() => {})
    throw error
  }
}

export async function requireAuth(req, res, next) {
  const { userId, expiresAt } = req.session ?? {}
  if (typeof userId !== 'string' || !/^[a-f0-9]{24}$/.test(userId)
      || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.')
  }
  const user = await req.app.locals.database.users.findOne(
    { _id: new ObjectId(userId) },
    { projection: publicProjection },
  )
  if (!user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.')
  }
  req.user = publicUser(user)
  next()
}

function authRateLimit(limit, identifier) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    identifier,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.')),
  })
}

export function createAuthRouter({ database, config, loadSession, logger }) {
  const router = Router()
  const { users } = database

  // Login and registration are rate-limited before loading sessions or parsing bodies.
  router.post('/register', authRateLimit(5, 'registration'), requireJson, readJson, loadSession, async (req, res) => {
    const { name, email, password } = credentials(req.body, true)
    const user = { _id: new ObjectId(), name, email, passwordHash: await hashPassword(password), createdAt: new Date() }
    try {
      await users.insertOne(user)
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000 && error.keyPattern?.email === 1) {
        throw new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.')
      }
      throw error
    }
    try {
      await startSession(req, user._id)
    } catch (error) {
      logFailure(logger, 'registration_session_failed', error)
      throw new ApiError(503, 'ACCOUNT_CREATED_LOGIN_REQUIRED', 'Your account was created. Sign in to continue.')
    }
    res.status(201).json({ user: publicUser(user) })
  })

  router.post('/login', authRateLimit(10, 'login'), requireJson, readJson, loadSession, async (req, res) => {
    const { email, password } = credentials(req.body, false)
    const user = await users.findOne({ email })
    if (!(await verifyPassword(password, user?.passwordHash))) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
    }
    await startSession(req, user._id)
    res.status(200).json({ user: publicUser(user) })
  })

  router.get('/me', loadSession, requireAuth, (req, res) => res.json({ user: req.user }))
  router.post('/logout', loadSession, async (req, res) => {
    if (req.session?.userId) await sessionOperation(req, 'destroy')
    res.clearCookie(SESSION_COOKIE_NAME, config.cookie)
    res.sendStatus(204)
  })

  return router
}
