import { useEffect, useRef, type ReactNode } from 'react'
import type { Flag } from '../lib/calc'

const money = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

export function formatMoney(n: number | null | undefined): string {
  return n == null ? '' : money.format(n)
}

export function formatDate(iso: string | null | undefined, opts: { weekday?: boolean } = {}): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    weekday: opts.weekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: y === new Date().getFullYear() ? undefined : 'numeric',
  })
}

export function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`
}

/** Status → CSS class, mirroring the spreadsheet's highlights. */
export function statusClass(status: string): string {
  if (status === 'Done') return 'pill pill-done'
  if (status === 'In Progress') return 'pill pill-progress'
  if (status.startsWith('Waiting')) return 'pill pill-waiting'
  if (status === 'On Hold') return 'pill pill-hold'
  if (status === 'Planned') return 'pill pill-planned'
  return 'pill'
}

export function FlagPill({ flag }: { flag: Flag }) {
  if (!flag) return null
  return <span className={flag === 'OVERDUE' ? 'pill pill-overdue' : 'pill pill-soon'}>{flag === 'OVERDUE' ? 'Overdue' : 'This week'}</span>
}

export function ProgressBar({ value, label = true }: { value: number; label?: boolean }) {
  return (
    <span className="progress" title={formatPercent(value)}>
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${Math.min(100, value * 100)}%` }} />
      </span>
      {label && <span className="progress-label">{formatPercent(value)}</span>}
    </span>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    // showModal() focuses the first button (the ×); move focus to the form instead.
    const target =
      dialog?.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog?.querySelector<HTMLElement>('.modal-body input, .modal-body select, .modal-body textarea')
    target?.focus()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal modal-wide' : 'modal'}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  )
}

export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'field field-wide' : 'field'}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function OptionSelect({
  value,
  options,
  onChange,
  placeholder = '—',
  required,
}: {
  value: string | null
  options: { name: string }[]
  onChange(v: string | null): void
  placeholder?: string
  required?: boolean
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} required={required}>
      {!required && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.name} value={o.name}>
          {o.name}
        </option>
      ))}
    </select>
  )
}

/** Parse a form value into number | null. */
export function toNumber(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
