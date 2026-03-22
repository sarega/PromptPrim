# PromptPrim SaaS on Supabase PRD

Last updated: 2026-03-20
Status: Draft v1

## 1. Product Summary

PromptPrim will evolve from a browser-first prototype into a hosted SaaS application built on Supabase.

The first SaaS release will focus on:

- real user authentication
- secure server-side OpenRouter access
- admin-controlled model allowlists
- wallet-based credit accounting
- Stripe-based subscription and top-up flows
- a finished user account section for plan, balance, and usage

The first release will not attempt to move every local project/session feature into the cloud at once. To keep scope manageable, cloud auth, model access, and billing will come first. Full cloud sync for projects and sessions can follow in a later phase.

## 2. Why This Project Exists

The current codebase is already strong on UX and agent tooling, but its account/admin/billing layer is still a prototype. Today:

- login is a redirect, not authentication
- users and billing live in browser `localStorage`
- admin settings live in browser storage
- OpenRouter calls are made directly from the client
- credit math is done client-side

That is enough for local demos, but not enough for a hosted SaaS product.

## 3. Current-State Audit

The following prototype behaviors must be replaced or isolated behind a backend:

- User/admin data is stored in `localStorage`
  - `src/js/modules/user/user.service.js`
- Mock user switching is used instead of auth
  - `src/js/modules/user/user.service.js`
- Landing "login" only redirects to the app
  - `src/landing.jsx`
- Admin page fetches provider models in the browser
  - `src/admin.js`
  - `src/js/core/core.api.js`
- The app can resolve and use the admin OpenRouter key on the client
  - `src/js/modules/user/user.service.js`
  - `src/js/core/core.api.js`
- Credits are burned client-side and billing totals are stored client-side
  - `src/js/modules/user/user.service.js`
  - `src/js/modules/chat/chat.handlers.js`
- Admin model selection is partly implemented, but runtime enforcement only reads the `free_tier` and `pro_tier` presets
  - `src/js/modules/admin/admin-model-manager.ui.js`
  - `src/js/modules/user/user.service.js`

## 4. Product Goals

### 4.1 Business Goals

- launch a secure hosted version of PromptPrim
- monetize usage without exposing platform API keys
- control which LLMs each plan can use
- support both subscriptions and one-off top-ups
- create enough margin to cover OpenRouter, Stripe, Supabase, support, and growth

### 4.2 User Goals

- sign up and log in normally
- see plan, credits, and recent usage clearly
- access only the models allowed by their plan
- buy credits or upgrade plan without contacting admin
- trust that billing is accurate and auditable

### 4.3 Admin Goals

- see all synced OpenRouter models
- define plan-based model allowlists
- view users, balances, usage, and payment state
- manually grant or remove credits with audit logs
- never expose the platform OpenRouter key in the browser

## 5. Non-Goals for the First SaaS Release

- full enterprise multi-tenant org model
- SSO
- private fine-tune hosting
- marketplace billing for third-party agents
- real-time collaborative editing
- full cloud sync of every current project/session feature

## 6. Recommended Business Model

The recommended launch model is:

- subscription + included credits + paid top-ups
- Studio BYOK tier + Pro platform-managed credits

Why:

- PromptPrim is a heavy usage product with agents, summaries, world tools, and long-context workflows
- a pure "unlimited" plan creates margin risk
- a pure pay-as-you-go plan is simple, but weakens retention and predictability
- a hybrid model gives stable MRR while protecting gross margin

### 6.1 Recommended Plans

#### Free

- `$0.20` trial credit balance
- expires in `7` days
- low-cost model allowlist only
- limited support
- no premium workflow features
- first paid step should be low-friction, with a `$5` refill pack available

#### Pro

- `$10/month`
- includes `$3` usage credits each month
- access to stronger model tiers
- ability to purchase top-ups

#### Studio

- `$8/month`
- BYOK for OpenRouter or other user-managed keys
- no included platform credits
- full control with lower monthly cost

### 6.2 Pricing Logic

Use credits internally as microcredits:

- `1 USD = 1,000,000 microcredits`

This matches the current prototype mental model and avoids floating-point issues in the UI.

### 6.3 Initial Launch Top-Up Packs

Recommended starter top-up ladder:

- `$5`
- `$10`
- `$30`
- `$50`
- `$100`

Why this ladder:

- `$5` lowers friction for first paid conversion from free users
- `$10` and `$30` cover most casual and regular users
- `$50` and `$100` support heavier usage without forcing subscription changes
- all packs should convert into the same internal microcredit logic, with any promotional bonus handled explicitly

