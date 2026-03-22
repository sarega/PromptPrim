import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as supabaseCorsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const corsHeaders = {
    ...supabaseCorsHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'content-type, x-openrouter-usage, x-promptprim-server-billed, x-promptprim-request-id'
};

type ChatRequestBody = {
    model?: string;
    messages?: unknown[];
    stream?: boolean;
    [key: string]: unknown;
};

type UsageSummary = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
};

type ModelCatalogRow = {
    id: string;
    provider: string;
    pricing_prompt: string;
    pricing_completion: string;
    is_active: boolean;
};

type ProfileRow = {
    id: string;
    role: string;
    status: string;
    plan_code: string;
    account_status: string;
    trial_expires_at: string | null;
    access_pass_expires_at: string | null;
};

type WalletRow = {
    user_id: string;
    balance_microcredits: number;
    monthly_credit_balance_microcredits: number;
    topup_credit_balance_microcredits: number;
    monthly_credit_expires_at: string | null;
};

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            ...headers
        }
    });
}

function normalizeNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRole(value: unknown) {
    return String(value || 'user').trim().toLowerCase() || 'user';
}

function isTimestampExpired(value: string | null | undefined) {
    if (!value) return false;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) && parsed <= Date.now();
}

function parseUsageFromHeader(headerValue: string | null): UsageSummary | null {
    if (!headerValue) return null;

    try {
        const parsed = JSON.parse(headerValue);
        return {
            prompt_tokens: normalizeNumber(parsed?.prompt_tokens, 0),
            completion_tokens: normalizeNumber(parsed?.completion_tokens, 0),
            total_tokens: normalizeNumber(parsed?.total_tokens, 0),
            cost: normalizeNumber(parsed?.cost, 0)
        };
    } catch (_) {
        return null;
    }
}

function computeProviderCost(modelRow: ModelCatalogRow | null, usage: UsageSummary | null) {
    if (!modelRow || !usage) return 0;

    const promptRate = normalizeNumber(modelRow.pricing_prompt, 0);
    const completionRate = normalizeNumber(modelRow.pricing_completion, 0);
    const promptTokens = normalizeNumber(usage.prompt_tokens, 0);
    const completionTokens = normalizeNumber(usage.completion_tokens, 0);

    return (promptTokens * promptRate) + (completionTokens * completionRate);
}

async function finalizeUsageCharge(serviceClient: ReturnType<typeof createClient>, options: {
    userId: string;
    requestId: string;
    modelId: string;
    usage: UsageSummary | null;
    providerCostUsd: number;
    providerRequestId?: string | null;
}) {
    const usage = options.usage || {};
    const providerCostUsd = Math.max(normalizeNumber(options.providerCostUsd, 0), 0);

    const { error } = await serviceClient.rpc('record_openrouter_usage_charge', {
        target_user_id: options.userId,
        usage_request_id: options.requestId,
        model_id: options.modelId,
        prompt_tokens: Math.max(normalizeNumber(usage.prompt_tokens, 0), 0),
        completion_tokens: Math.max(normalizeNumber(usage.completion_tokens, 0), 0),
        provider_cost_usd: providerCostUsd,
        provider_request_id: String(options.providerRequestId || '').trim() || null,
        usage_payload: {
            usage,
            finalized_at: new Date().toISOString()
        },
        notes: `PromptPrim OpenRouter proxy charge for ${options.modelId}.`
    });

    if (error) {
        console.error('Failed to record OpenRouter usage charge.', error);
    }
}

async function recordFailedUsage(serviceClient: ReturnType<typeof createClient>, options: {
    requestId: string;
    userId: string;
    modelId: string;
    errorMessage: string;
}) {
    const { error } = await serviceClient
        .from('usage_events')
        .insert({
            request_id: options.requestId,
            user_id: options.userId,
            provider: 'openrouter',
            model_id: options.modelId,
            status: 'failed',
            error_message: options.errorMessage,
            usage_payload: {
                failed_at: new Date().toISOString()
            }
        });

    if (error) {
        console.error('Failed to record OpenRouter usage failure.', error);
    }
}

function buildProxyHeaders(upstreamHeaders: Headers, requestId: string, billedServerSide = true) {
    const headers = new Headers(corsHeaders);
    headers.set('Content-Type', upstreamHeaders.get('Content-Type') || 'application/json');
    headers.set('x-promptprim-server-billed', billedServerSide ? '1' : '0');
    headers.set('x-promptprim-request-id', requestId);

    const upstreamUsageHeader = upstreamHeaders.get('x-openrouter-usage');
    if (upstreamUsageHeader) {
        headers.set('x-openrouter-usage', upstreamUsageHeader);
    }

    return headers;
}

