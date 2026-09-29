-- Supabase schema for accounts (website/design.md §5, docs/AUTH_SETUP.md).
-- Run once in the Supabase SQL editor (or via supabase db push); the whole
-- file is idempotent, so re-running after edits is safe.
-- Writes to entitlements/purchases come only from the analysis server
-- (secret key / service role); authenticated users can only read their own
-- rows.

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

-- ── Purchases (docs/PURCHASES.md) ─────────────────────────────────────────────────
-- One row per checkout attempt; the row IS the mapping from a provider
-- order_id back to user/plan (NOWPayments only echoes order_id). Writes come
-- only from the analysis server (secret key); users read their own rows.

drop table if exists payments;   -- pre-launch stub, superseded by purchases

create table if not exists purchases (
  id           uuid primary key,          -- the provider-facing order_id
  user_id      uuid not null references auth.users on delete cascade,
  provider     text not null default 'nowpayments',
  invoice_id   text,
  payment_id   text,
  plan         text not null check (plan in ('month', 'year')),
  amount_usd   numeric(10, 2) not null,
  status       text not null default 'pending'
    check (status in ('pending', 'completed', 'partially_paid', 'refunded', 'failed')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

alter table purchases enable row level security;

drop policy if exists "read own purchases" on purchases;
create policy "read own purchases"
  on purchases for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Atomic, idempotent fulfillment: flip the row pending→completed and extend
-- the entitlement in one transaction. The WHERE status='pending' guard makes
-- concurrent IPN retries / confirm races grant Pro exactly once.
create or replace function public.fulfill_purchase(p_order_id uuid, p_payment_id text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_days int;
begin
  update purchases
     set status = 'completed', completed_at = now(),
         payment_id = coalesce(p_payment_id, payment_id)
   where id = p_order_id and status = 'pending'
   returning user_id, case plan when 'month' then 30 else 365 end
    into v_user, v_days;
  if v_user is null then
    return false;   -- unknown order, or already fulfilled
  end if;

  update entitlements
     set plan = 'pro',
         expires_at = greatest(now(), coalesce(expires_at, now()))
                        + make_interval(days => v_days),
         updated_at = now()
   where user_id = v_user;
  return true;
end;
$$;

-- Refund (merchant-initiated on the provider side): mark the row and take the
-- purchased period back; an expires_at in the past means free (fail-closed).
create or replace function public.refund_purchase(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_days int;
begin
  update purchases
     set status = 'refunded'
   where id = p_order_id and status = 'completed'
   returning user_id, case plan when 'month' then 30 else 365 end
    into v_user, v_days;
  if v_user is null then
    return false;
  end if;

  update entitlements
     set expires_at = expires_at - make_interval(days => v_days),
         updated_at = now()
   where user_id = v_user;
  return true;
end;
$$;

-- security definer functions are executable by PUBLIC unless revoked; only
-- the server (service role via secret key) may fulfill or refund.
revoke all on function public.fulfill_purchase(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_purchase(uuid) from public, anon, authenticated;

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
