import { createClient } from '@supabase/supabase-js'

// Only the origin is wanted; drop paths like /rest/v1/ copied from the dashboard.
const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const url = rawUrl ? new URL(rawUrl).origin : undefined
// || rather than ??: a CI build with an unset variable gets an empty string, not undefined.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined

export const isConfigured = Boolean(url && key)

// Auto sign-in. VITE_ variables are bundled into the browser JS, so this
// password is readable by anyone who can load the app — local use only.
export const autoLogin = {
  email: (import.meta.env.VITE_LOGIN_EMAIL as string | undefined) || 'n.krilis@gmail.com',
  password: import.meta.env.VITE_LOGIN_PASSWORD as string | undefined,
}

export const supabase = createClient(url || 'http://localhost', key || 'missing')
