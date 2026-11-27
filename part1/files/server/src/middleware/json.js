import { json } from 'express'
import { ApiError } from '../errors.js'

// Same limits as the auth router: small JSON bodies only.
export const readJson = json({ limit: '8kb', inflate: false })

export function requireJson(req, _res, next) {
  if (!req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send a JSON request body.')
  }
  next()
}
