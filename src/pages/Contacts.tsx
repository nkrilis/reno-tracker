import { useState, type FormEvent } from 'react'
import { useData } from '../lib/data'
import type { Contact, Hired } from '../lib/types'
import { useIsNarrow } from '../lib/useMediaQuery'
import { Field, Modal, OptionSelect, formatDate, formatMoney, toNumber } from '../components/ui'

type Draft = Omit<Contact, 'id'> & { id?: string }

const BLANK: Draft = {
  name: null, company: null, trade: null, phone: null, email: null, areas: null,
  quote: null, quote_date: null, hired: null, start_date: null, notes: null,
}

const HIRED: Hired[] = ['Yes', 'No', 'Maybe']

export function Contacts() {
  const { contacts } = useData()
  const [editing, setEditing] = useState<Draft | null>(null)
  const narrow = useIsNarrow()

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Contacts &amp; Quotes</h1>
        <button className="btn btn-primary desktop-only" onClick={() => setEditing(BLANK)}>
          + Add contact
        </button>
      </div>

      {narrow ? (
        <ContactCards contacts={contacts} onEdit={setEditing} />
      ) : (
        <div className="card flush">
          <div className="table-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Trade</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Area(s)</th>
                  <th className="num">Quote</th>
                  <th>Quote Date</th>
                  <th>Hired?</th>
                  <th>Start Date</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} onClick={() => setEditing(c)}>
                    <td className="strong">{c.name}</td>
                    <td>{c.company}</td>
                    <td className="nowrap">{c.trade}</td>
                    <td className="nowrap">
                      {c.phone && (
                        <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()}>
                          {c.phone}
                        </a>
                      )}
                    </td>
                    <td>
                      {c.email && (
                        <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>
                          {c.email}
                        </a>
                      )}
                    </td>
                    <td>{c.areas}</td>
                    <td className="num">{formatMoney(c.quote)}</td>
                    <td className="nowrap">{formatDate(c.quote_date)}</td>
                    <td>{c.hired && <span className={`pill hired-${c.hired.toLowerCase()}`}>{c.hired}</span>}</td>
                    <td className="nowrap">{formatDate(c.start_date)}</td>
                    <td className="col-notes" title={c.notes ?? ''}>
                      {c.notes}
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={11} className="empty">
                      Log trades, phone numbers and quotes here as they come in.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button className="fab mobile-only" aria-label="Add contact" onClick={() => setEditing(BLANK)}>
        +
      </button>

      {editing && <ContactForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ContactCards({ contacts, onEdit }: { contacts: Contact[]; onEdit(c: Contact): void }) {
  if (contacts.length === 0) {
    return <p className="card empty">Log trades, phone numbers and quotes here as they come in.</p>
  }
  return (
    <ul className="task-cards">
      {contacts.map((c) => (
        <li key={c.id} className="task-card">
          <button className="task-card-main" onClick={() => onEdit(c)}>
            <span className="task-card-top">
              <strong>{c.name || c.company || 'Unnamed'}</strong>
              {c.hired && <span className={`pill hired-${c.hired.toLowerCase()}`}>Hired: {c.hired}</span>}
            </span>
            <span className="task-card-meta">
              {[c.name && c.company, c.trade, c.areas].filter(Boolean).join(' · ')}
            </span>
            {c.quote != null && (
              <span className="task-card-meta">
                <strong className="quote">{formatMoney(c.quote)}</strong>
                {c.quote_date && ` quoted ${formatDate(c.quote_date)}`}
              </span>
            )}
            {c.notes && <span className="task-card-meta">{c.notes}</span>}
          </button>
          {(c.phone || c.email) && (
            <div className="task-card-actions">
              {c.phone && (
                <a className="btn btn-sm" href={`tel:${c.phone}`}>
                  Call {c.phone}
                </a>
              )}
              {c.email && (
                <a className="btn btn-sm" href={`mailto:${c.email}`}>
                  Email
                </a>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function ContactForm({ initial, onClose }: { initial: Draft; onClose(): void }) {
  const { trades, api } = useData()
  const [form, setForm] = useState(initial)
  const [quote, setQuote] = useState(initial.quote?.toString() ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }))
  const text = (k: 'name' | 'company' | 'phone' | 'email' | 'areas' | 'notes') => ({
    value: form[k] ?? '',
    onChange: (e: { target: { value: string } }) => set(k, e.target.value || null),
  })
  const quoteInvalid = quote.trim() !== '' && toNumber(quote) == null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (quoteInvalid) return
    if (await api.saveContact({ ...form, quote: toNumber(quote) })) onClose()
  }

  return (
    <Modal
      title={initial.id ? `Edit ${initial.name ?? 'contact'}` : 'New contact'}
      onClose={onClose}
      footer={
        <>
          {initial.id &&
            (confirmDelete ? (
              <span className="row gap-sm">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={async () => (await api.deleteContact(initial.id!)) && onClose()}
                >
                  Delete contact
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
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="contact-form" className="btn btn-primary">
            Save
          </button>
        </>
      }
    >
      <form id="contact-form" className="form-grid" onSubmit={submit}>
        <Field label="Name">
          <input {...text('name')} data-autofocus />
        </Field>
        <Field label="Company">
          <input {...text('company')} />
        </Field>
        <Field label="Trade">
          <OptionSelect value={form.trade} options={trades} onChange={(v) => set('trade', v)} />
        </Field>
        <Field label="Area(s)">
          <input {...text('areas')} placeholder="e.g. Attic, Basement" />
        </Field>
        <Field label="Phone">
          <input type="tel" {...text('phone')} />
        </Field>
        <Field label="Email">
          <input type="email" {...text('email')} />
        </Field>
        <Field label="Quote ($)" hint={quoteInvalid && <span className="error-text">Not a number</span>}>
          <input inputMode="decimal" value={quote} onChange={(e) => setQuote(e.target.value)} />
        </Field>
        <Field label="Quote Date">
          <input type="date" value={form.quote_date ?? ''} onChange={(e) => set('quote_date', e.target.value || null)} />
        </Field>
        <Field label="Hired?">
          <select value={form.hired ?? ''} onChange={(e) => set('hired', (e.target.value || null) as Hired | null)}>
            <option value="">—</option>
            {HIRED.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Start Date">
          <input type="date" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
        </Field>
        <Field label="Notes" wide>
          <textarea rows={3} {...text('notes')} />
        </Field>
      </form>
    </Modal>
  )
}
