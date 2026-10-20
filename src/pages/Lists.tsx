import { useState, type FormEvent } from 'react'
import { useData } from '../lib/data'
import type { ListTable } from '../lib/types'

// The app treats these statuses specially (progress, highlighting), like the spreadsheet did.
const LOCKED_STATUSES = new Set(['Done', 'In Progress'])

const LISTS: { table: ListTable; title: string; note?: string }[] = [
  { table: 'statuses', title: 'Status', note: '“Done” and “In Progress” drive progress and can’t be renamed.' },
  { table: 'priorities', title: 'Priority' },
  { table: 'phases', title: 'Phase' },
  { table: 'trades', title: 'Assigned To / Trade', note: 'Also used for the Trade column on Contacts.' },
  { table: 'permit_options', title: 'Permit / Inspection?' },
]

export function Lists() {
  const data = useData()
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Lists</h1>
        <p className="muted">
          Dropdown options. Renaming an option updates every task that uses it; options still in use can’t be deleted.
        </p>
      </div>
      <div className="lists-grid">
        <AreasCard />
        {LISTS.map((l) => (
          <ListCard
            key={l.table}
            table={l.table}
            title={l.title}
            note={l.note}
            items={data[l.table].map((o) => o.name)}
            locked={l.table === 'statuses' ? LOCKED_STATUSES : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function AreasCard() {
  const { areas, api } = useData()
  return (
    <section className="card list-card list-card-wide">
      <h2>Areas</h2>
      <p className="muted small">The code is the ID prefix used to suggest new task IDs (e.g. KIT → KIT-11).</p>
      <ul className="option-list">
        {areas.map((a, i) => (
          <li key={a.name}>
            <EditableText value={a.name} onCommit={(v) => api.renameOption('areas', a.name, v)} />
            <EditableText
              className="mono code-input"
              value={a.code ?? ''}
              placeholder="CODE"
              transform={(v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '')}
              allowEmpty
              onCommit={(v) => api.updateArea(a.name, { code: v || null })}
            />
            <MoveButtons first={i === 0} last={i === areas.length - 1} onMove={(d) => api.moveOption('areas', a.name, d)} />
            <button className="icon-btn" aria-label={`Delete ${a.name}`} onClick={() => api.deleteOption('areas', a.name)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <AddOption table="areas" existing={areas.map((a) => a.name)} />
    </section>
  )
}

function ListCard({
  table,
  title,
  note,
  items,
  locked,
}: {
  table: ListTable
  title: string
  note?: string
  items: string[]
  locked?: Set<string>
}) {
  const { api } = useData()
  return (
    <section className="card list-card">
      <h2>{title}</h2>
      {note && <p className="muted small">{note}</p>}
      <ul className="option-list">
        {items.map((name, i) => (
          <li key={name}>
            {locked?.has(name) ? (
              <span className="locked" title="Built-in">
                {name}
              </span>
            ) : (
              <EditableText value={name} onCommit={(v) => api.renameOption(table, name, v)} />
            )}
            <MoveButtons first={i === 0} last={i === items.length - 1} onMove={(d) => api.moveOption(table, name, d)} />
            {!locked?.has(name) && (
              <button className="icon-btn" aria-label={`Delete ${name}`} onClick={() => api.deleteOption(table, name)}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <AddOption table={table} existing={items} />
    </section>
  )
}

function EditableText({
  value,
  onCommit,
  className,
  placeholder,
  transform = (v) => v,
  allowEmpty,
}: {
  value: string
  onCommit(v: string): void
  className?: string
  placeholder?: string
  transform?(v: string): string
  allowEmpty?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (next !== value && (next || allowEmpty)) onCommit(next)
  }
  return (
    <input
      className={`cell-input ${className ?? ''}`}
      value={draft ?? value}
      placeholder={placeholder}
      onChange={(e) => setDraft(transform(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}

function MoveButtons({ first, last, onMove }: { first: boolean; last: boolean; onMove(d: -1 | 1): void }) {
  return (
    <span className="move">
      <button className="icon-btn" disabled={first} onClick={() => onMove(-1)} aria-label="Move up">
        ↑
      </button>
      <button className="icon-btn" disabled={last} onClick={() => onMove(1)} aria-label="Move down">
        ↓
      </button>
    </span>
  )
}

function AddOption({ table, existing }: { table: ListTable | 'areas'; existing: string[] }) {
  const { api } = useData()
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const duplicate = existing.some((e) => e.toLowerCase() === trimmed.toLowerCase())

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || duplicate) return
    if (await api.addOption(table, trimmed)) setName('')
  }

  return (
    <form className="add-option" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add option…" />
      <button className="btn btn-sm" disabled={!trimmed || duplicate}>
        Add
      </button>
    </form>
  )
}
