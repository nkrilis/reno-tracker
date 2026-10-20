// The spreadsheet's formulas, as plain functions over the loaded rows.
import type { Area, Task, TaskDependency } from './types'

export const DONE = 'Done'
export const IN_PROGRESS = 'In Progress'

export type Flag = 'OVERDUE' | 'Due this week' | null

export interface TaskRow extends Task {
  subtaskCount: number
  /** 0–1. Parents: share of sub-tasks done. Leaves: 1 if done, else 0. */
  progress: number
  /** actual − estimate, only when both are entered */
  variance: number | null
  flag: Flag
  dependsOn: string[]
}

export interface AreaSummary {
  area: string
  budget: number | null
  tasks: number
  subtasks: number
  inProgress: number
  done: number
  percentComplete: number
  nextDue: string | null
  estCost: number
  actualCost: number
  remainingBudget: number | null
  variance: number
}

export interface Summary {
  overdue: number
  dueThisWeek: number
  overallProgress: number
  areas: AreaSummary[]
  total: Omit<AreaSummary, 'area'>
}

/** Local calendar date as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Whole days from a to b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

export function flagFor(task: Pick<Task, 'status' | 'due_date'>, today: string): Flag {
  if (task.status === DONE || !task.due_date) return null
  if (task.due_date < today) return 'OVERDUE'
  if (daysBetween(today, task.due_date) <= 7) return 'Due this week'
  return null
}

export function deriveRows(tasks: Task[], deps: TaskDependency[], today: string): TaskRow[] {
  const children = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.parent_id) continue
    const list = children.get(t.parent_id) ?? []
    list.push(t)
    children.set(t.parent_id, list)
  }
  const depMap = new Map<string, string[]>()
  for (const d of deps) {
    const list = depMap.get(d.task_id) ?? []
    list.push(d.depends_on_id)
    depMap.set(d.task_id, list)
  }

  return tasks.map((t) => {
    const kids = children.get(t.id) ?? []
    const progress = kids.length
      ? kids.filter((k) => k.status === DONE).length / kids.length
      : t.status === DONE ? 1 : 0
    return {
      ...t,
      subtaskCount: kids.length,
      progress,
      variance: t.est_cost != null && t.actual_cost != null ? t.actual_cost - t.est_cost : null,
      flag: flagFor(t, today),
      dependsOn: (depMap.get(t.id) ?? []).sort(compareIds),
    }
  })
}

/** Costs and % complete only count rows without sub-tasks, so parents aren't double-counted. */
export function summarize(rows: TaskRow[], areas: Area[]): Summary {
  const leaves = rows.filter((r) => r.subtaskCount === 0)
  const ratio = (n: number, d: number) => (d ? n / d : 0)

  const areaSummaries: AreaSummary[] = areas.map((a) => {
    const inArea = rows.filter((r) => r.area === a.name)
    const leafInArea = leaves.filter((r) => r.area === a.name)
    const open = inArea.filter((r) => r.status !== DONE && r.due_date).map((r) => r.due_date!)
    const estCost = sum(leafInArea.map((r) => r.est_cost))
    const actualCost = sum(leafInArea.map((r) => r.actual_cost))
    return {
      area: a.name,
      budget: a.budget,
      tasks: inArea.filter((r) => !r.parent_id).length,
      subtasks: inArea.filter((r) => r.parent_id).length,
      inProgress: inArea.filter((r) => r.status === IN_PROGRESS).length,
      done: inArea.filter((r) => r.status === DONE).length,
      percentComplete: ratio(leafInArea.filter((r) => r.status === DONE).length, leafInArea.length),
      nextDue: open.length ? open.sort()[0] : null,
      estCost,
      actualCost,
      remainingBudget: a.budget != null ? a.budget - actualCost : null,
      variance: actualCost - estCost,
    }
  })

  const overallProgress = ratio(leaves.filter((r) => r.status === DONE).length, leaves.length)
  const dues = areaSummaries.map((a) => a.nextDue).filter((d): d is string => !!d).sort()
  const budget = sum(areaSummaries.map((a) => a.budget))
  const estCost = sum(areaSummaries.map((a) => a.estCost))
  const actualCost = sum(areaSummaries.map((a) => a.actualCost))

  return {
    overdue: rows.filter((r) => r.flag === 'OVERDUE').length,
    dueThisWeek: rows.filter((r) => r.flag === 'Due this week').length,
    overallProgress,
    areas: areaSummaries,
    total: {
      budget,
      tasks: sum(areaSummaries.map((a) => a.tasks)),
      subtasks: sum(areaSummaries.map((a) => a.subtasks)),
      inProgress: sum(areaSummaries.map((a) => a.inProgress)),
      done: sum(areaSummaries.map((a) => a.done)),
      percentComplete: overallProgress,
      nextDue: dues[0] ?? null,
      estCost,
      actualCost,
      remainingBudget: budget - actualCost,
      variance: actualCost - estCost,
    },
  }
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0)
}

/** Natural order for IDs: ADM-1 < ADM-1.2 < ADM-1.10 < ADM-2. */
export function compareIds(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

/** Next free sub-task ID under a parent: MOLD-2 → MOLD-2.5 */
export function nextSubtaskId(parentId: string, existing: string[]): string {
  const prefix = `${parentId}.`
  let max = 0
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue
    const n = Number(id.slice(prefix.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${prefix}${max + 1}`
}

/** Next free top-level ID for an area code: KIT → KIT-11 */
export function nextTaskId(code: string, existing: string[]): string {
  const prefix = `${code}-`
  let max = 0
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue
    const n = Number(id.slice(prefix.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${prefix}${max + 1}`
}

export const TASK_ID_PATTERN = /^[A-Z0-9]+-[0-9]+(\.[0-9]+)*$/

export function parseIdList(input: string): string[] {
  return [...new Set(input.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))]
}
