import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
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

async function boardWithMember() {
  const owner = await newUser('Owner')
  const member = await newUser('Member')
  const { body: { board } } = await owner.post('/api/boards', { title: 'Team board' }).expect(201)
  const { body: { invitation } } = await owner.post(`/api/boards/${board.id}/invitations`, { email: member.email }).expect(201)
  await member.post(`/api/invitations/${invitation.id}/accept`).expect(200)
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
  errorCode(await outsider.get(`/api/boards/${board.id}/members`), 404, 'BOARD_NOT_FOUND')
  errorCode(await outsider.post(`/api/boards/${board.id}/invitations`, { email: outsider.email }), 404, 'BOARD_NOT_FOUND')
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

test('invite, accept, and the board appears for the new member', async () => {
  const { owner, member, board } = await boardWithMember()
  const list = await member.get('/api/boards').expect(200)
  assert.deepEqual(list.body.boards.map((b) => [b.id, b.role, b.memberCount]), [[board.id, 'member', 2]])

  const members = await owner.get(`/api/boards/${board.id}/members`).expect(200)
  assert.deepEqual(members.body.members.map((m) => m.role), ['owner', 'member'])
  assert.deepEqual((await owner.get(`/api/boards/${board.id}/invitations`).expect(200)).body.invitations, [])
  assert.deepEqual((await member.get('/api/invitations').expect(200)).body.invitations, [])
})

test('members can rename but only the owner deletes or manages members', async () => {
  const { owner, member, board } = await boardWithMember()
  const renamed = await member.patch(`/api/boards/${board.id}`, { title: 'Renamed' }).expect(200)
  assert.equal(renamed.body.board.title, 'Renamed')

  errorCode(await member.delete(`/api/boards/${board.id}`), 403, 'OWNER_ONLY')
  errorCode(await member.post(`/api/boards/${board.id}/invitations`, { email: 'x@example.test' }), 403, 'OWNER_ONLY')
  errorCode(await member.get(`/api/boards/${board.id}/invitations`), 403, 'OWNER_ONLY')
  errorCode(await member.delete(`/api/boards/${board.id}/members/${owner.user.id}`), 400, 'OWNER_CANNOT_LEAVE')
})

test('an invitation can only be accepted by the invited email', async () => {
  const owner = await newUser()
  const invited = await newUser()
  const stranger = await newUser()
  const { body: { board } } = await owner.post('/api/boards', { title: 'B' }).expect(201)
  const { body: { invitation } } = await owner.post(`/api/boards/${board.id}/invitations`, { email: invited.email.toUpperCase() }).expect(201)
  assert.equal(invitation.email, invited.email)

  assert.equal((await stranger.get('/api/invitations').expect(200)).body.invitations.length, 0)
  errorCode(await stranger.post(`/api/invitations/${invitation.id}/accept`), 404, 'INVITATION_NOT_FOUND')

  const mine = await invited.get('/api/invitations').expect(200)
  assert.equal(mine.body.invitations[0].board.title, 'B')
  assert.equal(mine.body.invitations[0].invitedBy.name, 'Test User')
})

test('duplicate invitations and inviting members are rejected', async () => {
  const { owner, member, board } = await boardWithMember()
  errorCode(await owner.post(`/api/boards/${board.id}/invitations`, { email: member.email }), 409, 'ALREADY_MEMBER')

  const email = 'new.person@example.test'
  const results = await Promise.all([
    owner.post(`/api/boards/${board.id}/invitations`, { email }),
    owner.post(`/api/boards/${board.id}/invitations`, { email }),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
  errorCode(await owner.post(`/api/boards/${board.id}/invitations`, { email: 'not-an-email' }), 400, 'VALIDATION_ERROR')
})

test('accepting the same invitation twice at once adds the member only once', async () => {
  const owner = await newUser()
  const invited = await newUser()
  const { body: { board } } = await owner.post('/api/boards', { title: 'Race' }).expect(201)
  const { body: { invitation } } = await owner.post(`/api/boards/${board.id}/invitations`, { email: invited.email }).expect(201)
  const results = await Promise.all([
    invited.post(`/api/invitations/${invitation.id}/accept`),
    invited.post(`/api/invitations/${invitation.id}/accept`),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 404])
  const members = await owner.get(`/api/boards/${board.id}/members`).expect(200)
  assert.equal(members.body.members.length, 2)
})

test('declined and revoked invitations cannot be accepted', async () => {
  const owner = await newUser()
  const invited = await newUser()
  const { body: { board } } = await owner.post('/api/boards', { title: 'B' }).expect(201)

  const first = (await owner.post(`/api/boards/${board.id}/invitations`, { email: invited.email }).expect(201)).body.invitation
  await invited.post(`/api/invitations/${first.id}/decline`).expect(204)
  errorCode(await invited.post(`/api/invitations/${first.id}/accept`), 404, 'INVITATION_NOT_FOUND')

  const second = (await owner.post(`/api/boards/${board.id}/invitations`, { email: invited.email }).expect(201)).body.invitation
  await owner.delete(`/api/boards/${board.id}/invitations/${second.id}`).expect(204)
  errorCode(await invited.post(`/api/invitations/${second.id}/accept`), 404, 'INVITATION_NOT_FOUND')
})

test('expired invitations cannot be accepted and do not block a new one', async () => {
  const owner = await newUser()
  const invited = await newUser()
  const { body: { board } } = await owner.post('/api/boards', { title: 'B' }).expect(201)
  const old = (await owner.post(`/api/boards/${board.id}/invitations`, { email: invited.email }).expect(201)).body.invitation
  await database.boardInvitations.updateOne({ email: invited.email }, { $set: { expiresAt: new Date(Date.now() - 1000) } })

  errorCode(await invited.post(`/api/invitations/${old.id}/accept`), 404, 'INVITATION_NOT_FOUND')
  await owner.post(`/api/boards/${board.id}/invitations`, { email: invited.email }).expect(201)
})

test('a removed member loses access immediately', async () => {
  const { owner, member, board } = await boardWithMember()
  await owner.delete(`/api/boards/${board.id}/members/${member.user.id}`).expect(204)
  errorCode(await member.get(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
  assert.deepEqual((await member.get('/api/boards').expect(200)).body.boards, [])
  errorCode(await owner.delete(`/api/boards/${board.id}/members/${member.user.id}`), 404, 'MEMBER_NOT_FOUND')
})

test('a member can leave, but cannot remove someone else', async () => {
  const { owner, member, board } = await boardWithMember()
  const third = await newUser()
  const { body: { invitation } } = await owner.post(`/api/boards/${board.id}/invitations`, { email: third.email }).expect(201)
  await third.post(`/api/invitations/${invitation.id}/accept`).expect(200)

  errorCode(await member.delete(`/api/boards/${board.id}/members/${third.user.id}`), 403, 'OWNER_ONLY')
  await member.delete(`/api/boards/${board.id}/members/${member.user.id}`).expect(204)
  errorCode(await member.get(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
})

test('deleting a board removes its members and invitations', async () => {
  const { owner, member, board } = await boardWithMember()
  await owner.post(`/api/boards/${board.id}/invitations`, { email: 'later@example.test' }).expect(201)
  await owner.delete(`/api/boards/${board.id}`).expect(204)

  errorCode(await owner.get(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
  errorCode(await member.get(`/api/boards/${board.id}`), 404, 'BOARD_NOT_FOUND')
  const { ObjectId } = await import('mongodb')
  const boardId = new ObjectId(board.id)
  assert.equal(await database.boardMembers.countDocuments({ boardId }), 0)
  assert.equal(await database.boardInvitations.countDocuments({ boardId }), 0)
})
