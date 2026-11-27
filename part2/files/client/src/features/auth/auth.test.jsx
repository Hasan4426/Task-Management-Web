import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../App.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { apiRequest } from '../../api/client.js'

const user = { id: 'abc123', name: 'Test User', email: 'test@example.com', createdAt: '2026-11-22T14:00:00.000Z' }
const password = ' a long unique passphrase '
const response = (status, data, headers = {}) => new Response(status === 204 ? null : JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
})
const failure = (status, code, message, fields) => response(status, { error: { code, message, fields } })

function setup(initial = failure(401, 'UNAUTHENTICATED', 'Sign in to continue.')) {
  const fetch = vi.fn().mockResolvedValueOnce(initial)
  // The dashboard loads boards and invitations after sign-in. Answer those with empty lists
  // so `fetch` below only sees the auth calls these tests count.
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    if (url.endsWith('/api/boards')) return Promise.resolve(response(200, { boards: [], page: 1, limit: 50, hasMore: false }))
    if (url.endsWith('/api/invitations')) return Promise.resolve(response(200, { invitations: [] }))
    return fetch(url, options)
  }))
  render(<AuthProvider><App /></AuthProvider>)
  return { fetch, browser: userEvent.setup() }
}
async function fill(browser) {
  await browser.type(await screen.findByLabelText('Email'), user.email)
  await browser.type(screen.getByLabelText('Password'), password)
}

describe('authentication UI and API contract', () => {
  it('restores an existing session using credentials', async () => {
    const { fetch } = setup(response(200, { user }))
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
    expect(await screen.findByRole('heading', { name: 'Your boards' })).toBeVisible()
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:3000/api/auth/me')
    expect(fetch.mock.calls[0][1].credentials).toBe('include')
  })

  it('shows retry on unavailable restoration instead of claiming the user is signed out', async () => {
    const { fetch, browser } = setup(failure(500, 'INTERNAL_ERROR', 'Temporarily unavailable.'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporarily unavailable')
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    fetch.mockResolvedValueOnce(response(200, { user }))
    await browser.click(screen.getByRole('button', { name: 'Retry', exact: true }))
    expect(await screen.findByRole('heading', { name: 'Your boards' })).toBeVisible()
  })

  it('registers with only contract fields and immediately displays the signed-in account', async () => {
    const { fetch, browser } = setup()
    await browser.click(await screen.findByRole('button', { name: 'Create an account' }))
    await browser.type(screen.getByLabelText('Name'), ' Test User ')
    await fill(browser)
    await browser.type(screen.getByLabelText('Confirm password'), password)
    fetch.mockResolvedValueOnce(response(201, { user }))
    await browser.click(screen.getByRole('button', { name: 'Create account', exact: true }))
    expect(await screen.findByRole('heading', { name: 'Your boards' })).toBeVisible()
    const [url, options] = fetch.mock.calls[1]
    expect(url).toMatch(/\/register$/)
    expect(JSON.parse(options.body)).toEqual({ name: user.name, email: user.email, password })
    expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' })
    expect(options.credentials).toBe('include')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('checks confirmation locally and accepts passwords measured in Unicode code points', async () => {
    const { fetch, browser } = setup()
    await browser.click(await screen.findByRole('button', { name: 'Create an account' }))
    await browser.type(screen.getByLabelText('Name'), user.name)
    await browser.type(screen.getByLabelText('Email'), user.email)
    await browser.type(screen.getByLabelText('Password'), '😀'.repeat(14))
    await browser.click(screen.getByRole('button', { name: 'Create account', exact: true }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves email and displays server field errors after rejected login', async () => {
    const { fetch, browser } = setup()
    await fill(browser)
    fetch.mockResolvedValueOnce(failure(400, 'VALIDATION_ERROR', 'Check the submitted fields.', { email: 'Email was rejected.' }))
    await browser.click(screen.getByRole('button', { name: 'Log in', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the submitted fields')
    expect(screen.getByLabelText('Email')).toHaveValue(user.email)
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email was rejected.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('prevents duplicate login submissions and displays generic credential errors', async () => {
    const { fetch, browser } = setup()
    await fill(browser)
    let finish
    fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await browser.dblClick(screen.getByRole('button', { name: 'Log in', exact: true }))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled()
    await act(async () => finish(failure(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
  })

  it('honors Retry-After and keeps login and registration limits separate', async () => {
    const { fetch, browser } = setup()
    await fill(browser)
    fetch.mockResolvedValueOnce(response(429, { error: { code: 'RATE_LIMITED', message: 'Too many attempts.' } }, { 'Retry-After': '120' }))
    await browser.click(screen.getByRole('button', { name: 'Log in', exact: true }))
    expect(await screen.findByRole('status')).toHaveTextContent('Try again in 120 seconds')
    expect(screen.getByRole('button', { name: 'Log in', exact: true })).toBeDisabled()
    await browser.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled()
    await browser.click(screen.getByRole('button', { name: 'Log in', exact: true }))
    expect(screen.getByRole('button', { name: 'Log in', exact: true })).toBeDisabled()
  })

  it('directs a partially successful registration to login', async () => {
    const { fetch, browser } = setup()
    await browser.click(await screen.findByRole('button', { name: 'Create an account' }))
    await browser.type(screen.getByLabelText('Name'), user.name)
    await fill(browser)
    await browser.type(screen.getByLabelText('Confirm password'), password)
    fetch.mockResolvedValueOnce(failure(503, 'ACCOUNT_CREATED_LOGIN_REQUIRED', 'Your account was created.'))
    await browser.click(screen.getByRole('button', { name: 'Create account', exact: true }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your account was created. Please log in')
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue(user.email)
  })

  it('retains the account on failed logout, then clears it after a successful 204 response', async () => {
    const { fetch, browser } = setup(response(200, { user }))
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await browser.click(await screen.findByRole('button', { name: 'Account' }))
    await browser.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Logout was not confirmed')
    expect(screen.getByRole('heading', { name: 'Your boards' })).toBeVisible()
    fetch.mockResolvedValueOnce(response(204))
    await browser.click(screen.getByRole('button', { name: 'Retry logout' }))
    expect(await screen.findByLabelText('Password')).toBeVisible()
    expect(screen.queryByText(user.email)).not.toBeInTheDocument()
    expect(fetch.mock.calls[2][0]).toMatch(/\/logout$/)
    expect(fetch.mock.calls[2][1].headers['X-Requested-With']).toBe('XMLHttpRequest')
  })

  it('clears the account on a protected API 401 without an automatic login loop', async () => {
    const { fetch } = setup(response(200, { user }))
    await screen.findByRole('heading', { name: 'Your boards' })
    fetch.mockResolvedValueOnce(failure(401, 'UNAUTHENTICATED', 'Sign in to continue.'))
    await act(async () => { await expect(apiRequest('/api/protected')).rejects.toMatchObject({ status: 401 }) })
    expect(await screen.findByLabelText('Password')).toBeVisible()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })
})
