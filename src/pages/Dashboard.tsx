import { useState } from 'react'
import { useData } from '../lib/data'
import { useDerived } from '../lib/useDerived'
import { daysBetween } from '../lib/calc'
import { href } from '../lib/route'
import { useIsNarrow } from '../lib/useMediaQuery'
import type { AreaSummary } from '../lib/calc'
import { ProgressBar, formatDate, formatMoney, formatPercent, toNumber } from '../components/ui'

export function Dashboard() {
  const { settings, api } = useData()
  const { today, summary } = useDerived()
  const narrow = useIsNarrow()
  const s = settings[0]
  const days = s?.possession_date ? daysBetween(today, s.possession_date) : null

  return (
    <div className="stack">
      <section className="hero">
        <div className="countdown card">
          <div className="countdown-number">{days == null ? '—' : days > 0 ? days : '🔑'}</div>
          <div>
            <div className="countdown-label">
              {days == null ? 'Set a possession date' : days > 0 ? `day${days === 1 ? '' : 's'} until possession` : 'Moved in'}
            </div>
            <label className="inline-field">
              <span className="muted">Possession</span>
              <input
                type="date"
                value={s?.possession_date ?? ''}
                onChange={(e) => api.updateSettings({ possession_date: e.target.value || null })}
              />
            </label>
            <div className="muted small">Today is {formatDate(today, { weekday: true })}</div>
          </div>
        </div>

        <a className={summary.overdue > 0 ? 'kpi card kpi-alert' : 'kpi card'} href={href('tasks', { flag: 'OVERDUE' })}>
          <span className="kpi-value">{summary.overdue}</span>
          <span className="kpi-label">Overdue</span>
        </a>
        <a className="kpi card" href={href('tasks', { flag: 'Due this week' })}>
          <span className="kpi-value">{summary.dueThisWeek}</span>
          <span className="kpi-label">Due in next 7 days</span>
        </a>
        <div className="kpi card">
          <span className="kpi-value">{formatPercent(summary.overallProgress)}</span>
          <span className="kpi-label">Overall progress</span>
          <ProgressBar value={summary.overallProgress} label={false} />
        </div>
      </section>

      <section className="card flush">
        <div className="card-head">
          <h2>By area</h2>
          <span className="muted small">Costs and % complete count only rows without sub-tasks.</span>
        </div>
        {narrow ? (
          <div className="area-cards">
            {summary.areas.map((a) => (
              <AreaCard key={a.area} a={a} />
            ))}
            <AreaCard a={{ ...summary.total, area: 'Total' }} total />
          </div>
        ) : (
          <div className="table-scroll">
            <table className="grid dashboard-grid">
              <thead>
                <tr>
                  <th>Area</th>
                  <th className="num">Tasks</th>
                  <th className="num">Sub-tasks</th>
                  <th className="num">In Progress</th>
                  <th className="num">Done</th>
                  <th>% Complete</th>
                  <th>Next Due</th>
                  <th className="num">Budget</th>
                  <th className="num">Est. Cost</th>
                  <th className="num">Actual</th>
                  <th className="num">Remaining</th>
                  <th className="num">Variance vs Est.</th>
                </tr>
              </thead>
              <tbody>
                {summary.areas.map((a) => (
                  <tr key={a.area}>
                    <td>
                      <a href={href('tasks', { area: a.area })}>{a.area}</a>
                    </td>
                    <td className="num">{a.tasks}</td>
                    <td className="num">{a.subtasks}</td>
                    <td className="num">{a.inProgress}</td>
                    <td className="num">{a.done}</td>
                    <td>
                      <ProgressBar value={a.percentComplete} />
                    </td>
                    <td>{formatDate(a.nextDue)}</td>
                    <td className="num">
                      <BudgetInput area={a.area} value={a.budget} />
                    </td>
                    <td className="num">{formatMoney(a.estCost)}</td>
                    <td className="num">{formatMoney(a.actualCost)}</td>
                    <td className={a.remainingBudget != null && a.remainingBudget < 0 ? 'num negative' : 'num'}>
                      {formatMoney(a.remainingBudget)}
                    </td>
                    <td className={a.variance > 0 ? 'num negative' : 'num'}>{formatMoney(a.variance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{summary.total.tasks}</td>
                  <td className="num">{summary.total.subtasks}</td>
                  <td className="num">{summary.total.inProgress}</td>
                  <td className="num">{summary.total.done}</td>
                  <td>
                    <ProgressBar value={summary.total.percentComplete} />
                  </td>
                  <td>{formatDate(summary.total.nextDue)}</td>
                  <td className="num">{formatMoney(summary.total.budget)}</td>
                  <td className="num">{formatMoney(summary.total.estCost)}</td>
                  <td className="num">{formatMoney(summary.total.actualCost)}</td>
                  <td className={(summary.total.remainingBudget ?? 0) < 0 ? 'num negative' : 'num'}>
                    {formatMoney(summary.total.remainingBudget)}
                  </td>
                  <td className={summary.total.variance > 0 ? 'num negative' : 'num'}>
                    {formatMoney(summary.total.variance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <OrderOfWork />
    </div>
  )
}

function AreaCard({ a, total }: { a: AreaSummary; total?: boolean }) {
  const remainingNegative = a.remainingBudget != null && a.remainingBudget < 0
  return (
    <div className={total ? 'area-card is-total' : 'area-card'}>
      <div className="area-card-head">
        {total ? <strong>Total</strong> : <a href={href('tasks', { area: a.area })}>{a.area}</a>}
        {a.nextDue && <span className="muted small nowrap">Next due {formatDate(a.nextDue)}</span>}
      </div>
      <ProgressBar value={a.percentComplete} />
      <div className="muted small">
        {a.tasks} tasks · {a.subtasks} sub-tasks · {a.inProgress} in progress · {a.done} done
      </div>
      <dl className="area-card-money">
        <div>
          <dt>Budget</dt>
          <dd>{total ? formatMoney(a.budget) : <BudgetInput area={a.area} value={a.budget} />}</dd>
        </div>
        <div>
          <dt>Est.</dt>
          <dd>{formatMoney(a.estCost)}</dd>
        </div>
        <div>
          <dt>Actual</dt>
          <dd>{formatMoney(a.actualCost)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd className={remainingNegative ? 'negative' : undefined}>{formatMoney(a.remainingBudget) || '—'}</dd>
        </div>
      </dl>
    </div>
  )
}

function BudgetInput({ area, value }: { area: string; value: number | null }) {
  const { api } = useData()
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const next = toNumber(draft)
    setDraft(null)
    if (next !== value) api.updateArea(area, { budget: next })
  }
  return (
    <input
      className="cell-input num"
      inputMode="decimal"
      placeholder="—"
      aria-label={`Budget for ${area}`}
      value={draft ?? formatMoney(value)}
      onFocus={() => setDraft(value == null ? '' : String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function OrderOfWork() {
  const { settings, api } = useData()
  const steps = settings[0]?.order_of_work ?? []
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <section className="card">
      <div className="card-head">
        <h2>Recommended order of work</h2>
        {draft === null ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setDraft(steps.join('\n'))}>
            Edit
          </button>
        ) : (
          <div className="row gap-sm">
            <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const next = draft.split('\n').map((l) => l.trim()).filter(Boolean)
                if (await api.updateSettings({ order_of_work: next })) setDraft(null)
              }}
            >
              Save
            </button>
          </div>
        )}
      </div>
      {draft === null ? (
        steps.length ? (
          <ol className="steps">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">No steps yet.</p>
        )
      ) : (
        <textarea
          className="steps-editor"
          rows={Math.max(6, draft.split('\n').length + 1)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="One step per line"
          autoFocus
        />
      )}
    </section>
  )
}
