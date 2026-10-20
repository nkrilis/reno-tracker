-- Home Renovation Tracker schema.
-- Mirrors the spreadsheet: Lists → lookup tables, Tasks → tasks + task_dependencies,
-- Contacts & Quotes → contacts, Dashboard inputs → settings + areas.budget.
-- Calculated columns (variance, # sub-tasks, progress, flag) are derived in the app.

-- ---------------------------------------------------------------------------
-- Lookup lists (the "Lists" sheet). Text primary keys keep task rows readable;
-- ON UPDATE CASCADE means renaming an option rewrites every task that uses it.
-- Deleting an option that is still in use is blocked by the foreign keys.
-- ---------------------------------------------------------------------------

create table public.areas (
  name        text primary key,
  code        text unique check (code ~ '^[A-Z0-9]+$'),  -- ID prefix, e.g. MOLD
  budget      numeric(12, 2),                             -- Dashboard "Budget ($)"
  sort_order  integer not null default 0
);

create table public.statuses (
  name        text primary key,
  sort_order  integer not null default 0
);

create table public.priorities (
  name        text primary key,
  sort_order  integer not null default 0
);

create table public.phases (
  name        text primary key,
  sort_order  integer not null default 0
);

-- "Assigned To" on tasks and "Trade" on contacts share this list, as in the sheet.
create table public.trades (
  name        text primary key,
  sort_order  integer not null default 0
);

create table public.permit_options (
  name        text primary key,
  sort_order  integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Project settings (single row).
-- ---------------------------------------------------------------------------

create table public.settings (
  id               integer primary key default 1 check (id = 1),
  project_name     text not null default 'Home Renovation',
  possession_date  date,
  order_of_work    text[] not null default '{}',
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tasks. The human-readable ID (MOLD-2.5) is the primary key; sub-tasks point
-- at their parent through parent_id. Renaming an ID cascades to sub-tasks and
-- dependencies; deleting a task deletes its sub-tasks.
-- ---------------------------------------------------------------------------

create table public.tasks (
  id           text primary key check (id ~ '^[A-Z0-9]+-[0-9]+(\.[0-9]+)*$'),
  parent_id    text references public.tasks (id) on update cascade on delete cascade,
  area         text references public.areas (name) on update cascade,
  title        text not null check (length(trim(title)) > 0),
  status       text not null references public.statuses (name) on update cascade,
  priority     text references public.priorities (name) on update cascade,
  phase        text references public.phases (name) on update cascade,
  assigned_to  text references public.trades (name) on update cascade,
  start_date   date,
  due_date     date,
  done_date    date,
  permit       text references public.permit_options (name) on update cascade,
  est_cost     numeric(12, 2),
  actual_cost  numeric(12, 2),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create index tasks_parent_id_idx on public.tasks (parent_id);
create index tasks_area_idx on public.tasks (area);

-- "Depends On" (e.g. "MOLD-2, MOLD-3") as a proper many-to-many table.
create table public.task_dependencies (
  task_id        text not null references public.tasks (id) on update cascade on delete cascade,
  depends_on_id  text not null references public.tasks (id) on update cascade on delete cascade,
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);

create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_id);

-- ---------------------------------------------------------------------------
-- Contacts & Quotes.
-- ---------------------------------------------------------------------------

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  company     text,
  trade       text references public.trades (name) on update cascade,
  phone       text,
  email       text,
  areas       text,            -- free text, e.g. "Attic, Basement"
  quote       numeric(12, 2),
  quote_date  date,
  hired       text check (hired in ('Yes', 'No', 'Maybe')),
  start_date  date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance.
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Save a task and its dependency list in one transaction. original_id is null
-- for a new task, otherwise the task's current ID (which may be changing).
-- ---------------------------------------------------------------------------

create function public.save_task(original_id text, task jsonb, depends_on text[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.tasks := jsonb_populate_record(null::public.tasks, task);
begin
  if original_id is null then
    insert into public.tasks (
      id, parent_id, area, title, status, priority, phase, assigned_to,
      start_date, due_date, done_date, permit, est_cost, actual_cost, notes
    ) values (
      r.id, r.parent_id, r.area, r.title, r.status, r.priority, r.phase, r.assigned_to,
      r.start_date, r.due_date, r.done_date, r.permit, r.est_cost, r.actual_cost, r.notes
    );
  else
    update public.tasks set
      id = r.id, parent_id = r.parent_id, area = r.area, title = r.title,
      status = r.status, priority = r.priority, phase = r.phase,
      assigned_to = r.assigned_to, start_date = r.start_date, due_date = r.due_date,
      done_date = r.done_date, permit = r.permit, est_cost = r.est_cost,
      actual_cost = r.actual_cost, notes = r.notes
    where id = original_id;
    if not found then
      raise exception 'Task % no longer exists', original_id;
    end if;
  end if;

  delete from public.task_dependencies where task_id = r.id;
  insert into public.task_dependencies (task_id, depends_on_id)
    select distinct r.id, d from unnest(coalesce(depends_on, '{}')) as d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: any signed-in user of this Supabase project can read and
-- edit everything (a shared household project). Turn off public sign-ups in
-- Authentication → Providers → Email and invite the people who should have access.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'areas', 'statuses', 'priorities', 'phases', 'trades', 'permit_options',
    'settings', 'tasks', 'task_dependencies', 'contacts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "signed-in users have full access" on public.%I
         for all to authenticated using (true) with check (true)', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end;
$$;

insert into public.settings (id) values (1);
