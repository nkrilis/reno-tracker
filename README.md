# Reno Tracker

A React + Supabase version of `Home_Renovation_Tracker.xlsx`: tasks with sub-tasks, a per-area dashboard with budgets, contacts & quotes, and editable dropdown lists.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Create the schema and load your spreadsheet data.** In the dashboard's SQL Editor, run these two files in order:
   - `supabase/migrations/20261020000000_init.sql`: tables, constraints, row level security, realtime
   - `supabase/seed.sql`: the lists, all 97 tasks and their dependencies, the possession date and the order of work from the spreadsheet

   With the [Supabase CLI](https://supabase.com/docs/guides/cli) you can run `supabase link` and then `supabase db push` instead, and load `seed.sql` from the SQL Editor.
3. **Configure auth** (Authentication in the dashboard):
   - URL Configuration: set the Site URL to where you run the app (`http://localhost:5173` for development) and add it to Redirect URLs.
   - Sign in once yourself and invite anyone else (Users → Invite). Then turn off **Allow new users to sign up**. Any signed-in user can edit everything, so sign-ups should stay closed.
4. **Connect the app:**
   ```sh
   cp .env.example .env.local   # fill in the URL and publishable (or anon) key
   npm install
   npm run dev
   ```

## How it maps to the spreadsheet

| Spreadsheet | App | Database |
| --- | --- | --- |
| Tasks sheet | **Tasks** page | `tasks`, `task_dependencies` |
| ID / Parent ID | Same IDs (`MOLD-2.5` → parent `MOLD-2`) | `tasks.id` is the primary key; `parent_id` references it |
| Depends On (`MOLD-2, MOLD-3`) | Comma-separated IDs, validated | one row per link in `task_dependencies` |
| Grey columns (Variance, # Sub-tasks, Progress, Flag) | Calculated live | not stored, see `src/lib/calc.ts` |
| Dashboard | **Dashboard** page | `settings` (possession date, order of work), `areas.budget` |
| Contacts & Quotes | **Contacts & Quotes** page | `contacts` |
| Lists sheet | **Lists** page | `areas`, `statuses`, `priorities`, `phases`, `trades`, `permit_options` |

The rules carry over from the spreadsheet:

- **Sub-tasks.** Give a sub-task its own ID and choose the parent. The row's **+ sub** button suggests the next free ID (e.g. `MOLD-2.5`). A new top-level task gets a suggested ID from its area's code (e.g. `KIT-11`).
- **Costs.** Enter costs on sub-tasks, or on tasks without sub-tasks. Dashboard totals and % complete only count rows with no sub-tasks, so parent rows aren't counted twice.
- **Flags.** A task that isn't Done is flagged *Overdue* when its due date has passed, and *This week* when it's due within 7 days.
- **Lists.** Renaming an option updates every task that uses it, through `ON UPDATE CASCADE`. An option that's still in use can't be deleted. "Done" and "In Progress" are built in.

Changes beyond the spreadsheet:

- **Renaming IDs.** Changing a task's ID carries its sub-tasks and dependencies over to the new ID.
- **Deleting.** Deleting a parent task also deletes its sub-tasks. The app asks you to confirm first.
- **Done date.** Setting a task to Done fills in the Done Date with today if it's empty.
- **Dependencies.** In the Depends On column, a dependency shows green once that task is done.
- **Live updates.** Changes from other devices or people appear right away (Supabase Realtime).
- **Dashboard links.** Clicking an area or a KPI on the Dashboard opens Tasks filtered to match.

## Development

```sh
npm test         # unit tests for the formulas, including a parity check against the spreadsheet's values
npm run build    # type-check + production build
```
