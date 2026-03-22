alter table public.profiles
    add column if not exists account_status text,
    add column if not exists trial_expires_at timestamptz,
    add column if not exists access_pass_expires_at timestamptz;

update public.profiles
set trial_expires_at = coalesce(
    trial_expires_at,
    created_at + interval '7 days'
)
where plan_code = 'free';

update public.profiles
set account_status = case
    when role = 'admin' then 'studio_active'
    when status = 'suspended' then 'paid_suspended'
    when plan_code = 'pro' then 'pro_active'
    when plan_code = 'studio' then 'studio_active'
    else 'free'
end
where account_status is null
   or account_status not in ('free', 'studio_active', 'pro_active', 'paid_suspended');

alter table public.profiles
    alter column account_status set default 'free';

update public.profiles
set account_status = 'free'
where account_status is null;

alter table public.profiles
    alter column account_status set not null;

alter table public.profiles
    drop constraint if exists profiles_account_status_check;

alter table public.profiles
    add constraint profiles_account_status_check
    check (account_status in ('free', 'studio_active', 'pro_active', 'paid_suspended'));

create index if not exists idx_profiles_account_status_plan_code
    on public.profiles(account_status, plan_code);

alter table public.wallets
    add column if not exists monthly_credit_balance_microcredits bigint not null default 0,
    add column if not exists topup_credit_balance_microcredits bigint not null default 0,
    add column if not exists monthly_credit_expires_at timestamptz;

alter table public.wallets
    drop constraint if exists wallets_monthly_credit_balance_microcredits_check;

alter table public.wallets
    add constraint wallets_monthly_credit_balance_microcredits_check
    check (monthly_credit_balance_microcredits >= 0);

alter table public.wallets
    drop constraint if exists wallets_topup_credit_balance_microcredits_check;

alter table public.wallets
    add constraint wallets_topup_credit_balance_microcredits_check
    check (topup_credit_balance_microcredits >= 0);

update public.wallets as wallets
set
    monthly_credit_balance_microcredits = case
        when coalesce(wallets.monthly_credit_balance_microcredits, 0) = 0
            and coalesce(wallets.topup_credit_balance_microcredits, 0) = 0
            and coalesce(wallets.balance_microcredits, 0) > 0
            and profiles.plan_code = 'free'
            then greatest(wallets.balance_microcredits, 0)
        else coalesce(wallets.monthly_credit_balance_microcredits, 0)
    end,
    topup_credit_balance_microcredits = case
        when coalesce(wallets.monthly_credit_balance_microcredits, 0) = 0
            and coalesce(wallets.topup_credit_balance_microcredits, 0) = 0
            and coalesce(wallets.balance_microcredits, 0) > 0
            and profiles.plan_code <> 'free'
            then greatest(wallets.balance_microcredits, 0)
        else coalesce(wallets.topup_credit_balance_microcredits, 0)
    end,
    monthly_credit_expires_at = case
        when profiles.plan_code = 'free' and wallets.monthly_credit_expires_at is null
            then profiles.trial_expires_at
        else wallets.monthly_credit_expires_at
    end,
    updated_at = timezone('utc', now())
from public.profiles
where profiles.id = wallets.user_id;

update public.wallets
set
    balance_microcredits = coalesce(monthly_credit_balance_microcredits, 0) + coalesce(topup_credit_balance_microcredits, 0),
    updated_at = timezone('utc', now());

create or replace function public.refresh_wallet_credit_totals(target_user_id uuid)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
    refreshed_wallet public.wallets%rowtype;
