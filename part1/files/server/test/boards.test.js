import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { ObjectId } from 'mongodb'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { connectDatabase } from '../src/database.js'
import { registerRoutes } from '../src/routes.js'

const dbName = 'boards_test_' + randomBytes(12).toString('hex')
const config = loadConfig({
  NODE_ENV: 'test',
  MONGODB_URI: process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017',
  MONGODB_DB: dbName,
  SESSION_SECRET: randomBytes(32).toString('hex'),
  ALLOWED_ORIGINS: 'http://localhost:5173',
})
let database
let app

before(async () => {
  database = await connectDatabase(config)
  app = createApp({ config, database, logger: { error() {} }, registerRoutes })
})

after(async () => {
  if (!database) return
  try {
    assert.match(database.db.databaseName, /^boards_test_[a-f0-9]{24}$/)
    await database.db.dropDatabase()
  } finally {
    await database.client.close()
  }
})

// Registers a new account and returns a small client that sends its session cookie.
// Registration uses a fresh app each time because the auth router allows only 5 sign-ups
// per app instance; sessions live in MongoDB, so the cookie still works on the shared app.
async function newUser(name = 'Test User') {
  const email = randomBytes(8).toString('hex') + '@example.test'
  const registrationApp = createApp({ config, database, logger: { error() {} } })
  const response = await request(registrationApp).post('/api/auth/register')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ name, email, password: 'a long enough test password' })
    .expect(201)
  const cookie = response.headers['set-cookie'].find((c) => c.startsWith('sid=')).split(';')[0]
  const call = (method, path) => {
    const r = request(app)[method](path).set('Cookie', cookie)
    return method === 'get' ? r : r.set('X-Requested-With', 'XMLHttpRequest')
  }
  return {
    user: response.body.user,
    email,
    get: (path) => call('get', path),
    post: (path, body) => (body === undefined ? call('post', path) : call('post', path).send(body)),
    patch: (path, body) => call('patch', path).send(body),
    delete: (path) => call('delete', path),
  }
}

function errorCode(response, status, code) {
  assert.equal(response.status, status, JSON.stringify(response.body))
  assert.equal(response.body.error.code, code)
}

// Sama's invitation endpoints are not in this part yet, so the test adds the member
// straight into the database (that is what accepting an invitation does).
async function boardWithMember() {
  const owner = await newUser('Owner')
  const member = await newUser('Member')
  const { body: { board } } = await owner.post('/api/boards', { title: 'Team board' }).expect(201)
  await database.boardMembers.insertOne({
    boardId: new ObjectId(board.id), userId: new ObjectId(member.user.id), role: 'member', joinedAt: new Date(),
  })
  return { owner, member, board }
}

test('requires sign-in', async () => {
  errorCode(await request(app).get('/api/boards'), 401, 'UNAUTHENTICATED')
})

test('creating a board makes the creator its owner', async () => {
  const owner = await newUser()
  const created = await owner.post('/api/boards', { title: '  Sprint plan  ', background: 'green' }).expect(201)
  assert.equal(created.body.board.title, 'Sprint plan')
  assert.equal(created.body.board.background, 'green')
  assert.equal(created.body.board.role, 'owner')
  assert.equal(created.body.board.ownerId, owner.user.id)

  const list = await owner.get('/api/boards').expect(200)
  assert.deepEqual(list.body.boards.map((b) => b.id), [created.body.board.id])
  assert.equal(list.body.hasMore, false)

  const one = await owner.get(`/api/boards/${created.body.board.id}`).expect(200)
  assert.deepEqual(one.body.members.map((m) => [m.id, m.role]), [[owner.user.id, 'owner']])
})

test('validates board input', async () => {
  const owner = await newUser()
  errorCode(await owner.post('/api/boards', { title: '' }), 400, 'VALIDATION_ERROR')
  errorCode(await owner.post('/api/boards', { title: 'x'.repeat(101) }), 400, 'VALIDATION_ERROR')
  errorCode(await owner.post('/api/boards', { title: 'ok', background: 'rainbow' }), 400, 'VALIDATION_ERROR')
  errorCode(await owner.post('/api/boards', { title: 'ok', ownerId: 'someone' }), 400, 'VALIDATION_ERROR')
  errorCode(await owner.get('/api/boards?limit=1000'), 400, 'VALIDATION_ERROR')
})

test('outsiders cannot see, edit or delete a board', async () => {
  const owner = await newUser()
  const outsider = await newUser()
  const { body: { board } } = await owner.post('/api/boards', { title: 'Private' }).expect(201)

  errorCode(await outsider.get(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
  errorCode(await outsider.patch(`/api/boards/${board.id}`, { title: 'Hacked' }), 404, 'BOARD_NOT_FOUND')
  errorCode(await outsider.delete(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
  errorCode(await outsider.get('/api/boards/not-an-id'), 404, 'BOARD_NOT_FOUND')
  assert.deepEqual((await outsider.get('/api/boards').expect(200)).body.boards, [])
})

test('paginates the board list', async () => {
  const owner = await newUser()
  for (const title of ['A', 'B', 'C']) await owner.post('/api/boards', { title }).expect(201)
  const first = await owner.get('/api/boards?limit=2').expect(200)
  assert.deepEqual(first.body.boards.map((b) => b.title), ['C', 'B'])
  assert.equal(first.body.hasMore, true)
  const second = await owner.get('/api/boards?limit=2&page=2').expect(200)
  assert.deepEqual(second.body.boards.map((b) => b.title), ['A'])
  assert.equal(second.body.hasMore, false)
})

test('a member sees the shared board with its members', async () => {
  const { member, board } = await boardWithMember()
  const list = await member.get('/api/boards').expect(200)
  assert.deepEqual(list.body.boards.map((b) => [b.id, b.role, b.memberCount]), [[board.id, 'member', 2]])
  const one = await member.get(`/api/boards/${board.id}`).expect(200)
  assert.deepEqual(one.body.members.map((m) => m.role), ['owner', 'member'])
})

test('members can rename but only the owner can delete', async () => {
  const { member, board } = await boardWithMember()
  const renamed = await member.patch(`/api/boards/${board.id}`, { background: 'red' }).expect(200)
  assert.equal(renamed.body.board.background, 'red')
  errorCode(await member.delete(`/api/boards/${board.id}`), 403, 'OWNER_ONLY')
  errorCode(await member.patch(`/api/boards/${board.id}`, {}), 400, 'VALIDATION_ERROR')
})

test('a member loses access as soon as the membership is gone', async () => {
  const { member, board } = await boardWithMember()
  await database.boardMembers.deleteOne({ boardId: new ObjectId(board.id), userId: new ObjectId(member.user.id) })
  errorCode(await member.get(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
})

test('deleting a board removes its memberships', async () => {
  const { owner, member, board } = await boardWithMember()
  await owner.delete(`/api/boards/${board.id}`).expect(204)
  errorCode(await owner.get(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
  errorCode(await member.get(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
  assert.equal(await database.boardMembers.countDocuments({ boardId: new ObjectId(board.id) }), 0)
})
