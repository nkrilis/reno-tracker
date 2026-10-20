import { useEffect, useState } from 'react'

export type Page = 'dashboard' | 'tasks' | 'contacts' | 'lists'

export interface Route {
  page: Page
  params: URLSearchParams
}

const PAGES: Page[] = ['dashboard', 'tasks', 'contacts', 'lists']

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const page = PAGES.includes(path as Page) ? (path as Page) : 'dashboard'
  return { page, params: new URLSearchParams(query) }
}

/** Hash routing: #/tasks?area=Kitchen&flag=OVERDUE */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function href(page: Page, params?: Record<string, string>): string {
  const q = params ? new URLSearchParams(params).toString() : ''
  return `#/${page}${q ? `?${q}` : ''}`
}
