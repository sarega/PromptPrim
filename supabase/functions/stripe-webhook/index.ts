import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18.5.0';

type BillingOfferingRow = {
    id: string;
    offering_key: string;
    kind: string;
    plan_code: string | null;
    stripe_price_id: string | null;
};

type SubscriptionRow = {
    user_id: string;
    provider_customer_id: string | null;
    plan_code: string | null;
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
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

function toTrimmedString(value: unknown) {
    return String(value || '').trim();
}

function getTimestampIso(value: number | null | undefined) {
    if (!value || !Number.isFinite(value)) return null;
    return new Date(value * 1000).toISOString();
}

function getMetadataValue(metadata: Record<string, string> | null | undefined, key: string) {
    return toTrimmedString(metadata?.[key]);
}

function mapSubscriptionStatus(rawValue: unknown) {
    const normalized = toTrimmedString(rawValue).toLowerCase();
    switch (normalized) {
        case 'trialing':
        case 'active':
        case 'past_due':
        case 'canceled':
        case 'unpaid':
        case 'incomplete':
        case 'incomplete_expired':
            return normalized;
        default:
            return 'incomplete';
    }
}

async function resolveOfferingByPriceId(serviceClient: ReturnType<typeof createClient>, stripePriceId: string, kind = '') {
    const normalizedStripePriceId = toTrimmedString(stripePriceId);
    if (!normalizedStripePriceId) return null;

    let query = serviceClient
        .from('billing_offerings')
        .select('id, offering_key, kind, plan_code, stripe_price_id')
        .eq('stripe_price_id', normalizedStripePriceId)
        .limit(1);

    if (kind) {
        query = query.eq('kind', kind);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
        throw new Error('Could not resolve the Stripe billing offering.');
    }

    return (data || null) as BillingOfferingRow | null;
}

async function resolveUserFromStripeIdentifiers(
    serviceClient: ReturnType<typeof createClient>,
    identifiers: {
        metadataUserId?: string;
        stripeCustomerId?: string;
        stripeSubscriptionId?: string;
    }
) {
    const metadataUserId = toTrimmedString(identifiers.metadataUserId);
    if (metadataUserId) {
        return metadataUserId;
    }

    const stripeCustomerId = toTrimmedString(identifiers.stripeCustomerId);
    if (stripeCustomerId) {
        const { data: customerRow, error: customerError } = await serviceClient
            .from('stripe_customers')
            .select('user_id')
            .eq('provider_customer_id', stripeCustomerId)
            .limit(1)
            .maybeSingle();

        if (customerError) {
            throw new Error('Could not resolve the Stripe customer owner.');
        }

        if (customerRow?.user_id) {
            return String(customerRow.user_id);
        }
    }

    const stripeSubscriptionId = toTrimmedString(identifiers.stripeSubscriptionId);
    if (stripeSubscriptionId) {
        const { data: subscriptionRow, error: subscriptionError } = await serviceClient
            .from('user_subscriptions')
            .select('user_id')
            .eq('provider_subscription_id', stripeSubscriptionId)
            .limit(1)
            .maybeSingle();

        if (subscriptionError) {
            throw new Error('Could not resolve the Stripe subscription owner.');
        }

        if (subscriptionRow?.user_id) {
            return String(subscriptionRow.user_id);
        }
    }

    return '';
}

async function resolveSubscriptionRow(
    serviceClient: ReturnType<typeof createClient>,
    stripeSubscriptionId: string
) {
    const normalizedSubscriptionId = toTrimmedString(stripeSubscriptionId);
    if (!normalizedSubscriptionId) return null;

    const { data, error } = await serviceClient
        .from('user_subscriptions')
        .select('user_id, provider_customer_id, plan_code')
        .eq('provider_subscription_id', normalizedSubscriptionId)
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error('Could not load the existing Stripe subscription row.');
    }

    return (data || null) as SubscriptionRow | null;
}

