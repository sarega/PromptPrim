create extension if not exists pgcrypto;

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
    select coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        'user'
    );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create table if not exists public.plans (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    monthly_price_usd numeric(10, 2) not null default 0,
    included_microcredits bigint not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    display_name text not null default 'User',
    role text not null default 'user' check (role in ('user', 'admin')),
    status text not null default 'active' check (status in ('active', 'grace', 'suspended')),
    plan_code text not null default 'free' references public.plans(code),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wallets (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    balance_microcredits bigint not null default 0 check (balance_microcredits >= 0),
    lifetime_purchased_microcredits bigint not null default 0 check (lifetime_purchased_microcredits >= 0),
    lifetime_consumed_microcredits bigint not null default 0 check (lifetime_consumed_microcredits >= 0),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wallet_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    type text not null,
    delta_microcredits bigint not null,
    provider_cost_usd numeric(12, 6),
    retail_value_usd numeric(12, 6),
    request_id uuid,
    stripe_event_id text,
    admin_user_id uuid references public.profiles(id) on delete set null,
    notes text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_wallet_ledger_user_id_created_at
    on public.wallet_ledger(user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    next_display_name text;
    next_role text;
begin
    next_display_name := coalesce(
        new.raw_user_meta_data ->> 'display_name',
        new.raw_user_meta_data ->> 'full_name',
        split_part(coalesce(new.email, ''), '@', 1),
        'User'
    );

    next_role := coalesce(
        nullif(new.raw_app_meta_data ->> 'role', ''),
        nullif(new.raw_user_meta_data ->> 'role', ''),
        'user'
    );

    insert into public.profiles (
        id,
        email,
        display_name,
        role,
        status,
        plan_code
    )
    values (
        new.id,
        coalesce(new.email, ''),
        next_display_name,
        case when next_role = 'admin' then 'admin' else 'user' end,
        'active',
        'free'
    )
    on conflict (id) do update
    set
        email = excluded.email,
        display_name = excluded.display_name,
        role = excluded.role,
        updated_at = timezone('utc', now());

    insert into public.wallets (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists set_plans_updated_at on public.plans;
create trigger set_plans_updated_at
before update on public.plans
for each row execute procedure public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_wallets_updated_at on public.wallets;
create trigger set_wallets_updated_at
before update on public.wallets
for each row execute procedure public.set_updated_at();

insert into public.plans (code, name, monthly_price_usd, included_microcredits, is_active)
values
    ('free', 'Free', 0, 500000, true),
    ('pro', 'Pro', 10, 7500000, true),
    ('studio', 'Studio', 8, 0, true)
on conflict (code) do update
set
    name = excluded.name,
    monthly_price_usd = excluded.monthly_price_usd,
    included_microcredits = excluded.included_microcredits,
    is_active = excluded.is_active,
    updated_at = timezone('utc', now());

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;

drop policy if exists "plans are readable by authenticated users" on public.plans;
create policy "plans are readable by authenticated users"
on public.plans
for select
to authenticated
using (true);

drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.current_app_role() = 'admin');

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.current_app_role() = 'admin')
with check (auth.uid() = id or public.current_app_role() = 'admin');

drop policy if exists "users can read own wallet" on public.wallets;
create policy "users can read own wallet"
on public.wallets
for select
to authenticated
using (auth.uid() = user_id or public.current_app_role() = 'admin');

drop policy if exists "users can read own wallet ledger" on public.wallet_ledger;
create policy "users can read own wallet ledger"
on public.wallet_ledger
for select
to authenticated
using (auth.uid() = user_id or public.current_app_role() = 'admin');
