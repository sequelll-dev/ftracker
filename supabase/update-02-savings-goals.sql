-- Finance Tracker: run this ONCE if you already set up your database before the
-- Savings tab existed. It adds the two tables the Savings tab needs.
-- (New projects can skip it: schema.sql already includes these tables.)

create table public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  target      numeric(14,2) not null check (target > 0),
  deadline    date,
  color_index smallint not null default 1 check (color_index between 1 and 8),
  created_at  timestamptz not null default now(),
  unique (user_id, id)
);
create index goals_user_idx on public.goals (user_id, created_at);

-- Money added to (positive) or withdrawn from (negative) a goal.
-- The composite foreign key stops an entry from pointing at someone else's goal.
create table public.goal_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id    uuid not null,
  amount     numeric(14,2) not null check (amount <> 0),
  date       date not null,
  note       text not null default '' check (char_length(note) <= 80),
  created_at timestamptz not null default now(),
  foreign key (user_id, goal_id) references public.goals (user_id, id) on delete cascade
);
create index goal_entries_goal_idx on public.goal_entries (goal_id, date desc);

alter table public.goals        enable row level security;
alter table public.goal_entries enable row level security;

create policy "own goals" on public.goals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own goal entries" on public.goal_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Realtime (optional): lets a second open tab or device update live.
alter publication supabase_realtime add table public.goals, public.goal_entries;
