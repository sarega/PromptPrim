import { stateManager } from '../../core/core.state.js';
import { getSupabaseAuthClient, isSupabaseEnabled } from '../auth/auth.service.js';
import {
    getSupabasePublishableKey,
    getSupabaseUrl
} from '../../integrations/supabase/client.js';

const MANAGED_PLAN_PRESETS = Object.freeze([
    { key: 'free', name: 'Free Plan' },
    { key: 'pro', name: 'Pro Plan' },
    { key: 'studio', name: 'Studio Plan' }
]);

let backendModelCatalogCache = [];
let backendPlanPresetCache = createEmptyPlanPresetMap();
let backendModelAccessReady = false;

function createEmptyPlanPresetMap() {
    return MANAGED_PLAN_PRESETS.reduce((accumulator, preset) => {
        accumulator[preset.key] = {
            name: preset.name,
            modelIds: []
        };
        return accumulator;
    }, {});
}

function clonePresetMap(presetMap) {
    return Object.fromEntries(
        Object.entries(presetMap || {}).map(([key, value]) => [
            key,
            {
                name: value?.name || key,
                modelIds: Array.isArray(value?.modelIds) ? [...value.modelIds] : []
            }
        ])
    );
}

function normalizePlanCode(planCode = 'free') {
    const normalizedPlanCode = String(planCode || 'free').trim().toLowerCase();
    return MANAGED_PLAN_PRESETS.some(preset => preset.key === normalizedPlanCode)
        ? normalizedPlanCode
        : 'free';
}

function normalizeCatalogRow(row) {
    return {
        id: row.id,
        name: row.name || row.id,
        provider: row.provider || 'openrouter',
        description: row.description || '',
        context_length: Number(row.context_length) || 0,
        pricing: {
            prompt: String(row.pricing_prompt ?? '0'),
            completion: String(row.pricing_completion ?? '0')
        },
        supports_tools: row.supports_tools === true
    };
}

function normalizeCatalogRows(rows) {
    return (Array.isArray(rows) ? rows : [])
        .map(normalizeCatalogRow)
        .sort((left, right) => left.name.localeCompare(right.name));
}

function buildCatalogUpsertRows(models) {
    return (Array.isArray(models) ? models : [])
        .filter(model => model?.id)
        .map(model => ({
            id: model.id,
            provider: String(model.provider || 'openrouter'),
            name: String(model.name || model.id),
            description: String(model.description || ''),
            context_length: Number(model.context_length) || 0,
            pricing_prompt: String(model.pricing?.prompt ?? '0'),
            pricing_completion: String(model.pricing?.completion ?? '0'),
            supports_tools: model.supports_tools === true,
            is_active: true,
            raw: model
        }));
}

