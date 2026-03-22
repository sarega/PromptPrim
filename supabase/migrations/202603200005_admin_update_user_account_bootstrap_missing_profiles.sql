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
    balance_delta bigint := 0;
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
            plan_code
        )
        values (
            target_user_id,
            coalesce(auth_user.email, ''),
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
    end if;

    select *
    into current_profile
    from public.profiles
    where id = target_user_id
    for update;

    if not found then
        raise exception 'Target user not found.';
    end if;

    insert into public.wallets (user_id)
    values (target_user_id)
    on conflict (user_id) do nothing;

    select *
    into current_wallet
    from public.wallets
    where user_id = target_user_id
    for update;

    normalized_plan_code := coalesce(nullif(lower(trim(next_plan_code)), ''), current_profile.plan_code);

    if not exists (
        select 1
        from public.plans
        where code = normalized_plan_code
    ) then
        raise exception 'Invalid plan code: %', normalized_plan_code;
    end if;

    update public.profiles
    set
        plan_code = normalized_plan_code,
        status = 'active',
        updated_at = timezone('utc', now())
    where id = target_user_id
    returning *
    into current_profile;

    if next_balance_microcredits is not null then
        requested_balance := greatest(next_balance_microcredits, 0);
        balance_delta := requested_balance - coalesce(current_wallet.balance_microcredits, 0);

        update public.wallets
        set
            balance_microcredits = requested_balance,
            lifetime_purchased_microcredits = case
                when balance_delta > 0 then lifetime_purchased_microcredits + balance_delta
                else lifetime_purchased_microcredits
            end,
            updated_at = timezone('utc', now())
        where user_id = target_user_id
        returning *
        into current_wallet;

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
                    format('Admin adjusted balance to %s microcredits.', requested_balance)
                )
            );
        end if;
    end if;

    result := jsonb_build_object(
        'user_id', current_profile.id,
        'plan_code', current_profile.plan_code,
        'status', current_profile.status,
        'balance_microcredits', current_wallet.balance_microcredits,
        'lifetime_purchased_microcredits', current_wallet.lifetime_purchased_microcredits,
        'lifetime_consumed_microcredits', current_wallet.lifetime_consumed_microcredits,
        'balance_delta_microcredits', balance_delta
    );

    return result;
end;
$$;

grant execute on function public.admin_update_user_account(uuid, text, bigint, text) to authenticated;
