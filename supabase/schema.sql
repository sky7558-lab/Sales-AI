-- Sales-AI Dashboard schema
-- Run this in the Supabase SQL editor for your project.

-- 1. Workspaces (a workspace contains both partners; row-level security keys off membership)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Helper: list of workspaces the current user belongs to.
create or replace function public.current_user_workspaces()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.workspace_members
  where user_id = auth.uid();
$$;

-- 2. Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  detail text,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  assignee uuid references auth.users(id) on delete set null,
  due_date date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_workspace_idx on public.tasks(workspace_id);
create index if not exists tasks_due_idx on public.tasks(due_date);

-- 3. Daily check-ins (one row per user per day per workspace)
create table if not exists public.daily_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  check_date date not null,
  done text,        -- "오늘 한 일"
  next text,        -- "내일 할 일"
  blockers text,    -- "막힌 부분 / 도움 필요"
  mood smallint check (mood between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, check_date)
);
create index if not exists daily_checks_workspace_date_idx
  on public.daily_checks(workspace_id, check_date desc);

-- 4. Weekly check-ins (one row per user per ISO week per workspace)
create table if not exists public.weekly_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  wins text,
  losses text,
  next_week text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, week_start)
);

-- 5. Notes / discussion
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  title text,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_workspace_idx on public.notes(workspace_id, created_at desc);

-- 6. Row-level security
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_checks enable row level security;
alter table public.weekly_checks enable row level security;
alter table public.notes enable row level security;

-- workspaces: members can read their workspaces.
drop policy if exists "ws read" on public.workspaces;
create policy "ws read" on public.workspaces
  for select using (id in (select public.current_user_workspaces()));

-- workspace_members: a user can see other members of workspaces they belong to.
drop policy if exists "wm read" on public.workspace_members;
create policy "wm read" on public.workspace_members
  for select using (workspace_id in (select public.current_user_workspaces()));

-- A logged-in user may insert themselves into a workspace (for invite-by-id flow).
drop policy if exists "wm self join" on public.workspace_members;
create policy "wm self join" on public.workspace_members
  for insert with check (user_id = auth.uid());

-- Tasks: members can do everything within their workspace.
drop policy if exists "tasks rw" on public.tasks;
create policy "tasks rw" on public.tasks
  for all
  using (workspace_id in (select public.current_user_workspaces()))
  with check (workspace_id in (select public.current_user_workspaces()));

-- Daily / weekly checks: members can read all rows in workspace, but only edit their own.
drop policy if exists "daily read" on public.daily_checks;
create policy "daily read" on public.daily_checks
  for select using (workspace_id in (select public.current_user_workspaces()));
drop policy if exists "daily write own" on public.daily_checks;
create policy "daily write own" on public.daily_checks
  for insert with check (
    user_id = auth.uid() and workspace_id in (select public.current_user_workspaces())
  );
drop policy if exists "daily update own" on public.daily_checks;
create policy "daily update own" on public.daily_checks
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "daily delete own" on public.daily_checks;
create policy "daily delete own" on public.daily_checks
  for delete using (user_id = auth.uid());

drop policy if exists "weekly read" on public.weekly_checks;
create policy "weekly read" on public.weekly_checks
  for select using (workspace_id in (select public.current_user_workspaces()));
drop policy if exists "weekly write own" on public.weekly_checks;
create policy "weekly write own" on public.weekly_checks
  for insert with check (
    user_id = auth.uid() and workspace_id in (select public.current_user_workspaces())
  );
drop policy if exists "weekly update own" on public.weekly_checks;
create policy "weekly update own" on public.weekly_checks
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Notes: any member can read; only author can update/delete; any member can insert.
drop policy if exists "notes read" on public.notes;
create policy "notes read" on public.notes
  for select using (workspace_id in (select public.current_user_workspaces()));
drop policy if exists "notes insert" on public.notes;
create policy "notes insert" on public.notes
  for insert with check (
    author = auth.uid() and workspace_id in (select public.current_user_workspaces())
  );
drop policy if exists "notes update own" on public.notes;
create policy "notes update own" on public.notes
  for update using (author = auth.uid())
  with check (author = auth.uid());
drop policy if exists "notes delete own" on public.notes;
create policy "notes delete own" on public.notes
  for delete using (author = auth.uid());

-- 7. updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists daily_touch on public.daily_checks;
create trigger daily_touch before update on public.daily_checks
  for each row execute function public.touch_updated_at();

drop trigger if exists weekly_touch on public.weekly_checks;
create trigger weekly_touch before update on public.weekly_checks
  for each row execute function public.touch_updated_at();

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();
