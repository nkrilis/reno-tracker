import { useSyncExternalStore } from 'react'

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Phone-width layout: cards instead of wide tables. Matches the 700px breakpoint in index.css. */
export function useIsNarrow(): boolean {
  return useMediaQuery('(max-width: 700px)')
}
