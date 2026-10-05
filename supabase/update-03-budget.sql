-- Finance Tracker: run this ONCE if you already set up your database before the
-- Budget tab existed. It adds the budget tables and a budget-category link on
-- transactions. (New projects can skip it: schema.sql already includes all of this.)

-- Budget categories you name yourself (Daily Living, Academic Needs, ...).
create table public.budget_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 30),
  color_index smallint not null default 1 check (color_index between 1 and 8),
  created_at  timestamptz not null default now(),
  unique (user_id, id)
);
create unique index budget_categories_unique_name
  on public.budget_categories (user_id, lower(name));

-- One row per month: the income you typed, your savings percentage, and which
-- split you chose (a preset or your own). rollover_resolved becomes true once you
-- have decided what to do with the previous month's unspent budget.
create table public.budget_plans (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month             text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  income            numeric(14,2) check (income is null or income >= 0),
  savings_pct       numeric(5,2) not null default 0 check (savings_pct between 0 and 100),
  split_mode        text not null default 'custom' check (split_mode in ('p404020','p503020','custom')),
  rollover_resolved boolean not null default false,
  primary key (user_id, month)
);

-- Each category's share (%) of the month's budget, plus any amount carried over
-- from last month when you chose to carry it.
create table public.budget_allocations (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month       text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  category_id uuid not null,
  pct         numeric(5,2) not null default 0 check (pct between 0 and 100),
  carried     numeric(14,2) not null default 0 check (carried >= 0),
  primary key (user_id, month, category_id),
  foreign key (user_id, category_id) references public.budget_categories (user_id, id) on delete cascade
);

-- An expense can be charged to one budget category. Deleting the category keeps
-- the expense and just clears the link. (The "set null (column)" form needs
-- Postgres 15 or newer, which is the default on Supabase.)
alter table public.transactions add column budget_category_id uuid;
alter table public.transactions add constraint transactions_budget_category_fk
  foreign key (user_id, budget_category_id)
  references public.budget_categories (user_id, id)
  on delete set null (budget_category_id);
create index transactions_budget_idx on public.transactions (user_id, budget_category_id);

alter table public.budget_categories  enable row level security;
alter table public.budget_plans       enable row level security;
alter table public.budget_allocations enable row level security;

create policy "own budget categories" on public.budget_categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own budget plans" on public.budget_plans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own budget allocations" on public.budget_allocations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Realtime (optional): lets a second open tab or device update live.
alter publication supabase_realtime add table
  public.budget_categories, public.budget_plans, public.budget_allocations;