async function syncStripeCustomerRow(
    serviceClient: ReturnType<typeof createClient>,
    options: {
        userId: string;
        stripeCustomerId: string;
        emailSnapshot?: string | null;
    }
) {
    const normalizedUserId = toTrimmedString(options.userId);
    const normalizedCustomerId = toTrimmedString(options.stripeCustomerId);
    if (!normalizedUserId || !normalizedCustomerId) return;

    const { error } = await serviceClient
        .from('stripe_customers')
        .upsert({
            user_id: normalizedUserId,
            provider_customer_id: normalizedCustomerId,
            email_snapshot: toTrimmedString(options.emailSnapshot) || null
        }, { onConflict: 'user_id' });

    if (error) {
        throw new Error('Could not persist the Stripe customer record.');
    }
}

async function syncSubscriptionState(
    serviceClient: ReturnType<typeof createClient>,
    options: {
        userId: string;
        stripeCustomerId: string;
        stripeSubscriptionId: string;
        stripePriceId: string;
        planCode?: string | null;
        subscriptionStatus: string;
        cancelAtPeriodEnd: boolean;
        currentPeriodStart?: string | null;
        currentPeriodEnd?: string | null;
    }
) {
    const normalizedUserId = toTrimmedString(options.userId);
    const normalizedSubscriptionId = toTrimmedString(options.stripeSubscriptionId);
    if (!normalizedUserId || !normalizedSubscriptionId) {
        throw new Error('Stripe subscription sync is missing required identifiers.');
    }

    const normalizedPlanCode = toTrimmedString(options.planCode) || null;
    const normalizedStatus = mapSubscriptionStatus(options.subscriptionStatus);
    const { error } = await serviceClient.rpc('sync_stripe_subscription_state', {
        target_user_id: normalizedUserId,
        stripe_customer_id: toTrimmedString(options.stripeCustomerId) || null,
        stripe_subscription_id: normalizedSubscriptionId,
        stripe_price_id: toTrimmedString(options.stripePriceId) || null,
        plan_code: normalizedPlanCode,
        subscription_status: normalizedStatus,
        cancel_at_period_end: options.cancelAtPeriodEnd === true,
        current_period_start: options.currentPeriodStart || null,
        current_period_end: options.currentPeriodEnd || null
    });

    if (error) {
        throw new Error(error.message || 'Could not sync the Stripe subscription state.');
    }
}

async function handleTopupCheckoutCompleted(
    serviceClient: ReturnType<typeof createClient>,
    event: Stripe.Event,
    session: Stripe.Checkout.Session
) {
    const metadata = session.metadata || {};
    const offeringKind = getMetadataValue(metadata, 'offering_kind');
    if (offeringKind !== 'topup') {
        return { handled: false, reason: 'not_topup' };
    }

    const paymentStatus = toTrimmedString(session.payment_status).toLowerCase();
    if (event.type !== 'checkout.session.async_payment_succeeded' && paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
        return { handled: false, reason: 'payment_not_ready' };
    }

    const userId = await resolveUserFromStripeIdentifiers(serviceClient, {
        metadataUserId: getMetadataValue(metadata, 'user_id'),
        stripeCustomerId: toTrimmedString(session.customer)
    });

    if (!userId) {
        throw new Error('Could not resolve the PromptPrim user for this Stripe top-up checkout.');
    }

    const stripeCustomerId = toTrimmedString(session.customer);
    if (stripeCustomerId) {
        await syncStripeCustomerRow(serviceClient, {
            userId,
            stripeCustomerId,
            emailSnapshot: session.customer_details?.email || null
        });
    }

    const rpcResult = await serviceClient.rpc('record_stripe_billing_purchase', {
        target_user_id: userId,
        purchase_kind: 'topup',
        provider_reference_id: toTrimmedString(session.id),
        stripe_event_id: toTrimmedString(event.id) || null,
        offering_key: getMetadataValue(metadata, 'offering_key') || null,
        stripe_customer_id: stripeCustomerId || null,
        stripe_payment_intent_id: toTrimmedString(session.payment_intent) || null,
        amount_usd: Number(session.amount_total || 0) / 100,
        purchase_status: 'paid',
        payload: {
            event_type: event.type,
            checkout_session_id: toTrimmedString(session.id),
            payment_status: paymentStatus,
            metadata
        },
        notes: 'Stripe top-up checkout completed.'
    });

    if (rpcResult.error) {
        throw new Error(rpcResult.error.message || 'Could not record the Stripe top-up purchase.');
    }

    return {
        handled: true,
        purchase: rpcResult.data || null
    };
}

