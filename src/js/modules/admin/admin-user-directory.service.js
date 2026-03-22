import { getSupabaseAuthClient, isSupabaseEnabled } from '../auth/auth.service.js';
import * as UserService from '../user/user.service.js';

let backendDirectoryUserIds = null;
let adminVisibleUsersCache = null;

function cloneUser(user) {
    return JSON.parse(JSON.stringify(user));
}

function buildFallbackWallet(profileId) {
    return {
        user_id: profileId,
        balance_microcredits: 0,
        monthly_credit_balance_microcredits: 0,
        topup_credit_balance_microcredits: 0,
        monthly_credit_expires_at: null,
        lifetime_purchased_microcredits: 0,
        lifetime_consumed_microcredits: 0,
        created_at: null,
        updated_at: null
    };
}

function buildFallbackPlan(planCode = 'free') {
    const normalizedPlanCode = String(planCode || 'free').trim().toLowerCase() || 'free';
    return {
        code: normalizedPlanCode,
        name: normalizedPlanCode.charAt(0).toUpperCase() + normalizedPlanCode.slice(1),
        monthly_price_usd: 0,
        included_microcredits: 0,
        is_active: true
    };
}

function buildDirectorySnapshot(profile, wallet, plan) {
    return {
        authUser: {
            id: profile.id,
            email: profile.email,
            role: profile.role,
            app_metadata: {
                role: profile.role
            },
            user_metadata: {
                display_name: profile.display_name
            }
        },
        profile,
        wallet: wallet || buildFallbackWallet(profile.id),
        plan: plan || buildFallbackPlan(profile.plan_code)
    };
}

function getVisibleUsersFromLocalIds(localUserIds) {
    const ids = Array.isArray(localUserIds) ? localUserIds : [];
    return ids
        .map(userId => UserService.getUserById(userId))
        .filter(Boolean);
}

function buildMergedAdminVisibleUsers() {
    const visibleUsersById = new Map();

    const appendUser = (user) => {
        const userId = String(user?.userId || '').trim();
        if (!userId || visibleUsersById.has(userId)) return;
        visibleUsersById.set(userId, user);
    };

    if (Array.isArray(backendDirectoryUserIds) && backendDirectoryUserIds.length > 0) {
        getVisibleUsersFromLocalIds(backendDirectoryUserIds).forEach(appendUser);
    }

    UserService.getAllUsers().forEach(appendUser);

    return Array.from(visibleUsersById.values());
}

function updateAdminVisibleUsersCache(users) {
    adminVisibleUsersCache = (Array.isArray(users) ? users : []).map(cloneUser);
    return getAdminVisibleUsers();
}

export function getAdminVisibleUsers() {
    if (Array.isArray(adminVisibleUsersCache)) {
        return adminVisibleUsersCache.map(cloneUser);
    }

    return buildMergedAdminVisibleUsers().map(cloneUser);
}

export function getAdminVisibleUserById(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return null;

    const cachedUser = getAdminVisibleUsers().find(user => String(user?.userId || '').trim() === normalizedUserId);
    return cachedUser ? cloneUser(cachedUser) : null;
}

export function upsertAdminVisibleUser(user) {
    const normalizedUser = cloneUser(user);
    const normalizedUserId = String(normalizedUser?.userId || '').trim();
    if (!normalizedUserId) return getAdminVisibleUsers();

    const nextUsers = getAdminVisibleUsers();
    const existingIndex = nextUsers.findIndex(entry => String(entry?.userId || '').trim() === normalizedUserId);
    if (existingIndex >= 0) {
        nextUsers[existingIndex] = normalizedUser;
    } else {
        nextUsers.push(normalizedUser);
    }

    return updateAdminVisibleUsersCache(nextUsers);
}

export function removeAdminVisibleUser(userId, options = {}) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return getAdminVisibleUsers();
    const normalizedBackendUserId = String(options.linkedBackendUserId || '').trim();

    const nextUsers = getAdminVisibleUsers().filter((entry) => {
        const entryUserId = String(entry?.userId || '').trim();
        if (!entryUserId) return false;
        if (entryUserId === normalizedUserId) return false;

        if (normalizedBackendUserId) {
            const entryBackendUserId = String(
                entry?.externalAuthUserId
                || entry?.backendAccount?.userId
                || ''
            ).trim();
            if (entryBackendUserId && entryBackendUserId === normalizedBackendUserId) {
                return false;
            }
            if (entryUserId === `sb_${normalizedBackendUserId}`) {
                return false;
            }
        }

        return true;
    });
    return updateAdminVisibleUsersCache(nextUsers);
}

export async function refreshAdminUserDirectory() {
    if (!isSupabaseEnabled()) {
        backendDirectoryUserIds = null;
        adminVisibleUsersCache = UserService.getAllUsers().map(cloneUser);
        return getAdminVisibleUsers();
    }

    const client = getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

    const [profilesResult, walletsResult, plansResult] = await Promise.all([
        client
            .from('profiles')
            .select('id, email, display_name, role, status, plan_code, account_status, trial_expires_at, access_pass_expires_at, created_at, updated_at')
            .order('created_at', { ascending: true }),
        client
            .from('wallets')
            .select('user_id, balance_microcredits, monthly_credit_balance_microcredits, topup_credit_balance_microcredits, monthly_credit_expires_at, lifetime_purchased_microcredits, lifetime_consumed_microcredits, created_at, updated_at'),
        client
            .from('plans')
            .select('code, name, monthly_price_usd, included_microcredits, is_active')
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (walletsResult.error) throw walletsResult.error;
    if (plansResult.error) throw plansResult.error;

    const walletByUserId = new Map((Array.isArray(walletsResult.data) ? walletsResult.data : []).map(wallet => [wallet.user_id, wallet]));
    const planByCode = new Map((Array.isArray(plansResult.data) ? plansResult.data : []).map(plan => [plan.code, plan]));
    const snapshots = (Array.isArray(profilesResult.data) ? profilesResult.data : []).map(profile => (
        buildDirectorySnapshot(
            profile,
            walletByUserId.get(profile.id),
            planByCode.get(profile.plan_code)
        )
    ));

    backendDirectoryUserIds = UserService.syncBackendUserDirectoryFromSnapshots(snapshots, { publish: false });
    return updateAdminVisibleUsersCache(buildMergedAdminVisibleUsers());
}
