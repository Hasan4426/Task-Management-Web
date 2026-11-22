import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { inspect } from 'node:util'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { connectDatabase } from '../src/database.js'

const dbName = 'auth_test_qa_' + randomBytes(12).toString('hex')
const origin = 'http://localhost:5173'
const password = ' a test passphrase with padding '
const env = {
  NODE_ENV: 'test',
  MONGODB_URI: process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017',
  MONGODB_DB: dbName,
  SESSION_SECRET: randomBytes(32).toString('hex'),
  ALLOWED_ORIGINS: origin,
}
const config = loadConfig(env)
const logger = { error() {} }
let database

before(async () => {
  database = await connectDatabase(config)
})

after(async () => {
  if (!database) return

  try {
    assert.match(database.db.databaseName, /^auth_test_qa_[a-f0-9]{24}$/)
    assert.equal(database.db.databaseName, dbName)
    await database.db.dropDatabase()
  } finally {
    await database.client.close()
  }
})

function newApp() {
  return createApp({ config, database, logger })
}

function account() {
  return {
    email: randomBytes(8).toString('hex') + '@example.test',
    name: 'QA Test',
    password,
  }
}

function post(app, endpoint) {
  return request(app).post('/api/auth/' + endpoint)
    .set('X-Requested-With', 'XMLHttpRequest')
}

function me(app, cookie) {
  const call = request(app).get('/api/auth/me')
  return cookie ? call.set('Cookie', cookie) : call
}

function sessionCookie(response) {
  const cookie = response.headers['set-cookie']?.find(value => value.startsWith('sid='))
  assert.ok(cookie, 'response should set sid')
  return cookie.split(';')[0]
}

async function sessionsFor(userId) {
  const sessions = await database.db.collection('sessions').find({}).toArray()
  return sessions.filter(document => JSON.parse(document.session).userId === userId)
}

function publicUser(response, details) {
  assert.deepEqual(Object.keys(response.body), ['user'])
  const { user } = response.body
  assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'email', 'id', 'name'])
  assert.equal(user.email, details.email)
  assert.equal(user.name, details.name)
  assert.ok(typeof user.id === 'string' && user.id.length > 0)
  assert.equal(new Date(user.createdAt).toISOString(), user.createdAt)
  assert.match(response.headers['cache-control'], /\bno-store\b/i)
  return user
}

function publicError(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.body))
  assert.deepEqual(Object.keys(response.body), ['error'])
  assert.ok(Object.keys(response.body.error).every(key => ['code', 'message', 'fields'].includes(key)))
  if (code) assert.equal(response.body.error.code, code)
  assert.equal(typeof response.body.error.code, 'string')
  assert.equal(typeof response.body.error.message, 'string')
}

test('register returns a public user and persists an HttpOnly session across app and database client recreation', async () => {
  const app = newApp()
  const details = account()
  publicError(await me(app), 401, 'UNAUTHENTICATED')
  const registered = await post(app, 'register').send({
    ...details,
    name: '  ' + details.name + ' ',
    email: ' ' + details.email.toUpperCase() + ' ',
  }).expect(201)

  const user = publicUser(registered, details)
  const cookie = sessionCookie(registered)
  assert.match(registered.headers['set-cookie'][0], /; HttpOnly(?:;|$)/i)
  assert.match(registered.headers['set-cookie'][0], /; SameSite=Lax(?:;|$)/i)
  assert.match(registered.headers['set-cookie'][0], /; Path=\/(?:;|$)/i)
  assert.ok(!registered.text.includes(cookie.slice('sid='.length)))

  const stored = await database.users.findOne({ email: details.email })
  assert.match(stored.passwordHash, /^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/)
  assert.ok(!JSON.stringify(stored).includes(password))

  const [initialSession] = await sessionsFor(user.id)
  const expectedLifetime = 7 * 24 * 60 * 60 * 1000
  const { expiresAt } = JSON.parse(initialSession.session)
  assert.ok(expiresAt <= Date.now() + expectedLifetime)
  assert.ok(expiresAt >= Date.now() + expectedLifetime - 5000)

  const reopened = await connectDatabase(config)
  try {
    const freshApp = createApp({ config, database: reopened, logger })
    assert.deepEqual(publicUser(await me(freshApp, cookie).expect(200), details), user)
    const [restoredSession] = await sessionsFor(user.id)
    assert.deepEqual(restoredSession, initialSession)
  } finally {
    await reopened.client.close()
  }
})

