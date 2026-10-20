import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { autoLogin, isConfigured, supabase } from './lib/supabase'
import { DataProvider, useData } from './lib/data'
import { href, useRoute, type Page } from './lib/route'
import { AutoSignIn, SetupNotice, SignIn } from './components/Auth'
import { Dashboard } from './pages/Dashboard'
import { Tasks } from './pages/Tasks'
import { Contacts } from './pages/Contacts'
import { Lists } from './pages/Lists'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured) return <SetupNotice />
  if (session === undefined) return null
  if (!session) return autoLogin.password ? <AutoSignIn /> : <SignIn />

  return (
    <DataProvider>
      <Shell email={session.user.email ?? ''} />
    </DataProvider>
  )
}

const NAV: { page: Page; label: string; short: string; icon: string }[] = [
  { page: 'dashboard', label: 'Dashboard', short: 'Dashboard', icon: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z' },
  { page: 'tasks', label: 'Tasks', short: 'Tasks', icon: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01' },
  {
    page: 'contacts',
    label: 'Contacts & Quotes',
    short: 'Contacts',
    icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  },
  { page: 'lists', label: 'Lists', short: 'Lists', icon: 'M4 21v-7M4 10V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6' },
]

function Shell({ email }: { email: string }) {
  const route = useRoute()
  const { loading, toast, dismissToast, settings } = useData()

  // Each tab starts at the top, like a native tab bar.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.page])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(dismissToast, 6000)
    return () => window.clearTimeout(t)
  }, [toast, dismissToast])

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href={href('dashboard')}>
            {settings[0]?.project_name ?? 'Reno Tracker'}
          </a>
          <nav className="tabs">
            {NAV.map((n) => (
              <a key={n.page} href={href(n.page)} className={route.page === n.page ? 'tab active' : 'tab'}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="account">
            <span className="muted">{email}</span>
            {/* With auto sign-in, signing out would just sign straight back in. */}
            {!autoLogin.password && (
              <button className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="page">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : route.page === 'dashboard' ? (
          <Dashboard />
        ) : route.page === 'tasks' ? (
          <Tasks params={route.params} />
        ) : route.page === 'contacts' ? (
          <Contacts />
        ) : (
          <Lists />
        )}
      </main>

      <nav className="bottom-nav">
        {NAV.map((n) => (
          <a key={n.page} href={href(n.page)} className={route.page === n.page ? 'active' : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={n.icon} />
            </svg>
            {n.short}
          </a>
        ))}
      </nav>

      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button className="icon-btn" onClick={dismissToast} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </>
  )
}
