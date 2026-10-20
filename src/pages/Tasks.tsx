import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useData } from '../lib/data'
import { useDerived } from '../lib/useDerived'
import { DONE, compareIds, type TaskRow } from '../lib/calc'
import type { Task } from '../lib/types'
import { FlagPill, ProgressBar, formatDate, formatMoney, statusClass } from '../components/ui'
import { TaskForm } from '../components/TaskForm'
import { useIsNarrow } from '../lib/useMediaQuery'

interface Filters {
  q: string
  area: string
  status: string
  phase: string
  priority: string
  assigned: string
  flag: string
  hideDone: boolean
}

function filtersFrom(params: URLSearchParams): Filters {
  return {
    q: params.get('q') ?? '',
    area: params.get('area') ?? '',
    status: params.get('status') ?? '',
    phase: params.get('phase') ?? '',
    priority: params.get('priority') ?? '',
    assigned: params.get('assigned') ?? '',
    flag: params.get('flag') ?? '',
    hideDone: params.get('hideDone') === '1',
  }
}

type SortKey =
  | 'id' | 'title' | 'area' | 'status' | 'priority' | 'phase' | 'assigned_to' | 'start_date'
  | 'due_date' | 'done_date' | 'permit' | 'est_cost' | 'actual_cost' | 'variance'
  | 'subtaskCount' | 'progress' | 'flag'

interface Sort {
  key: SortKey
  dir: 1 | -1
}

const MOBILE_SORTS: { value: string; label: string; sort: Sort | null }[] = [
  { value: '', label: 'Sort: by area', sort: null },
  { value: 'due', label: 'Sort: due date', sort: { key: 'due_date', dir: 1 } },
  { value: 'priority', label: 'Sort: priority', sort: { key: 'priority', dir: 1 } },
  { value: 'status', label: 'Sort: status', sort: { key: 'status', dir: 1 } },
  { value: 'id', label: 'Sort: ID', sort: { key: 'id', dir: 1 } },
]

type Editing = { originalId: string | null; task: Task } | null

const COLUMNS: { key: SortKey | 'dependsOn' | 'notes'; label: string; num?: boolean }[] = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Task / Sub-task' },
  { key: 'area', label: 'Area' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'phase', label: 'Phase' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'start_date', label: 'Start' },
  { key: 'due_date', label: 'Due' },
  { key: 'done_date', label: 'Done' },
  { key: 'dependsOn', label: 'Depends On' },
  { key: 'permit', label: 'Permit?' },
  { key: 'est_cost', label: 'Est. Cost', num: true },
  { key: 'actual_cost', label: 'Actual', num: true },
  { key: 'variance', label: 'Variance', num: true },
  { key: 'subtaskCount', label: 'Subs', num: true },
  { key: 'progress', label: 'Progress' },
  { key: 'flag', label: 'Flag' },
  { key: 'notes', label: 'Notes' },
]

export function blankTask(statuses: { name: string }[]): Task {
  return {
    id: '', parent_id: null, area: null, title: '', status: statuses[0]?.name ?? 'Not Started',
    priority: null, phase: null, assigned_to: null, start_date: null, due_date: null,
    done_date: null, permit: null, est_cost: null, actual_cost: null, notes: null,
  }
}