Target effective pricing should cover:

- underlying model cost
- OpenRouter funding/platform fees
- Stripe payment and billing fees
- Supabase and hosting costs
- support and margin

Initial recommendation:

- keep an effective markup target around `1.4x - 1.7x` underlying inference cost
- review actual margins after the first 30-60 days of usage data

This number is a product recommendation, not a hard finance rule. We should validate it with real cohort behavior after launch.

## 7. Product Requirements

### 7.1 Authentication

The app must support:

- sign up
- sign in
- sign out
- password reset
- session persistence
- protected routes for app and admin

Admin access must be role-based. There must be no concept of switching to another user locally.

### 7.2 User Account

The user account section must show:

- current plan
- current credit balance
- included monthly credits
- recent usage history
- recent payments and top-ups
- upgrade and refill actions
- account status such as active, grace, suspended

### 7.3 Admin Model Management

The admin page must:

- sync all current OpenRouter models into the database
- display full model catalog with search/filter
- allow selection of models per plan
- optionally support featured or hidden flags
- publish the allowed model list to users based on plan

The source of truth must be database-backed, not JSON in local storage.

### 7.4 Credit and Billing

The system must:

- store user balance on the backend
- keep an immutable ledger of balance changes
- support Stripe subscriptions
- support one-off top-up purchases
- support manual admin adjustments
- record actual usage cost per request
- prevent double-billing and race conditions

### 7.5 LLM Request Security

All paid model requests must be proxied server-side.

The browser must never:

- see the platform OpenRouter API key
- decide final credit burn
- decide whether a user is allowed to access a premium model

### 7.6 Reporting

Admin must be able to view:

- MRR or subscription revenue
- total refill revenue
- total provider cost
- per-user usage
- per-plan usage
- margin by period

## 8. Technical Architecture

### 8.1 Frontend

Keep the existing Vite frontend and refactor integrations.

Frontend responsibilities:

- render app UI
- hold local workspace state where appropriate
- call Supabase auth APIs
- call Edge Functions for protected operations
- display user/account/admin data from the backend

### 8.2 Supabase

Use:

- Supabase Auth
- Postgres
- Row Level Security
- Edge Functions
- Storage if we later move uploaded assets or project files to the cloud

### 8.3 External Services

- OpenRouter for model inference and model catalog sync
- Stripe for subscriptions, top-ups, invoices, and billing portal

## 9. Backend Data Model

### 9.1 Core Tables

#### `profiles`

- `id uuid pk` = `auth.users.id`
- `email text`
- `display_name text`
- `role text` in (`user`, `admin`)
- `status text` in (`active`, `grace`, `suspended`)
- `created_at`
- `updated_at`

#### `plans`

- `id uuid pk`
- `code text unique` such as `free`, `pro`, `studio`
- `name text`
- `monthly_price_usd numeric`
- `included_microcredits bigint`
- `is_active boolean`

#### `user_subscriptions`

- `id uuid pk`
- `user_id uuid`
- `plan_id uuid`
- `provider text` = `stripe`
- `provider_customer_id text`
- `provider_subscription_id text`
- `status text`
- `current_period_start`
- `current_period_end`

#### `wallets`

- `user_id uuid pk`
- `balance_microcredits bigint`
- `lifetime_purchased_microcredits bigint`
- `lifetime_consumed_microcredits bigint`
- `updated_at`

#### `wallet_ledger`

- `id uuid pk`
- `user_id uuid`
- `type text`
- `delta_microcredits bigint`
- `provider_cost_usd numeric`
- `retail_value_usd numeric`
- `request_id uuid null`
- `stripe_event_id text null`
- `admin_user_id uuid null`
- `notes text null`
- `created_at`

#### `model_catalog`

- `id text pk` using OpenRouter model id
- `name text`
- `provider text`
- `description text`
- `context_length integer`
- `prompt_price numeric`
- `completion_price numeric`
- `supports_tools boolean`
- `is_active boolean`
- `synced_at`

#### `plan_model_access`

- `id uuid pk`
- `plan_id uuid`
- `model_id text`
- `enabled boolean`
- unique `(plan_id, model_id)`

#### `usage_events`

- `id uuid pk`
- `user_id uuid`
- `request_id uuid unique`
- `model_id text`
- `prompt_tokens integer`
- `completion_tokens integer`
- `provider_cost_usd numeric`
- `retail_cost_microcredits bigint`
- `usage_is_estimated boolean`
- `latency_ms integer`
- `created_at`

