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
        plan_code
    )
    values (
        new.id,
        coalesce(new.email, ''),
        next_display_name,
        case when next_role = 'admin' then 'admin' else 'user' end,
        'active',
        next_plan_code
    )
    on conflict (id) do update
    set
        email = excluded.email,
        display_name = excluded.display_name,
        role = excluded.role,
        updated_at = timezone('utc', now());

    insert into public.wallets (
        user_id,
        balance_microcredits
    )
    values (
        new.id,
        next_included_microcredits
    )
    on conflict (user_id) do nothing
    returning user_id into inserted_wallet_user_id;

    if inserted_wallet_user_id is not null and next_included_microcredits > 0 then
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
            'Initial plan credits granted at signup.'
        );
    end if;

    return new;
end;
$$;

with missing_wallets as (
    insert into public.wallets (
        user_id,
        balance_microcredits
    )
    select
        profiles.id,
        coalesce(plans.included_microcredits, 0)
    from public.profiles
    join public.plans
        on plans.code = profiles.plan_code
    where not exists (
        select 1
        from public.wallets
        where wallets.user_id = profiles.id
    )
    returning user_id, balance_microcredits
),
starter_grants as (
    update public.wallets
    set
        balance_microcredits = greatest(public.wallets.balance_microcredits, coalesce(plans.included_microcredits, 0)),
        updated_at = timezone('utc', now())
    from public.profiles
    join public.plans
        on plans.code = public.profiles.plan_code
    where public.wallets.user_id = public.profiles.id
        and public.profiles.plan_code = 'free'
        and public.wallets.balance_microcredits = 0
        and public.wallets.lifetime_consumed_microcredits = 0
        and not exists (
            select 1
            from public.wallet_ledger
            where public.wallet_ledger.user_id = public.wallets.user_id
                and public.wallet_ledger.type = 'signup_grant'
        )
    returning public.wallets.user_id, coalesce(plans.included_microcredits, 0) as granted_microcredits
),
ledger_grants as (
    insert into public.wallet_ledger (
        user_id,
        type,
        delta_microcredits,
        notes
    )
    select
        starter_grants.user_id,
        'signup_grant',
        starter_grants.granted_microcredits,
        'Initial free-plan credits backfilled during Phase 1 SaaS migration.'
    from starter_grants
    where starter_grants.granted_microcredits > 0
    returning user_id
)
insert into public.wallet_ledger (
    user_id,
    type,
    delta_microcredits,
    notes
)
select
    missing_wallets.user_id,
    'signup_grant',
    missing_wallets.balance_microcredits,
    'Initial plan credits backfilled when missing wallet rows were created.'
from missing_wallets
where missing_wallets.balance_microcredits > 0
    and not exists (
        select 1
        from ledger_grants
        where ledger_grants.user_id = missing_wallets.user_id
    );