export function Tasks({ params }: { params: URLSearchParams }) {
  const data = useData()
  const { areas, statuses, priorities, phases, trades, api } = data
  const { rows } = useDerived()
  const [filters, setFilters] = useState(() => filtersFrom(params))
  const [sort, setSort] = useState<Sort | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Editing>(null)
  const [showFilters, setShowFilters] = useState(false)
  const narrow = useIsNarrow()

  // Links from the dashboard (area / flag) replace the current filters.
  const paramKey = params.toString()
  useEffect(() => setFilters(filtersFrom(new URLSearchParams(paramKey))), [paramKey])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const activeFilters = [
    filters.area, filters.status, filters.phase, filters.priority, filters.assigned, filters.flag, filters.hideDone,
  ].filter(Boolean).length
  const anyFilter = Boolean(filters.q) || activeFilters > 0

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const match = (r: TaskRow) =>
      (!filters.area || r.area === filters.area) &&
      (!filters.status || r.status === filters.status) &&
      (!filters.phase || r.phase === filters.phase) &&
      (!filters.priority || r.priority === filters.priority) &&
      (!filters.assigned || r.assigned_to === filters.assigned) &&
      (!filters.flag || r.flag === filters.flag) &&
      (!filters.hideDone || r.status !== DONE) &&
      (!q || [r.id, r.title, r.notes, r.area, r.assigned_to].some((v) => v?.toLowerCase().includes(q)))
    const filtered = rows.filter(match)

    if (sort) {
      const val = (r: TaskRow) => r[sort.key] as string | number | null
      return filtered
        .slice()
        .sort((a, b) => {
          const va = val(a)
          const vb = val(b)
          if (va == null || va === '') return vb == null || vb === '' ? 0 : 1 // blanks last
          if (vb == null || vb === '') return -1
          const c = typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : sort.key === 'id' ? compareIds(String(va), String(vb)) : String(va).localeCompare(String(vb))
          return c * sort.dir
        })
        .map((row) => ({ row, depth: 0 }))
    }

    // Default: tree order — areas in list order, sub-tasks under their parent.
    const areaOrder = new Map(areas.map((a, i) => [a.name, i]))
    const inSet = new Set(filtered.map((r) => r.id))
    const kids = new Map<string, TaskRow[]>()
    const roots: TaskRow[] = []
    for (const r of filtered) {
      if (r.parent_id && inSet.has(r.parent_id)) {
        kids.set(r.parent_id, [...(kids.get(r.parent_id) ?? []), r])
      } else {
        roots.push(r)
      }
    }
    const rank = (r: TaskRow) => areaOrder.get(r.area ?? '') ?? Number.MAX_SAFE_INTEGER
    roots.sort((a, b) => rank(a) - rank(b) || compareIds(a.id, b.id))
    const out: { row: TaskRow; depth: number }[] = []
    const walk = (r: TaskRow, depth: number) => {
      out.push({ row: r, depth })
      if (collapsed.has(r.id)) return
      for (const k of (kids.get(r.id) ?? []).sort((a, b) => compareIds(a.id, b.id))) walk(k, depth + 1)
    }
    roots.forEach((r) => walk(r, 0))
    return out
  }, [rows, filters, sort, collapsed, areas])

  const parents = rows.filter((r) => r.subtaskCount > 0).map((r) => r.id)
  const allCollapsed = parents.length > 0 && parents.every((id) => collapsed.has(id))

  const toggleSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null))

  const newTask = (over: Partial<Task> = {}) =>
    setEditing({ originalId: null, task: { ...blankTask(statuses), area: filters.area || null, ...over } })

  const toggleCollapsed = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const edit = (r: TaskRow) => setEditing({ originalId: r.id, task: r })

  const addSubtask = (parent: Task) =>
    newTask({
      parent_id: parent.id, area: parent.area, phase: parent.phase, priority: parent.priority, assigned_to: parent.assigned_to,
    })

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Tasks</h1>
        <button className="btn btn-primary desktop-only" onClick={() => newTask()}>
          + New task
        </button>
      </div>

      <div className="toolbar card">
        <input
          type="search"
          className="search"
          placeholder="Search ID, task, notes…"
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
        />
        <button
          className={activeFilters ? 'btn btn-sm filters-toggle active' : 'btn btn-sm filters-toggle'}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </button>
        <div className={showFilters ? 'filter-group open' : 'filter-group'}>
          <FilterSelect label="Area" value={filters.area} options={areas} onChange={(v) => set('area', v)} />
          <FilterSelect label="Status" value={filters.status} options={statuses} onChange={(v) => set('status', v)} />
          <FilterSelect label="Phase" value={filters.phase} options={phases} onChange={(v) => set('phase', v)} />
          <FilterSelect label="Priority" value={filters.priority} options={priorities} onChange={(v) => set('priority', v)} />
          <FilterSelect label="Assigned" value={filters.assigned} options={trades} onChange={(v) => set('assigned', v)} />
          <FilterSelect
            label="Flag"
            value={filters.flag}
            options={[{ name: 'OVERDUE' }, { name: 'Due this week' }]}
            onChange={(v) => set('flag', v)}
          />
          <label className="check">
            <input type="checkbox" checked={filters.hideDone} onChange={(e) => set('hideDone', e.target.checked)} />
            Hide done
          </label>
          {narrow && (
            <select
              className={sort ? 'filter active' : 'filter'}
              aria-label="Sort"
              value={MOBILE_SORTS.find((m) => m.sort?.key === sort?.key)?.value ?? ''}
              onChange={(e) => setSort(MOBILE_SORTS.find((m) => m.value === e.target.value)?.sort ?? null)}
            >
              {MOBILE_SORTS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {anyFilter && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters(filtersFrom(new URLSearchParams()))}>
            Clear
          </button>
        )}
        <span className="spacer" />
        {!sort && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(parents))}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {sort && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSort(null)}>
            Reset sort
          </button>
        )}
        <span className="muted small">
          {visible.length} of {rows.length}
        </span>
      </div>

      {narrow ? (
        <TaskCards
          items={visible}
          sorted={!!sort}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          onEdit={edit}
          onAddSubtask={addSubtask}
          empty={rows.length ? 'No tasks match these filters.' : 'No tasks yet — add your first one.'}
        />
      ) : (
        <div className="card flush">
          <div className="table-scroll tall">
            <table className="grid task-grid">
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const sortable = c.key !== 'dependsOn' && c.key !== 'notes'
                    const active = sort?.key === c.key
                    return (
                      <th key={c.key} className={[c.num && 'num', `col-${c.key}`].filter(Boolean).join(' ')}>
                        {sortable ? (
                          <button className="th-btn" onClick={() => toggleSort(c.key as SortKey)}>
                            {c.label}
                            <span className="sort-ind">{active ? (sort!.dir === 1 ? '▲' : '▼') : ''}</span>
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row: r, depth }) => (
                  <tr
                    key={r.id}
                    className={[r.status === DONE && 'row-done', r.subtaskCount > 0 && 'row-parent'].filter(Boolean).join(' ')}
                    onClick={() => edit(r)}
                  >
                    <td className="col-id">
                      <span className="id-cell" style={{ paddingLeft: depth * 16 }}>
                        {r.subtaskCount > 0 && !sort ? (
                          <button
                            className="caret"
                            aria-label={collapsed.has(r.id) ? 'Expand' : 'Collapse'}
                            onClick={stop(() => toggleCollapsed(r.id))}
                          >
                            {collapsed.has(r.id) ? '▸' : '▾'}
                          </button>
                        ) : (
                          <span className="caret-space" />
                        )}
                        <code>{r.id}</code>
                      </span>
                    </td>
                    <td className="col-title">
                      <span className="title-cell">
                        <span className="title-text">{r.title}</span>
                        <button className="add-sub" title="Add sub-task" onClick={stop(() => addSubtask(r))}>
                          + sub
                        </button>
                      </span>
                    </td>
                    <td>{r.area}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={`${statusClass(r.status)} status-select`}
                        value={r.status}
                        aria-label={`Status of ${r.id}`}
                        onChange={(e) => api.setTaskStatus(r, e.target.value)}
                      >
                        {statuses.map((s) => (
                          <option key={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>{r.priority && <span className={`prio prio-${r.priority.toLowerCase()}`}>{r.priority}</span>}</td>
                    <td className="nowrap">{r.phase}</td>
                    <td className="nowrap">{r.assigned_to}</td>
                    <td className="nowrap">{formatDate(r.start_date)}</td>
                    <td className={r.flag === 'OVERDUE' ? 'nowrap negative' : 'nowrap'}>{formatDate(r.due_date)}</td>
                    <td className="nowrap">{formatDate(r.done_date)}</td>
                    <td>
                      <span className="deps">
                        {r.dependsOn.map((d) => {
                          const dep = byId.get(d)
                          const done = dep?.status === DONE
                          return (
                            <code key={d} className={done ? 'dep dep-done' : 'dep'} title={dep ? `${dep.title} — ${dep.status}` : d}>
                              {d}
                            </code>
                          )
                        })}
                      </span>
                    </td>
                    <td>{r.permit}</td>
                    <td className="num">{formatMoney(r.est_cost)}</td>
                    <td className="num">{formatMoney(r.actual_cost)}</td>
                    <td className={r.variance != null && r.variance > 0 ? 'num negative' : 'num'}>{formatMoney(r.variance)}</td>
                    <td className="num">{r.subtaskCount || ''}</td>
                    <td>
                      <ProgressBar value={r.progress} />
                    </td>
                    <td>
                      <FlagPill flag={r.flag} />
                    </td>
                    <td className="col-notes" title={r.notes ?? ''}>
                      {r.notes}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="empty">
                      {rows.length ? 'No tasks match these filters.' : 'No tasks yet — add your first one.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button className="fab mobile-only" aria-label="New task" onClick={() => newTask()}>
        +
      </button>

      {editing && (
        <TaskForm
          key={editing.originalId ?? `new:${editing.task.parent_id ?? ''}`}
          originalId={editing.originalId}
          initial={editing.task}
          onClose={() => setEditing(null)}
          onAddSubtask={(parent) => addSubtask(parent)}
        />
      )}
    </div>
  )
}

function TaskCards({
  items,
  sorted,
  collapsed,
  onToggle,
  onEdit,
  onAddSubtask,
  empty,
}: {
  items: { row: TaskRow; depth: number }[]
  sorted: boolean
  collapsed: Set<string>
  onToggle(id: string): void
  onEdit(r: TaskRow): void
  onAddSubtask(r: TaskRow): void
  empty: string
}) {
  const { statuses, api } = useData()
  if (items.length === 0) return <p className="card empty">{empty}</p>
  return (
    <ul className="task-cards">
      {items.map(({ row: r, depth }) => {
        const isParent = r.subtaskCount > 0
        return (
          <li
            key={r.id}
            className={['task-card', isParent && 'is-parent', r.status === DONE && 'is-done'].filter(Boolean).join(' ')}
            style={{ marginLeft: Math.min(depth, 3) * 14 }}
          >
            <button className="task-card-main" onClick={() => onEdit(r)}>
              <span className="task-card-top">
                <code>{r.id}</code>
                {r.priority === 'High' && <span className="prio prio-high">High</span>}
                <FlagPill flag={r.flag} />
              </span>
              <span className="task-card-title">{r.title}</span>
              <span className="task-card-meta">
                {[r.assigned_to, r.due_date && `Due ${formatDate(r.due_date)}`, sorted && r.area].filter(Boolean).join(' · ')}
              </span>
              {isParent && (
                <span className="task-card-progress">
                  <ProgressBar value={r.progress} />
                  <span className="muted small nowrap">
                    {r.subtaskCount} sub-task{r.subtaskCount > 1 ? 's' : ''}
                  </span>
                </span>
              )}
            </button>
            <div className="task-card-actions">
              <select
                className={`${statusClass(r.status)} status-select`}
                value={r.status}
                aria-label={`Status of ${r.id}`}
                onChange={(e) => api.setTaskStatus(r, e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => onAddSubtask(r)}>
                + Sub-task
              </button>
              {isParent && !sorted && (
                <button
                  className="btn btn-ghost btn-sm"
                  aria-expanded={!collapsed.has(r.id)}
                  onClick={() => onToggle(r.id)}
                >
                  {collapsed.has(r.id) ? 'Show' : 'Hide'} {r.subtaskCount}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { name: string }[]
  onChange(v: string): void
}): ReactNode {
  return (
    <select className={value ? 'filter active' : 'filter'} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o.name} value={o.name}>
          {o.name}
        </option>
      ))}
    </select>
  )
}

function stop(fn: () => void) {
  return (e: { stopPropagation(): void }) => {
    e.stopPropagation()
    fn()
  }
}
