import { getSupabaseAuthClient, isSupabaseEnabled } from '../auth/auth.service.js';
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

function buildUsageEntry(row) {
    const promptTokens = Number(row?.prompt_tokens) || 0;
    const completionTokens = Number(row?.completion_tokens) || 0;
    return {
        id: String(row?.id || row?.request_id || ''),
        requestId: String(row?.request_id || ''),
        timestamp: row?.created_at || null,
        model: String(row?.model_id || ''),
        status: String(row?.status || 'completed').trim().toLowerCase(),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        providerCostUSD: Number(row?.provider_cost_usd) || 0,
        markupRate: Number(row?.markup_rate) || 0,
        chargedMicrocredits: Number(row?.charged_microcredits) || 0,
        chargedUSD: UserService.convertCreditsToUSD(Number(row?.charged_microcredits) || 0),
        errorMessage: String(row?.error_message || '').trim()
    };
}

function buildLedgerEntry(row) {
    const deltaMicrocredits = Number(row?.delta_microcredits) || 0;
    return {
        id: String(row?.id || ''),
        timestamp: row?.created_at || null,
        type: String(row?.type || '').trim().toLowerCase(),
        deltaMicrocredits,
        deltaUSD: UserService.convertCreditsToUSD(Math.abs(deltaMicrocredits)),
        direction: deltaMicrocredits >= 0 ? 'credit' : 'debit',
        providerCostUSD: Number(row?.provider_cost_usd) || 0,
        retailValueUSD: Number(row?.retail_value_usd) || 0,
        requestId: String(row?.request_id || ''),
        notes: String(row?.notes || '').trim()
    };
}

function getClient() {
    if (!isSupabaseEnabled()) {
        throw new Error('Supabase is not configured.');
    }

    const client = getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

    return client;
}

export function isBackendAccountDataAvailable(profile = null) {
    return isSupabaseEnabled() && UserService.isBackendManagedProfile(profile);
}

