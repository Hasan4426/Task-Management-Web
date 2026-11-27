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
    return { client, db, users }
  } catch (error) {
    await client.close().catch(() => {})
    throw error
  }
}
