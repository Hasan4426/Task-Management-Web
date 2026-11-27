export const publicProjection = { _id: 1, name: 1, email: 1, createdAt: 1 }

export function publicUser(user) {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  }
}
