import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18.5.0';
import { corsHeaders as supabaseCorsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const corsHeaders = {
    ...supabaseCorsHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type CheckoutRequestBody = {
    offeringKey?: string;
    successUrl?: string;
    cancelUrl?: string;
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

function getStripeClient() {
    const stripeApiKey = String(
        Deno.env.get('STRIPE_SECRET_KEY')
        || Deno.env.get('STRIPE_API_KEY')
        || ''
    ).trim();
    if (!stripeApiKey) {
        throw new Error('Missing STRIPE_SECRET_KEY secret in Supabase Edge Functions.');
    }

    return new Stripe(stripeApiKey, {
        apiVersion: '2025-02-24.acacia'
    });
}

function normalizeUrl(rawValue: unknown) {
    const normalized = String(rawValue || '').trim();
    if (!normalized) return '';

    try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return parsed.toString();
    } catch (_) {
        return '';
    }
}

function normalizePlanCode(rawValue: unknown) {
    const normalized = String(rawValue || 'free').trim().toLowerCase();
    if (!normalized || normalized === 'master') return 'studio';
    return normalized;
}

function deriveAccountStatus(profile: {
    role?: string | null;
    plan_code?: string | null;
    status?: string | null;
    account_status?: string | null;
}) {
    const normalizedRole = String(profile.role || '').trim().toLowerCase();
    if (normalizedRole === 'admin') return 'studio_active';

    const normalizedAccountStatus = String(profile.account_status || '').trim().toLowerCase();
    if (['free', 'studio_active', 'pro_active', 'paid_suspended'].includes(normalizedAccountStatus)) {
        return normalizedAccountStatus;
    }

    const normalizedPlanCode = normalizePlanCode(profile.plan_code);
    const normalizedStatus = String(profile.status || 'active').trim().toLowerCase();
    if (normalizedPlanCode === 'pro') {
        return normalizedStatus === 'active' ? 'pro_active' : 'paid_suspended';
    }
    if (normalizedPlanCode === 'studio') {
        return normalizedStatus === 'active' ? 'studio_active' : 'paid_suspended';
    }
    return 'free';
}

Deno.serve(async (request: Request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed.' }, 405);
    }

    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Missing Authorization header.' }, 401);
        }

        const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
        const supabaseAnonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
        const supabaseServiceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
            return jsonResponse({ error: 'Supabase function environment is not configured correctly.' }, 500);
        }

        const authClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: authHeader
                }
            }
        });
        const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

        const { data: userResult, error: userError } = await authClient.auth.getUser();
        if (userError || !userResult.user) {
            return jsonResponse({ error: 'Invalid session.' }, 401);
        }

        let requestBody: CheckoutRequestBody | null = null;
        try {
            requestBody = await request.json();
        } catch (_) {
            return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
        }

        const offeringKey = String(requestBody?.offeringKey || '').trim();
        const successUrl = normalizeUrl(requestBody?.successUrl);
        const cancelUrl = normalizeUrl(requestBody?.cancelUrl);

        if (!offeringKey) {
            return jsonResponse({ error: 'An offering key is required.' }, 400);
        }

        if (!successUrl || !cancelUrl) {
            return jsonResponse({ error: 'Valid success and cancel URLs are required.' }, 400);
        }

        const [{ data: profile, error: profileError }, { data: offering, error: offeringError }, { data: stripeCustomerRow, error: stripeCustomerError }] = await Promise.all([
            serviceClient
                .from('profiles')
                .select('id, email, display_name, plan_code, role, status, account_status')
                .eq('id', userResult.user.id)
                .maybeSingle(),
            serviceClient
                .from('billing_offerings')
                .select('id, offering_key, display_name, kind, plan_code, billing_interval, amount_usd, granted_microcredits, stripe_price_id, is_active')
                .eq('offering_key', offeringKey)
                .eq('is_active', true)
                .maybeSingle(),
            serviceClient
                .from('stripe_customers')
                .select('provider_customer_id')
                .eq('user_id', userResult.user.id)
                .maybeSingle()
        ]);

        if (profileError || !profile) {
            return jsonResponse({ error: 'PromptPrim profile not found for this user.' }, 409);
        }

        if (offeringError || !offering) {
            return jsonResponse({ error: 'This billing offering is not active or does not exist.' }, 404);
        }

        if (stripeCustomerError) {
            return jsonResponse({ error: 'Could not load Stripe customer record.' }, 500);
        }

        const stripePriceId = String(offering.stripe_price_id || '').trim();
        if (!stripePriceId) {
            return jsonResponse({ error: 'This billing offering is not connected to a Stripe price yet.' }, 409);
        }

        const effectiveAccountStatus = deriveAccountStatus(profile);
        if (offering.kind === 'topup' && effectiveAccountStatus !== 'pro_active') {
            return jsonResponse({
                error: 'Top-up Credits are only available to active Pro accounts. Free is trial-only, and Studio is strict BYOK.'
            }, 403);
        }

        const stripe = getStripeClient();
        let stripeCustomerId = String(stripeCustomerRow?.provider_customer_id || '').trim();

        if (!stripeCustomerId) {
            const createdCustomer = await stripe.customers.create({
                email: String(profile.email || userResult.user.email || '').trim() || undefined,
                name: String(profile.display_name || '').trim() || undefined,
                metadata: {
                    user_id: String(userResult.user.id),
                    promptprim_profile_id: String(profile.id)
                }
            });

            stripeCustomerId = createdCustomer.id;

            const { error: upsertCustomerError } = await serviceClient
                .from('stripe_customers')
                .upsert({
                    user_id: userResult.user.id,
                    provider_customer_id: stripeCustomerId,
                    email_snapshot: String(profile.email || userResult.user.email || '').trim() || null
                }, { onConflict: 'user_id' });

            if (upsertCustomerError) {
                return jsonResponse({ error: 'Could not persist the Stripe customer record.' }, 500);
            }
        }

        const metadata = {
            user_id: String(userResult.user.id),
            offering_key: String(offering.offering_key),
            offering_kind: String(offering.kind),
            plan_code: String(offering.plan_code || ''),
            granted_microcredits: String(offering.granted_microcredits ?? 0),
            stripe_price_id: stripePriceId
        };

        const session = await stripe.checkout.sessions.create({
            mode: offering.kind === 'subscription' ? 'subscription' : 'payment',
            customer: stripeCustomerId,
            line_items: [
                {
                    price: stripePriceId,
                    quantity: 1
                }
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: String(userResult.user.id),
            metadata,
            allow_promotion_codes: true,
            billing_address_collection: 'auto',
            ...(offering.kind === 'subscription'
                ? {
                    subscription_data: {
                        metadata
                    }
                }
                : {
                    payment_intent_data: {
                        metadata
                    }
                })
        });

        return jsonResponse({
            checkoutSessionId: session.id,
            url: session.url
        });
    } catch (error) {
        console.error('Unexpected stripe-create-checkout failure:', error);
        return jsonResponse({
            error: error instanceof Error ? error.message : 'Unexpected checkout failure.'
        }, 500);
    }
});