function extractUsageFromSseLine(line: string, currentUsage: UsageSummary | null) {
    if (!line.startsWith('data: ')) return currentUsage;

    const payloadText = line.slice(6).trim();
    if (!payloadText || payloadText === '[DONE]') return currentUsage;

    try {
        const payload = JSON.parse(payloadText);
        if (payload?.usage && typeof payload.usage === 'object') {
            return {
                prompt_tokens: normalizeNumber(payload.usage.prompt_tokens, 0),
                completion_tokens: normalizeNumber(payload.usage.completion_tokens, 0),
                total_tokens: normalizeNumber(payload.usage.total_tokens, 0),
                cost: normalizeNumber(payload.usage.cost, 0)
            };
        }
    } catch (_) {
        return currentUsage;
    }

    return currentUsage;
}

Deno.serve(async (request: Request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        if (request.method !== 'POST') {
            return jsonResponse({ error: 'Method not allowed.' }, 405);
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Missing Authorization header.' }, 401);
        }

        const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
        const supabaseAnonKey = String(Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
        const supabaseServiceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
        const openRouterApiKey = String(Deno.env.get('OPENROUTER_API_KEY') || '').trim();

        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
            return jsonResponse({ error: 'Supabase Edge Function environment is not configured correctly.' }, 500);
        }

        if (!openRouterApiKey) {
            return jsonResponse({ error: 'Missing OPENROUTER_API_KEY secret in Supabase Edge Functions.' }, 503);
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
            return jsonResponse({ error: 'Invalid Supabase session.' }, 401);
        }

        let requestBody: ChatRequestBody | null = null;
        try {
            requestBody = await request.json();
        } catch (_) {
            return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
        }

        const modelId = String(requestBody?.model || '').trim();
        const messages = Array.isArray(requestBody?.messages) ? requestBody?.messages : null;
        const isStreaming = requestBody?.stream === true;

        if (!modelId) {
            return jsonResponse({ error: 'Model is required.' }, 400);
        }
        if (!messages || messages.length === 0) {
            return jsonResponse({ error: 'Messages are required.' }, 400);
        }

        const [{ data: profile }, { data: wallet }, { data: modelRow }] = await Promise.all([
            serviceClient
                .from('profiles')
                .select('id, role, status, plan_code, account_status, trial_expires_at, access_pass_expires_at')
                .eq('id', userResult.user.id)
                .maybeSingle(),
            serviceClient
                .from('wallets')
                .select('user_id, balance_microcredits, monthly_credit_balance_microcredits, topup_credit_balance_microcredits, monthly_credit_expires_at')
                .eq('user_id', userResult.user.id)
                .maybeSingle(),
            serviceClient
                .from('model_catalog')
                .select('id, provider, pricing_prompt, pricing_completion, is_active')
                .eq('id', modelId)
                .eq('provider', 'openrouter')
                .eq('is_active', true)
                .maybeSingle()
        ]);

        const currentProfile = profile as ProfileRow | null;
        const currentWallet = (wallet as WalletRow | null) || {
            user_id: userResult.user.id,
            balance_microcredits: 0,
            monthly_credit_balance_microcredits: 0,
            topup_credit_balance_microcredits: 0,
            monthly_credit_expires_at: null
        };
        const currentModel = modelRow as ModelCatalogRow | null;

        if (!currentProfile) {
            return jsonResponse({ error: 'No PromptPrim account profile exists for this user yet.' }, 409);
        }

        if (!currentModel) {
            return jsonResponse({ error: 'This model is not active in PromptPrim yet. Ask the admin to sync and enable it first.' }, 403);
        }

        const currentRole = normalizeRole(currentProfile.role);
        const isAdmin = currentRole === 'admin';
        let accountStatus = String(currentProfile.account_status || '').trim().toLowerCase();
        if (accountStatus === 'studio_active' && isTimestampExpired(currentProfile.access_pass_expires_at)) {
            accountStatus = 'paid_suspended';
        }

        if (!isAdmin) {
            if (accountStatus === 'paid_suspended' || String(currentProfile.status || 'active').trim().toLowerCase() === 'suspended') {
                return jsonResponse({ error: 'Your paid access is suspended. Renew Studio or Pro, or activate Studio Access Pass first.' }, 403);
            }

            if (accountStatus === 'studio_active') {
                return jsonResponse({ error: 'Studio Plan requires your own API key. Hosted PromptPrim credits are not used on Studio accounts.' }, 403);
            }

            if (accountStatus === 'free' && isTimestampExpired(currentProfile.trial_expires_at)) {
                return jsonResponse({ error: 'Your free trial has expired.' }, 402);
            }

            if (normalizeNumber(currentWallet.balance_microcredits, 0) <= 0) {
                return jsonResponse({ error: 'Your hosted credit balance is empty.' }, 402);
            }

            const { data: accessRow, error: accessError } = await serviceClient
                .from('plan_model_access')
                .select('plan_code, model_id')
                .eq('plan_code', currentProfile.plan_code)
                .eq('model_id', modelId)
                .eq('is_enabled', true)
                .maybeSingle();

            if (accessError) {
                return jsonResponse({ error: 'Could not verify model access.' }, 500);
            }

            if (!accessRow) {
                return jsonResponse({ error: 'This model is not available for your current plan.' }, 403);
            }
        }

        const requestId = crypto.randomUUID();
        const upstreamBody = {
            ...requestBody,
            model: modelId,
            messages
        };

        let upstreamResponse: Response;
        try {
            upstreamResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify(upstreamBody)
            });
        } catch (_) {
            await recordFailedUsage(serviceClient, {
                requestId,
                userId: userResult.user.id,
                modelId,
                errorMessage: 'Could not reach OpenRouter from the Edge Function.'
            });
            return jsonResponse({ error: 'Could not reach OpenRouter from the Edge Function.' }, 502);
        }

        if (!upstreamResponse.ok) {
            const errorText = (await upstreamResponse.text()).trim();
            await recordFailedUsage(serviceClient, {
                requestId,
                userId: userResult.user.id,
                modelId,
                errorMessage: errorText || `OpenRouter returned ${upstreamResponse.status}.`
            });

            return new Response(errorText || JSON.stringify({ error: 'OpenRouter request failed.' }), {
                status: upstreamResponse.status,
                headers: buildProxyHeaders(upstreamResponse.headers, requestId, false)
            });
        }

        const upstreamUsageFromHeader = parseUsageFromHeader(upstreamResponse.headers.get('x-openrouter-usage'));
        const providerRequestId = upstreamResponse.headers.get('x-request-id');

        if (!isStreaming) {
            const responseText = await upstreamResponse.text();
            let responseJson: Record<string, unknown> | null = null;
            try {
                responseJson = JSON.parse(responseText);
            } catch (_) {
                responseJson = null;
            }

            const usageFromBody = responseJson?.usage && typeof responseJson.usage === 'object'
                ? {
                    prompt_tokens: normalizeNumber((responseJson.usage as Record<string, unknown>).prompt_tokens, 0),
                    completion_tokens: normalizeNumber((responseJson.usage as Record<string, unknown>).completion_tokens, 0),
                    total_tokens: normalizeNumber((responseJson.usage as Record<string, unknown>).total_tokens, 0),
                    cost: normalizeNumber((responseJson.usage as Record<string, unknown>).cost, 0)
                }
                : null;

            const finalizedUsage = usageFromBody || upstreamUsageFromHeader;
            const providerCostUsd = Math.max(
                normalizeNumber(finalizedUsage?.cost, 0),
                computeProviderCost(currentModel, finalizedUsage)
            );

            if (finalizedUsage) {
                await finalizeUsageCharge(serviceClient, {
                    userId: userResult.user.id,
                    requestId,
                    modelId,
                    usage: finalizedUsage,
                    providerCostUsd,
                    providerRequestId
                });
            }

            return new Response(responseText, {
                status: upstreamResponse.status,
                headers: buildProxyHeaders(upstreamResponse.headers, requestId)
            });
        }

        const reader = upstreamResponse.body?.getReader();
        if (!reader) {
            return jsonResponse({ error: 'OpenRouter returned an empty stream.' }, 502);
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let finalized = false;
        let finalUsage: UsageSummary | null = upstreamUsageFromHeader;

        const finalizeOnce = async () => {
            if (finalized) return;
            finalized = true;

            if (!finalUsage) return;

            const providerCostUsd = Math.max(
                normalizeNumber(finalUsage.cost, 0),
                computeProviderCost(currentModel, finalUsage)
            );

            await finalizeUsageCharge(serviceClient, {
                userId: userResult.user.id,
                requestId,
                modelId,
                usage: finalUsage,
                providerCostUsd,
                providerRequestId
            });
        };

        const streamingBody = new ReadableStream({
            async pull(controller) {
                try {
                    const { done, value } = await reader.read();
                    if (done) {
                        if (buffer.trim()) {
                            const lines = buffer.split('\n');
                            lines.forEach((line) => {
                                finalUsage = extractUsageFromSseLine(line, finalUsage);
                            });
                        }
                        await finalizeOnce();
                        controller.close();
                        return;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    lines.forEach((line) => {
                        finalUsage = extractUsageFromSseLine(line, finalUsage);
                    });

                    controller.enqueue(value);
                } catch (error) {
                    await finalizeOnce();
                    controller.error(error);
                }
            },
            async cancel(reason) {
                try {
                    await reader.cancel(reason);
                } finally {
                    await finalizeOnce();
                }
            }
        });

        return new Response(streamingBody, {
            status: upstreamResponse.status,
            headers: buildProxyHeaders(upstreamResponse.headers, requestId)
        });
    } catch (error) {
        console.error('Unexpected openrouter-chat failure.', error);
        return jsonResponse({
            error: error instanceof Error
                ? `Unexpected openrouter-chat failure: ${error.message}`
                : 'Unexpected openrouter-chat failure.'
        }, 500);
    }
});
