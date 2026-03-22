import { createClient } from '@supabase/supabase-js';

let supabaseClientInstance = null;

function getNormalizedEnvValue(key) {
    const rawValue = import.meta.env[key];
    return typeof rawValue === 'string' ? rawValue.trim() : '';
}

export function getSupabaseUrl() {
    return getNormalizedEnvValue('VITE_SUPABASE_URL');
}

export function getSupabasePublishableKey() {
    return (
        getNormalizedEnvValue('VITE_SUPABASE_PUBLISHABLE_KEY')
        || getNormalizedEnvValue('VITE_SUPABASE_ANON_KEY')
    );
}

export function isSupabaseConfigured() {
    return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function getSupabaseClient() {
    if (!isSupabaseConfigured()) return null;

    if (!supabaseClientInstance) {
        supabaseClientInstance = createClient(
            getSupabaseUrl(),
            getSupabasePublishableKey(),
            {
                auth: {
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    persistSession: true
                }
            }
        );
    }

    return supabaseClientInstance;
}
