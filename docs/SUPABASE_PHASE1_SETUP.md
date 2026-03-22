# Supabase Phase 1 Setup

Last updated: 2026-03-22

This guide covers the first runnable Supabase integration added in Phase 1:

- hosted sign in and sign up
- guarded `app.html`
- guarded `admin.html`
- initial schema for `profiles`, `plans`, `wallets`, and `wallet_ledger`
- backend hydration of the logged-in user profile and wallet
- backend-managed model catalog and plan allowlists

## 1. Create a Supabase project

Create a new Supabase project and collect:

- Project URL
- Publishable anon key

## 2. Add local environment variables

Copy `.env.example` to `.env` and fill in:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-anon-key
```

## 3. Apply the Phase 1 SQL

Run the migrations in your Supabase SQL editor:

- [202603200001_phase1_auth_foundation.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603200001_phase1_auth_foundation.sql)
- [202603200002_wallet_signup_grant.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603200002_wallet_signup_grant.sql)
- [202603200003_model_catalog_and_plan_access.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603200003_model_catalog_and_plan_access.sql)
- [202603200004_admin_update_user_account.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603200004_admin_update_user_account.sql)
- [202603200005_admin_update_user_account_bootstrap_missing_profiles.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603200005_admin_update_user_account_bootstrap_missing_profiles.sql)
- [202603200006_billing_settings_and_usage_events.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603200006_billing_settings_and_usage_events.sql)
- [202603200007_stripe_billing_foundation.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603200007_stripe_billing_foundation.sql)
- [202603220008_studio_pricing_alignment.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603220008_studio_pricing_alignment.sql)
- [202603220009_billing_v2_credit_split_and_access_pass.sql](/home/kaiwank/my-project/PromptPrim/supabase/migrations/202603220009_billing_v2_credit_split_and_access_pass.sql)

This creates:

- `plans`
- `profiles`
- `wallets`
- `wallet_ledger`
- `model_catalog`
- `plan_model_access`
- profile and wallet bootstrap trigger for new auth users
- starter wallet credits for new free users and a backfill for missing/empty starter wallets
- backend-managed allowlists so admin-selected models can be exposed by plan
- admin RPC for persisting user plan and wallet edits from the admin page
- a resilience patch so admin edits can bootstrap older auth users who are missing `profiles`/`wallets` rows
- backend billing settings storage for markup rate
- `usage_events` plus a server-only usage charge RPC for OpenRouter proxy billing
- Stripe billing tables for offerings, customers, subscriptions, and purchases
- server-only Stripe purchase recording RPC for top-ups and subscription grants
- split wallet balances for `monthly_credit_balance_microcredits` and `topup_credit_balance_microcredits`
- `account_status`, trial expiry, and access-pass expiry tracking on `profiles`
- internal `activate_studio_access_pass(...)` RPC for 30-day Studio reactivation from Top-up Credits

## 4. Create your first admin user

Sign up normally through `auth.html`, then set that user’s role to admin.

For the current Phase 1 guard, admin access is read from Supabase auth metadata:

- `app_metadata.role = "admin"` preferred
- `user_metadata.role = "admin"` also works for initial testing

If you set the role in metadata after the account already exists, sign out and sign back in.

## 5. Run the app

Start the dev server:

```bash
npm run dev
```

Pages:

- `/` landing page
- `/auth.html` auth page
- `/app.html` main app
- `/admin.html` admin page

## 6. Deploy the provider balance sync function

To let the admin billing panel reflect real OpenRouter account balance:

1. Create a Supabase Edge Function from the repo file:
   - [openrouter-credits/index.ts](/home/kaiwank/my-project/PromptPrim/supabase/functions/openrouter-credits/index.ts#L1)
2. Add a Supabase function secret named `OPENROUTER_API_KEY`
   - this must be an OpenRouter management key
   - do not use the browser-stored admin key for this
3. Deploy the function:

```bash
supabase functions deploy openrouter-credits --no-verify-jwt
```

After deployment, the admin page can use `Sync OpenRouter Balance` to pull:

- total credits purchased
- total provider usage
- remaining provider balance

The frontend invokes this through the authenticated Supabase client, and the function checks that the caller is an admin before calling OpenRouter.

## 7. Deploy the backend model sync function

To move OpenRouter model catalog sync off the browser and into Supabase:

1. Create a Supabase Edge Function from:
   - [openrouter-models-sync/index.ts](/home/kaiwank/my-project/PromptPrim/supabase/functions/openrouter-models-sync/index.ts#L1)
2. Keep the same `OPENROUTER_API_KEY` secret set in Supabase Edge Functions
   - this function also uses the built-in `SUPABASE_SERVICE_ROLE_KEY` provided by Supabase
3. Deploy the function:

```bash
supabase functions deploy openrouter-models-sync --no-verify-jwt
```

After deployment:

- admin-triggered model refresh pulls OpenRouter models through the Edge Function
- the function upserts the results into `model_catalog`
- the admin allowlist editor can use the synced backend catalog instead of browser-only provider fetches

## 8. Deploy the chat proxy function

To move SaaS user OpenRouter traffic off the browser and into the backend:

1. Create a Supabase Edge Function from:
   - [openrouter-chat/index.ts](/home/kaiwank/my-project/PromptPrim/supabase/functions/openrouter-chat/index.ts#L1)
2. Keep the same `OPENROUTER_API_KEY` secret set in Supabase Edge Functions
   - this function also uses the built-in `SUPABASE_SERVICE_ROLE_KEY` provided by Supabase
3. Deploy the function:

```bash
supabase functions deploy openrouter-chat --no-verify-jwt
```

After deployment:

- Supabase-authenticated non-Studio users will send OpenRouter chat requests through the Edge Function
- the function validates the user session
- enforces `free`, `studio_active`, `pro_active`, and `paid_suspended` access rules
- checks plan/model access against `plan_model_access`
- blocks zero-balance wallets
- records actual usage in `usage_events`
- charges monthly credits first, then Top-up Credits through the backend RPC

## 9. Deploy the Stripe billing functions

To move subscriptions and top-ups fully server-side:

1. Create Supabase Edge Functions from:
   - [stripe-create-checkout/index.ts](/home/kaiwank/my-project/PromptPrim/supabase/functions/stripe-create-checkout/index.ts#L1)
   - [stripe-customer-portal/index.ts](/home/kaiwank/my-project/PromptPrim/supabase/functions/stripe-customer-portal/index.ts#L1)
   - [stripe-webhook/index.ts](/home/kaiwank/my-project/PromptPrim/supabase/functions/stripe-webhook/index.ts#L1)
2. Add Supabase function secrets:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SIGNING_SECRET`
   - optional: `STRIPE_PORTAL_CONFIGURATION_ID`
