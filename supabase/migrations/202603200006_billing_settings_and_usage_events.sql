create table if not exists public.billing_settings (
    id text primary key default 'default',
    markup_rate numeric(10, 4) not null default 2.5 check (markup_rate > 0),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

insert into public.billing_settings (id, markup_rate)
values ('default', 2.5)
on conflict (id) do nothing;

drop trigger if exists set_billing_settings_updated_at on public.billing_settings;
create trigger set_billing_settings_updated_at
before update on public.billing_settings
for each row execute procedure public.set_updated_at();

alter table public.billing_settings enable row level security;

drop policy if exists "billing settings are readable by authenticated users" on public.billing_settings;
create policy "billing settings are readable by authenticated users"
on public.billing_settings
for select
to authenticated
using (true);

drop policy if exists "admins can update billing settings" on public.billing_settings;
drop policy if exists "admins can insert billing settings" on public.billing_settings;
create policy "admins can insert billing settings"
on public.billing_settings
for insert
to authenticated
with check (public.current_app_role() = 'admin');

create policy "admins can update billing settings"
on public.billing_settings
for update
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create table if not exists public.usage_events (
    id uuid primary key default gen_random_uuid(),
    request_id uuid not null unique,
    user_id uuid not null references public.profiles(id) on delete cascade,
    provider text not null default 'openrouter',
    model_id text not null,
    status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
    provider_request_id text,
    prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
    completion_tokens integer not null default 0 check (completion_tokens >= 0),
    provider_cost_usd numeric(12, 6) not null default 0 check (provider_cost_usd >= 0),
    markup_rate numeric(10, 4) not null default 1 check (markup_rate > 0),
    charged_microcredits bigint not null default 0 check (charged_microcredits >= 0),
    usage_payload jsonb not null default '{}'::jsonb,
    error_message text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_usage_events_user_id_created_at
    on public.usage_events(user_id, created_at desc);

create index if not exists idx_usage_events_status_created_at
    on public.usage_events(status, created_at desc);

drop trigger if exists set_usage_events_updated_at on public.usage_events;
create trigger set_usage_events_updated_at
before update on public.usage_events
for each row execute procedure public.set_updated_at();

alter table public.usage_events enable row level security;

drop policy if exists "users can read own usage events" on public.usage_events;
create policy "users can read own usage events"
on public.usage_events
for select
to authenticated
using (auth.uid() = user_id or public.current_app_role() = 'admin');

create or replace function public.record_openrouter_usage_charge(
    target_user_id uuid,
    usage_request_id uuid,
    model_id text,
    prompt_tokens integer default 0,
    completion_tokens integer default 0,
    provider_cost_usd numeric(12, 6) default 0,
    provider_request_id text default null,
    usage_payload jsonb default '{}'::jsonb,
    notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    existing_event public.usage_events%rowtype;
    current_wallet public.wallets%rowtype;
    current_markup_rate numeric(10, 4);
    requested_charge bigint := 0;
    applied_charge bigint := 0;
begin
    if target_user_id is null then
        raise exception 'Target user ID is required.';
    end if;

    if usage_request_id is null then
        raise exception 'Usage request ID is required.';
    end if;

    if nullif(trim(model_id), '') is null then
        raise exception 'Model ID is required.';
    end if;

    select *
    into existing_event
    from public.usage_events
    where request_id = usage_request_id;

    if found then
        return jsonb_build_object(
            'request_id', existing_event.request_id,
            'already_recorded', true,
            'charged_microcredits', existing_event.charged_microcredits,
            'provider_cost_usd', existing_event.provider_cost_usd,
            'markup_rate', existing_event.markup_rate
        );
    end if;

    insert into public.wallets (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;

    select *
    into current_wallet
    from public.wallets
    where user_id = target_user_id
    for update;

    if not found then
        raise exception 'Wallet not found for target user.';
    end if;

    select markup_rate
    into current_markup_rate
    from public.billing_settings
    where id = 'default';

    current_markup_rate := coalesce(current_markup_rate, 2.5);
    requested_charge := greatest(
        ceil(coalesce(provider_cost_usd, 0)::numeric * current_markup_rate * 1000000),
        0
    )::bigint;
    applied_charge := least(coalesce(current_wallet.balance_microcredits, 0), requested_charge);

    update public.wallets
    set
        balance_microcredits = greatest(balance_microcredits - applied_charge, 0),
        lifetime_consumed_microcredits = lifetime_consumed_microcredits + applied_charge,
        updated_at = timezone('utc', now())
    where user_id = target_user_id
    returning *
    into current_wallet;

    insert into public.usage_events (
        request_id,
        user_id,
        provider,
        model_id,
        status,
        provider_request_id,
        prompt_tokens,
        completion_tokens,
        provider_cost_usd,
        markup_rate,
        charged_microcredits,
        usage_payload
    )
    values (
        usage_request_id,
        target_user_id,
        'openrouter',
        trim(model_id),
        'completed',
        nullif(trim(provider_request_id), ''),
        greatest(coalesce(prompt_tokens, 0), 0),
        greatest(coalesce(completion_tokens, 0), 0),
        greatest(coalesce(provider_cost_usd, 0), 0),
        current_markup_rate,
        applied_charge,
        coalesce(usage_payload, '{}'::jsonb)
    );

    if applied_charge > 0 then
        insert into public.wallet_ledger (
            user_id,
            type,
            delta_microcredits,
            provider_cost_usd,
            retail_value_usd,
            request_id,
            notes
        )
        values (
            target_user_id,
            'usage_finalize',
            applied_charge * -1,
            greatest(coalesce(provider_cost_usd, 0), 0),
            greatest(coalesce(provider_cost_usd, 0), 0),
            usage_request_id,
            coalesce(
                nullif(trim(notes), ''),
                format('OpenRouter usage charge recorded for model %s.', trim(model_id))
            )
        );
    end if;

    return jsonb_build_object(
        'request_id', usage_request_id,
        'already_recorded', false,
        'charged_microcredits', applied_charge,
        'provider_cost_usd', greatest(coalesce(provider_cost_usd, 0), 0),
        'markup_rate', current_markup_rate,
        'remaining_balance_microcredits', current_wallet.balance_microcredits
    );
end;
$$;

revoke all on function public.record_openrouter_usage_charge(uuid, uuid, text, integer, integer, numeric, text, jsonb, text) from public;
grant execute on function public.record_openrouter_usage_charge(uuid, uuid, text, integer, integer, numeric, text, jsonb, text) to service_role;
