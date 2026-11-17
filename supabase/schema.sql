Attempting to perform the InitializeDefaultDrives operation on the 'FileSystem' provider failed.
-- GreenTrack multi-tenant foundation (Supabase / PostgreSQL)
-- Each company owns its customers, task types and ledger. Membership and RLS
-- enforce the company boundary at the database, not in browser filters.
create extension if not exists pgcrypto;

create type public.app_role as enum ('employee', 'customer');
create type public.organization_role as enum ('owner', 'admin', 'employee');
create type public.transaction_type as enum ('debit', 'credit');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role public.organization_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id, active);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(user_id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 160),
  email text,
  phone text,
  service_address text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id)
);
create index customers_org_idx on public.customers(organization_id, name);
create index customers_user_idx on public.customers(user_id);

create table public.task_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  icon text not null default '🌿',
  hourly_rate numeric(10,2) not null default 0 check (hourly_rate >= 0),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  task_type_id uuid,
  task_name text not null,
  transaction_date date not null,
  start_time time,
  end_time time,
  amount numeric(10,2) not null check (amount > 0),
  type public.transaction_type not null,
  notes text not null default '',
  logged_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (end_time is null or start_time is not null),
  foreign key (organization_id, customer_id)
    references public.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, task_type_id)
    references public.task_types(organization_id, id) on delete set null
);
create index transactions_org_customer_date_idx
  on public.transactions (organization_id, customer_id, transaction_date desc);

-- Security-definer helpers avoid recursive evaluation of membership RLS.
create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid()) and m.active
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles public.organization_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid()) and m.active
      and m.role = any(allowed_roles)
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.customers enable row level security;
alter table public.task_types enable row level security;
alter table public.transactions enable row level security;

create policy "profiles: user reads own profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "organizations: members read their organizations" on public.organizations
  for select to authenticated using ((select public.is_org_member(id)));
create policy "members: users read own memberships and admins read org roster" on public.organization_members
  for select to authenticated using (
    user_id = (select auth.uid()) or
    (select public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
  );
create policy "customers: employees manage within their organization" on public.customers
  for all to authenticated
  using ((select public.has_org_role(organization_id, array['owner','admin','employee']::public.organization_role[])))
  with check ((select public.has_org_role(organization_id, array['owner','admin','employee']::public.organization_role[])));
create policy "customers: customer reads own linked record" on public.customers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "task types: members read active types" on public.task_types
  for select to authenticated using (
    active and (select public.is_org_member(organization_id)) or
    (select public.has_org_role(organization_id, array['owner','admin','employee']::public.organization_role[]))
  );
create policy "task types: admins manage within their organization" on public.task_types
  for all to authenticated
  using ((select public.has_org_role(organization_id, array['owner','admin']::public.organization_role[])))
  with check ((select public.has_org_role(organization_id, array['owner','admin']::public.organization_role[])));
create policy "transactions: employees manage within their organization" on public.transactions
  for all to authenticated
  using ((select public.has_org_role(organization_id, array['owner','admin','employee']::public.organization_role[])))
  with check (
    (select public.has_org_role(organization_id, array['owner','admin','employee']::public.organization_role[]))
    and logged_by = (select auth.uid())
  );
create policy "transactions: customer reads own organization ledger" on public.transactions
  for select to authenticated using (
    exists (
      select 1 from public.customers c
      where c.id = transactions.customer_id
        and c.organization_id = transactions.organization_id
        and c.user_id = (select auth.uid())
    )
  );

grant usage on schema public to authenticated;
revoke all on public.profiles, public.organizations, public.organization_members,
  public.customers, public.task_types, public.transactions from anon, public, authenticated;
revoke execute on function public.is_org_member(uuid),
  public.has_org_role(uuid, public.organization_role[]) from anon, public;
grant select on public.profiles, public.organizations, public.organization_members to authenticated;
grant select, insert, update, delete on public.customers, public.task_types,
  public.transactions to authenticated;
grant execute on function public.is_org_member(uuid),
  public.has_org_role(uuid, public.organization_role[]) to authenticated;

-- Organization creation, membership writes, invites and membership deactivation
-- are service-role operations performed by trusted Edge Functions only.

