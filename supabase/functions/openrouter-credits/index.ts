import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type OpenRouterCreditsResponse = {
    data?: {
        total_credits?: number;
        total_usage?: number;
    };
    error?: unknown;
};

type OpenRouterCurrentKeyResponse = {
    data?: {
        label?: string;
        limit?: number | null;
        limit_remaining?: number | null;
        usage?: number;
        is_management_key?: boolean;
        is_provisioning_key?: boolean;
    };
    error?: unknown;
};

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
    try {
        return await response.json() as T;
    } catch (_) {
        return null;
    }
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

function resolveRole(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null, fallbackRole = '') {
    const appRole = String(user?.app_metadata?.role || '').trim().toLowerCase();
    if (appRole) return appRole;

    const userRole = String(user?.user_metadata?.role || '').trim().toLowerCase();
    if (userRole) return userRole;

    return String(fallbackRole || '').trim().toLowerCase();
}

Deno.serve(async (request: Request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed.' }, 405);
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
        return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const openRouterApiKey = String(Deno.env.get('OPENROUTER_API_KEY') || '').trim();

    if (!supabaseUrl || !supabaseAnonKey) {
        return jsonResponse({ error: 'Supabase function environment is not configured correctly.' }, 500);
    }

    if (!openRouterApiKey) {
        return jsonResponse({ error: 'Missing OPENROUTER_API_KEY secret in Supabase Edge Functions.' }, 503);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                Authorization: authHeader
            }
        }
    });

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
        return jsonResponse({ error: 'Invalid session.' }, 401);
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userResult.user.id)
        .maybeSingle();

    if (profileError) {
        return jsonResponse({ error: 'Could not verify admin access.' }, 500);
    }

    const role = resolveRole(userResult.user, profile?.role || '');
    if (role !== 'admin') {
        return jsonResponse({ error: 'Admin access is required.' }, 403);
    }

    const openRouterHeaders = {
        Authorization: `Bearer ${openRouterApiKey}`,
        Accept: 'application/json'
    };

    let creditsResponse: Response;
    let keyResponse: Response;

    try {
        [creditsResponse, keyResponse] = await Promise.all([
            fetch('https://openrouter.ai/api/v1/credits', { headers: openRouterHeaders }),
            fetch('https://openrouter.ai/api/v1/key', { headers: openRouterHeaders })
        ]);
    } catch (_) {
        return jsonResponse({ error: 'Could not reach OpenRouter from the Edge Function.' }, 502);
    }

    const keyPayload = await parseJsonSafe<OpenRouterCurrentKeyResponse>(keyResponse);
    const keyData = keyPayload?.data || {};

    if (!creditsResponse.ok) {
        let providerMessage = 'Could not fetch OpenRouter credits.';
        const errorPayload = await parseJsonSafe<{ error?: { message?: string } }>(creditsResponse);
        providerMessage = errorPayload?.error?.message || providerMessage;

        if (creditsResponse.status === 403) {
            providerMessage = 'OpenRouter credits sync requires a management key.';
        }

        return jsonResponse({
            error: providerMessage,
            key: {
                label: keyData.label || '',
                limit: keyData.limit ?? null,
                limitRemaining: keyData.limit_remaining ?? null,
                usage: keyData.usage ?? null,
                isManagementKey: keyData.is_management_key === true,
                isProvisioningKey: keyData.is_provisioning_key === true
            }
        }, creditsResponse.status);
    }

    const creditsPayload = await parseJsonSafe<OpenRouterCreditsResponse>(creditsResponse);
    const creditsData = creditsPayload?.data || {};
    const totalCredits = Number(creditsData.total_credits) || 0;
    const totalUsage = Number(creditsData.total_usage) || 0;

    return jsonResponse({
        provider: 'openrouter',
        syncedAt: new Date().toISOString(),
        credits: {
            totalCredits,
            totalUsage,
            remainingCredits: Math.max(totalCredits - totalUsage, 0)
        },
        key: {
            label: keyData.label || '',
            limit: keyData.limit ?? null,
            limitRemaining: keyData.limit_remaining ?? null,
            usage: keyData.usage ?? null,
            isManagementKey: keyData.is_management_key === true,
            isProvisioningKey: keyData.is_provisioning_key === true
        }
    });
});
