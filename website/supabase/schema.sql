-- Supabase schema for accounts (website/design.md §5, AUTH_SETUP.md).
-- Run once in the Supabase SQL editor (or via supabase db push); the whole
-- file is idempotent, so re-running after edits is safe.
-- Writes to entitlements/payments come only from the service role
-- (payment webhook); authenticated users can only read their own rows.

-- ── Profiles ─────────────────────────────────────────────────────────────────
-- One row per auth user, kept in sync from the auth record by trigger.
-- Google sign-in supplies name/avatar in raw_user_meta_data.

create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile"
  on profiles for select
  to authenticated
  using (id = (select auth.uid()));

-- Sync a profile row (and a default free entitlement) whenever an auth user
-- is created or updated. security definer: the trigger runs as the table
-- owner, since the signing-up user has no insert rights on either table.
create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url',
             new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update set
    email        = excluded.email,
    display_name = excluded.display_name,
    avatar_url   = excluded.avatar_url,
    updated_at   = now();

  insert into public.entitlements (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_change on auth.users;
create trigger on_auth_user_change
  after insert or update on auth.users
  for each row execute function public.handle_auth_user();

create table if not exists entitlements (
  user_id    uuid primary key references auth.users on delete cascade,
  plan       text not null default 'free' check (plan in ('free', 'pro')),
  expires_at timestamptz,                 -- null for free
  updated_at timestamptz not null default now()
);

alter table entitlements enable row level security;

drop policy if exists "read own entitlement" on entitlements;
create policy "read own entitlement"
  on entitlements for select
  to authenticated
  using (user_id = (select auth.uid()));

create table if not exists payments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  provider           text not null,      -- 'coinbase_commerce'
  provider_charge_id text unique not null,
  amount_usd         numeric not null,
  months             int not null,
  status             text not null check (status in ('pending', 'confirmed', 'failed')),
  created_at         timestamptz not null default now()
);

alter table payments enable row level security;

drop policy if exists "read own payments" on payments;
create policy "read own payments"
  on payments for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Pre-launch email waitlist (design.md §5 "Waitlist"): anonymous visitors may
-- insert their email and nothing else — no select, update, or delete.
create table if not exists waitlist (
  email      text primary key,
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;

drop policy if exists "anyone can join waitlist" on waitlist;
create policy "anyone can join waitlist"
  on waitlist for insert
  to anon
  with check (true);
