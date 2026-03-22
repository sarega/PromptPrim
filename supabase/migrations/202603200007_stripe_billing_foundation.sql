create table if not exists public.billing_offerings (
    id uuid primary key default gen_random_uuid(),
    offering_key text not null unique,
    display_name text not null,
    kind text not null check (kind in ('subscription', 'topup')),
    plan_code text references public.plans(code) on delete set null,
    billing_interval text check (billing_interval in ('month', 'year')),
    amount_usd numeric(12, 2) not null check (amount_usd > 0),
    granted_microcredits bigint not null default 0 check (granted_microcredits >= 0),
    stripe_product_id text,
    stripe_price_id text,
    is_active boolean not null default false,
    sort_order integer not null default 0,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    check (
        (kind = 'subscription' and plan_code is not null and billing_interval is not null)
        or
        (kind = 'topup' and plan_code is null)
    )
);

create index if not exists idx_billing_offerings_kind_sort
    on public.billing_offerings(kind, sort_order asc, created_at asc);

drop trigger if exists set_billing_offerings_updated_at on public.billing_offerings;
create trigger set_billing_offerings_updated_at
before update on public.billing_offerings
for each row execute procedure public.set_updated_at();

alter table public.billing_offerings enable row level security;

drop policy if exists "active billing offerings are readable by authenticated users" on public.billing_offerings;
create policy "active billing offerings are readable by authenticated users"
on public.billing_offerings
for select
to authenticated
using (is_active = true or public.current_app_role() = 'admin');

drop policy if exists "admins can insert billing offerings" on public.billing_offerings;
drop policy if exists "admins can update billing offerings" on public.billing_offerings;
drop policy if exists "admins can delete billing offerings" on public.billing_offerings;
create policy "admins can insert billing offerings"
on public.billing_offerings
for insert
to authenticated
with check (public.current_app_role() = 'admin');

create policy "admins can update billing offerings"
on public.billing_offerings
for update
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create policy "admins can delete billing offerings"
on public.billing_offerings
for delete
to authenticated
using (public.current_app_role() = 'admin');

insert into public.billing_offerings (
    offering_key,
    display_name,
    kind,
    plan_code,
    billing_interval,
    amount_usd,
    granted_microcredits,
    is_active,
    sort_order
)
values
    ('plan_pro_monthly', 'Pro Plan', 'subscription', 'pro', 'month', 10.00, 7500000, false, 10),
    ('plan_studio_monthly', 'Studio Plan', 'subscription', 'studio', 'month', 8.00, 0, false, 20),
    ('topup_5', '$5 Top-Up', 'topup', null, null, 5.00, 0, false, 110),
    ('topup_10', '$10 Top-Up', 'topup', null, null, 10.00, 0, false, 120),
    ('topup_30', '$30 Top-Up', 'topup', null, null, 30.00, 0, false, 130),
    ('topup_50', '$50 Top-Up', 'topup', null, null, 50.00, 0, false, 140),
    ('topup_100', '$100 Top-Up', 'topup', null, null, 100.00, 0, false, 150)
on conflict (offering_key) do update
set
    display_name = excluded.display_name,
    kind = excluded.kind,
    plan_code = excluded.plan_code,
    billing_interval = excluded.billing_interval,
    amount_usd = excluded.amount_usd,
    granted_microcredits = excluded.granted_microcredits,
    sort_order = excluded.sort_order,
    updated_at = timezone('utc', now());

