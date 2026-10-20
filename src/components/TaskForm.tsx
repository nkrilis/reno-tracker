import { useMemo, useState, type FormEvent } from 'react'
import { useData } from '../lib/data'
import { DONE, TASK_ID_PATTERN, nextSubtaskId, nextTaskId, parseIdList, todayISO } from '../lib/calc'
import type { Task } from '../lib/types'
import { Field, Modal, OptionSelect, toNumber } from './ui'

const TASK_FIELDS: (keyof Task)[] = [
  'id', 'parent_id', 'area', 'title', 'status', 'priority', 'phase', 'assigned_to', 'start_date',
  'due_date', 'done_date', 'permit', 'est_cost', 'actual_cost', 'notes',
]

function pickTask(t: Task): Task {
  return Object.fromEntries(TASK_FIELDS.map((k) => [k, t[k]])) as unknown as Task
}

export function TaskForm({
  originalId,
  initial,
  onClose,
  onAddSubtask,
}: {
  originalId: string | null
  initial: Task
  onClose(): void
  onAddSubtask(parent: Task): void
}) {
  const { tasks, task_dependencies, areas, statuses, priorities, phases, trades, permit_options, api } = useData()
  const isNew = originalId === null
  const ids = useMemo(() => tasks.map((t) => t.id), [tasks])

  const suggestId = (t: Task) => {
    if (t.parent_id) return nextSubtaskId(t.parent_id, ids)
    const code = areas.find((a) => a.name === t.area)?.code
    return code ? nextTaskId(code, ids) : ''
  }

  const [form, setForm] = useState<Task>(() => {
    const t = pickTask(initial)
    return isNew && !t.id ? { ...t, id: suggestId(t) } : t
  })
  const [idTouched, setIdTouched] = useState(!isNew)
  const [depsText, setDepsText] = useState(() =>
    task_dependencies.filter((d) => d.task_id === originalId).map((d) => d.depends_on_id).join(', '),
  )
  const [costs, setCosts] = useState({
    est: initial.est_cost?.toString() ?? '',
    actual: initial.actual_cost?.toString() ?? '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const update = (patch: Partial<Task>) =>
    setForm((f) => {
      const next = { ...f, ...patch }
      if (patch.status === DONE && !f.done_date) next.done_date = todayISO()
      if (isNew && !idTouched && ('parent_id' in patch || 'area' in patch)) next.id = suggestId(next) || f.id
      return next
    })

  // Can't pick yourself or your own descendants as parent.
  const descendants = useMemo(() => {
    const out = new Set<string>()
    if (!originalId) return out
    const walk = (id: string) => {
      for (const t of tasks) if (t.parent_id === id && !out.has(t.id)) (out.add(t.id), walk(t.id))
    }
    walk(originalId)
    return out
  }, [tasks, originalId])

  const subtaskCount = originalId ? tasks.filter((t) => t.parent_id === originalId).length : 0
  const deps = parseIdList(depsText)

  const errors: Partial<Record<'id' | 'title' | 'parent' | 'deps' | 'est' | 'actual', string>> = {}
  if (!TASK_ID_PATTERN.test(form.id)) errors.id = 'Use the form CODE-1 or CODE-1.2'
  else if (form.id !== originalId && ids.includes(form.id)) errors.id = `${form.id} already exists`
  if (!form.title.trim()) errors.title = 'Required'
  if (form.parent_id && (form.parent_id === originalId || descendants.has(form.parent_id))) {
    errors.parent = 'A task can’t be nested under itself'
  }
  const unknownDeps = deps.filter((d) => !ids.includes(d) || d === originalId || d === form.id)
  if (unknownDeps.length) errors.deps = `Not found or self: ${unknownDeps.join(', ')}`
  if (costs.est.trim() && toNumber(costs.est) == null) errors.est = 'Not a number'
  if (costs.actual.trim() && toNumber(costs.actual) == null) errors.actual = 'Not a number'
  const hasErrors = Object.keys(errors).length > 0
  const show = (k: keyof typeof errors) => (submitted || k === 'id' || k === 'deps' ? errors[k] : undefined)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors) return
    setSaving(true)
    const task: Task = {
      ...form,
      title: form.title.trim(),
      notes: form.notes?.trim() || null,
      est_cost: toNumber(costs.est),
      actual_cost: toNumber(costs.actual),
    }
    const ok = await api.saveTask(originalId, task, deps)
    setSaving(false)
    if (ok) onClose()
  }

  async function remove() {
    if (!originalId) return
    if (await api.deleteTask(originalId)) onClose()
  }

  const parentOptions = tasks.filter((t) => t.id !== originalId && !descendants.has(t.id))
  const depTitles = deps.map((d) => tasks.find((t) => t.id === d)).filter((t): t is Task => !!t)

  return (
    <Modal
      wide
      title={isNew ? (form.parent_id ? `New sub-task of ${form.parent_id}` : 'New task') : `Edit ${originalId}`}
      onClose={onClose}
      footer={
        <>
          {!isNew &&
            (confirmDelete ? (
              <span className="row gap-sm">
                <span className="error-text small">
                  Delete {originalId}
                  {subtaskCount ? ` and its ${subtaskCount} sub-task${subtaskCount > 1 ? 's' : ''}` : ''}?
                </span>
                <button type="button" className="btn btn-danger btn-sm" onClick={remove}>
                  Delete
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm danger-text" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
          {!isNew && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddSubtask(initial)}>
              + Add sub-task
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="task-form" className="form-grid" onSubmit={submit} noValidate>
        <Field
          label="ID"
          hint={
            show('id') ? (
              <span className="error-text">{show('id')}</span>
            ) : originalId && form.id !== originalId ? (
              'Sub-tasks and dependencies will follow the new ID.'
            ) : undefined
          }
        >
          <input
            className="mono"
            value={form.id}
            data-autofocus={isNew || undefined}
            onChange={(e) => {
              setIdTouched(true)
              update({ id: e.target.value.toUpperCase().replace(/\s/g, '') })
            }}
            placeholder="e.g. KIT-11"
          />
        </Field>
        <Field label="Parent ID" hint={show('parent') && <span className="error-text">{show('parent')}</span>}>
          <select
            className="parent-select"
            value={form.parent_id ?? ''}
            onChange={(e) => {
              const parent = tasks.find((t) => t.id === e.target.value)
              update(
                parent && isNew
                  ? { parent_id: parent.id, area: parent.area, phase: parent.phase, priority: parent.priority }
                  : { parent_id: e.target.value || null },
              )
            }}
          >
            <option value="">— none (top-level task) —</option>
            {parentOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} — {t.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Task / Sub-task" wide hint={show('title') && <span className="error-text">{show('title')}</span>}>
          <input value={form.title} onChange={(e) => update({ title: e.target.value })} data-autofocus={!isNew || undefined} />
        </Field>

        <Field label="Area">
          <OptionSelect value={form.area} options={areas} onChange={(area) => update({ area })} />
        </Field>
        <Field label="Status">
          <OptionSelect required value={form.status} options={statuses} onChange={(status) => update({ status: status! })} />
        </Field>
        <Field label="Priority">
          <OptionSelect value={form.priority} options={priorities} onChange={(priority) => update({ priority })} />
        </Field>
        <Field label="Phase">
          <OptionSelect value={form.phase} options={phases} onChange={(phase) => update({ phase })} />
        </Field>
        <Field label="Assigned To">
          <OptionSelect value={form.assigned_to} options={trades} onChange={(assigned_to) => update({ assigned_to })} />
        </Field>
        <Field label="Permit / Inspection?">
          <OptionSelect value={form.permit} options={permit_options} onChange={(permit) => update({ permit })} />
        </Field>

        <Field label="Start">
          <input type="date" value={form.start_date ?? ''} onChange={(e) => update({ start_date: e.target.value || null })} />
        </Field>
        <Field label="Due">
          <input type="date" value={form.due_date ?? ''} onChange={(e) => update({ due_date: e.target.value || null })} />
        </Field>
        <Field label="Done Date">
          <input type="date" value={form.done_date ?? ''} onChange={(e) => update({ done_date: e.target.value || null })} />
        </Field>

        <Field
          label="Depends On"
          wide
          hint={
            show('deps') ? (
              <span className="error-text">{show('deps')}</span>
            ) : depTitles.length ? (
              depTitles.map((t) => `${t.id}: ${t.title}${t.status === DONE ? ' ✓' : ''}`).join(' · ')
            ) : (
              'Comma-separated IDs, e.g. MOLD-2, MOLD-3'
            )
          }
        >
          <input className="mono" value={depsText} onChange={(e) => setDepsText(e.target.value)} list="task-ids" />
          <datalist id="task-ids">
            {ids.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </Field>

        <Field
          label="Est. Cost ($)"
          hint={
            show('est') ? (
              <span className="error-text">{show('est')}</span>
            ) : subtaskCount ? (
              'Has sub-tasks — dashboard totals use the sub-task costs.'
            ) : undefined
          }
        >
          <input inputMode="decimal" value={costs.est} onChange={(e) => setCosts((c) => ({ ...c, est: e.target.value }))} />
        </Field>
        <Field label="Actual Cost ($)" hint={show('actual') && <span className="error-text">{show('actual')}</span>}>
          <input inputMode="decimal" value={costs.actual} onChange={(e) => setCosts((c) => ({ ...c, actual: e.target.value }))} />
        </Field>

        <Field label="Notes" wide>
          <textarea rows={3} value={form.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} />
        </Field>
      </form>
    </Modal>
  )
}
