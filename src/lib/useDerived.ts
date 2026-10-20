import { useMemo } from 'react'
import { useData } from './data'
import { deriveRows, summarize, todayISO } from './calc'

/** Task rows with their calculated columns, plus the dashboard summary. */
export function useDerived() {
  const { tasks, task_dependencies, areas } = useData()
  const today = todayISO()
  return useMemo(() => {
    const rows = deriveRows(tasks, task_dependencies, today)
    return { today, rows, summary: summarize(rows, areas) }
  }, [tasks, task_dependencies, areas, today])
}
