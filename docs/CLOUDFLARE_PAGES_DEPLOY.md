# Cloudflare Pages Deploy

This frontend is ready to deploy as a static multi-page app on Cloudflare Pages.

## Build Modes

- Cloudflare Pages root deploy:
  - build command: `npm run build:cloudflare`
  - output directory: `dist`
- Custom root deploy outside Cloudflare:
  - build command: `npm run build:root`
- GitHub Pages subpath deploy:
  - build command: `npm run build:github`

The Vite base path is now environment-aware:

- default is `/`
- `VITE_PUBLIC_BASE_PATH=/your-subpath/` overrides it explicitly
- `npm run build:github` still forces `/PromptPrim/` for GitHub Pages-style deploys

Cloudflare Pages route helpers are also included:

- `/auth` -> `/auth.html`
- `/app` -> `/app.html`
- `/admin` -> `/admin.html`

## Cloudflare Pages Settings

Recommended Pages project settings:

- Framework preset: `Vite`
- Build command: `npm run build:cloudflare`
- Build output directory: `dist`
- Root directory: project root

## Required Environment Variables

Set these in Cloudflare Pages:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Optional:

- `VITE_PUBLIC_BASE_PATH=/`
- `VITE_FORMSPREE_ENDPOINT=https://formspree.io/f/your-form-id`
- `VITE_CONTACT_EMAIL=hello@your-domain.com`

## Supabase Auth URLs

In Supabase Auth settings, make sure your production URLs are allowed.

For a root-domain deploy:

- Site URL: `https://your-domain.com/`
- Redirect URLs:
  - `https://your-domain.com/auth.html`
  - `https://your-domain.com/app.html`
  - `https://your-domain.com/admin.html`

If you deploy under a subpath, include that exact subpath in every URL.

## Important Architecture Note

Cloudflare Pages hosts the frontend only.

These backend pieces still stay on Supabase:

- Auth
- Database
- Edge Functions
- Stripe webhook handler
- Stripe checkout/customer portal functions
- OpenRouter proxy / billing functions

So after deploying the frontend, keep managing backend deploys with Supabase CLI.

## Quick Verification

After deploy:

1. Open `index.html`
2. Go to `auth.html`
3. Sign in
4. Confirm `app.html` loads
5. Confirm `admin.html` loads for admin users
6. Test one account save and one admin action
7. Test one Stripe checkout in test mode
8. Submit the landing-page contact form and confirm the message reaches your Formspree inbox/email

## Formspree Contact Setup

To make the landing-page contact form work without building a custom backend first:

1. Create a form in Formspree.
2. Copy the endpoint that looks like `https://formspree.io/f/your-form-id`.
3. Set `VITE_FORMSPREE_ENDPOINT` in Cloudflare Pages.
4. Optionally set `VITE_CONTACT_EMAIL` so the landing page also shows a direct email fallback.
5. Redeploy and test one submission from `index.html`.
