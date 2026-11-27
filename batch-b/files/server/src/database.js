import { MongoClient } from 'mongodb'

export async function connectDatabase(config) {
  const client = new MongoClient(config.mongodbUri, {
    serverSelectionTimeoutMS: 3000,
    socketTimeoutMS: 5000,
    waitQueueTimeoutMS: 5000,
  })
  try {
    await client.connect()
    const db = client.db(config.mongodbDb)
    const users = db.collection('users')
    await users.createIndex({ email: 1 }, { unique: true })
    await db.collection('sessions').createIndex({ expires: 1 }, { expireAfterSeconds: 0 })

    // Batch B: boards, memberships and invitations.
    const boards = db.collection('boards')
    const boardMembers = db.collection('boardMembers')
    const boardInvitations = db.collection('boardInvitations')
    // A user can be a member of a board only once.
    await boardMembers.createIndex({ boardId: 1, userId: 1 }, { unique: true })
    // "Which boards am I in?" for the dashboard, newest membership first.
    await boardMembers.createIndex({ userId: 1, joinedAt: -1 })
    // Only one *pending* invitation per email per board; old accepted/declined ones are kept as history.
    await boardInvitations.createIndex(
      { boardId: 1, email: 1 },
      { unique: true, partialFilterExpression: { status: 'pending' } },
    )
    // "Which invitations are waiting for me?"
    await boardInvitations.createIndex({ email: 1, status: 1, createdAt: -1 })

    return { client, db, users, boards, boardMembers, boardInvitations }
  } catch (error) {
    await client.close().catch(() => {})
    throw error
  }
}
