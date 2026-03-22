alter table public.profiles
    add column if not exists avatar_url text,
    add column if not exists billing_name text,
    add column if not exists billing_company text,
    add column if not exists billing_phone text,
    add column if not exists billing_address_line1 text,
    add column if not exists billing_address_line2 text,
    add column if not exists billing_city text,
    add column if not exists billing_state text,
    add column if not exists billing_postal_code text,
    add column if not exists billing_country text;

create or replace function public.handle_auth_user_updated()
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

    return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update on auth.users
for each row execute procedure public.handle_auth_user_updated();