begin
    update public.wallets
    set
        balance_microcredits = coalesce(monthly_credit_balance_microcredits, 0) + coalesce(topup_credit_balance_microcredits, 0),
        updated_at = timezone('utc', now())
    where user_id = target_user_id
    returning *
    into refreshed_wallet;

    if not found then
        raise exception 'Wallet not found for target user.';
    end if;

    return refreshed_wallet;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    next_display_name text;
    next_role text;
    next_plan_code text := 'free';
    next_included_microcredits bigint := 0;
    next_trial_expires_at timestamptz := timezone('utc', now()) + interval '7 days';
    inserted_wallet_user_id uuid;
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

    select coalesce(included_microcredits, 0)
    into next_included_microcredits
    from public.plans
    where code = next_plan_code;

    insert into public.profiles (
        id,
        email,
        display_name,
        role,
        status,
        plan_code,
        account_status,
        trial_expires_at,
        access_pass_expires_at
    )
    values (
        new.id,
        coalesce(new.email, ''),
        next_display_name,
        case when next_role = 'admin' then 'admin' else 'user' end,
        'active',
        case when next_role = 'admin' then 'studio' else next_plan_code end,
        case when next_role = 'admin' then 'studio_active' else 'free' end,
        case when next_role = 'admin' then null else next_trial_expires_at end,
        null
    )
    on conflict (id) do update
    set
        email = excluded.email,
        display_name = excluded.display_name,
        role = excluded.role,
        plan_code = excluded.plan_code,
        account_status = excluded.account_status,
        trial_expires_at = excluded.trial_expires_at,
        updated_at = timezone('utc', now());

    insert into public.wallets (
        user_id,
        balance_microcredits,
        monthly_credit_balance_microcredits,
        topup_credit_balance_microcredits,
        monthly_credit_expires_at
    )
    values (
        new.id,
        case when next_role = 'admin' then 0 else next_included_microcredits end,
        case when next_role = 'admin' then 0 else next_included_microcredits end,
        0,
        case when next_role = 'admin' then null else next_trial_expires_at end
    )
    on conflict (user_id) do nothing
    returning user_id into inserted_wallet_user_id;

    if inserted_wallet_user_id is not null and next_role <> 'admin' and next_included_microcredits > 0 then
        insert into public.wallet_ledger (
            user_id,
            type,
            delta_microcredits,
            notes
        )
        values (
            new.id,
            'signup_grant',
            next_included_microcredits,
            'Initial free trial credit granted at signup.'
        );
    end if;

    return new;
end;
$$;

