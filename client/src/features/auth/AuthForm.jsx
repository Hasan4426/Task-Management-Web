import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'

function validate(values, registering) {
  const errors = {}
  if (registering && (!values.name.trim() || [...values.name.trim()].length > 80 || !values.name.isWellFormed())) {
    errors.name = 'Enter a name of 1 to 80 characters.'
  }
  const email = values.email.trim()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
  if ([...values.password].length < 15 || [...values.password].length > 128 || !values.password.isWellFormed()) {
    errors.password = 'Enter a password of 15 to 128 characters.'
  }
  if (registering && values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords must match.'
  return errors
}

export default function AuthForm() {
  const { authenticate } = useAuth()
  const [mode, setMode] = useState('login')
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [fields, setFields] = useState({})
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [deadlines, setDeadlines] = useState({ login: 0, register: 0 })
  const [now, setNow] = useState(Date.now())
  const submitting = useRef(false)
  const summary = useRef(null)
  const registering = mode === 'register'
  const seconds = Math.max(0, Math.ceil((deadlines[mode] - now) / 1000))

  useEffect(() => {
    if (!seconds) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [seconds])
  useEffect(() => { if (message) summary.current?.focus() }, [message])

  function switchMode(nextMode) {
    setMode(nextMode)
    setFields({})
    setMessage('')
    setNotice('')
    setValues(previous => ({ ...previous, password: '', confirmPassword: '' }))
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting.current || Date.now() < deadlines[mode]) return
    const errors = validate(values, registering)
    setFields(errors)
    setMessage('')
    setNotice('')
    if (Object.keys(errors).length) {
      setMessage('Please correct the fields below.')
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      await authenticate(mode, {
        ...(registering ? { name: values.name.trim() } : {}),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      })
    } catch (error) {
      setValues(previous => ({ ...previous, password: '', confirmPassword: '' }))
      if (error.code === 'ACCOUNT_CREATED_LOGIN_REQUIRED') {
        setMode('login')
        setFields({})
        setNotice('Your account was created. Please log in to continue.')
      } else {
        setFields(error.fields ?? {})
        setMessage(error.message)
        if (error.code === 'RATE_LIMITED' || error.status === 429) {
          const time = Date.now()
          setNow(time)
          setDeadlines(previous => ({ ...previous, [mode]: time + Math.max(1, error.retryAfter || 60) * 1000 }))
        }
      }
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  function input(name, label, type, autoComplete) {
    return <p>
      <label htmlFor={name}>{label}</label>{' '}
      <input id={name} name={name} type={type} autoComplete={autoComplete}
        value={values[name]} required
        aria-invalid={Boolean(fields[name])}
        aria-describedby={[fields[name] ? `${name}-error` : '', name === 'password' ? 'password-help' : ''].filter(Boolean).join(' ') || undefined}
        onChange={event => setValues(previous => ({ ...previous, [name]: event.target.value }))} />
      {fields[name] && <span id={`${name}-error`}> {fields[name]}</span>}
    </p>
  }

  return <section aria-labelledby="auth-heading">
    <h2 id="auth-heading">{registering ? 'Create an account' : 'Log in'}</h2>
    {notice && <p role="status">{notice}</p>}
    {message && <div role="alert" tabIndex={-1} ref={summary}>
      <p>{message}</p>
      {Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([name, error]) =>
        <li key={name}><a href={`#${name}`}>{error}</a></li>)}</ul>}
    </div>}
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset disabled={busy}>
        <legend>{registering ? 'Account details' : 'Login details'}</legend>
        {registering && input('name', 'Name', 'text', 'name')}
        {input('email', 'Email', 'email', 'username')}
        {input('password', 'Password', 'password', registering ? 'new-password' : 'current-password')}
        <p id="password-help">Use 15–128 characters. Spaces and Unicode are allowed.</p>
        {registering && input('confirmPassword', 'Confirm password', 'password', 'new-password')}
        <button type="submit" disabled={busy || seconds > 0}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Log in'}</button>
      </fieldset>
    </form>
    {seconds > 0 && <p role="status">Try again in {seconds} seconds.</p>}
    <p>{registering ? 'Already have an account?' : 'Need an account?'}{' '}
      <button type="button" disabled={busy} onClick={() => switchMode(registering ? 'login' : 'register')}>
        {registering ? 'Log in' : 'Create an account'}
      </button>
    </p>
  </section>
}