test('login has a generic credential error and preserves exact password whitespace', async () => {
  const app = newApp()
  const details = account()
  await post(app, 'register').send(details).expect(201)
  const wrongPassword = await post(app, 'login').send({
    email: details.email,
    password: details.password.trim(),
  })
  const missingAccount = await post(app, 'login').send({
    email: account().email,
    password: details.password,
  })

  publicError(wrongPassword, 401, 'INVALID_CREDENTIALS')
  publicError(missingAccount, 401, 'INVALID_CREDENTIALS')
  assert.deepEqual(wrongPassword.body, missingAccount.body)
  assert.equal(wrongPassword.headers['set-cookie'], undefined)
  assert.equal(missingAccount.headers['set-cookie'], undefined)

  const loggedIn = await post(app, 'login').send({
    email: ' ' + details.email.toUpperCase() + ' ',
    password: details.password,
  }).expect(200)
  publicUser(loggedIn, details)
  sessionCookie(loggedIn)
})

test('same-device login rotates the session and logout preserves a separate device session', async () => {
  const app = newApp()
  const details = account()
  const credentials = { email: details.email, password: details.password }
  const first = sessionCookie(await post(app, 'register').send(details).expect(201))
  const second = sessionCookie(await post(app, 'login').send(credentials).expect(200))
  const rotated = sessionCookie(await post(app, 'login')
    .set('Cookie', first)
    .send(credentials)
    .expect(200))

  assert.equal(new Set([first, second, rotated]).size, 3)
  publicError(await me(app, first), 401, 'UNAUTHENTICATED')
  await me(app, rotated).expect(200)
  await me(app, second).expect(200)

  const logout = await post(app, 'logout').set('Cookie', rotated).expect(204)
  assert.equal(sessionCookie(logout), 'sid=')
  assert.match(logout.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970|Max-Age=0/i)
  publicError(await me(app, rotated), 401, 'UNAUTHENTICATED')
  await me(app, second).expect(200)
  await post(app, 'logout').set('Cookie', rotated).expect(204)
  await post(app, 'logout').expect(204)
})

test('tampered, expired and deleted-user sessions are rejected', async () => {
  const app = newApp()
  const details = account()
  const response = await post(app, 'register').send(details).expect(201)
  const cookie = sessionCookie(response)
  const userId = response.body.user.id
  const sessionCollection = database.db.collection('sessions')
  publicError(await me(app, cookie + 'a'), 401, 'UNAUTHENTICATED')

  const [session] = await sessionsFor(userId)
  assert.ok(session)
  assert.ok(session.expires.getTime() > Date.now())
  const expiredSession = { ...JSON.parse(session.session), expiresAt: Date.now() - 1000 }
  assert.equal((await sessionCollection.updateOne({ _id: session._id }, {
    $set: { session: JSON.stringify(expiredSession) },
  })).modifiedCount, 1)
  publicError(await me(app, cookie), 401, 'UNAUTHENTICATED')

  const fresh = await post(app, 'login').send({
    email: details.email,
    password: details.password,
  }).expect(200)
  const freshCookie = sessionCookie(fresh)
  await me(app, freshCookie).expect(200)
  assert.equal((await database.users.deleteOne({ email: details.email })).deletedCount, 1)
  publicError(await me(app, freshCookie), 401, 'UNAUTHENTICATED')
})

test('concurrent normalized registrations create precisely one account and one session', async () => {
  const app = newApp()
  const details = account()
  const variants = [
    details,
    { ...details, email: ' ' + details.email.toUpperCase() + ' ' },
  ]
  const responses = await Promise.all(variants.map(variant => post(app, 'register').send(variant)))
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409])
  const accepted = responses.find(response => response.status === 201)
  const rejected = responses.find(response => response.status === 409)
  publicError(rejected, 409, 'EMAIL_IN_USE')
  assert.equal(rejected.headers['set-cookie'], undefined)
  assert.equal(await database.users.countDocuments({ email: details.email }), 1)
  assert.equal((await sessionsFor(accepted.body.user.id)).length, 1)
  publicError(await post(app, 'register').send(details), 409, 'EMAIL_IN_USE')
})

