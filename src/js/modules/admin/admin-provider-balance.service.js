import * as AuthService from '../auth/auth.service.js';
import {
    getSupabasePublishableKey,
    getSupabaseUrl
} from '../../integrations/supabase/client.js';

export function isProviderBalanceSyncAvailable() {
    return AuthService.isSupabaseEnabled();
}

export async function syncOpenRouterProviderBalance() {
    if (!AuthService.isSupabaseEnabled()) {
        throw new Error('Supabase is not configured.');
    }

    const client = AuthService.getSupabaseAuthClient();
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

    const supabaseUrl = String(getSupabaseUrl() || '').trim().replace(/\/+$/, '');
    const publishableKey = String(getSupabasePublishableKey() || '').trim();
    if (!supabaseUrl || !publishableKey) {
        throw new Error('Supabase function endpoint is not configured.');
    }

    let response;
    try {
        response = await fetch(`${supabaseUrl}/functions/v1/openrouter-credits`, {
            method: 'GET',
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

    if (response.ok) {
        return payload;
    }

    const baseMessage = payload?.error
        || payload?.message
        || 'The provider sync function returned an error.';
    const diagnostics = [];

    if (response.status === 401) {
        diagnostics.push('The current Supabase session is missing or expired.');
    }

    if (response.status === 403) {
        diagnostics.push('The signed-in user is not being recognized as an admin.');
    }

    if (payload?.key?.isManagementKey === false) {
        diagnostics.push('The configured OpenRouter key is not a management key.');
    }

    if (typeof payload?.key?.label === 'string' && payload.key.label.trim()) {
        diagnostics.push(`OpenRouter key label: ${payload.key.label.trim()}.`);
    }

    throw new Error(
        diagnostics.length > 0
            ? `${baseMessage} ${diagnostics.join(' ')}`
            : baseMessage
    );
}