async function getRefreshedAccessToken() {
    const client = getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

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

export function getManagedPlanPresetDefinitions() {
    return MANAGED_PLAN_PRESETS.map(preset => ({ ...preset }));
}

export function isBackendModelAccessReady() {
    return backendModelAccessReady;
}

export function getManagedPlanPresets() {
    return clonePresetMap(backendPlanPresetCache);
}

export function getBackendModelCatalog() {
    return backendModelCatalogCache.map(model => ({
        ...model,
        pricing: {
            prompt: model.pricing?.prompt ?? '0',
            completion: model.pricing?.completion ?? '0'
        }
    }));
}

export function getBackendAllowedModelIdsForPlan(planCode = 'free') {
    const normalizedPlanCode = normalizePlanCode(planCode);
    const preset = backendPlanPresetCache[normalizedPlanCode];
    return new Set(Array.isArray(preset?.modelIds) ? preset.modelIds : []);
}

export async function loadBackendModelCatalog({ hydrateState = false } = {}) {
    if (!isSupabaseEnabled()) {
        return [];
    }

    const client = getSupabaseAuthClient();
    const { data, error } = await client
        .from('model_catalog')
        .select('id, provider, name, description, context_length, pricing_prompt, pricing_completion, supports_tools, is_active')
        .eq('is_active', true);

    if (error) throw error;

    backendModelCatalogCache = normalizeCatalogRows(data);
    if (hydrateState) {
        stateManager.setSystemModels(backendModelCatalogCache);
    }

    return getBackendModelCatalog();
}

export async function loadManagedPlanPresets() {
    if (!isSupabaseEnabled()) {
        backendModelAccessReady = false;
        return getManagedPlanPresets();
    }

    backendModelAccessReady = false;
    const client = getSupabaseAuthClient();
    const { data, error } = await client
        .from('plan_model_access')
        .select('plan_code, model_id')
        .eq('is_enabled', true);

    if (error) throw error;

    const nextPresetMap = createEmptyPlanPresetMap();
    (Array.isArray(data) ? data : []).forEach(row => {
        const normalizedPlanCode = normalizePlanCode(row.plan_code);
        if (row.model_id) {
            nextPresetMap[normalizedPlanCode].modelIds.push(String(row.model_id));
        }
    });

    backendPlanPresetCache = nextPresetMap;
    backendModelAccessReady = true;
    return getManagedPlanPresets();
}

export async function syncBackendOpenRouterModelCatalog({ hydrateState = false } = {}) {
    if (!isSupabaseEnabled()) {
        throw new Error('Supabase is not configured.');
    }

    const accessToken = await getRefreshedAccessToken();
    const supabaseUrl = String(getSupabaseUrl() || '').trim().replace(/\/+$/, '');
    const publishableKey = String(getSupabasePublishableKey() || '').trim();

    if (!supabaseUrl || !publishableKey) {
        throw new Error('Supabase function endpoint is not configured.');
    }

    let response;
    try {
        response = await fetch(`${supabaseUrl}/functions/v1/openrouter-models-sync`, {
            method: 'POST',
            headers: {
                apikey: publishableKey,
                Authorization: `Bearer ${accessToken}`
            }
        });
    } catch (networkError) {
        throw new Error(
            networkError instanceof Error
                ? `Could not reach Supabase Edge Functions: ${networkError.message}`
                : 'Could not reach Supabase Edge Functions.'
        );
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch (_) {
        payload = null;
    }

    if (!response.ok) {
        const baseMessage = payload?.error || payload?.message || 'The backend model sync function returned an error.';
        const diagnostics = [];

        if (response.status === 401) {
            diagnostics.push('The current Supabase session is missing or expired.');
        }

        if (response.status === 403) {
            diagnostics.push('The signed-in user is not being recognized as an admin.');
        }

        throw new Error(
            diagnostics.length > 0
                ? `${baseMessage} ${diagnostics.join(' ')}`
                : baseMessage
        );
    }

    backendModelCatalogCache = normalizeCatalogRows(payload?.models);
    if (hydrateState) {
        stateManager.setSystemModels(backendModelCatalogCache);
    }

    return {
        count: Number(payload?.count) || backendModelCatalogCache.length,
        syncedAt: payload?.syncedAt || null,
        models: getBackendModelCatalog()
    };
}

export async function saveManagedPlanPreset(planCode, selectedModelIds, availableModels = []) {
    if (!isSupabaseEnabled()) {
        throw new Error('Supabase is not configured.');
    }

    const normalizedPlanCode = normalizePlanCode(planCode);
    const client = getSupabaseAuthClient();
    const catalogRows = buildCatalogUpsertRows(availableModels);

    if (catalogRows.length > 0) {
        const { error: upsertCatalogError } = await client
            .from('model_catalog')
            .upsert(catalogRows, { onConflict: 'id' });

        if (upsertCatalogError) throw upsertCatalogError;
        backendModelCatalogCache = normalizeCatalogRows(catalogRows);
    }

    const { error: deleteAccessError } = await client
        .from('plan_model_access')
        .delete()
        .eq('plan_code', normalizedPlanCode);

    if (deleteAccessError) throw deleteAccessError;

    const accessRows = Array.from(new Set(selectedModelIds || []))
        .filter(Boolean)
        .map(modelId => ({
            plan_code: normalizedPlanCode,
            model_id: modelId,
            is_enabled: true
        }));

    if (accessRows.length > 0) {
        const { error: upsertAccessError } = await client
            .from('plan_model_access')
            .upsert(accessRows, { onConflict: 'plan_code,model_id' });

        if (upsertAccessError) throw upsertAccessError;
    }

    backendPlanPresetCache[normalizedPlanCode] = {
        name: MANAGED_PLAN_PRESETS.find(preset => preset.key === normalizedPlanCode)?.name || normalizedPlanCode,
        modelIds: accessRows.map(row => row.model_id)
    };
    backendModelAccessReady = true;

    return {
        ...backendPlanPresetCache[normalizedPlanCode],
        modelIds: [...backendPlanPresetCache[normalizedPlanCode].modelIds]
    };
}
