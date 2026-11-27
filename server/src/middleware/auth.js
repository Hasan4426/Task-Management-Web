import { ObjectId } from 'mongodb'
import { ApiError } from '../errors.js'
import { publicProjection, publicUser } from '../features/auth/auth.user.js'

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