export async function fetchBackendUsageEvents(profile = null, { limit = 25 } = {}) {
    if (!isBackendAccountDataAvailable(profile)) return [];

    const client = getClient();
    const targetUserId = normalizeBackendUserId(profile);
    if (!targetUserId) return [];

    const { data, error } = await client
        .from('usage_events')
        .select('id, request_id, model_id, status, prompt_tokens, completion_tokens, provider_cost_usd, markup_rate, charged_microcredits, error_message, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;

    return (Array.isArray(data) ? data : []).map(buildUsageEntry);
}

export async function fetchBackendWalletLedger(profile = null, { limit = 25 } = {}) {
    if (!isBackendAccountDataAvailable(profile)) return [];

    const client = getClient();
    const targetUserId = normalizeBackendUserId(profile);
    if (!targetUserId) return [];

    const { data, error } = await client
        .from('wallet_ledger')
        .select('id, type, delta_microcredits, provider_cost_usd, retail_value_usd, request_id, notes, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;

    return (Array.isArray(data) ? data : []).map(buildLedgerEntry);
}

export async function fetchBackendAccountSnapshot(profile = null, options = {}) {
    const [usageEvents, walletLedger] = await Promise.all([
        fetchBackendUsageEvents(profile, options),
        fetchBackendWalletLedger(profile, options)
    ]);

    return {
        usageEvents,
        walletLedger
    };
}

export async function fetchBackendFinancialReport() {
    const client = getClient();

    const [profilesResult, walletsResult, usageEventsResult] = await Promise.all([
        client
            .from('profiles')
            .select('id, email, display_name, role, status, account_status, plan_code, created_at')
            .order('created_at', { ascending: true }),
        client
            .from('wallets')
            .select('user_id, balance_microcredits, lifetime_purchased_microcredits, lifetime_consumed_microcredits'),
        client
            .from('usage_events')
            .select('user_id, status, prompt_tokens, completion_tokens, provider_cost_usd, charged_microcredits')
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (walletsResult.error) throw walletsResult.error;
    if (usageEventsResult.error) throw usageEventsResult.error;

    const walletsByUserId = new Map((Array.isArray(walletsResult.data) ? walletsResult.data : []).map(wallet => [wallet.user_id, wallet]));
    const usageEventsByUserId = new Map();

    (Array.isArray(usageEventsResult.data) ? usageEventsResult.data : []).forEach((row) => {
        const userId = String(row?.user_id || '').trim();
        if (!userId) return;
        const bucket = usageEventsByUserId.get(userId) || [];
        bucket.push(row);
        usageEventsByUserId.set(userId, bucket);
    });

    const perUser = (Array.isArray(profilesResult.data) ? profilesResult.data : [])
        .filter(profile => String(profile?.role || '').trim().toLowerCase() !== 'admin')
        .map((profile) => {
            const wallet = walletsByUserId.get(profile.id) || null;
            const usageRows = usageEventsByUserId.get(profile.id) || [];
            const completedUsageRows = usageRows.filter(row => String(row?.status || '').trim().toLowerCase() === 'completed');
            const totalRefilledUSD = UserService.convertCreditsToUSD(Number(wallet?.lifetime_purchased_microcredits) || 0);
            const totalUsageUSD = completedUsageRows.reduce((sum, row) => sum + (Number(row?.provider_cost_usd) || 0), 0);
            const totalRetailUsageUSD = completedUsageRows.reduce((sum, row) => {
                return sum + UserService.convertCreditsToUSD(Number(row?.charged_microcredits) || 0);
            }, 0);
            const totalPromptTokens = completedUsageRows.reduce((sum, row) => sum + (Number(row?.prompt_tokens) || 0), 0);
            const totalCompletionTokens = completedUsageRows.reduce((sum, row) => sum + (Number(row?.completion_tokens) || 0), 0);

            return {
                userId: profile.id,
                userName: String(profile.display_name || profile.email || 'User'),
                email: String(profile.email || ''),
                plan: String(profile.plan_code || 'free'),
                status: String(profile.account_status || profile.status || 'active'),
                currentBalanceUSD: UserService.convertCreditsToUSD(Number(wallet?.balance_microcredits) || 0),
                totalRefilledUSD,
                totalUsageUSD,
                totalRetailUsageUSD,
                totalApiCalls: completedUsageRows.length,
                totalTokensProcessed: totalPromptTokens + totalCompletionTokens,
                netValue: totalRefilledUSD - totalUsageUSD
            };
        });

    const summary = perUser.reduce((accumulator, user) => {
        accumulator.grossRevenue += user.totalRefilledUSD;
        accumulator.totalCosts += user.totalUsageUSD;
        accumulator.totalRetailUsage += user.totalRetailUsageUSD;
        accumulator.activeUsers += 1;
        accumulator.totalApiCalls += user.totalApiCalls;
        accumulator.totalTokensProcessed += user.totalTokensProcessed;
        return accumulator;
    }, {
        grossRevenue: 0,
        totalCosts: 0,
        totalRetailUsage: 0,
        activeUsers: 0,
        totalApiCalls: 0,
        totalTokensProcessed: 0
    });

    return {
        summary: {
            grossRevenue: summary.grossRevenue,
            totalCosts: summary.totalCosts,
            totalRetailUsage: summary.totalRetailUsage,
            netProfit: summary.grossRevenue - summary.totalCosts,
            activeUsers: summary.activeUsers,
            totalApiCalls: summary.totalApiCalls,
            totalTokensProcessed: summary.totalTokensProcessed
        },
        perUser
    };
}

export async function fetchBackendWalletPoolSummary() {
    const client = getClient();

    const { data, error } = await client
        .from('wallets')
        .select('user_id, balance_microcredits');

    if (error) throw error;

    const totalIssuedMicrocredits = (Array.isArray(data) ? data : []).reduce((sum, wallet) => {
        return sum + (Number(wallet?.balance_microcredits) || 0);
    }, 0);

    return {
        totalIssuedMicrocredits,
        totalTrackedUsers: Array.isArray(data) ? data.length : 0
    };
}