create or replace function public.admin_update_user_account(
    target_user_id uuid,
    next_plan_code text default null,
    next_balance_microcredits bigint default null,
    adjustment_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    normalized_plan_code text;
    current_profile public.profiles%rowtype;
    current_wallet public.wallets%rowtype;
    requested_balance bigint;
    next_topup_balance bigint;
    balance_delta bigint := 0;
    result jsonb;
    auth_user record;
    next_display_name text;
    next_role text;
    next_account_status text;
begin
    if public.current_app_role() <> 'admin' then
        raise exception 'Admin access required.';
    end if;

    if target_user_id is null then
        raise exception 'Target user ID is required.';
    end if;

    select *
    into current_profile
    from public.profiles
    where id = target_user_id
    for update;

    if not found then
        select
            id,
            email,
            raw_user_meta_data,
            raw_app_meta_data
        into auth_user
        from auth.users
        where id = target_user_id;

        if not found then
            raise exception 'Target user not found.';
        end if;

        next_display_name := coalesce(
            auth_user.raw_user_meta_data ->> 'display_name',
            auth_user.raw_user_meta_data ->> 'full_name',
            split_part(coalesce(auth_user.email, ''), '@', 1),
            'User'
        );

        next_role := coalesce(
            nullif(auth_user.raw_app_meta_data ->> 'role', ''),
            nullif(auth_user.raw_user_meta_data ->> 'role', ''),
            'user'
        );

        insert into public.profiles (
            id,
            email,
            display_name,
            role,
            status,
            plan_code,
            account_status,
            trial_expires_at
        )
        values (
            target_user_id,
            coalesce(auth_user.email, ''),
            next_display_name,
            case when next_role = 'admin' then 'admin' else 'user' end,
            'active',
            case when next_role = 'admin' then 'studio' else 'free' end,
            case when next_role = 'admin' then 'studio_active' else 'free' end,
            case when next_role = 'admin' then null else timezone('utc', now()) + interval '7 days' end
        )
        on conflict (id) do update
        set
            email = excluded.email,
            display_name = excluded.display_name,
            role = excluded.role,
            updated_at = timezone('utc', now());
    end if;

    select *
    into current_profile
    from public.profiles
    where id = target_user_id
    for update;

    insert into public.wallets (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;

    select *
    into current_wallet
    from public.wallets
    where user_id = target_user_id
    for update;

    normalized_plan_code := coalesce(nullif(lower(trim(next_plan_code)), ''), current_profile.plan_code);

    if normalized_plan_code = 'master' then
        normalized_plan_code := 'studio';
    end if;

    if not exists (
        select 1
        from public.plans
        where code = normalized_plan_code
    ) then
        raise exception 'Invalid plan code: %', normalized_plan_code;
    end if;

    next_account_status := case
        when current_profile.role = 'admin' then 'studio_active'
        when normalized_plan_code = 'pro' then 'pro_active'
        when normalized_plan_code = 'studio' then 'studio_active'
        else 'free'
    end;

    update public.profiles
    set
        plan_code = case when current_profile.role = 'admin' then 'studio' else normalized_plan_code end,
        account_status = next_account_status,
        status = case when next_account_status = 'paid_suspended' then 'suspended' else 'active' end,
        trial_expires_at = case
            when current_profile.role = 'admin' then null
            when normalized_plan_code = 'free' then coalesce(current_profile.trial_expires_at, timezone('utc', now()) + interval '7 days')
            else current_profile.trial_expires_at
        end,
        updated_at = timezone('utc', now())
    where id = target_user_id
    returning *
    into current_profile;

    if next_balance_microcredits is not null then
        requested_balance := greatest(next_balance_microcredits, 0);
        next_topup_balance := greatest(requested_balance - coalesce(current_wallet.monthly_credit_balance_microcredits, 0), 0);
        balance_delta := next_topup_balance - coalesce(current_wallet.topup_credit_balance_microcredits, 0);

        update public.wallets
        set
            topup_credit_balance_microcredits = next_topup_balance,
            lifetime_purchased_microcredits = case
                when balance_delta > 0 then lifetime_purchased_microcredits + balance_delta
                else lifetime_purchased_microcredits
            end,
            updated_at = timezone('utc', now())
        where user_id = target_user_id
        returning *
        into current_wallet;

        select *
        into current_wallet
        from public.refresh_wallet_credit_totals(target_user_id);

        if balance_delta <> 0 then
            insert into public.wallet_ledger (
                user_id,
                type,
                delta_microcredits,
                admin_user_id,
                notes
            )
            values (
                target_user_id,
                'admin_adjustment',
                balance_delta,
                auth.uid(),
                coalesce(
                    nullif(trim(adjustment_reason), ''),
                    format('Admin adjusted top-up balance to %s microcredits.', next_topup_balance)
                )
            );
        end if;
    else
        select *
        into current_wallet
        from public.refresh_wallet_credit_totals(target_user_id);
    end if;

    result := jsonb_build_object(
        'user_id', current_profile.id,
        'plan_code', current_profile.plan_code,
        'status', current_profile.status,
        'account_status', current_profile.account_status,
        'trial_expires_at', current_profile.trial_expires_at,
        'balance_microcredits', current_wallet.balance_microcredits,
        'monthly_credit_balance_microcredits', current_wallet.monthly_credit_balance_microcredits,
        'topup_credit_balance_microcredits', current_wallet.topup_credit_balance_microcredits,
        'monthly_credit_expires_at', current_wallet.monthly_credit_expires_at,
        'access_pass_expires_at', current_profile.access_pass_expires_at,
        'lifetime_purchased_microcredits', current_wallet.lifetime_purchased_microcredits,
        'lifetime_consumed_microcredits', current_wallet.lifetime_consumed_microcredits,
        'balance_delta_microcredits', balance_delta
    );

    return result;
end;
$$;

grant execute on function public.admin_update_user_account(uuid, text, bigint, text) to authenticated;

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
    monthly_charge bigint := 0;
    topup_charge bigint := 0;
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

    monthly_charge := least(coalesce(current_wallet.monthly_credit_balance_microcredits, 0), requested_charge);
    topup_charge := least(coalesce(current_wallet.topup_credit_balance_microcredits, 0), greatest(requested_charge - monthly_charge, 0));
    applied_charge := monthly_charge + topup_charge;

    update public.wallets
    set
        monthly_credit_balance_microcredits = greatest(monthly_credit_balance_microcredits - monthly_charge, 0),
        topup_credit_balance_microcredits = greatest(topup_credit_balance_microcredits - topup_charge, 0),
        lifetime_consumed_microcredits = lifetime_consumed_microcredits + applied_charge,
        updated_at = timezone('utc', now())
    where user_id = target_user_id;

    select *
    into current_wallet
    from public.refresh_wallet_credit_totals(target_user_id);

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
        coalesce(usage_payload, '{}'::jsonb) || jsonb_build_object(
            'credit_split',
            jsonb_build_object(
                'monthly_microcredits', monthly_charge,
                'topup_microcredits', topup_charge
            )
        )
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
            'usage_deduction',
            applied_charge * -1,
            greatest(coalesce(provider_cost_usd, 0), 0),
            applied_charge::numeric / (current_markup_rate * 1000000),
            usage_request_id,
            coalesce(
                nullif(trim(notes), ''),
                format(
                    'OpenRouter usage charged for model %s (monthly: %s, top-up: %s).',
                    trim(model_id),
                    monthly_charge,
                    topup_charge
                )
            )
        );
    end if;

    return jsonb_build_object(
        'request_id', usage_request_id,
        'already_recorded', false,
        'charged_microcredits', applied_charge,
        'monthly_charged_microcredits', monthly_charge,
        'topup_charged_microcredits', topup_charge,
        'provider_cost_usd', greatest(coalesce(provider_cost_usd, 0), 0),
        'markup_rate', current_markup_rate,
        'remaining_balance_microcredits', current_wallet.balance_microcredits,
        'remaining_monthly_credit_balance_microcredits', current_wallet.monthly_credit_balance_microcredits,
        'remaining_topup_credit_balance_microcredits', current_wallet.topup_credit_balance_microcredits
    );
end;
$$;

revoke all on function public.record_openrouter_usage_charge(uuid, uuid, text, integer, integer, numeric, text, jsonb, text) from public;
grant execute on function public.record_openrouter_usage_charge(uuid, uuid, text, integer, integer, numeric, text, jsonb, text) to service_role;

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
    current_profile public.profiles%rowtype;
    current_markup_rate numeric(10, 4) := 1;
    previous_monthly_balance bigint := 0;
    normalized_stripe_event_id text;
    normalized_provider_reference_id text;
    normalized_offering_key text;
    normalized_plan_code text;
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
    normalized_plan_code := nullif(lower(trim(plan_code)), '');

    if normalized_plan_code = 'master' then
        normalized_plan_code := 'studio';
    end if;

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
                normalized_plan_code,
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
        resolved_plan_code := normalized_plan_code;
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
    into current_profile
    from public.profiles
    where id = target_user_id
    for update;

    if not found then
        raise exception 'Profile not found for target user.';
    end if;

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
    previous_monthly_balance := greatest(coalesce(current_wallet.monthly_credit_balance_microcredits, 0), 0);

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
            account_status = case
                when resolved_plan_code = 'pro' then 'pro_active'
                else 'studio_active'
            end,
            status = 'active',
            access_pass_expires_at = null,
            updated_at = timezone('utc', now())
        where id = target_user_id
        returning *
        into current_profile;

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

    if purchase_kind = 'subscription' then
        if previous_monthly_balance > 0 then
            update public.wallets
            set
                monthly_credit_balance_microcredits = 0,
                monthly_credit_expires_at = null,
                updated_at = timezone('utc', now())
            where user_id = target_user_id;

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
                'monthly_expire',
                previous_monthly_balance * -1,
                previous_monthly_balance::numeric / (current_markup_rate * 1000000),
                normalized_stripe_event_id,
                'Previous monthly credit expired before the new billing cycle grant.'
            );
        end if;

        if resolved_plan_code = 'pro' and resolved_microcredits > 0 then
            update public.wallets
            set
                monthly_credit_balance_microcredits = resolved_microcredits,
                monthly_credit_expires_at = billing_period_end,
                lifetime_purchased_microcredits = lifetime_purchased_microcredits + resolved_microcredits,
                updated_at = timezone('utc', now())
            where user_id = target_user_id;

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
                'monthly_grant',
                resolved_microcredits,
                resolved_amount_usd,
                normalized_stripe_event_id,
                coalesce(
                    nullif(trim(notes), ''),
                    'Stripe Pro subscription monthly credits granted.'
                )
            );
        else
            update public.wallets
            set
                monthly_credit_balance_microcredits = 0,
                monthly_credit_expires_at = null,
                updated_at = timezone('utc', now())
            where user_id = target_user_id;
        end if;
    elsif purchase_kind = 'topup' and resolved_microcredits > 0 then
        update public.wallets
        set
            topup_credit_balance_microcredits = topup_credit_balance_microcredits + resolved_microcredits,
            lifetime_purchased_microcredits = lifetime_purchased_microcredits + resolved_microcredits,
            updated_at = timezone('utc', now())
        where user_id = target_user_id;

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
            'topup_purchase',
            resolved_microcredits,
            resolved_amount_usd,
            normalized_stripe_event_id,
            coalesce(
                nullif(trim(notes), ''),
                format('Stripe top-up credited for $%s.', resolved_amount_usd)
            )
        );
    end if;

    select *
    into current_wallet
    from public.refresh_wallet_credit_totals(target_user_id);

    return jsonb_build_object(
        'purchase_id', existing_purchase.id,
        'already_recorded', false,
        'granted_microcredits', resolved_microcredits,
        'amount_usd', resolved_amount_usd,
        'plan_code', resolved_plan_code,
        'account_status', current_profile.account_status,
        'remaining_balance_microcredits', current_wallet.balance_microcredits,
        'remaining_monthly_credit_balance_microcredits', current_wallet.monthly_credit_balance_microcredits,
        'remaining_topup_credit_balance_microcredits', current_wallet.topup_credit_balance_microcredits,
        'monthly_credit_expires_at', current_wallet.monthly_credit_expires_at
    );
