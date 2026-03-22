import * as AuthService from '../auth/auth.service.js';
import * as UserService from '../user/user.service.js';

function normalizeBackendUserId(profile = null) {
    const target = profile || UserService.getCurrentUserProfile();
    if (!target) return '';

    const backendUserId = String(
        target.backendAccount?.userId
        || target.externalAuthUserId
        || ''
    ).trim();

    if (backendUserId) return backendUserId;

    const localUserId = String(target.userId || '').trim();
    if (localUserId.startsWith('sb_')) {
        return localUserId.slice(3);
    }

    return '';
}

export function isBackendUserAccountSyncAvailable(profile = null) {
    return AuthService.isSupabaseEnabled() && UserService.isBackendManagedProfile(profile);
}

export async function saveBackendManagedUserAccount(profile, {
    plan,
    credits,
    monthlyCredits,
    topupCredits,
    accountStatus,
    trialExpiresAt,
    clearTrialExpiresAt = false,
    accessPassExpiresAt,
    clearAccessPassExpiresAt = false,
    reason = ''
} = {}) {
    if (!isBackendUserAccountSyncAvailable(profile)) {
        throw new Error('Supabase-backed account editing is not available for this user.');
    }

    const client = AuthService.getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

    const targetUserId = normalizeBackendUserId(profile);
    if (!targetUserId) {
        throw new Error('Could not resolve the Supabase user ID for this account.');
    }

    const normalizedPlan = String(plan || profile?.backendAccount?.planCode || profile?.plan || 'free').trim().toLowerCase() || 'free';
    const normalizedCredits = credits === undefined || credits === null || credits === ''
        ? null
        : Math.max(0, Number.parseInt(credits, 10) || 0);
    const normalizedMonthlyCredits = monthlyCredits === undefined || monthlyCredits === null || monthlyCredits === ''
        ? null
        : Math.max(0, Number.parseInt(monthlyCredits, 10) || 0);
    const normalizedTopupCredits = topupCredits === undefined || topupCredits === null || topupCredits === ''
        ? null
        : Math.max(0, Number.parseInt(topupCredits, 10) || 0);
    const normalizedAccountStatus = String(accountStatus || '').trim().toLowerCase() || null;
    const normalizedReason = String(reason || '').trim();
    const normalizedTrialExpiresAt = clearTrialExpiresAt
        ? null
        : (trialExpiresAt ? new Date(trialExpiresAt).toISOString() : null);
    const normalizedAccessPassExpiresAt = clearAccessPassExpiresAt
        ? null
        : (accessPassExpiresAt ? new Date(accessPassExpiresAt).toISOString() : null);

    const { data, error } = await client.rpc('admin_update_user_account', {
        target_user_id: targetUserId,
        next_plan_code: normalizedPlan,
        next_balance_microcredits: normalizedCredits,
        adjustment_reason: normalizedReason || null,
        next_monthly_credit_balance_microcredits: normalizedMonthlyCredits,
        next_topup_credit_balance_microcredits: normalizedTopupCredits,
        next_account_status: normalizedAccountStatus,
        next_trial_expires_at: normalizedTrialExpiresAt,
        clear_trial_expires_at: clearTrialExpiresAt === true,
        next_access_pass_expires_at: normalizedAccessPassExpiresAt,
        clear_access_pass_expires_at: clearAccessPassExpiresAt === true
    });

    if (error) {
        throw new Error(error.message || 'Could not save the Supabase user account.');
    }

    return data || {};
}

export async function deleteBackendManagedUserAccount(profile) {
    if (!isBackendUserAccountSyncAvailable(profile)) {
        throw new Error('Supabase-backed account deletion is not available for this user.');
    }

    const client = AuthService.getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

    const targetUserId = normalizeBackendUserId(profile);
    if (!targetUserId) {
        throw new Error('Could not resolve the Supabase user ID for this account.');
    }

    const { data, error } = await client.rpc('admin_delete_user_account', {
        target_user_id: targetUserId
    });

    if (error) {
        throw new Error(error.message || 'Could not delete the Supabase user account.');
    }

    return data || {};
}
