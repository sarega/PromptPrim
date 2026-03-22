import * as AuthService from '../auth/auth.service.js';
import { getSupabasePublishableKey, getSupabaseUrl } from '../../integrations/supabase/client.js';

function getSupabaseClientOrThrow() {
    const client = AuthService.getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }
    return client;
}

async function getRefreshedAccessToken() {
    const client = getSupabaseClientOrThrow();
    const { data: refreshedSessionData, error: refreshedSessionError } = await client.auth.refreshSession();
    if (refreshedSessionError) {
        throw new Error('Your Supabase session has expired. Please sign out and sign back in.');
    }

    const accessToken = String(refreshedSessionData?.session?.access_token || '').trim();
    if (!accessToken) {
        throw new Error('No valid Supabase access token is available. Please sign in again.');
    }

    return accessToken;
}

function getFunctionBaseUrl() {
    const supabaseUrl = String(getSupabaseUrl() || '').trim().replace(/\/+$/, '');
    const publishableKey = String(getSupabasePublishableKey() || '').trim();
    if (!supabaseUrl || !publishableKey) {
        throw new Error('Supabase function endpoint is not configured.');
    }
    return {
        supabaseUrl,
        publishableKey
    };
}

function normalizeOfferingRow(row = {}) {
    return {
        id: String(row.id || ''),
        offeringKey: String(row.offering_key || ''),
        displayName: String(row.display_name || row.offering_key || ''),
        kind: String(row.kind || 'topup'),
        planCode: row.plan_code ? String(row.plan_code) : null,
        billingInterval: row.billing_interval ? String(row.billing_interval) : null,
        amountUSD: Number(row.amount_usd) || 0,
        grantedMicrocredits: Number(row.granted_microcredits) || 0,
        checkoutReady: Boolean(String(row.stripe_price_id || '').trim()),
        sortOrder: Number(row.sort_order) || 0
    };
}

export function isStripeBillingAvailable() {
    return AuthService.isSupabaseEnabled();
}

