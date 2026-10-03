-- Where it went: database schema for Supabase.
-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It is safe to run on an empty project. Re-running it will fail on "already exists".

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per user: preferences and onboarding state.
create table public.settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  currency   text not null default 'USD' check (char_length(currency) = 3),
  name       text not null default '' check (char_length(name) <= 40),
  skin       text not null default 'auto'
             check (skin in ('auto','mist','sage','ocean','blush','night','dusk')),
  opening    numeric(14,2),
  open_on    text not null default 'dashboard' check (open_on in ('dashboard','records')),
  onboarded  boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Custom categories. Built-in categories live in the app, not here.
create table public.categories (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (id ~ '^u-[a-z0-9]{3,12}$'),
  label       text not null check (char_length(label) between 1 and 30),
  type        text not null check (type in ('expense','income')),
  color_index smallint not null check (color_index between 1 and 8),
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create unique index categories_unique_label
  on public.categories (user_id, type, lower(label));

-- Transactions. "category" is a built-in id (food, salary, ...) or a custom id (u-xxxxxx).
create table public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type       text not null check (type in ('expense','income')),
  category   text not null check (char_length(category) between 1 and 40),
  amount     numeric(14,2) not null check (amount > 0),
  date       date not null,
  note       text not null default '' check (char_length(note) <= 80),
  created_at timestamptz not null default now()
);
create index transactions_user_date_idx on public.transactions (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Row-level security: every user can only touch their own rows.
-- ---------------------------------------------------------------------------

alter table public.settings     enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;

create policy "own settings" on public.settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own categories" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Create a settings row automatically when someone signs up.
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Removing a custom category moves its transactions to Other, atomically.
-- Runs as the caller, so row-level security still applies.
-- ---------------------------------------------------------------------------

create function public.remove_category(p_id text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moved integer;
begin
  update public.transactions t
     set category = case when t.type = 'income' then 'otherinc' else 'other' end
   where t.category = p_id
     and t.user_id = (select auth.uid());
  get diagnostics moved = row_count;

  delete from public.categories c
   where c.id = p_id
     and c.user_id = (select auth.uid());

  return moved;
end;
$$;
revoke execute on function public.remove_category(text) from public, anon;
grant  execute on function public.remove_category(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: lets a second open tab or device update live. Optional.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.transactions, public.categories;