test('JSON content type, JSON size and string-only allowlisted fields are enforced', async () => {
  const app = newApp()
  const details = account()

  publicError(await post(app, 'register').type('text/plain').send('invalid'), 415)
  publicError(await post(app, 'register').type('json').send('{"email":'), 400)
  publicError(await post(app, 'register').type('json').send('[]'), 400, 'VALIDATION_ERROR')
  publicError(await post(app, 'register').send({ ...details, name: 'x'.repeat(9 * 1024) }), 413, 'PAYLOAD_TOO_LARGE')

  const invalidPayloads = [
    { ...details, name: ['QA'] },
    { ...details, email: ['qa@example.test'] },
    { ...details, password: null },
    { ...details, password: '😀'.repeat(14) },
    { ...details, password: 'a'.repeat(129) },
    { ...details, extra: true },
  ]
  for (const payload of invalidPayloads) {
    const response = await post(newApp(), 'register').send(payload)
    publicError(response, 400)
    assert.equal(response.headers['set-cookie'], undefined)
  }

  const minimumUnicodePassword = { ...account(), password: '😀'.repeat(15) }
  const created = await post(newApp(), 'register').send(minimumUnicodePassword).expect(201)
  publicUser(created, minimumUnicodePassword)
  const nonStringLogin = await post(app, 'login').send({ email: { $ne: null }, password })
  publicError(nonStringLogin, 400)
  assert.equal(await database.users.countDocuments({ email: details.email }), 0)
})

test('CORS allows the configured origin and auth mutations enforce origin and CSRF checks', async () => {
  const app = newApp()
  const details = account()
  const preflight = await request(app).options('/api/auth/register')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'content-type,x-requested-with')
    .expect(204)
  assert.equal(preflight.headers['access-control-allow-origin'], origin)
  assert.equal(preflight.headers['access-control-allow-credentials'], 'true')
  assert.match(preflight.headers['access-control-allow-headers'], /x-requested-with/i)
  assert.match(preflight.headers.vary, /\bOrigin\b/i)

  const forbiddenOrigin = 'http://localhost.example.test:5173'
  const forbidden = await post(app, 'register').set('Origin', forbiddenOrigin).send(details)
  publicError(forbidden, 403, 'ORIGIN_NOT_ALLOWED')
  assert.equal(forbidden.headers['access-control-allow-origin'], undefined)

  const withoutHeader = await request(app).post('/api/auth/register').set('Origin', origin).send(details)
  publicError(withoutHeader, 403, 'CSRF_REQUIRED')
  const wrongHeader = await request(app).post('/api/auth/register')
    .set('Origin', origin)
    .set('X-Requested-With', 'fetch')
    .send(details)
  publicError(wrongHeader, 403, 'CSRF_REQUIRED')
  publicError(await me(app).set('Origin', forbiddenOrigin), 403, 'ORIGIN_NOT_ALLOWED')
  publicError(await request(app).put('/api/auth/register').set('X-Requested-With', 'XMLHttpRequest'),
    404, 'NOT_FOUND')
  assert.equal(await database.users.countDocuments({ email: details.email }), 0)

  const registered = await post(app, 'register').set('Origin', origin).send(details).expect(201)
  assert.equal(registered.headers['access-control-allow-origin'], origin)
  const cookie = sessionCookie(registered)
  publicError(await post(app, 'logout').set('Origin', 'null').set('Cookie', cookie),
    403, 'ORIGIN_NOT_ALLOWED')
  publicError(await request(app).post('/api/auth/logout').set('Origin', origin).set('Cookie', cookie),
    403, 'CSRF_REQUIRED')
  await me(app, cookie).expect(200)
})

test('configured login and registration attempt limits return 429 and leave health available', async () => {
  const app = newApp()
  const credentials = { email: account().email, password }
  for (let index = 0; index < 10; index++) {
    publicError(await post(app, 'login').send(credentials), 401, 'INVALID_CREDENTIALS')
  }
  const limited = await post(app, 'login').send(credentials)
  publicError(limited, 429, 'RATE_LIMITED')
  assert.ok(Number(limited.headers['retry-after']) > 0)

  for (let index = 0; index < 5; index++) {
    publicError(await post(app, 'register').send({}), 400)
  }
  publicError(await post(app, 'register').send(account()), 429, 'RATE_LIMITED')
  await request(app).get('/api/health').expect(200)
})

