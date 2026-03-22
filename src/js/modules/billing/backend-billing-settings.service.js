import { getSupabaseAuthClient, isSupabaseEnabled } from '../auth/auth.service.js';

const BILLING_DB_KEY = 'promptPrimAdminBilling_v1';
const DEFAULT_MARKUP_RATE = 2.5;

function getStoredLocalBillingInfo() {
    try {
        const stored = localStorage.getItem(BILLING_DB_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (_) {
        return {};
    }
}

function applyMarkupRateToLocalCache(markupRate) {
    const nextMarkupRate = Number(markupRate);
    if (!Number.isFinite(nextMarkupRate) || nextMarkupRate <= 0) {
        return null;
    }

    const nextBillingInfo = {
        balanceUSD: 10,
        usedUSD: 0,
        providerSource: 'manual',
        providerSyncedAt: null,
        providerKeyLabel: '',
        providerLimit: null,
        providerLimitRemaining: null,
        providerLastError: '',
        ...getStoredLocalBillingInfo(),
        markupRate: nextMarkupRate
    };

    try {
        localStorage.setItem(BILLING_DB_KEY, JSON.stringify(nextBillingInfo));
    } catch (_) {
        return null;
    }

    return nextBillingInfo;
}

export function isBackendBillingSettingsAvailable() {
    return isSupabaseEnabled();
}

export async function syncBackendBillingSettingsToLocalCache() {
    if (!isBackendBillingSettingsAvailable()) {
        return null;
    }

    const client = getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

    const { data, error } = await client
        .from('billing_settings')
        .select('id, markup_rate')
        .eq('id', 'default')
        .maybeSingle();

    if (error) throw error;

    return applyMarkupRateToLocalCache(data?.markup_rate ?? DEFAULT_MARKUP_RATE);
}

export async function saveBackendMarkupRate(markupRate) {
    if (!isBackendBillingSettingsAvailable()) {
        throw new Error('Supabase billing settings are not available.');
    }

    const client = getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

    const nextMarkupRate = Number(markupRate);
    if (!Number.isFinite(nextMarkupRate) || nextMarkupRate <= 0) {
        throw new Error('Markup rate must be greater than zero.');
    }

    const { data, error } = await client
        .from('billing_settings')
        .upsert({
            id: 'default',
            markup_rate: nextMarkupRate
        }, { onConflict: 'id' })
        .select('id, markup_rate')
        .single();

    if (error) throw error;

    return applyMarkupRateToLocalCache(data?.markup_rate ?? nextMarkupRate);
}
