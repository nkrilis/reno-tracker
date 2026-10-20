export interface Area {
  name: string
  code: string | null
  budget: number | null
  sort_order: number
}

export interface ListOption {
  name: string
  sort_order: number
}

export interface Settings {
  id: 1
  project_name: string
  possession_date: string | null
  order_of_work: string[]
}

export interface Task {
  id: string
  parent_id: string | null
  area: string | null
  title: string
  status: string
  priority: string | null
  phase: string | null
  assigned_to: string | null
  start_date: string | null
  due_date: string | null
  done_date: string | null
  permit: string | null
  est_cost: number | null
  actual_cost: number | null
  notes: string | null
}

export interface TaskDependency {
  task_id: string
  depends_on_id: string
}

export type Hired = 'Yes' | 'No' | 'Maybe'

export interface Contact {
  id: string
  name: string | null
  company: string | null
  trade: string | null
  phone: string | null
  email: string | null
  areas: string | null
  quote: number | null
  quote_date: string | null
  hired: Hired | null
  start_date: string | null
  notes: string | null
}

export type ListTable = 'statuses' | 'priorities' | 'phases' | 'trades' | 'permit_options'