#### `admin_audit_logs`

- `id uuid pk`
- `admin_user_id uuid`
- `action text`
- `entity_type text`
- `entity_id text`
- `payload jsonb`
- `created_at`

### 9.2 Optional Later Tables

- `projects`
- `project_members`
- `project_snapshots`
- `uploaded_files`
- `knowledge_indexes`

These should be phase-2 or later unless cloud sync becomes launch-critical.

## 10. Credit Logic

### 10.1 Unit

Use `microcredits` as the internal unit.

Benefits:

- integer-safe
- easy UI formatting
- consistent with current prototype

### 10.2 Ledger Rules

Never mutate balance without a ledger row.

Allowed ledger event types:

- `subscription_grant`
- `topup_purchase`
- `usage_hold`
- `usage_finalize`
- `usage_release`
- `admin_adjustment`
- `bonus`
- `refund`

### 10.3 Request Flow

1. User submits prompt.
2. Backend verifies auth and plan.
3. Backend verifies requested model is allowed for the user.
4. Backend places a temporary usage hold based on a conservative max-cost estimate.
5. Backend calls OpenRouter.
6. Backend calculates final actual cost from usage and provider response.
7. Backend finalizes ledger and releases unused hold.
8. Backend returns completion and updated balance summary.

### 10.4 Grace Period

Recommended rule:

- if paid user balance hits zero, fall back to restricted free-tier access for a short grace window
- do not allow premium-model usage on zero balance
- preserve read access to history/account screens

## 11. Admin Product Requirements

### 11.1 Model Sync

Admin can trigger or schedule model sync from OpenRouter.

Sync must:

- upsert the full catalog into `model_catalog`
- preserve historical references for inactive models
- refresh pricing and context values

### 11.2 Plan-to-Model Mapping

Admin can:

- choose a plan
- search all synced models
- bulk select and deselect
- save the allowlist for that plan

This replaces the current local Studio/plan preset approach.

### 11.3 User Management

Admin can:

- search users
- view status, plan, balance, total spend
- add or remove credits
- force status changes
- inspect usage history
- see billing events and audit trail

### 11.4 Billing Controls

Admin can:

- define plans
- define included credits
- set top-up pack prices
- start with a launch preset ladder of `$5`, `$10`, `$30`, `$50`, `$100`
- inspect margin and usage reports

## 12. User Product Requirements

### 12.1 Landing and Auth

The landing page must support:

- sign in
- sign up
- pricing overview
- call-to-action into authenticated app flow

### 12.2 Account Screen

The account screen must include:

- profile info
- plan name and status
- total credit balance
- monthly credits (Pro)
- Top-up Credits
- Studio Access Pass status and expiry
- refill and upgrade buttons
- payment history
- recent usage

### 12.3 Model Experience

Users should only see allowed models. They should not see premium models they cannot access unless we intentionally show them as locked upsell items.

When a user changes tier or refills into a higher tier:

- the allowed model list must refresh immediately
- the account/settings UI must stop showing stale lower-tier options
- the current default working model should be reconciled automatically if it is no longer valid
- on Free -> Pro upgrades, the app may promote the default working model to a Pro-tier default to make the upgrade feel immediate

## 13. Phase Plan

## 13A. Agenda Snapshot

Current delivery status as of 2026-03-22:

- done: Supabase auth foundation
- done: protected app and admin routes
- done: backend-backed `profiles`, `wallets`, and starter credit bootstrap
- done: admin user management now hydrates from Supabase account rows instead of only local shadow users
- done: backend-managed model catalog and plan allowlists now have a Supabase-backed OpenRouter sync path
- in progress: server-side OpenRouter proxy and backend usage accounting foundation are in the repo
- in progress: user account and admin log/reporting screens now read backend usage and wallet history where available
- done: live OpenRouter provider balance sync for admin billing
- in progress: Stripe billing foundation is now in the repo with offerings schema, checkout, customer portal, and webhook fulfillment
- in progress: billing v2 credit split and Studio Access Pass flow are now in the repo
- not started: finished account/reporting polish and optional cloud sync

Remaining work count:

- `8` major jobs left for the first real SaaS launch
- `1` optional post-launch job left for cloud project/session sync

Launch-critical jobs still left:

1. Finish auth completeness
   - password reset
   - email confirmation and production auth settings
   - role/bootstrap cleanup so no prototype shadow-user behavior remains
