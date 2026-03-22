import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders as supabaseCorsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const corsHeaders = {
    ...supabaseCorsHeaders,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

type OpenRouterModelRow = {
    id?: string;
    name?: string;
    description?: string;
    context_length?: number;
    pricing?: {
        prompt?: string | number;
        completion?: string | number;
    };
    architecture?: {
        tool_use?: boolean;
    };
    [key: string]: unknown;
};

type OpenRouterModelsResponse = {
    data?: OpenRouterModelRow[];
    error?: unknown;
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

function resolveRole(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null, fallbackRole = '') {
    const appRole = String(user?.app_metadata?.role || '').trim().toLowerCase();
    if (appRole) return appRole;

    const userRole = String(user?.user_metadata?.role || '').trim().toLowerCase();
    if (userRole) return userRole;

    return String(fallbackRole || '').trim().toLowerCase();
}

function normalizeNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeModelRow(model: OpenRouterModelRow) {
    return {
        id: String(model.id || '').trim(),
        provider: 'openrouter',
        name: String(model.name || model.id || '').trim(),
        description: String(model.description || ''),
        context_length: normalizeNumber(model.context_length, 0),
        pricing_prompt: String(model.pricing?.prompt ?? '0'),
        pricing_completion: String(model.pricing?.completion ?? '0'),
        supports_tools: model.architecture?.tool_use === true,
        is_active: true,
        raw: model
    };
}

Deno.serve(async (request: Request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (request.method !== 'POST' && request.method !== 'GET') {
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
        const openRouterApiKey = String(Deno.env.get('OPENROUTER_API_KEY') || '').trim();

        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
            return jsonResponse({ error: 'Supabase function environment is not configured correctly.' }, 500);
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
            return jsonResponse({ error: 'Invalid session.' }, 401);
        }

        const { data: profile, error: profileError } = await serviceClient
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

        let providerResponse: Response;
        try {
            providerResponse = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${openRouterApiKey}`,
                    Accept: 'application/json'
                }
            });
        } catch (_) {
            return jsonResponse({ error: 'Could not reach OpenRouter from the Edge Function.' }, 502);
        }

        let payload: OpenRouterModelsResponse | null = null;
        try {
            payload = await providerResponse.json() as OpenRouterModelsResponse;
        } catch (_) {
            payload = null;
        }

        if (!providerResponse.ok) {
            const providerMessage = String(
                (payload as { error?: { message?: string } } | null)?.error?.message
                || 'Could not fetch OpenRouter models.'
            );
            return jsonResponse({ error: providerMessage }, providerResponse.status);
        }

        const models = (Array.isArray(payload?.data) ? payload.data : [])
            .map(normalizeModelRow)
            .filter((row) => row.id);

        if (models.length > 0) {
            const { error: upsertError } = await serviceClient
                .from('model_catalog')
                .upsert(models, { onConflict: 'id' });

            if (upsertError) {
                return jsonResponse({ error: 'Could not persist OpenRouter models into Supabase.' }, 500);
            }
        }

        return jsonResponse({
            provider: 'openrouter',
            syncedAt: new Date().toISOString(),
            count: models.length,
            models
        });
    } catch (error) {
        console.error('Unexpected openrouter-models-sync failure:', error);
        return jsonResponse({
            error: error instanceof Error ? error.message : 'Unexpected model sync failure.'
        }, 500);
    }
});
