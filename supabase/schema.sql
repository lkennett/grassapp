-- GreenTrack secure data foundation (Supabase / PostgreSQL)
-- Apply in the Supabase SQL editor. This schema is the server-side source of truth.
create extension if not exists pgcrypto;

create type public.app_role as enum ('employee', 'customer');
create type public.transaction_type as enum ('debit', 'credit');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 160),
  email text,
  phone text,
  service_address text,
  created_at timestamptz not null default now()
);

create table public.task_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  icon text not null default '🌿',
  hourly_rate numeric(10,2) not null default 0 check (hourly_rate >= 0),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  task_type_id uuid references public.task_types(id) on delete set null,
  task_name text not null,
  transaction_date date not null,
  start_time time,
  end_time time,
  amount numeric(10,2) not null check (amount > 0),
  type public.transaction_type not null,
  notes text not null default '',
  logged_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (end_time is null or start_time is not null)
);

create index transactions_customer_date_idx
  on public.transactions (customer_id, transaction_date desc);
create index customers_user_id_idx on public.customers (user_id);

-- SECURITY DEFINER avoids recursive RLS evaluation when checking employee role.
create or replace function public.is_employee()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.role = 'employee'
  );
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.task_types enable row level security;
alter table public.transactions enable row level security;

create policy "profiles: user reads own profile"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_employee()));

create policy "customers: employees manage customers"
  on public.customers for all to authenticated
  using ((select public.is_employee()))
  with check ((select public.is_employee()));

create policy "customers: customer reads linked record"
  on public.customers for select to authenticated
  using (user_id = (select auth.uid()));

create policy "task types: authenticated users read active tasks"
  on public.task_types for select to authenticated
  using (active or (select public.is_employee()));

create policy "task types: employees manage task types"
  on public.task_types for all to authenticated
  using ((select public.is_employee()))
  with check ((select public.is_employee()));

create policy "transactions: employees manage transactions"
  on public.transactions for all to authenticated
  using ((select public.is_employee()))
  with check ((select public.is_employee()));

create policy "transactions: customers read own transactions"
  on public.transactions for select to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = transactions.customer_id
        and c.user_id = (select auth.uid())
    )
  );

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.customers, public.task_types,
  public.transactions to authenticated;
grant execute on function public.is_employee() to authenticated;

-- Do not expose the service-role key in browser code. Create employee profiles
-- through a trusted admin workflow; customer invites must use a server-side
-- Edge Function or another trusted process that can safely call Auth Admin.
