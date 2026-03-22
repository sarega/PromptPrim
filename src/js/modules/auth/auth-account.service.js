import { getSupabaseAuthClient, getUserDisplayName, getUserRole } from './auth.service.js';

function buildFallbackProfile(authUser) {
    const role = getUserRole(authUser);
    return {
        id: authUser.id,
        email: String(authUser.email || '').trim(),
        display_name: getUserDisplayName(authUser),
        avatar_url: String(authUser.user_metadata?.avatar_url || '').trim() || null,
        billing_name: null,
        billing_company: null,
        billing_phone: null,
        billing_address_line1: null,
        billing_address_line2: null,
        billing_city: null,
        billing_state: null,
        billing_postal_code: null,
        billing_country: null,
        role,
        status: 'active',
        plan_code: 'free',
        account_status: role === 'admin' ? 'studio_active' : 'free',
        trial_expires_at: null,
        access_pass_expires_at: null,
        created_at: null,
        updated_at: null
    };
}

function buildFallbackWallet(userId) {
    return {
        user_id: userId,
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

export async function getCurrentAccountSnapshot(authUser = null) {
    const client = getSupabaseAuthClient();
    if (!client) {
        return { data: null, error: new Error('Supabase is not configured.') };
    }

    let currentAuthUser = authUser;
    if (!currentAuthUser) {
        const { data, error } = await client.auth.getUser();
        if (error) return { data: null, error };
        currentAuthUser = data.user;
    }

    if (!currentAuthUser?.id) {
        return { data: null, error: null };
    }

    const userId = currentAuthUser.id;

    const [profileResult, walletResult] = await Promise.all([
        client
            .from('profiles')
            .select('id, email, display_name, avatar_url, billing_name, billing_company, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_postal_code, billing_country, role, status, plan_code, account_status, trial_expires_at, access_pass_expires_at, created_at, updated_at')
            .eq('id', userId)
            .maybeSingle(),
        client
            .from('wallets')
            .select('user_id, balance_microcredits, monthly_credit_balance_microcredits, topup_credit_balance_microcredits, monthly_credit_expires_at, lifetime_purchased_microcredits, lifetime_consumed_microcredits, created_at, updated_at')
            .eq('user_id', userId)
            .maybeSingle()
    ]);

    if (profileResult.error) return { data: null, error: profileResult.error };
    if (walletResult.error) return { data: null, error: walletResult.error };

    const profile = profileResult.data || buildFallbackProfile(currentAuthUser);
    const wallet = walletResult.data || buildFallbackWallet(userId);

    const { data: plan, error: planError } = await client
        .from('plans')
        .select('code, name, monthly_price_usd, included_microcredits, is_active')
        .eq('code', profile.plan_code || 'free')
        .maybeSingle();

    if (planError) return { data: null, error: planError };

    return {
        data: {
            authUser: currentAuthUser,
            profile,
            wallet,
            plan: plan || buildFallbackPlan(profile.plan_code)
        },
        error: null
    };
}
