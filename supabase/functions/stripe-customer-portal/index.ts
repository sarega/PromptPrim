import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18.5.0';
import { corsHeaders as supabaseCorsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const corsHeaders = {
    ...supabaseCorsHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type PortalRequestBody = {
    returnUrl?: string;
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

        let requestBody: PortalRequestBody | null = null;
        try {
            requestBody = await request.json();
        } catch (_) {
            requestBody = {};
        }

        const returnUrl = normalizeUrl(requestBody?.returnUrl);

        const [{ data: profile, error: profileError }, { data: stripeCustomerRow, error: stripeCustomerError }, { data: latestSubscription, error: subscriptionError }] = await Promise.all([
            serviceClient
                .from('profiles')
                .select('id, email')
                .eq('id', userResult.user.id)
                .maybeSingle(),
            serviceClient
                .from('stripe_customers')
                .select('provider_customer_id')
                .eq('user_id', userResult.user.id)
                .maybeSingle(),
            serviceClient
                .from('user_subscriptions')
                .select('provider_customer_id')
                .eq('user_id', userResult.user.id)
                .order('current_period_end', { ascending: false })
                .limit(1)
                .maybeSingle()
        ]);

        if (profileError || !profile) {
            return jsonResponse({ error: 'PromptPrim profile not found for this user.' }, 409);
        }

        if (stripeCustomerError || subscriptionError) {
            return jsonResponse({ error: 'Could not load Stripe billing records for this user.' }, 500);
        }

        const stripeCustomerId = String(
            stripeCustomerRow?.provider_customer_id
            || latestSubscription?.provider_customer_id
            || ''
        ).trim();

        if (!stripeCustomerId) {
            return jsonResponse({
                error: 'No Stripe customer exists for this account yet. Complete your first checkout before opening the billing portal.'
            }, 409);
        }

        if (!String(stripeCustomerRow?.provider_customer_id || '').trim()) {
            const { error: persistCustomerError } = await serviceClient
                .from('stripe_customers')
                .upsert({
                    user_id: userResult.user.id,
                    provider_customer_id: stripeCustomerId,
                    email_snapshot: String(profile.email || userResult.user.email || '').trim() || null
                }, { onConflict: 'user_id' });

            if (persistCustomerError) {
                return jsonResponse({ error: 'Could not persist the Stripe customer record.' }, 500);
            }
        }

        const stripe = getStripeClient();
        const portalConfigurationId = String(Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') || '').trim();
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            ...(returnUrl ? { return_url: returnUrl } : {}),
            ...(portalConfigurationId ? { configuration: portalConfigurationId } : {})
        });

        return jsonResponse({
            customerId: stripeCustomerId,
            url: portalSession.url
        });
    } catch (error) {
        console.error('Unexpected stripe-customer-portal failure:', error);
        return jsonResponse({
            error: error instanceof Error ? error.message : 'Unexpected billing portal failure.'
        }, 500);
    }
});
