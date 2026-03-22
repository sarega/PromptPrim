create table if not exists public.model_catalog (
    id text primary key,
    provider text not null default 'openrouter',
    name text not null,
    description text not null default '',
    context_length integer not null default 0,
    pricing_prompt text not null default '0',
    pricing_completion text not null default '0',
    supports_tools boolean not null default false,
    is_active boolean not null default true,
    raw jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.plan_model_access (
    plan_code text not null references public.plans(code) on delete cascade,
    model_id text not null references public.model_catalog(id) on delete cascade,
    is_enabled boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    primary key (plan_code, model_id)
);

create index if not exists idx_model_catalog_provider
    on public.model_catalog(provider);

create index if not exists idx_plan_model_access_plan_code
    on public.plan_model_access(plan_code);

drop trigger if exists set_model_catalog_updated_at on public.model_catalog;
create trigger set_model_catalog_updated_at
before update on public.model_catalog
for each row execute procedure public.set_updated_at();

drop trigger if exists set_plan_model_access_updated_at on public.plan_model_access;
create trigger set_plan_model_access_updated_at
before update on public.plan_model_access
for each row execute procedure public.set_updated_at();

alter table public.model_catalog enable row level security;
alter table public.plan_model_access enable row level security;

drop policy if exists "model catalog is readable by authenticated users" on public.model_catalog;
create policy "model catalog is readable by authenticated users"
on public.model_catalog
for select
to authenticated
using (true);

drop policy if exists "admins can insert model catalog" on public.model_catalog;
create policy "admins can insert model catalog"
on public.model_catalog
for insert
to authenticated
with check (public.current_app_role() = 'admin');

drop policy if exists "admins can update model catalog" on public.model_catalog;
create policy "admins can update model catalog"
on public.model_catalog
for update
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists "admins can delete model catalog" on public.model_catalog;
create policy "admins can delete model catalog"
on public.model_catalog
for delete
to authenticated
using (public.current_app_role() = 'admin');

drop policy if exists "plan model access is readable by authenticated users" on public.plan_model_access;
create policy "plan model access is readable by authenticated users"
on public.plan_model_access
for select
to authenticated
using (true);

drop policy if exists "admins can insert plan model access" on public.plan_model_access;
create policy "admins can insert plan model access"
on public.plan_model_access
for insert
to authenticated
with check (public.current_app_role() = 'admin');

drop policy if exists "admins can update plan model access" on public.plan_model_access;
create policy "admins can update plan model access"
on public.plan_model_access
for update
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists "admins can delete plan model access" on public.plan_model_access;
create policy "admins can delete plan model access"
on public.plan_model_access
for delete
to authenticated
using (public.current_app_role() = 'admin');
