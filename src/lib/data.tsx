import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { DONE, compareIds, todayISO } from './calc'
import type { Area, Contact, ListOption, ListTable, Settings, Task, TaskDependency } from './types'

interface Tables {
  areas: Area[]
  statuses: ListOption[]
  priorities: ListOption[]
  phases: ListOption[]
  trades: ListOption[]
  permit_options: ListOption[]
  settings: Settings[]
  tasks: Task[]
  task_dependencies: TaskDependency[]
  contacts: Contact[]
}

type TableName = keyof Tables

const ORDER: Record<TableName, string | null> = {
  areas: 'sort_order',
  statuses: 'sort_order',
  priorities: 'sort_order',
  phases: 'sort_order',
  trades: 'sort_order',
  permit_options: 'sort_order',
  settings: null,
  tasks: null,
  task_dependencies: null,
  contacts: 'created_at',
}

const TABLES = Object.keys(ORDER) as TableName[]

const EMPTY: Tables = {
  areas: [], statuses: [], priorities: [], phases: [], trades: [], permit_options: [],
  settings: [], tasks: [], task_dependencies: [], contacts: [],
}

export interface Api {
  saveTask(originalId: string | null, task: Task, dependsOn: string[]): Promise<boolean>
  setTaskStatus(task: Task, status: string): Promise<boolean>
  deleteTask(id: string): Promise<boolean>
  saveContact(contact: Omit<Contact, 'id'> & { id?: string }): Promise<boolean>
  deleteContact(id: string): Promise<boolean>
  addOption(table: ListTable | 'areas', name: string): Promise<boolean>
  renameOption(table: ListTable | 'areas', from: string, to: string): Promise<boolean>
  deleteOption(table: ListTable | 'areas', name: string): Promise<boolean>
  moveOption(table: ListTable | 'areas', name: string, delta: -1 | 1): Promise<boolean>
  updateArea(name: string, patch: Partial<Pick<Area, 'code' | 'budget'>>): Promise<boolean>
  updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<boolean>
}

interface DataValue extends Tables {
  loading: boolean
  api: Api
  toast: string | null
  dismissToast(): void
}

const DataContext = createContext<DataValue | null>(null)

export function useData(): DataValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}

const NUMERIC_COLUMNS = ['budget', 'est_cost', 'actual_cost', 'quote'] as const

/** numeric(12,2) can arrive as a string depending on the client; make sure it's a number. */
function normalizeNumbers<T extends Record<string, unknown>>(row: T): T {
  let out = row
  for (const col of NUMERIC_COLUMNS) {
    if (typeof row[col] === 'string') out = { ...out, [col]: Number(row[col]) }
  }
  return out
}

export function friendlyError(e: PostgrestError | Error): string {
  const code = 'code' in e ? e.code : undefined
  const msg = e.message
  if (code === '23505') return 'That ID or name already exists.'
  if (code === '23503') {
    if (/update or delete/.test(msg)) return 'That option is still used by tasks or contacts — change those first.'
    return 'A referenced item (parent, dependency or list option) doesn’t exist.'
  }
  if (code === '23514') {
    if (msg.includes('tasks_id_check')) return 'IDs look like CODE-1 or CODE-1.2 (capital letters, digits, dots).'
    if (msg.includes('areas_code_check')) return 'Area codes are capital letters and digits only.'
    return 'That value isn’t allowed.'
  }
  return msg
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [tables, setTables] = useState<Tables>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const pending = useRef(new Set<TableName>())
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async (names: TableName[]) => {
    const results = await Promise.all(
      names.map(async (name) => {
        let query = supabase.from(name).select('*')
        const order = ORDER[name]
        if (order) query = query.order(order)
        const { data, error } = await query
        if (error) throw error
        return [name, data] as const
      }),
    )
    setTables((prev) => {
      const next = { ...prev }
      for (const [name, data] of results) (next as Record<TableName, unknown>)[name] = data.map(normalizeNumbers)
      next.tasks = [...next.tasks].sort((a, b) => compareIds(a.id, b.id))
      return next
    })
  }, [])

  useEffect(() => {
    load(TABLES)
      .catch((e) => setToast(friendlyError(e)))
      .finally(() => setLoading(false))

    // Live updates from other devices / people. Bursts (e.g. a rename that
    // cascades into many tasks) are coalesced into one reload per table.
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const table = payload.table as TableName
        if (!TABLES.includes(table)) return
        pending.current.add(table)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          const names = [...pending.current]
          pending.current.clear()
          load(names).catch((e) => setToast(friendlyError(e)))
        }, 250)
      })
      .subscribe()
    return () => {
      window.clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [load])

  const api = useMemo<Api>(() => {
    /** Run a mutation, surface errors as a toast, then refresh the tables it touches. */
    async function run(
      op: () => PromiseLike<{ error: PostgrestError | null }>,
      reload: TableName[],
    ): Promise<boolean> {
      const { error } = await op()
      if (error) {
        setToast(friendlyError(error))
        return false
      }
      await load(reload).catch((e) => setToast(friendlyError(e)))
      return true
    }

    const listReload = (table: ListTable | 'areas'): TableName[] => [table, 'tasks', 'contacts']

    return {
      saveTask: (originalId, task, dependsOn) =>
        run(
          () => supabase.rpc('save_task', { original_id: originalId, task, depends_on: dependsOn }),
          ['tasks', 'task_dependencies'],
        ),

      setTaskStatus: (task, status) =>
        run(
          () =>
            supabase
              .from('tasks')
              .update({
                status,
                done_date: status === DONE && !task.done_date ? todayISO() : task.done_date,
              })
              .eq('id', task.id),
          ['tasks'],
        ),

      deleteTask: (id) =>
        run(() => supabase.from('tasks').delete().eq('id', id), ['tasks', 'task_dependencies']),

      saveContact: ({ id, ...fields }) =>
        run(
          () => (id ? supabase.from('contacts').update(fields).eq('id', id) : supabase.from('contacts').insert(fields)),
          ['contacts'],
        ),

      deleteContact: (id) => run(() => supabase.from('contacts').delete().eq('id', id), ['contacts']),

      addOption: (table, name) =>
        run(async () => {
          const { data } = await supabase.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1)
          const sort_order = ((data?.[0]?.sort_order as number | undefined) ?? -1) + 1
          return supabase.from(table).insert({ name, sort_order })
        }, [table]),

      renameOption: (table, from, to) =>
        run(() => supabase.from(table).update({ name: to }).eq('name', from), listReload(table)),

      deleteOption: (table, name) => run(() => supabase.from(table).delete().eq('name', name), [table]),

      moveOption: (table, name, delta) =>
        run(async () => {
          const { data, error } = await supabase.from(table).select('name').order('sort_order')
          if (error) return { error }
          const names = (data as { name: string }[]).map((r) => r.name)
          const i = names.indexOf(name)
          const j = i + delta
          if (i < 0 || j < 0 || j >= names.length) return { error: null }
          ;[names[i], names[j]] = [names[j], names[i]]
          const results = await Promise.all(
            names.map((n, sort_order) => supabase.from(table).update({ sort_order }).eq('name', n)),
          )
          return { error: results.find((r) => r.error)?.error ?? null }
        }, [table]),

      updateArea: (name, patch) => run(() => supabase.from('areas').update(patch).eq('name', name), ['areas']),

      updateSettings: (patch) => run(() => supabase.from('settings').update(patch).eq('id', 1), ['settings']),
    }
  }, [load])

  const value: DataValue = {
    ...tables,
    loading,
    api,
    toast,
    dismissToast: () => setToast(null),
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
