import { isIP } from 'node:net'

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SESSION_COOKIE_NAME = 'sid'

function invalid(name, expectation) {
  return new Error(name + ' ' + expectation)
}

export function loadConfig(env = process.env) {
  const environment = env.NODE_ENV ?? 'development'
  if (!['development', 'test', 'production'].includes(environment)) {
    throw invalid('NODE_ENV', 'must be development, test or production.')
  }
  const production = environment === 'production'

  const sessionSecret = env.SESSION_SECRET
  if (!sessionSecret || Buffer.byteLength(sessionSecret) < 32) {
    throw invalid('SESSION_SECRET', 'must contain at least 32 bytes.')
  }
  if (production && (!/^[a-fA-F0-9]{64}$/.test(sessionSecret) || /^(.{1,8})\1+$/.test(sessionSecret))) {
    throw invalid('SESSION_SECRET', 'must be a random 32-byte value encoded as 64 hexadecimal characters.')
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? (production ? '' : 'http://localhost:5173'))
    .split(',')
    .map((origin) => origin.trim())
  for (const origin of allowedOrigins) {
    const parsed = URL.parse(origin)
    if (!parsed || parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)
        || (production && parsed.protocol !== 'https:')) {
      throw invalid('ALLOWED_ORIGINS', production
        ? 'must contain comma-separated HTTPS origins.'
        : 'must contain comma-separated HTTP or HTTPS origins.')
    }
  }

  const secure = env.SESSION_COOKIE_SECURE ?? String(production)
  if (!['true', 'false'].includes(secure) || (production && secure !== 'true')) {
    throw invalid('SESSION_COOKIE_SECURE', production ? 'must be true in production.' : 'must be true or false.')
  }
  const sameSite = (env.SESSION_COOKIE_SAME_SITE ?? 'lax').toLowerCase()
  if (!['lax', 'strict', 'none'].includes(sameSite) || (sameSite === 'none' && secure !== 'true')) {
    throw invalid('SESSION_COOKIE_SAME_SITE', 'must be lax, strict or none, and none requires a Secure cookie.')
  }

  const proxy = env.TRUST_PROXY ?? 'false'
  const trustProxy = proxy === 'false' ? false : proxy.split(',').map((address) => address.trim())
  if (trustProxy && trustProxy.some((address) => !isIP(address) || address.includes('%'))) {
    throw invalid('TRUST_PROXY', 'must be false or a comma-separated list of trusted proxy IP addresses.')
  }

  const mongodbUri = env.MONGODB_URI ?? (production ? '' : 'mongodb://127.0.0.1:27017')
  if (!/^mongodb(?:\+srv)?:\/\//.test(mongodbUri)) {
    throw invalid('MONGODB_URI', 'must be a MongoDB connection URI.')
  }
  const mongodbDb = env.MONGODB_DB ?? (production ? '' : 'webdev_auth')
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(mongodbDb)) {
    throw invalid('MONGODB_DB', 'must be a database name of up to 63 letters, digits, underscores or hyphens.')
  }
  const port = Number(env.PORT ?? '3000')
  if (!/^\d+$/.test(env.PORT ?? '3000') || port < 1 || port > 65535) {
    throw invalid('PORT', 'must be an integer from 1 to 65535.')
  }
  const host = (env.HOST ?? '127.0.0.1').trim()
  if (!host) throw invalid('HOST', 'must be a bind address.')

  return {
    host,
    port,
    production,
    mongodbUri,
    mongodbDb,
    allowedOrigins: new Set(allowedOrigins),
    sessionSecret,
    trustProxy,
    cookie: { httpOnly: true, secure: secure === 'true', sameSite, path: '/' },
  }
}
