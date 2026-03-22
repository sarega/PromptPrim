import { getSupabaseClient, isSupabaseConfigured } from '../../integrations/supabase/client.js';

function getBasePath() {
    const base = typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
    if (!base) return '/';
    return base.endsWith('/') ? base : `${base}/`;
}

function buildAbsoluteUrl(relativePath = '') {
    const safePath = String(relativePath || '').replace(/^\/+/, '');
    return new URL(safePath, `${window.location.origin}${getBasePath()}`).toString();
}

function getSafeNextPath(rawValue = '') {
    const normalized = String(rawValue || '').trim();
    if (!normalized) return 'app.html';
    if (/^https?:\/\//i.test(normalized)) return 'app.html';
    if (normalized.startsWith('//')) return 'app.html';
    return normalized.replace(/^\/+/, '') || 'app.html';
}

function getLocationParams(source = '') {
    const normalizedSource = String(source || '').trim();
    if (!normalizedSource) return new URLSearchParams();
    const withoutPrefix = normalizedSource.replace(/^[#?]/, '');
    return new URLSearchParams(withoutPrefix);
}

function getLocationAuthParam(key = '') {
    const safeKey = String(key || '').trim();
    if (!safeKey || typeof window === 'undefined') return '';

    const hashValue = getLocationParams(window.location.hash).get(safeKey);
    if (typeof hashValue === 'string' && hashValue.trim()) {
        return hashValue.trim();
    }

    const queryValue = new URLSearchParams(window.location.search).get(safeKey);
    return typeof queryValue === 'string' ? queryValue.trim() : '';
}

export function isSupabaseEnabled() {
    return isSupabaseConfigured();
}

export function getAuthPageUrl(nextPath = 'app.html') {
    const authUrl = new URL(buildAbsoluteUrl('auth.html'));
    authUrl.searchParams.set('next', getSafeNextPath(nextPath));
    return authUrl.toString();
}

export function getAppPageUrl(relativePath = 'app.html') {
    return buildAbsoluteUrl(getSafeNextPath(relativePath));
}

export function getRequestedNextPath(defaultPath = 'app.html') {
    const params = new URLSearchParams(window.location.search);
    return getSafeNextPath(params.get('next') || defaultPath);
}

export function getSupabaseAuthClient() {
    return getSupabaseClient();
}

export async function getSession() {
    const client = getSupabaseAuthClient();
    if (!client) return { data: { session: null }, error: null };
    return client.auth.getSession();
}

export async function refreshSession() {
    const client = getSupabaseAuthClient();
    if (!client) return { data: { session: null }, error: null };
    return client.auth.refreshSession();
}

export async function getCurrentUser() {
    const client = getSupabaseAuthClient();
    if (!client) return { data: { user: null }, error: null };
    return client.auth.getUser();
}

export async function signInWithPassword({ email, password }) {
    const client = getSupabaseAuthClient();
    if (!client) {
        return { data: { session: null, user: null }, error: new Error('Supabase is not configured.') };
    }
    return client.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword({ email, password, displayName }) {
    const client = getSupabaseAuthClient();
    if (!client) {
        return { data: { session: null, user: null }, error: new Error('Supabase is not configured.') };
    }
    return client.auth.signUp({
        email,
        password,
        options: {
            data: {
                display_name: String(displayName || '').trim()
            }
        }
    });
}

export async function signOut() {
    const client = getSupabaseAuthClient();
    if (!client) return { error: null };
    return client.auth.signOut();
}

export async function updateCurrentUser(attributes = {}) {
    const client = getSupabaseAuthClient();
    if (!client) {
        return { data: { user: null }, error: new Error('Supabase is not configured.') };
    }
    return client.auth.updateUser(attributes);
}

export async function requestPasswordRecovery(email, nextPath = 'app.html') {
    const client = getSupabaseAuthClient();
    if (!client) {
        return { data: null, error: new Error('Supabase is not configured.') };
    }

    return client.auth.resetPasswordForEmail(String(email || '').trim(), {
        redirectTo: getAuthPageUrl(nextPath)
    });
}

export function onAuthStateChange(callback) {
    const client = getSupabaseAuthClient();
    if (!client || typeof callback !== 'function') {
        return { data: { subscription: { unsubscribe() {} } } };
    }
    return client.auth.onAuthStateChange(callback);
}

export function getUserRole(user) {
    const appRole = String(user?.app_metadata?.role || '').trim().toLowerCase();
    if (appRole) return appRole;

    const userRole = String(user?.user_metadata?.role || '').trim().toLowerCase();
    if (userRole) return userRole;

    return 'user';
}

export function isAdminUser(user) {
    return getUserRole(user) === 'admin';
}

export function getUserDisplayName(user) {
    const explicitName = String(
        user?.user_metadata?.display_name
        || user?.user_metadata?.full_name
        || user?.user_metadata?.name
        || ''
    ).trim();
    if (explicitName) return explicitName;

    const email = String(user?.email || '').trim();
    if (email) return email.split('@')[0];

    return 'User';
}

export function getAuthFlowTypeFromUrl() {
    return getLocationAuthParam('type').toLowerCase();
}

export function isRecoveryFlowUrl() {
    return getAuthFlowTypeFromUrl() === 'recovery';
}
