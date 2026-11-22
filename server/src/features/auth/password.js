import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ApiError } from '../../errors.js'

const derive = promisify(scrypt)
const options = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }
const maxActive = 2
const maxWaiting = 8
const waiting = []
let active = 0

async function deriveKey(password, salt) {
  if (active >= maxActive) {
    if (waiting.length >= maxWaiting) {
      throw new ApiError(503, 'AUTH_BUSY', 'Authentication is busy. Try again shortly.')
    }
    await new Promise((resolve) => waiting.push(resolve))
  } else {
    active += 1
  }

  try {
    return await derive(password, salt, 64, options)
  } finally {
    const next = waiting.shift()
    if (next) next()
    else active -= 1
  }
}

const prefix = 'scrypt-v1'
const dummy = { salt: randomBytes(16), key: randomBytes(64) }

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await deriveKey(password, salt)
  return [prefix, salt.toString('hex'), key.toString('hex')].join(':')
}

export async function verifyPassword(password, hash) {
  const parsed = typeof hash === 'string' && /^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{128})$/.exec(hash)
  const salt = parsed ? Buffer.from(parsed[1], 'hex') : dummy.salt
  const key = parsed ? Buffer.from(parsed[2], 'hex') : dummy.key
  const actual = await deriveKey(password, salt)
  return timingSafeEqual(actual, key) && Boolean(parsed)
}