export async function fetchBillingOfferings() {
    if (!isStripeBillingAvailable()) {
        return [];
    }

    const client = getSupabaseClientOrThrow();
    const { data, error } = await client
        .from('billing_offerings')
        .select('id, offering_key, display_name, kind, plan_code, billing_interval, amount_usd, granted_microcredits, stripe_price_id, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

    if (error) throw error;

    return (Array.isArray(data) ? data : [])
        .map(normalizeOfferingRow)
        .sort((left, right) => left.sortOrder - right.sortOrder);
}

export async function fetchBillingSnapshot() {
    if (!isStripeBillingAvailable()) {
        return {
            offerings: [],
            subscription: null,
            hasStripeCustomer: false,
            profile: null,
            wallet: null
        };
    }

    const client = getSupabaseClientOrThrow();
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw userError;

    const currentUserId = String(userData?.user?.id || '').trim();
    if (!currentUserId) {
        throw new Error('No authenticated Supabase user is available.');
    }

    const [offerings, subscriptionResult, customerResult, profileResult, walletResult] = await Promise.all([
        fetchBillingOfferings(),
        client
            .from('user_subscriptions')
            .select('provider_subscription_id, provider_customer_id, provider_price_id, plan_code, status, cancel_at_period_end, current_period_start, current_period_end')
            .eq('user_id', currentUserId)
            .order('current_period_end', { ascending: false })
            .limit(1)
            .maybeSingle(),
        client
            .from('stripe_customers')
            .select('provider_customer_id')
            .eq('user_id', currentUserId)
            .maybeSingle(),
        client
            .from('profiles')
            .select('plan_code, status, account_status, trial_expires_at, access_pass_expires_at')
            .eq('id', currentUserId)
            .maybeSingle(),
        client
            .from('wallets')
            .select('balance_microcredits, monthly_credit_balance_microcredits, topup_credit_balance_microcredits, monthly_credit_expires_at')
            .eq('user_id', currentUserId)
            .maybeSingle()
    ]);

    if (subscriptionResult.error) throw subscriptionResult.error;
    if (customerResult.error) throw customerResult.error;
    if (profileResult.error) throw profileResult.error;
    if (walletResult.error) throw walletResult.error;

    return {
        offerings,
        subscription: subscriptionResult.data ? {
            subscriptionId: String(subscriptionResult.data.provider_subscription_id || ''),
            customerId: String(subscriptionResult.data.provider_customer_id || ''),
            priceId: String(subscriptionResult.data.provider_price_id || ''),
            planCode: subscriptionResult.data.plan_code ? String(subscriptionResult.data.plan_code) : null,
            status: String(subscriptionResult.data.status || 'incomplete'),
            cancelAtPeriodEnd: subscriptionResult.data.cancel_at_period_end === true,
            currentPeriodStart: subscriptionResult.data.current_period_start || null,
            currentPeriodEnd: subscriptionResult.data.current_period_end || null
        } : null,
        hasStripeCustomer: Boolean(String(customerResult.data?.provider_customer_id || '').trim()),
        profile: profileResult.data ? {
            planCode: profileResult.data.plan_code ? String(profileResult.data.plan_code) : null,
            status: String(profileResult.data.status || 'active'),
            accountStatus: String(profileResult.data.account_status || ''),
            trialExpiresAt: profileResult.data.trial_expires_at || null,
            accessPassExpiresAt: profileResult.data.access_pass_expires_at || null
        } : null,
        wallet: walletResult.data ? {
            balanceMicrocredits: Number(walletResult.data.balance_microcredits) || 0,
            monthlyCreditBalanceMicrocredits: Number(walletResult.data.monthly_credit_balance_microcredits) || 0,
            topupCreditBalanceMicrocredits: Number(walletResult.data.topup_credit_balance_microcredits) || 0,
            monthlyCreditExpiresAt: walletResult.data.monthly_credit_expires_at || null
        } : null
    };
}

async function invokeBillingFunction(functionName, payload = {}) {
    const accessToken = await getRefreshedAccessToken();
    const { supabaseUrl, publishableKey } = getFunctionBaseUrl();

    let response;
    try {
        response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
            method: 'POST',
            headers: {
                apikey: publishableKey,
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    } catch (networkError) {
        throw new Error(
            networkError instanceof Error
                ? `Could not reach Supabase Edge Functions: ${networkError.message}`
                : 'Could not reach Supabase Edge Functions.'
        );
    }

    let result = null;
    try {
        result = await response.json();
    } catch (_) {
        result = null;
    }

    if (!response.ok) {
        throw new Error(result?.error || result?.message || 'The billing function returned an error.');
    }

    return result;
}

export async function createCheckoutSession(offeringKey) {
    const normalizedOfferingKey = String(offeringKey || '').trim();
    if (!normalizedOfferingKey) {
        throw new Error('A billing offering key is required.');
    }

    const appUrl = AuthService.getAppPageUrl('app.html');
    const successUrl = `${appUrl}${appUrl.includes('?') ? '&' : '?'}billing=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}${appUrl.includes('?') ? '&' : '?'}billing=cancel`;

    return invokeBillingFunction('stripe-create-checkout', {
        offeringKey: normalizedOfferingKey,
        successUrl,
        cancelUrl
    });
}

export async function createCustomerPortalSession() {
    const returnUrl = `${AuthService.getAppPageUrl('app.html')}?billing=account`;
    return invokeBillingFunction('stripe-customer-portal', { returnUrl });
}

export async function activateStudioAccessPass() {
    const client = getSupabaseClientOrThrow();
    const { error: refreshError } = await client.auth.refreshSession();
    if (refreshError) {
        throw new Error('Your Supabase session has expired. Please sign out and sign back in.');
    }
    const { data, error } = await client.rpc('activate_studio_access_pass', {
        confirmation: 'confirm_access_pass_deduction'
    });

    if (error) {
        throw new Error(error.message || 'Could not activate the Studio Access Pass.');
    }

    return data || {};
}
