const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const unauthorizedListeners = new Set()

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

export async function apiRequest(path, { method = 'GET', body, signal, notifyUnauthorized = true } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        ...(!['GET', 'HEAD', 'OPTIONS'].includes(method) ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Unable to reach the server. Check your connection and try again.')
  }
  if (response.status === 401 && notifyUnauthorized) {
    unauthorizedListeners.forEach(listener => listener())
  }
  if (response.status === 204) return null
  let data
  try { data = await response.json() } catch {
    throw Object.assign(new Error('The server returned an unexpected response. Please try again.'), { status: response.status })
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.message ?? 'Request failed. Please try again.'), {
      status: response.status,
      code: data.error?.code,
      fields: data.error?.fields,
      retryAfter: Number(response.headers.get('Retry-After')) || 0,
    })
  }
  return data
}

export function authRequest(path, options = {}) {
  return apiRequest(`/api/auth/${path}`, { ...options, notifyUnauthorized: false })
}
