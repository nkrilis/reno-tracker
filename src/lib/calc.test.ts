import { describe, expect, it } from 'vitest'
import {
  compareIds, deriveRows, flagFor, nextSubtaskId, nextTaskId, parseIdList, summarize,
} from './calc'
import type { Area, Task, TaskDependency } from './types'
import fixture from './__fixtures__/spreadsheet.json'

const tasks = fixture.tasks as Task[]
const deps = fixture.deps as TaskDependency[]
const areaNames = [
  'Admin & Possession', 'Mold Remediation', 'Electrical Rough-in', 'Networking',
  'Security Cameras', 'Insulation', 'Lighting & Pot Lights', 'Kitchen', 'Laundry Room',
  'Upstairs Bath 1', 'Upstairs Bath 2', 'Trim & Doors (Whole House)', 'Other',
]
const areas: Area[] = areaNames.map((name, i) => ({ name, code: null, budget: null, sort_order: i }))

function task(over: Partial<Task>): Task {
  return {
    id: 'X-1', parent_id: null, area: 'Other', title: 't', status: 'Not Started',
    priority: null, phase: null, assigned_to: null, start_date: null, due_date: null,
    done_date: null, permit: null, est_cost: null, actual_cost: null, notes: null, ...over,
  }
}

describe('matches the spreadsheet dashboard (as of 2026-10-20)', () => {
  const rows = deriveRows(tasks, deps, '2026-10-20')
  const s = summarize(rows, areas)

  it('counts tasks and sub-tasks per area', () => {
    expect(s.areas.map((a) => [a.tasks, a.subtasks])).toEqual([
      [2, 6], [4, 10], [3, 6], [1, 6], [1, 4], [2, 4], [3, 3], [10, 3],
      [7, 0], [8, 0], [8, 0], [6, 0], [0, 0],
    ])
    expect([s.total.tasks, s.total.subtasks]).toEqual([55, 42])
  })

  it('finds the next due date per area', () => {
    expect(s.areas.map((a) => a.nextDue)).toEqual([
      '2026-11-04', '2026-11-06', '2026-11-10', '2026-11-10', '2026-11-10',
      '2026-11-13', '2026-11-13', null, null, null, null, null, null,
    ])
    expect(s.total.nextDue).toBe('2026-11-04')
  })

  it('computes sub-task counts on parent rows', () => {
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get('ADM-1')!.subtaskCount).toBe(4)
    expect(byId.get('MOLD-2')!.subtaskCount).toBe(4)
    expect(byId.get('MOLD-4')!.dependsOn).toEqual(['MOLD-2', 'MOLD-3'])
    expect(s.overdue).toBe(0)
    expect(s.overallProgress).toBe(0)
  })
})

describe('roll-ups', () => {
  const t = [
    task({ id: 'K-1', area: 'Other', est_cost: 999, actual_cost: 999 }),
    task({ id: 'K-1.1', parent_id: 'K-1', status: 'Done', est_cost: 100, actual_cost: 120 }),
    task({ id: 'K-1.2', parent_id: 'K-1', status: 'In Progress', est_cost: 50 }),
    task({ id: 'K-2', status: 'Done', due_date: '2026-01-01' }),
  ]
  const rows = deriveRows(t, [], '2026-10-20')
  const s = summarize(rows, [{ name: 'Other', code: 'K', budget: 500, sort_order: 0 }])

  it('parent progress is the share of done sub-tasks', () => {
    expect(rows[0].progress).toBe(0.5)
    expect(rows[1].variance).toBe(20)
    expect(rows[2].variance).toBeNull()
  })

  it('ignores parent rows for costs and % complete', () => {
    const a = s.areas[0]
    expect(a.estCost).toBe(150)
    expect(a.actualCost).toBe(120)
    expect(a.remainingBudget).toBe(380)
    expect(a.variance).toBe(-30)
    expect(a.percentComplete).toBeCloseTo(2 / 3)
    expect(a.inProgress).toBe(1)
    expect(a.done).toBe(2)
  })
})

describe('flags', () => {
  it('flags overdue and due within 7 days, never done tasks', () => {
    const today = '2026-10-20'
    expect(flagFor({ status: 'Planned', due_date: '2026-10-19' }, today)).toBe('OVERDUE')
    expect(flagFor({ status: 'Planned', due_date: '2026-10-20' }, today)).toBe('Due this week')
    expect(flagFor({ status: 'Planned', due_date: '2026-10-27' }, today)).toBe('Due this week')
    expect(flagFor({ status: 'Planned', due_date: '2026-10-28' }, today)).toBeNull()
    expect(flagFor({ status: 'Done', due_date: '2026-10-01' }, today)).toBeNull()
    expect(flagFor({ status: 'Planned', due_date: null }, today)).toBeNull()
  })
})

describe('ids', () => {
  it('sorts naturally', () => {
    expect(['ADM-2', 'ADM-1.10', 'ADM-1', 'ADM-1.2'].sort(compareIds))
      .toEqual(['ADM-1', 'ADM-1.2', 'ADM-1.10', 'ADM-2'])
  })
  it('suggests the next free id', () => {
    expect(nextSubtaskId('MOLD-2', ['MOLD-2', 'MOLD-2.1', 'MOLD-2.4', 'MOLD-2.4.1'])).toBe('MOLD-2.5')
    expect(nextTaskId('KIT', ['KIT-1', 'KIT-10', 'KIT-2.3'])).toBe('KIT-11')
    expect(nextTaskId('NEW', [])).toBe('NEW-1')
  })
  it('parses dependency lists', () => {
    expect(parseIdList('mold-2, MOLD-3,MOLD-2  ')).toEqual(['MOLD-2', 'MOLD-3'])
  })
})