test('production configuration rejects insecure cookies, a short secret and a wildcard origin', () => {
  const production = { ...env, NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://ui.example.test' }
  assert.doesNotThrow(() => loadConfig(production))
  assert.throws(() => loadConfig({ ...production, SESSION_COOKIE_SECURE: 'false' }))
  assert.throws(() => loadConfig({ ...production, SESSION_SECRET: 'short' }))
  assert.throws(() => loadConfig({ ...production, SESSION_SECRET: '00'.repeat(32) }))
  assert.throws(() => loadConfig({ ...production, ALLOWED_ORIGINS: origin }))
  assert.throws(() => loadConfig({ ...production, ALLOWED_ORIGINS: '*' }))
  assert.throws(() => loadConfig({
    ...env,
    SESSION_COOKIE_SAME_SITE: 'none',
    SESSION_COOKIE_SECURE: 'false',
  }))
})

test('database method failure redacts the response and logs', async () => {
  const logs = []
  const failedDatabase = {
    ...database,
    users: {
      async findOne() {
        throw new Error('private database error fixture')
      },
    },
  }
  const app = createApp({
    config, database: failedDatabase, logger: { error: (...entries) => logs.push(...entries) },
  })
  const result = await post(app, 'login').send({ email: account().email, password })
  publicError(result, 500)
  assert.ok(!result.text.includes('private database error fixture'))
  assert.ok(!result.text.includes(password))
  assert.equal(result.headers['set-cookie'], undefined)
  assert.ok(logs.length > 0)
  assert.doesNotMatch(inspect(logs), /private database error fixture|test passphrase/)
})

test('production emits Secure, HttpOnly, SameSite=None cookies behind an explicitly trusted proxy', async () => {
  const production = loadConfig({
    ...env,
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://ui.example.test',
    TRUST_PROXY: '127.0.0.1,::1',
    SESSION_COOKIE_SAME_SITE: 'none',
  })
  const app = createApp({ config: production, database, logger })
  const details = account()
  publicError(await post(app, 'register').send(details), 403, 'HTTPS_REQUIRED')
  const accepted = await post(app, 'register')
    .set('X-Forwarded-Proto', 'https')
    .send(details)
    .expect(201)
  const [cookie] = accepted.headers['set-cookie']
  assert.match(cookie, /; Secure(?:;|$)/i)
  assert.match(cookie, /; HttpOnly(?:;|$)/i)
  assert.match(cookie, /; SameSite=None(?:;|$)/i)
  assert.ok(accepted.headers['strict-transport-security'])
})

test('readiness failure returns 503 without exposing database details', async () => {
  const unavailable = {
    ...database,
    db: {
      async command() {
        throw new Error('private readiness error fixture')
      },
    },
  }
  const app = createApp({ config, database: unavailable, logger })
  const result = await request(app).get('/api/health')
  publicError(result, 503, 'SERVICE_UNAVAILABLE')
  assert.ok(!result.text.includes('private readiness error fixture'))
})

test('a failed registration session write leaves the account available for login', async (context) => {
  const details = account()
  const sessions = database.db.collection('sessions')
  context.mock.method(sessions, 'updateOne', async () => {
    throw new Error('private session write error fixture')
  })
  const failedDatabase = {
    ...database,
    client: {
      db(name) {
        assert.equal(name, dbName)
        return {
          collection(collectionName) {
            assert.equal(collectionName, 'sessions')
            return sessions
          },
        }
      },
    },
  }
  const failedApp = createApp({ config, database: failedDatabase, logger })
  const registration = await post(failedApp, 'register').send(details)
  publicError(registration, 503, 'ACCOUNT_CREATED_LOGIN_REQUIRED')
  assert.ok(!registration.text.includes('private session write error fixture'))
  assert.equal(registration.headers['set-cookie'], undefined)
  const created = await database.users.findOne({ email: details.email })
  assert.ok(created)
  assert.equal((await sessionsFor(created._id.toHexString())).length, 0)

  const app = newApp()
  const result = await post(app, 'login').send({ email: details.email, password: details.password }).expect(200)
  await me(app, sessionCookie(result)).expect(200)
})

test('reusable authentication middleware protects a separate mounted route', async () => {
  const app = createApp({
    config,
    database,
    logger,
    registerRoutes(server) {
      server.get('/api/protected', server.locals.requireAuth, (req, res) => {
        res.json({ user: req.user })
      })
    },
  })
  const details = account()
  const send = () => request(app).get('/api/protected')
  publicError(await send(), 401, 'UNAUTHENTICATED')
  const created = await post(app, 'register').send(details).expect(201)
  const result = await send().set('Cookie', sessionCookie(created)).expect(200)
  assert.deepEqual(publicUser(result, details), created.body.user)
})