create table if not exists public.stripe_customers (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    provider_customer_id text not null unique,
    email_snapshot text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_stripe_customers_updated_at on public.stripe_customers;
create trigger set_stripe_customers_updated_at
before update on public.stripe_customers
for each row execute procedure public.set_updated_at();

alter table public.stripe_customers enable row level security;

drop policy if exists "users can read own stripe customer row" on public.stripe_customers;
create policy "users can read own stripe customer row"
on public.stripe_customers
for select
to authenticated
using (auth.uid() = user_id or public.current_app_role() = 'admin');

create table if not exists public.user_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    provider text not null default 'stripe',
    provider_customer_id text,
    provider_subscription_id text not null unique,
    provider_price_id text,
    plan_code text references public.plans(code) on delete set null,
    status text not null default 'incomplete'
        check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired')),
    cancel_at_period_end boolean not null default false,
    current_period_start timestamptz,
    current_period_end timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_subscriptions_user_id_period_end
    on public.user_subscriptions(user_id, current_period_end desc);

drop trigger if exists set_user_subscriptions_updated_at on public.user_subscriptions;
create trigger set_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute procedure public.set_updated_at();

alter table public.user_subscriptions enable row level security;

drop policy if exists "users can read own subscriptions" on public.user_subscriptions;
create policy "users can read own subscriptions"
on public.user_subscriptions
for select
to authenticated
using (auth.uid() = user_id or public.current_app_role() = 'admin');

create table if not exists public.billing_purchases (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    offering_id uuid references public.billing_offerings(id) on delete set null,
    kind text not null check (kind in ('subscription', 'topup')),
    status text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'refunded')),
    amount_usd numeric(12, 2) not null default 0 check (amount_usd >= 0),
    granted_microcredits bigint not null default 0 check (granted_microcredits >= 0),
    stripe_event_id text,
    provider_reference_id text not null,
    stripe_checkout_session_id text,
    stripe_customer_id text,
    stripe_subscription_id text,
    stripe_invoice_id text,
    stripe_payment_intent_id text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists uq_billing_purchases_provider_reference_id
    on public.billing_purchases(provider_reference_id);

create unique index if not exists uq_billing_purchases_stripe_event_id_not_null
    on public.billing_purchases(stripe_event_id)
    where stripe_event_id is not null;

create index if not exists idx_billing_purchases_user_id_created_at
    on public.billing_purchases(user_id, created_at desc);

drop trigger if exists set_billing_purchases_updated_at on public.billing_purchases;
create trigger set_billing_purchases_updated_at
before update on public.billing_purchases
for each row execute procedure public.set_updated_at();

alter table public.billing_purchases enable row level security;

drop policy if exists "users can read own billing purchases" on public.billing_purchases;
create policy "users can read own billing purchases"
on public.billing_purchases
for select
to authenticated
using (auth.uid() = user_id or public.current_app_role() = 'admin');