async function resolveSubscriptionPriceId(
    stripe: Stripe,
    invoice: Stripe.Invoice
) {
    const invoiceLine = Array.isArray(invoice.lines?.data)
        ? invoice.lines.data.find((line) => line.price?.id) || null
        : null;

    let stripePriceId = toTrimmedString(invoiceLine?.price?.id);
    if (stripePriceId) {
        return stripePriceId;
    }

    const subscriptionId = toTrimmedString(invoice.subscription);
    if (!subscriptionId) {
        return '';
    }

    try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        stripePriceId = toTrimmedString(subscription.items.data[0]?.price?.id);
    } catch (_) {
        stripePriceId = '';
    }

    return stripePriceId;
}

async function handleInvoicePaid(
    stripe: Stripe,
    serviceClient: ReturnType<typeof createClient>,
    event: Stripe.Event,
    invoice: Stripe.Invoice
) {
    const stripeSubscriptionId = toTrimmedString(invoice.subscription);
    if (!stripeSubscriptionId) {
        return { handled: false, reason: 'not_subscription_invoice' };
    }

    const stripeCustomerId = toTrimmedString(invoice.customer);
    const existingSubscription = await resolveSubscriptionRow(serviceClient, stripeSubscriptionId);
    const userId = await resolveUserFromStripeIdentifiers(serviceClient, {
        stripeCustomerId,
        stripeSubscriptionId
    }) || toTrimmedString(existingSubscription?.user_id);

    if (!userId) {
        throw new Error('Could not resolve the PromptPrim user for this Stripe invoice.');
    }

    const stripePriceId = await resolveSubscriptionPriceId(stripe, invoice);
    const offering = await resolveOfferingByPriceId(serviceClient, stripePriceId, 'subscription');
    if (!offering) {
        throw new Error('Could not match the Stripe subscription invoice to a PromptPrim billing offering.');
    }

    if (stripeCustomerId) {
        await syncStripeCustomerRow(serviceClient, {
            userId,
            stripeCustomerId,
            emailSnapshot: invoice.customer_email || null
        });
    }

    const invoiceLine = Array.isArray(invoice.lines?.data)
        ? invoice.lines.data.find((line) => line.price?.id) || null
        : null;
    const billingPeriodStart = getTimestampIso(invoiceLine?.period?.start ?? invoice.period_start);
    const billingPeriodEnd = getTimestampIso(invoiceLine?.period?.end ?? invoice.period_end);

    const rpcResult = await serviceClient.rpc('record_stripe_billing_purchase', {
        target_user_id: userId,
        purchase_kind: 'subscription',
        provider_reference_id: toTrimmedString(invoice.id),
        stripe_event_id: toTrimmedString(event.id) || null,
        offering_key: offering.offering_key,
        stripe_customer_id: stripeCustomerId || null,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_price_id: stripePriceId || null,
        stripe_invoice_id: toTrimmedString(invoice.id),
        amount_usd: Number(invoice.amount_paid || invoice.total || 0) / 100,
        purchase_status: 'active',
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        payload: {
            event_type: event.type,
            invoice_id: toTrimmedString(invoice.id),
            stripe_subscription_id: stripeSubscriptionId,
            stripe_price_id: stripePriceId,
            billing_reason: toTrimmedString(invoice.billing_reason)
        },
        notes: 'Stripe subscription invoice paid.'
    });

    if (rpcResult.error) {
        throw new Error(rpcResult.error.message || 'Could not record the Stripe subscription purchase.');
    }

    return {
        handled: true,
        purchase: rpcResult.data || null
    };
}