end;
$$;

revoke all on function public.record_stripe_billing_purchase(
    uuid, text, text, text, text, text, text, text, text, text, text, numeric, bigint, text, timestamptz, timestamptz, jsonb, text
) from public;
grant execute on function public.record_stripe_billing_purchase(
    uuid, text, text, text, text, text, text, text, text, text, text, numeric, bigint, text, timestamptz, timestamptz, jsonb, text
) to service_role;

create or replace function public.sync_stripe_subscription_state(
    target_user_id uuid,
    stripe_customer_id text default null,
    stripe_subscription_id text default null,
    stripe_price_id text default null,
    plan_code text default null,
    subscription_status text default 'active',
    cancel_at_period_end boolean default false,
    current_period_start timestamptz default null,
    current_period_end timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    current_profile public.profiles%rowtype;
    current_wallet public.wallets%rowtype;
    normalized_plan_code text;
    normalized_status text;
    expired_monthly_balance bigint := 0;
begin
    if target_user_id is null then
        raise exception 'Target user ID is required.';
    end if;

    normalized_plan_code := nullif(lower(trim(plan_code)), '');
    if normalized_plan_code = 'master' then
        normalized_plan_code := 'studio';
    end if;

    normalized_status := case lower(trim(coalesce(subscription_status, 'active')))
        when 'trialing' then 'trialing'
        when 'active' then 'active'
        when 'past_due' then 'past_due'
        when 'canceled' then 'canceled'
        when 'unpaid' then 'unpaid'
        when 'incomplete' then 'incomplete'
        when 'incomplete_expired' then 'incomplete_expired'
        else 'incomplete'
    end;

    select *
    into current_profile
    from public.profiles
    where id = target_user_id
    for update;

    if not found then
        raise exception 'Profile not found for target user.';
    end if;

    insert into public.wallets (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;

    select *
    into current_wallet
    from public.wallets
    where user_id = target_user_id
    for update;

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
            normalized_plan_code,
            normalized_status,
            cancel_at_period_end,
            current_period_start,
            current_period_end
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

    expired_monthly_balance := greatest(coalesce(current_wallet.monthly_credit_balance_microcredits, 0), 0);

    if normalized_status in ('active', 'trialing') then
        update public.profiles
        set
            plan_code = coalesce(normalized_plan_code, current_profile.plan_code),
            account_status = case
                when coalesce(normalized_plan_code, current_profile.plan_code) = 'pro' then 'pro_active'
                when coalesce(normalized_plan_code, current_profile.plan_code) = 'studio' then 'studio_active'
                else 'free'
            end,
            status = 'active',
            access_pass_expires_at = null,
            updated_at = timezone('utc', now())
        where id = target_user_id
        returning *
        into current_profile;

        if coalesce(normalized_plan_code, current_profile.plan_code) = 'studio' and expired_monthly_balance > 0 then
            update public.wallets
            set
                monthly_credit_balance_microcredits = 0,
                monthly_credit_expires_at = null,
                updated_at = timezone('utc', now())
            where user_id = target_user_id;

            insert into public.wallet_ledger (
                user_id,
                type,
                delta_microcredits,
                notes
            )
            values (
                target_user_id,
                'monthly_expire',
                expired_monthly_balance * -1,
                'Monthly credits cleared because the active plan is now Studio.'
            );
        end if;
    else
        if expired_monthly_balance > 0 then
            update public.wallets
            set
                monthly_credit_balance_microcredits = 0,
                monthly_credit_expires_at = null,
                updated_at = timezone('utc', now())
            where user_id = target_user_id;

            insert into public.wallet_ledger (
                user_id,
                type,
                delta_microcredits,
                notes
            )
            values (
                target_user_id,
                'monthly_expire',
                expired_monthly_balance * -1,
                'Monthly credits expired because the paid subscription is no longer active.'
            );
        end if;

        update public.profiles
        set
            plan_code = coalesce(normalized_plan_code, current_profile.plan_code),
            account_status = case
                when role = 'admin' then 'studio_active'
                when coalesce(normalized_plan_code, current_profile.plan_code) = 'free' then 'free'
                else 'paid_suspended'
            end,
            status = case
                when role = 'admin' then 'active'
                when coalesce(normalized_plan_code, current_profile.plan_code) = 'free' then 'active'
                else 'suspended'
            end,
            access_pass_expires_at = null,
            updated_at = timezone('utc', now())
        where id = target_user_id
        returning *
        into current_profile;
    end if;

    select *
    into current_wallet
    from public.refresh_wallet_credit_totals(target_user_id);

    return jsonb_build_object(
        'user_id', current_profile.id,
        'plan_code', current_profile.plan_code,
        'account_status', current_profile.account_status,
        'status', current_profile.status,
        'balance_microcredits', current_wallet.balance_microcredits,
        'monthly_credit_balance_microcredits', current_wallet.monthly_credit_balance_microcredits,
        'topup_credit_balance_microcredits', current_wallet.topup_credit_balance_microcredits,
        'monthly_credit_expires_at', current_wallet.monthly_credit_expires_at
    );
end;
$$;

revoke all on function public.sync_stripe_subscription_state(uuid, text, text, text, text, text, boolean, timestamptz, timestamptz) from public;
grant execute on function public.sync_stripe_subscription_state(uuid, text, text, text, text, text, boolean, timestamptz, timestamptz) to service_role;

create or replace function public.activate_studio_access_pass(
    confirmation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_user_id uuid := auth.uid();
    current_profile public.profiles%rowtype;
    current_wallet public.wallets%rowtype;
    access_pass_cost_microcredits bigint := 7000000;
    next_access_pass_expires_at timestamptz := timezone('utc', now()) + interval '30 days';
begin
    if target_user_id is null then
        raise exception 'Authenticated user is required.';
    end if;

    if nullif(trim(confirmation), '') is null then
        raise exception 'Confirmation is required.';
    end if;

    select *
    into current_profile
    from public.profiles
    where id = target_user_id
    for update;

    if not found then
        raise exception 'Profile not found for current user.';
    end if;

    if current_profile.role = 'admin' then
        raise exception 'Admin accounts do not use access passes.';
    end if;

    if current_profile.account_status <> 'paid_suspended' then
        raise exception 'Studio Access Pass is only available for suspended paid accounts.';
    end if;

    insert into public.wallets (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;

    select *
    into current_wallet
    from public.wallets
    where user_id = target_user_id
    for update;

    if coalesce(current_wallet.topup_credit_balance_microcredits, 0) < access_pass_cost_microcredits then
        raise exception 'At least $7 of top-up credits is required to activate the Studio Access Pass.';
    end if;

    update public.wallets
    set
        topup_credit_balance_microcredits = topup_credit_balance_microcredits - access_pass_cost_microcredits,
        lifetime_consumed_microcredits = lifetime_consumed_microcredits + access_pass_cost_microcredits,
        updated_at = timezone('utc', now())
    where user_id = target_user_id;

    update public.profiles
    set
        plan_code = 'studio',
        account_status = 'studio_active',
        status = 'active',
        access_pass_expires_at = next_access_pass_expires_at,
        updated_at = timezone('utc', now())
    where id = target_user_id
    returning *
    into current_profile;

    insert into public.wallet_ledger (
        user_id,
        type,
        delta_microcredits,
        retail_value_usd,
        notes
    )
    values (
        target_user_id,
        'access_pass_deduction',
        access_pass_cost_microcredits * -1,
        7.0,
        'Studio Access Pass (30 days) activated from top-up credits.'
    );

    select *
    into current_wallet
    from public.refresh_wallet_credit_totals(target_user_id);

    return jsonb_build_object(
        'user_id', current_profile.id,
        'plan_code', current_profile.plan_code,
        'account_status', current_profile.account_status,
        'access_pass_expires_at', current_profile.access_pass_expires_at,
        'remaining_balance_microcredits', current_wallet.balance_microcredits,
        'remaining_topup_credit_balance_microcredits', current_wallet.topup_credit_balance_microcredits
    );
end;
$$;

revoke all on function public.activate_studio_access_pass(text) from public;
grant execute on function public.activate_studio_access_pass(text) to authenticated;