create or replace function public.record_stripe_billing_purchase(
    target_user_id uuid,
    purchase_kind text,
    provider_reference_id text,
    stripe_event_id text default null,
    offering_key text default null,
    stripe_customer_id text default null,
    stripe_subscription_id text default null,
    stripe_price_id text default null,
    stripe_invoice_id text default null,
    stripe_payment_intent_id text default null,
    plan_code text default null,
    amount_usd numeric(12, 2) default 0,
    granted_microcredits bigint default 0,
    purchase_status text default 'paid',
    billing_period_start timestamptz default null,
    billing_period_end timestamptz default null,
    payload jsonb default '{}'::jsonb,
    notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    existing_purchase public.billing_purchases%rowtype;
    selected_offering public.billing_offerings%rowtype;
    current_wallet public.wallets%rowtype;
    current_markup_rate numeric(10, 4) := 1;
    normalized_stripe_event_id text;
    normalized_provider_reference_id text;
    normalized_offering_key text;
    resolved_plan_code text;
    resolved_microcredits bigint := 0;
    resolved_amount_usd numeric(12, 2) := greatest(coalesce(amount_usd, 0), 0);
    resolved_billing_purchase_status text := 'paid';
    resolved_subscription_status text := 'active';
begin
    if target_user_id is null then
        raise exception 'Target user ID is required.';
    end if;

    if nullif(trim(purchase_kind), '') is null then
        raise exception 'Purchase kind is required.';
    end if;

    if nullif(trim(provider_reference_id), '') is null then
        raise exception 'Provider reference ID is required.';
    end if;

    purchase_kind := lower(trim(purchase_kind));
    normalized_stripe_event_id := nullif(trim(stripe_event_id), '');
    normalized_provider_reference_id := trim(provider_reference_id);
    normalized_offering_key := nullif(trim(offering_key), '');
    if purchase_kind not in ('subscription', 'topup') then
        raise exception 'Unsupported purchase kind: %', purchase_kind;
    end if;

    if normalized_stripe_event_id is not null then
        select *
        into existing_purchase
        from public.billing_purchases
        where billing_purchases.stripe_event_id = normalized_stripe_event_id;

        if found then
            return jsonb_build_object(
                'purchase_id', existing_purchase.id,
                'already_recorded', true,
                'provider_reference_id', existing_purchase.provider_reference_id
            );
        end if;
    end if;

    select *
    into existing_purchase
    from public.billing_purchases
    where billing_purchases.provider_reference_id = normalized_provider_reference_id;

    if found then
        return jsonb_build_object(
            'purchase_id', existing_purchase.id,
            'already_recorded', true,
            'provider_reference_id', existing_purchase.provider_reference_id
        );
    end if;

    if normalized_offering_key is not null then
        select *
        into selected_offering
        from public.billing_offerings
        where billing_offerings.offering_key = normalized_offering_key;
    end if;

    if found then
        if purchase_kind = 'subscription' then
            resolved_plan_code := coalesce(
                nullif(lower(trim(plan_code)), ''),
                selected_offering.plan_code
            );
            resolved_microcredits := greatest(
                coalesce(granted_microcredits, 0),
                coalesce(selected_offering.granted_microcredits, 0)
            );
            resolved_amount_usd := greatest(
                coalesce(amount_usd, 0),
                coalesce(selected_offering.amount_usd, 0)
            );
        else
            resolved_plan_code := null;
            select markup_rate
            into current_markup_rate
            from public.billing_settings
            where id = 'default';

            current_markup_rate := coalesce(current_markup_rate, 2.5);
            resolved_microcredits := greatest(
                coalesce(granted_microcredits, 0),
                ceil(greatest(coalesce(amount_usd, selected_offering.amount_usd, 0), 0)::numeric * current_markup_rate * 1000000)::bigint
            );
            resolved_amount_usd := greatest(
                coalesce(amount_usd, 0),
                coalesce(selected_offering.amount_usd, 0)
            );
        end if;
    else
        resolved_plan_code := nullif(lower(trim(plan_code)), '');
        resolved_microcredits := greatest(coalesce(granted_microcredits, 0), 0);
    end if;

    resolved_billing_purchase_status := case lower(trim(coalesce(purchase_status, 'paid')))
        when 'pending' then 'pending'
        when 'failed' then 'failed'
        when 'refunded' then 'refunded'
        else 'paid'
    end;

    resolved_subscription_status := case lower(trim(coalesce(purchase_status, 'active')))
        when 'trialing' then 'trialing'
        when 'active' then 'active'
        when 'past_due' then 'past_due'
        when 'canceled' then 'canceled'
        when 'unpaid' then 'unpaid'
        when 'incomplete' then 'incomplete'
        when 'incomplete_expired' then 'incomplete_expired'
        when 'pending' then 'incomplete'
        when 'failed' then 'past_due'
        when 'refunded' then 'canceled'
        else 'active'
    end;

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

    if purchase_kind = 'subscription' then
        if resolved_plan_code is null then
            raise exception 'Plan code is required for subscription purchases.';
        end if;

        if not exists (
            select 1 from public.plans where plans.code = resolved_plan_code
        ) then
            raise exception 'Invalid plan code: %', resolved_plan_code;
        end if;

        update public.profiles
        set
            plan_code = resolved_plan_code,
            status = 'active',
            updated_at = timezone('utc', now())
        where id = target_user_id;

        if nullif(trim(stripe_subscription_id), '') is not null then
            insert into public.user_subscriptions (
                user_id,
                provider,
                provider_customer_id,
                provider_subscription_id,
                provider_price_id,
                plan_code,
                status,
                cancel_at_period_end,
                current_period_start,
                current_period_end
            )
            values (
                target_user_id,
                'stripe',
                nullif(trim(stripe_customer_id), ''),
                trim(stripe_subscription_id),
                nullif(trim(stripe_price_id), ''),
                resolved_plan_code,
                resolved_subscription_status,
                false,
                billing_period_start,
                billing_period_end
            )
            on conflict (provider_subscription_id) do update
            set
                provider_customer_id = excluded.provider_customer_id,
                provider_price_id = excluded.provider_price_id,
                plan_code = excluded.plan_code,
                status = excluded.status,
                cancel_at_period_end = excluded.cancel_at_period_end,
                current_period_start = excluded.current_period_start,
                current_period_end = excluded.current_period_end,
                updated_at = timezone('utc', now());
        end if;
    end if;

    if nullif(trim(stripe_customer_id), '') is not null then
        insert into public.stripe_customers (
            user_id,
            provider_customer_id,
            email_snapshot
        )
        values (
            target_user_id,
            trim(stripe_customer_id),
            (select email from public.profiles where id = target_user_id)
        )
        on conflict (user_id) do update
        set
            provider_customer_id = excluded.provider_customer_id,
            email_snapshot = excluded.email_snapshot,
            updated_at = timezone('utc', now());
    end if;

    insert into public.billing_purchases (
        user_id,
        offering_id,
        kind,
        status,
        amount_usd,
        granted_microcredits,
        stripe_event_id,
        provider_reference_id,
        stripe_checkout_session_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_invoice_id,
        stripe_payment_intent_id,
        payload
    )
        values (
            target_user_id,
            selected_offering.id,
            purchase_kind,
            resolved_billing_purchase_status,
            resolved_amount_usd,
            resolved_microcredits,
            normalized_stripe_event_id,
            normalized_provider_reference_id,
            case
                when normalized_provider_reference_id like 'cs_%' then normalized_provider_reference_id
                else null
            end,
        nullif(trim(stripe_customer_id), ''),
        nullif(trim(stripe_subscription_id), ''),
        nullif(trim(stripe_invoice_id), ''),
        nullif(trim(stripe_payment_intent_id), ''),
        coalesce(payload, '{}'::jsonb)
    )
    returning *
    into existing_purchase;

    if resolved_microcredits > 0 then
        update public.wallets
        set
            balance_microcredits = balance_microcredits + resolved_microcredits,
            lifetime_purchased_microcredits = lifetime_purchased_microcredits + resolved_microcredits,
            updated_at = timezone('utc', now())
        where user_id = target_user_id
        returning *
        into current_wallet;

        insert into public.wallet_ledger (
            user_id,
            type,
            delta_microcredits,
            retail_value_usd,
            stripe_event_id,
            notes
        )
        values (
            target_user_id,
            case
                when purchase_kind = 'subscription' then 'subscription_grant'
                else 'topup_purchase'
            end,
            resolved_microcredits,
            resolved_amount_usd,
            normalized_stripe_event_id,
            coalesce(
                nullif(trim(notes), ''),
                case
                    when purchase_kind = 'subscription'
                        then format('Stripe subscription credited for plan %s.', coalesce(resolved_plan_code, 'unknown'))
                    else format('Stripe top-up credited for $%s.', resolved_amount_usd)
                end
            )
        );
    end if;

    return jsonb_build_object(
        'purchase_id', existing_purchase.id,
        'already_recorded', false,
        'granted_microcredits', resolved_microcredits,
        'amount_usd', resolved_amount_usd,
        'plan_code', resolved_plan_code,
        'remaining_balance_microcredits', current_wallet.balance_microcredits
    );
end;
$$;

revoke all on function public.record_stripe_billing_purchase(
    uuid, text, text, text, text, text, text, text, text, text, text, numeric, bigint, text, timestamptz, timestamptz, jsonb, text
) from public;
grant execute on function public.record_stripe_billing_purchase(
    uuid, text, text, text, text, text, text, text, text, text, text, numeric, bigint, text, timestamptz, timestamptz, jsonb, text
) to service_role;