3. Deploy the functions:

```bash
supabase functions deploy stripe-create-checkout --no-verify-jwt
supabase functions deploy stripe-customer-portal --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

4. In Stripe Dashboard or Workbench, register the webhook endpoint URL:

```text
https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.paid`
- `customer.subscription.updated`
- `customer.subscription.deleted`

5. Update the seeded offerings with your real Stripe price IDs, then activate the ones you want to sell:

```sql
update public.billing_offerings
set stripe_price_id = 'price_xxx', is_active = true
where offering_key = 'plan_pro_monthly';

update public.billing_offerings
set stripe_price_id = 'price_yyy', is_active = true
where offering_key = 'plan_studio_monthly';

update public.billing_offerings
set stripe_price_id = 'price_zzz', is_active = true
where offering_key = 'topup_5';
```

After deployment:

- users can start Stripe checkout from the account modal
- completed top-ups credit the wallet through webhook fulfillment
- paid subscription invoices grant included credits through webhook fulfillment
- the Stripe customer portal can open from the account modal after the first checkout

## 10. Current limitations

This is a foundation pass, not the full SaaS migration yet.

Current behavior:

- Supabase auth is real
- app/admin route protection is real
- the active app profile is hydrated from Supabase `profiles` and `wallets` after login
- model visibility can now be stored in Supabase by billing plan
- OpenRouter model catalog sync can now run through Supabase Edge Functions
- user account history and admin activity/account/reporting views can now read backend `usage_events` and `wallet_ledger`
- backend chat proxy foundation is now in the repo, but still needs live deployment in your Supabase project
- backend usage accounting is now in the repo, but still needs migration `202603200006...` applied
- Stripe billing foundation is now in the repo, but still needs live secrets, price IDs, and webhook registration
- monthly subscription renewals and portal access depend on live Stripe configuration

Next phases will move model access, usage debits, and billing checkout fully server-side.