async function handleSubscriptionStateChange(
    serviceClient: ReturnType<typeof createClient>,
    subscription: Stripe.Subscription
) {
    const metadata = subscription.metadata || {};
    const stripeSubscriptionId = toTrimmedString(subscription.id);
    const stripeCustomerId = toTrimmedString(subscription.customer);
    const stripePriceId = toTrimmedString(subscription.items.data[0]?.price?.id);
    const subscriptionStatus = mapSubscriptionStatus(subscription.status);
    const offering = await resolveOfferingByPriceId(serviceClient, stripePriceId, 'subscription');
    const existingSubscription = await resolveSubscriptionRow(serviceClient, stripeSubscriptionId);

    const userId = await resolveUserFromStripeIdentifiers(serviceClient, {
        metadataUserId: getMetadataValue(metadata, 'user_id'),
        stripeCustomerId,
        stripeSubscriptionId
    }) || toTrimmedString(existingSubscription?.user_id);

    if (!userId) {
        throw new Error('Could not resolve the PromptPrim user for this Stripe subscription update.');
    }

    if (stripeCustomerId) {
        await syncStripeCustomerRow(serviceClient, {
            userId,
            stripeCustomerId
        });
    }

    await syncSubscriptionState(serviceClient, {
        userId,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId,
        planCode: offering?.plan_code || existingSubscription?.plan_code || null,
        subscriptionStatus,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        currentPeriodStart: getTimestampIso(subscription.current_period_start),
        currentPeriodEnd: getTimestampIso(subscription.current_period_end)
    });

    return {
        handled: true,
        subscriptionId: stripeSubscriptionId,
        status: subscriptionStatus
    };
}

Deno.serve(async (request: Request) => {
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed.' }, 405);
    }

    try {
        const stripeWebhookSecret = toTrimmedString(Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET'));
        const supabaseUrl = toTrimmedString(Deno.env.get('SUPABASE_URL'));
        const supabaseServiceRoleKey = toTrimmedString(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

        if (!stripeWebhookSecret) {
            return jsonResponse({ error: 'Missing STRIPE_WEBHOOK_SIGNING_SECRET secret in Supabase Edge Functions.' }, 500);
        }

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            return jsonResponse({ error: 'Supabase function environment is not configured correctly.' }, 500);
        }

        const stripeSignature = request.headers.get('Stripe-Signature');
        if (!stripeSignature) {
            return jsonResponse({ error: 'Missing Stripe-Signature header.' }, 400);
        }

        const payload = await request.text();
        const stripe = getStripeClient();

        let event: Stripe.Event;
        try {
            event = await stripe.webhooks.constructEventAsync(payload, stripeSignature, stripeWebhookSecret);
        } catch (error) {
            console.error('Stripe webhook signature verification failed:', error);
            return jsonResponse({
                error: error instanceof Error ? error.message : 'Stripe signature verification failed.'
            }, 400);
        }

        const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
                const session = event.data.object as Stripe.Checkout.Session;
                const result = await handleTopupCheckoutCompleted(serviceClient, event, session);
                return jsonResponse({ received: true, eventType: event.type, result });
            }
            case 'invoice.paid': {
                const invoice = event.data.object as Stripe.Invoice;
                const result = await handleInvoicePaid(stripe, serviceClient, event, invoice);
                return jsonResponse({ received: true, eventType: event.type, result });
            }
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                const result = await handleSubscriptionStateChange(serviceClient, subscription);
                return jsonResponse({ received: true, eventType: event.type, result });
            }
            default:
                return jsonResponse({
                    received: true,
                    ignored: true,
                    eventType: event.type
                });
        }
    } catch (error) {
        console.error('Unexpected stripe-webhook failure:', error);
        return jsonResponse({
            error: error instanceof Error ? error.message : 'Unexpected Stripe webhook failure.'
        }, 500);
    }
});
