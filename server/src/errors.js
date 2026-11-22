export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export function sendError(res, error) {
  const { status, code, message, fields } = error
  return res.status(status).json({ error: { code, message, fields } })
}

export function logFailure(logger, event, error) {
  logger.error({ event, name: error?.name, code: typeof error?.code === 'number' ? error.code : undefined })
}
