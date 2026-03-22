-- Manual helper for PromptPrim Stripe test-mode catalog created on 2026-03-22.
-- This is not a migration. Run it manually in the target Supabase project
-- only when you want the app to use Stripe test-mode products and prices.

update public.billing_offerings
set
    stripe_product_id = 'prod_UC4OmTkwVxvGa0',
    stripe_price_id = 'price_1TDgFxBnTTgl4SU7WH6M562w',
    is_active = true,
    updated_at = timezone('utc', now())
where offering_key = 'plan_studio_monthly';

update public.billing_offerings
set
    stripe_product_id = 'prod_UC4O76ahk1ELjR',
    stripe_price_id = 'price_1TDgFxBnTTgl4SU7Pof6yDJx',
    is_active = true,
    updated_at = timezone('utc', now())
where offering_key = 'plan_pro_monthly';

update public.billing_offerings
set
    stripe_product_id = 'prod_UC4OZmEDHLxkxg',
    stripe_price_id = 'price_1TDgI7BnTTgl4SU7k2jwgv4w',
    is_active = true,
    updated_at = timezone('utc', now())
where offering_key = 'topup_5';

update public.billing_offerings
set
    stripe_product_id = 'prod_UC4OZmEDHLxkxg',
    stripe_price_id = 'price_1TDgI6BnTTgl4SU7YJsQ9FPY',
    is_active = true,
    updated_at = timezone('utc', now())
where offering_key = 'topup_10';

update public.billing_offerings
set
    stripe_product_id = 'prod_UC4OZmEDHLxkxg',
    stripe_price_id = 'price_1TDgI3BnTTgl4SU7Tlk9DUOC',
    is_active = true,
    updated_at = timezone('utc', now())
where offering_key = 'topup_30';

update public.billing_offerings
set
    stripe_product_id = 'prod_UC4OZmEDHLxkxg',
    stripe_price_id = 'price_1TDgI2BnTTgl4SU7j7NRsTOK',
    is_active = true,
    updated_at = timezone('utc', now())
where offering_key = 'topup_50';

update public.billing_offerings
set
    stripe_product_id = 'prod_UC4OZmEDHLxkxg',
    stripe_price_id = 'price_1TDgHRBnTTgl4SU7euYC8a7O',
    is_active = true,
    updated_at = timezone('utc', now())
where offering_key = 'topup_100';

select
    offering_key,
    display_name,
    kind,
    plan_code,
    amount_usd,
    stripe_product_id,
    stripe_price_id,
    is_active
from public.billing_offerings
order by sort_order asc, created_at asc;
