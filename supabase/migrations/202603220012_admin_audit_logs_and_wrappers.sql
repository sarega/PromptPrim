create table if not exists public.admin_audit_logs (
    id uuid primary key default gen_random_uuid(),
    admin_user_id uuid references public.profiles(id) on delete set null,
    admin_email_snapshot text,
    action_type text not null,
    summary text not null,
    target_user_id uuid references public.profiles(id) on delete set null,
    target_email_snapshot text,
    target_display_name_snapshot text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    constraint admin_audit_logs_action_type_not_blank check (char_length(trim(action_type)) > 0),
    constraint admin_audit_logs_summary_not_blank check (char_length(trim(summary)) > 0)
);

create index if not exists idx_admin_audit_logs_created_at
    on public.admin_audit_logs(created_at desc);

create index if not exists idx_admin_audit_logs_target_user_id_created_at
    on public.admin_audit_logs(target_user_id, created_at desc);

create index if not exists idx_admin_audit_logs_admin_user_id_created_at
    on public.admin_audit_logs(admin_user_id, created_at desc);

create index if not exists idx_admin_audit_logs_action_type_created_at
    on public.admin_audit_logs(action_type, created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admins can read admin audit logs" on public.admin_audit_logs;
create policy "admins can read admin audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.current_app_role() = 'admin');

create or replace function public.write_admin_audit_log(
    next_action_type text,
    next_summary text,
    next_target_user_id uuid default null,
    next_target_email_snapshot text default null,
    next_target_display_name_snapshot text default null,
    next_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    audit_log_id uuid;
    actor_email text := '';
begin
    if public.current_app_role() <> 'admin' then
        raise exception 'Admin access required.';
    end if;

    if nullif(trim(next_action_type), '') is null then
        raise exception 'Audit action type is required.';
    end if;

    if nullif(trim(next_summary), '') is null then
        raise exception 'Audit summary is required.';
    end if;

    select coalesce(email, '')
    into actor_email
    from public.profiles
    where id = auth.uid();

    insert into public.admin_audit_logs (
        admin_user_id,
        admin_email_snapshot,
        action_type,
        summary,
        target_user_id,
        target_email_snapshot,
        target_display_name_snapshot,
        metadata
    )
    values (
        auth.uid(),
        actor_email,
        trim(next_action_type),
        trim(next_summary),
        next_target_user_id,
        nullif(trim(coalesce(next_target_email_snapshot, '')), ''),
        nullif(trim(coalesce(next_target_display_name_snapshot, '')), ''),
        coalesce(next_metadata, '{}'::jsonb)
    )
    returning id
    into audit_log_id;

    return audit_log_id;
end;
$$;

grant execute on function public.write_admin_audit_log(text, text, uuid, text, text, jsonb) to authenticated;

create or replace function public.audit_billing_settings_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.current_app_role() = 'admin' and old.markup_rate is distinct from new.markup_rate then
        perform public.write_admin_audit_log(
            'billing_settings_updated',
            format('Updated billing markup rate to %s.', new.markup_rate),
            null,
            null,
            null,
            jsonb_build_object(
                'settings_id', new.id,
                'previous_markup_rate', old.markup_rate,
                'next_markup_rate', new.markup_rate
            )
        );
    end if;

    return new;
end;
$$;

drop trigger if exists audit_billing_settings_changes on public.billing_settings;
create trigger audit_billing_settings_changes
after update on public.billing_settings
for each row
when (old.markup_rate is distinct from new.markup_rate)
execute procedure public.audit_billing_settings_changes();

do $$
begin
    if to_regprocedure('public.admin_update_user_account_impl(uuid,text,bigint,text,bigint,bigint,text,timestamptz,boolean,timestamptz,boolean)') is null
        and to_regprocedure('public.admin_update_user_account(uuid,text,bigint,text,bigint,bigint,text,timestamptz,boolean,timestamptz,boolean)') is not null then
        execute 'alter function public.admin_update_user_account(uuid, text, bigint, text, bigint, bigint, text, timestamptz, boolean, timestamptz, boolean) rename to admin_update_user_account_impl';
    end if;
end;
$$;

do $$
begin
    if to_regprocedure('public.admin_delete_user_account_impl(uuid)') is null
        and to_regprocedure('public.admin_delete_user_account(uuid)') is not null then
        execute 'alter function public.admin_delete_user_account(uuid) rename to admin_delete_user_account_impl';
    end if;
end;
$$;

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
    prior_profile public.profiles%rowtype;
    prior_wallet public.wallets%rowtype;
    next_profile public.profiles%rowtype;
    audit_summary text;
    result jsonb;
begin
    if public.current_app_role() <> 'admin' then
        raise exception 'Admin access required.';
    end if;

    if target_user_id is null then
        raise exception 'Target user ID is required.';
    end if;

    select *
    into prior_profile
    from public.profiles
    where id = target_user_id;

    select *
    into prior_wallet
    from public.wallets
    where user_id = target_user_id;

    result := public.admin_update_user_account_impl(
        target_user_id,
        next_plan_code,
        next_balance_microcredits,
        adjustment_reason,
        next_monthly_credit_balance_microcredits,
        next_topup_credit_balance_microcredits,
        next_account_status,
        next_trial_expires_at,
        clear_trial_expires_at,
        next_access_pass_expires_at,
        clear_access_pass_expires_at
    );

    select *
    into next_profile
    from public.profiles
    where id = target_user_id;

    audit_summary := coalesce(
        nullif(trim(adjustment_reason), ''),
        format('Updated account controls for %s.', coalesce(next_profile.display_name, next_profile.email, target_user_id::text))
    );

    perform public.write_admin_audit_log(
        'user_account_updated',
        audit_summary,
        target_user_id,
        coalesce(next_profile.email, prior_profile.email, ''),
        coalesce(next_profile.display_name, prior_profile.display_name, ''),
        jsonb_strip_nulls(jsonb_build_object(
            'reason', nullif(trim(adjustment_reason), ''),
            'requested', jsonb_strip_nulls(jsonb_build_object(
                'next_plan_code', nullif(trim(coalesce(next_plan_code, '')), ''),
                'next_balance_microcredits', next_balance_microcredits,
                'next_monthly_credit_balance_microcredits', next_monthly_credit_balance_microcredits,
                'next_topup_credit_balance_microcredits', next_topup_credit_balance_microcredits,
                'next_account_status', nullif(trim(coalesce(next_account_status, '')), ''),
                'next_trial_expires_at', next_trial_expires_at,
                'clear_trial_expires_at', case when clear_trial_expires_at then true else null end,
                'next_access_pass_expires_at', next_access_pass_expires_at,
                'clear_access_pass_expires_at', case when clear_access_pass_expires_at then true else null end
            )),
            'before', jsonb_build_object(
                'plan_code', prior_profile.plan_code,
                'account_status', prior_profile.account_status,
                'status', prior_profile.status,
                'trial_expires_at', prior_profile.trial_expires_at,
                'access_pass_expires_at', prior_profile.access_pass_expires_at,
                'balance_microcredits', coalesce(prior_wallet.balance_microcredits, 0),
                'monthly_credit_balance_microcredits', coalesce(prior_wallet.monthly_credit_balance_microcredits, 0),
                'topup_credit_balance_microcredits', coalesce(prior_wallet.topup_credit_balance_microcredits, 0),
                'monthly_credit_expires_at', prior_wallet.monthly_credit_expires_at
            ),
            'after', result
        ))
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
    prior_profile public.profiles%rowtype;
    prior_auth_email text := '';
    prior_auth_meta jsonb := '{}'::jsonb;
    deleted_email text := '';
    deleted_display_name text := '';
    result jsonb;
begin
    if public.current_app_role() <> 'admin' then
        raise exception 'Admin access required.';
    end if;

    if target_user_id is null then
        raise exception 'Target user ID is required.';
    end if;

    select *
    into prior_profile
    from public.profiles
    where id = target_user_id;

    select
        coalesce(email, ''),
        coalesce(raw_user_meta_data, '{}'::jsonb)
    into
        prior_auth_email,
        prior_auth_meta
    from auth.users
    where id = target_user_id;

    deleted_email := coalesce(nullif(prior_auth_email, ''), prior_profile.email, '');
    deleted_display_name := coalesce(
        prior_profile.display_name,
        prior_auth_meta ->> 'display_name',
        prior_auth_meta ->> 'full_name',
        split_part(deleted_email, '@', 1),
        ''
    );

    result := public.admin_delete_user_account_impl(target_user_id);

    perform public.write_admin_audit_log(
        'user_account_deleted',
        format('Deleted user account %s.', coalesce(nullif(deleted_email, ''), target_user_id::text)),
        target_user_id,
        deleted_email,
        deleted_display_name,
        jsonb_strip_nulls(jsonb_build_object(
            'deleted_user_id', target_user_id,
            'deleted_email', deleted_email,
            'prior_profile', jsonb_strip_nulls(jsonb_build_object(
                'plan_code', prior_profile.plan_code,
                'account_status', prior_profile.account_status,
                'status', prior_profile.status,
                'trial_expires_at', prior_profile.trial_expires_at,
                'access_pass_expires_at', prior_profile.access_pass_expires_at
            )),
            'result', result
        ))
    );

    return result;
end;
$$;

grant execute on function public.admin_delete_user_account(uuid) to authenticated;
