drop function if exists public.admin_update_user_account(uuid, text, bigint, text);

create or replace function public.admin_update_user_account(
    target_user_id uuid,
    next_plan_code text default null,
    next_balance_microcredits bigint default null,
    adjustment_reason text default null,
    next_monthly_credit_balance_microcredits bigint default null,
    next_topup_credit_balance_microcredits bigint default null,
    next_account_status text default null,
    next_trial_expires_at timestamptz default null,
    clear_trial_expires_at boolean default false,
    next_access_pass_expires_at timestamptz default null,
    clear_access_pass_expires_at boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    normalized_plan_code text;
    normalized_requested_account_status text;
    effective_account_status text;
    current_profile public.profiles%rowtype;
    current_wallet public.wallets%rowtype;
    requested_balance bigint;
    resolved_monthly_balance bigint;
    resolved_topup_balance bigint;
    monthly_balance_delta bigint := 0;
    topup_balance_delta bigint := 0;
    resolved_trial_expires_at timestamptz;
    resolved_access_pass_expires_at timestamptz;
    result jsonb;
    auth_user record;
    next_display_name text;
    next_role text;
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

    normalized_requested_account_status := nullif(lower(trim(next_account_status)), '');
    if normalized_requested_account_status in ('auto', 'active') then
        normalized_requested_account_status := null;
    end if;

    if normalized_requested_account_status is not null
        and normalized_requested_account_status not in ('free', 'studio_active', 'pro_active', 'paid_suspended') then
        raise exception 'Invalid account status: %', normalized_requested_account_status;
    end if;

    effective_account_status := case
        when current_profile.role = 'admin' then 'studio_active'
        when normalized_requested_account_status is not null then normalized_requested_account_status
        when normalized_plan_code = 'pro' then 'pro_active'
        when normalized_plan_code = 'studio' then 'studio_active'
        else 'free'
    end;

    resolved_trial_expires_at := case
        when current_profile.role = 'admin' then null
        when clear_trial_expires_at then null
        when next_trial_expires_at is not null then next_trial_expires_at
        when normalized_plan_code = 'free' then coalesce(current_profile.trial_expires_at, timezone('utc', now()) + interval '7 days')
        else current_profile.trial_expires_at
    end;

    resolved_access_pass_expires_at := case
        when clear_access_pass_expires_at then null
        when next_access_pass_expires_at is not null then next_access_pass_expires_at
        else current_profile.access_pass_expires_at
    end;

    update public.profiles
    set
        plan_code = case when current_profile.role = 'admin' then 'studio' else normalized_plan_code end,
        account_status = effective_account_status,
        status = case when effective_account_status = 'paid_suspended' then 'suspended' else 'active' end,
        trial_expires_at = resolved_trial_expires_at,
        access_pass_expires_at = resolved_access_pass_expires_at,
        updated_at = timezone('utc', now())
    where id = target_user_id
    returning *
    into current_profile;

    resolved_monthly_balance := case
        when next_monthly_credit_balance_microcredits is not null then greatest(next_monthly_credit_balance_microcredits, 0)
        when effective_account_status = 'paid_suspended' then 0
        else coalesce(current_wallet.monthly_credit_balance_microcredits, 0)
    end;

    resolved_topup_balance := case
        when next_topup_credit_balance_microcredits is not null then greatest(next_topup_credit_balance_microcredits, 0)
        when next_balance_microcredits is not null then greatest(greatest(next_balance_microcredits, 0) - resolved_monthly_balance, 0)
        else coalesce(current_wallet.topup_credit_balance_microcredits, 0)
    end;

    monthly_balance_delta := resolved_monthly_balance - coalesce(current_wallet.monthly_credit_balance_microcredits, 0);
    topup_balance_delta := resolved_topup_balance - coalesce(current_wallet.topup_credit_balance_microcredits, 0);

    update public.wallets
    set
        monthly_credit_balance_microcredits = resolved_monthly_balance,
        topup_credit_balance_microcredits = resolved_topup_balance,
        monthly_credit_expires_at = case
            when effective_account_status = 'paid_suspended' then null
            when resolved_monthly_balance <= 0 then null
            when next_monthly_credit_balance_microcredits is not null and current_wallet.monthly_credit_expires_at is null
                then timezone('utc', now()) + interval '30 days'
            else current_wallet.monthly_credit_expires_at
        end,
        lifetime_purchased_microcredits = case
            when topup_balance_delta > 0 then lifetime_purchased_microcredits + topup_balance_delta
            else lifetime_purchased_microcredits
        end,
        updated_at = timezone('utc', now())
    where user_id = target_user_id
    returning *
    into current_wallet;

    select *
    into current_wallet
    from public.refresh_wallet_credit_totals(target_user_id);

    if monthly_balance_delta <> 0 then
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
            monthly_balance_delta,
            auth.uid(),
            coalesce(
                nullif(trim(adjustment_reason), ''),
                format('Admin adjusted monthly credit balance to %s microcredits.', resolved_monthly_balance)
            )
        );
    end if;

    if topup_balance_delta <> 0 then
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
            topup_balance_delta,
            auth.uid(),
            coalesce(
                nullif(trim(adjustment_reason), ''),
                format('Admin adjusted Top-up Credit balance to %s microcredits.', resolved_topup_balance)
            )
        );
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
        'monthly_balance_delta_microcredits', monthly_balance_delta,
        'topup_balance_delta_microcredits', topup_balance_delta
    );

    return result;
end;
$$;

grant execute on function public.admin_update_user_account(
    uuid, text, bigint, text, bigint, bigint, text, timestamptz, boolean, timestamptz, boolean
) to authenticated;

create or replace function public.admin_delete_user_account(
    target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_profile public.profiles%rowtype;
    target_auth_user record;
    target_role text;
begin
    if public.current_app_role() <> 'admin' then
        raise exception 'Admin access required.';
    end if;

    if target_user_id is null then
        raise exception 'Target user ID is required.';
    end if;

    if auth.uid() = target_user_id then
        raise exception 'You cannot delete your own admin account.';
    end if;

    select *
    into target_profile
    from public.profiles
    where id = target_user_id;

    select
        id,
        email,
        raw_user_meta_data,
        raw_app_meta_data
    into target_auth_user
    from auth.users
    where id = target_user_id;

    if not found then
        raise exception 'Target user not found.';
    end if;

    target_role := coalesce(
        nullif(target_auth_user.raw_app_meta_data ->> 'role', ''),
        nullif(target_auth_user.raw_user_meta_data ->> 'role', ''),
        nullif(target_profile.role, ''),
        'user'
    );

    if target_role = 'admin' then
        raise exception 'Admin accounts cannot be deleted here.';
    end if;

    delete from auth.users
    where id = target_user_id;

    return jsonb_build_object(
        'deleted_user_id', target_user_id,
        'deleted_email', coalesce(target_auth_user.email, target_profile.email, '')
    );
end;
$$;

grant execute on function public.admin_delete_user_account(uuid) to authenticated;
