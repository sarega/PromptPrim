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

update public.profiles
set
    plan_code = 'studio',
    updated_at = timezone('utc', now())
where lower(plan_code) = 'master';

update public.user_subscriptions
set
    plan_code = 'studio',
    updated_at = timezone('utc', now())
where lower(plan_code) = 'master';

update public.billing_offerings
set
    display_name = case
        when offering_key = 'plan_pro_monthly' then 'Pro Plan'
        when offering_key = 'plan_studio_monthly' then 'Studio Plan'
        else display_name
    end,
    plan_code = case
        when lower(coalesce(plan_code, '')) = 'master' then 'studio'
        else plan_code
    end,
    amount_usd = case
        when offering_key = 'plan_pro_monthly' then 10.00
        when offering_key = 'plan_studio_monthly' then 8.00
        else amount_usd
    end,
    granted_microcredits = case
        when offering_key = 'plan_pro_monthly' then 7500000
        when offering_key = 'plan_studio_monthly' then 0
        else granted_microcredits
    end,
    updated_at = timezone('utc', now())
where offering_key in ('plan_pro_monthly', 'plan_studio_monthly')
   or lower(coalesce(plan_code, '')) = 'master';

update public.user_subscriptions
set
    plan_code = 'studio',
    updated_at = timezone('utc', now())
where provider_price_id in (
    select stripe_price_id
    from public.billing_offerings
    where offering_key = 'plan_studio_monthly'
);
