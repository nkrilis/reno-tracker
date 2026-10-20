import { useEffect, useState, type FormEvent } from 'react'
import { autoLogin, supabase } from '../lib/supabase'

/** Signs in with the email/password from .env.local; the session listener in App takes it from there. */
export function AutoSignIn() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth
      .signInWithPassword({ email: autoLogin.email, password: autoLogin.password! })
      .then(({ error }) => error && setError(error.message))
  }, [])

  if (!error) return null
  return (
    <div className="centered">
      <div className="card auth-card">
        <h1>Couldn’t sign in</h1>
        <p className="error-text">{error}</p>
        <p className="muted">
          Check that <strong>{autoLogin.email}</strong> exists in Supabase (Authentication → Users) with the password set
          in <code>VITE_LOGIN_PASSWORD</code>, then restart <code>npm run dev</code>.
        </p>
      </div>
    </div>
  )
}

/** Email + password sign-in, used wherever no auto sign-in password is configured (e.g. the deployed site). */
export function SignIn() {
  const [email, setEmail] = useState(autoLogin.email)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="centered">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Reno Tracker</h1>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            enterKeyHint="go"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

export function SetupNotice() {
  return (
    <div className="centered">
      <div className="card auth-card">
        <h1>Connect Supabase</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in your project URL and publishable key,
          then restart <code>npm run dev</code>.
        </p>
        <p className="muted">See README.md for the full setup.</p>
      </div>
    </div>
  )
}