2. Finish secure model sync
   - move OpenRouter model sync behind Supabase Edge Functions
   - store provider secrets in Supabase, not browser state
   - extend provider sync from billing balance into full model-catalog refresh
   - keep user model access and default model selection in sync with live plan changes
3. Build the server-side chat proxy
   - all OpenRouter inference must go through an Edge Function
   - browser must stop using the platform key directly
4. Finish wallet ledger accounting
   - add `usage_events`
   - reserve/finalize/release flow
   - make ledger the source of truth for balance changes
5. Connect live provider-cost reflection
   - live admin balance sync is working; finish persistence and reconciliation views
   - admin should see real provider spend and remaining provider balance
   - reconcile provider balance vs issued PromptPrim user credits
6. Finish Stripe billing
   - create Stripe products/prices
   - wire live price IDs into `billing_offerings`
   - deploy checkout, portal, and webhook functions
   - verify Studio / Pro subscriptions, monthly grants, and top-up packs end to end
7. Finish the user account area
   - real plan screen
   - usage history
   - payment history
   - monthly-vs-top-up balance visibility
   - access-pass activation UX
8. Finish production admin/reporting and hardening
   - audit log UI
   - reporting based on backend data
   - RLS review, failure-path handling, deployment checklist

Optional post-launch job:

1. Cloud project/session sync
   - move selected project/session data to Supabase
   - preserve local-first editing quality while syncing across devices

## Phase 0: Product and Schema Finalization

Outcome:

- approve PRD
- confirm pricing direction
- confirm whether launch is single-user or team-aware

Deliverables:

- final schema
- env strategy
- implementation checklist

Exit criteria:

- no unresolved decisions that block auth, billing, or model access

## Phase 1: Supabase Foundation

Outcome:

- real authentication exists
- browser no longer switches users locally

Deliverables:

- Supabase project setup
- auth screens and session handling
- `profiles`, `plans`, `wallets`, `wallet_ledger` schema
- RLS policies

Exit criteria:

- user can sign up, sign in, sign out
- admin route is protected by role

## Phase 2: Secure Model Access

Outcome:

- OpenRouter model catalog is backend-managed
- model access is plan-based and secure

Deliverables:

- `model_catalog`
- `plan_model_access`
- model sync function
- admin allowlist UI backed by Supabase

Exit criteria:

- admin can sync all OpenRouter models
- users only receive their allowed models from the backend

## Phase 3: LLM Proxy and Credit Ledger

Outcome:

- inference is server-side
- billing is ledger-backed

Deliverables:

- `chat-proxy` edge function
- usage hold/finalize logic
- `usage_events`
- updated frontend account balance refresh

Exit criteria:

- platform OpenRouter key is no longer used in the browser
- each request creates auditable usage and ledger records

## Phase 4: Stripe Billing and Top-Ups

Outcome:

- real money flow is live

Deliverables:

- Stripe products and prices
- checkout session function
- customer portal function
- webhook function
- subscription activation logic
- top-up pack flow
- initial top-up packs: `$5`, `$10`, `$30`, `$50`, `$100`

Exit criteria:

- successful purchase updates wallet or subscription state automatically

## Phase 5: Finished User Account and Reporting

Outcome:

- account and admin sections feel production-ready

Deliverables:

- account page overhaul
- payment history
- usage history
- admin reports
- audit log UI

Exit criteria:

- user can understand plan, spending, and balance without admin help

## Phase 6: Optional Cloud Project Sync

Outcome:

- projects and sessions can sync across devices

Deliverables:

- project storage model
- sync strategy for sessions and knowledge files

Exit criteria:

- cloud sync is stable and does not regress the local-first editing experience

## 14. Risks

- trying to move auth, billing, and project sync at the same time will slow the launch
- using browser-side provider keys in hosted mode would be a critical security flaw
- unlimited pricing would expose the business to runaway model cost
- model pricing changes require periodic sync and reporting checks
- race conditions in wallet deduction will create trust issues if we skip reservation/finalization

## 15. Open Questions

- Should free users see locked premium models as upsell items?
- Should project/session cloud sync be in launch scope or postponed?

## 16. Recommended Next Build Step

Finish Phase 4 next:

- create the live Stripe products and prices
- activate `billing_offerings`
- deploy checkout, portal, and webhook functions
- validate end-to-end top-up and subscription renewal behavior

That completes the hosted money flow and removes the biggest remaining gap before a real SaaS launch.
