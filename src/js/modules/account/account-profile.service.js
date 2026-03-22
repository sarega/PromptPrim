import * as AuthService from '../auth/auth.service.js';
import * as UserService from '../user/user.service.js';

const MAX_AVATAR_URL_LENGTH = 120000;

function normalizeText(value, { maxLength = 500, lowercase = false } = {}) {
    let normalized = String(value || '').trim();
    if (lowercase) normalized = normalized.toLowerCase();
    if (maxLength > 0) {
        normalized = normalized.slice(0, maxLength);
    }
    return normalized;
}

function normalizeNullableText(value, options = {}) {
    const normalized = normalizeText(value, options);
    return normalized || null;
}

function buildLocalBillingProfile(user = null) {
    const billingProfile = (user?.billingProfile && typeof user.billingProfile === 'object')
        ? user.billingProfile
        : {};

    return {
        avatarUrl: normalizeText(user?.avatarUrl || billingProfile.avatarUrl || '', { maxLength: MAX_AVATAR_URL_LENGTH }),
        billingName: normalizeText(billingProfile.billingName || user?.userName || '', { maxLength: 120 }),
        billingCompany: normalizeText(billingProfile.billingCompany || '', { maxLength: 120 }),
        billingPhone: normalizeText(billingProfile.billingPhone || '', { maxLength: 40 }),
        billingAddressLine1: normalizeText(billingProfile.billingAddressLine1 || '', { maxLength: 160 }),
        billingAddressLine2: normalizeText(billingProfile.billingAddressLine2 || '', { maxLength: 160 }),
        billingCity: normalizeText(billingProfile.billingCity || '', { maxLength: 120 }),
        billingState: normalizeText(billingProfile.billingState || '', { maxLength: 120 }),
        billingPostalCode: normalizeText(billingProfile.billingPostalCode || '', { maxLength: 40 }),
        billingCountry: normalizeText(billingProfile.billingCountry || '', { maxLength: 80 })
    };
}

function buildProfileSnapshotFromUser(user = null) {
    const currentUser = user || UserService.getCurrentUserProfile();
    if (!currentUser) return null;

    const localBillingProfile = buildLocalBillingProfile(currentUser);
    return {
        displayName: normalizeText(currentUser.userName || 'User', { maxLength: 120 }),
        email: normalizeText(currentUser.email || '', { maxLength: 320, lowercase: true }),
        userId: normalizeText(currentUser.externalAuthUserId || currentUser.userId || '', { maxLength: 128 }),
        authSource: UserService.isBackendManagedProfile(currentUser) ? 'Supabase' : 'Local',
        ...localBillingProfile
    };
}

function normalizeProfileDraft(draft = {}, fallback = null) {
    const base = fallback || buildProfileSnapshotFromUser();
    return {
        displayName: normalizeText(draft.displayName ?? base?.displayName ?? 'User', { maxLength: 120 }) || 'User',
        email: normalizeText(draft.email ?? base?.email ?? '', { maxLength: 320, lowercase: true }),
        userId: normalizeText(draft.userId ?? base?.userId ?? '', { maxLength: 128 }),
        authSource: normalizeText(draft.authSource ?? base?.authSource ?? 'Local', { maxLength: 40 }) || 'Local',
        avatarUrl: normalizeText(draft.avatarUrl ?? base?.avatarUrl ?? '', { maxLength: MAX_AVATAR_URL_LENGTH }),
        billingName: normalizeText(draft.billingName ?? base?.billingName ?? '', { maxLength: 120 }),
        billingCompany: normalizeText(draft.billingCompany ?? base?.billingCompany ?? '', { maxLength: 120 }),
        billingPhone: normalizeText(draft.billingPhone ?? base?.billingPhone ?? '', { maxLength: 40 }),
        billingAddressLine1: normalizeText(draft.billingAddressLine1 ?? base?.billingAddressLine1 ?? '', { maxLength: 160 }),
        billingAddressLine2: normalizeText(draft.billingAddressLine2 ?? base?.billingAddressLine2 ?? '', { maxLength: 160 }),
        billingCity: normalizeText(draft.billingCity ?? base?.billingCity ?? '', { maxLength: 120 }),
        billingState: normalizeText(draft.billingState ?? base?.billingState ?? '', { maxLength: 120 }),
        billingPostalCode: normalizeText(draft.billingPostalCode ?? base?.billingPostalCode ?? '', { maxLength: 40 }),
        billingCountry: normalizeText(draft.billingCountry ?? base?.billingCountry ?? '', { maxLength: 80 })
    };
}

async function getBackendEditableProfile(user = null) {
    const client = AuthService.getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

    const { data: authUserResult, error: authUserError } = await client.auth.getUser();
    if (authUserError) throw authUserError;

    const authUser = authUserResult?.user || null;
    if (!authUser?.id) {
        return buildProfileSnapshotFromUser(user);
    }

    const { data: profileRow, error: profileError } = await client
        .from('profiles')
        .select('id, email, display_name, avatar_url, billing_name, billing_company, billing_phone, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_postal_code, billing_country')
        .eq('id', authUser.id)
        .maybeSingle();

    if (profileError) throw profileError;

    const fallback = buildProfileSnapshotFromUser(user);
    return normalizeProfileDraft({
        displayName: profileRow?.display_name || AuthService.getUserDisplayName(authUser) || fallback?.displayName || 'User',
        email: authUser.email || profileRow?.email || fallback?.email || '',
        userId: authUser.id,
        authSource: 'Supabase',
        avatarUrl: profileRow?.avatar_url || authUser.user_metadata?.avatar_url || fallback?.avatarUrl || '',
        billingName: profileRow?.billing_name || fallback?.billingName || '',
        billingCompany: profileRow?.billing_company || fallback?.billingCompany || '',
        billingPhone: profileRow?.billing_phone || fallback?.billingPhone || '',
        billingAddressLine1: profileRow?.billing_address_line1 || fallback?.billingAddressLine1 || '',
        billingAddressLine2: profileRow?.billing_address_line2 || fallback?.billingAddressLine2 || '',
        billingCity: profileRow?.billing_city || fallback?.billingCity || '',
        billingState: profileRow?.billing_state || fallback?.billingState || '',
        billingPostalCode: profileRow?.billing_postal_code || fallback?.billingPostalCode || '',
        billingCountry: profileRow?.billing_country || fallback?.billingCountry || ''
    }, fallback);
}

export async function fetchEditableAccountProfile(user = null) {
    const currentUser = user || UserService.getCurrentUserProfile();
    if (!currentUser) return null;

    if (!UserService.isBackendManagedProfile(currentUser) || !AuthService.isSupabaseEnabled()) {
        return buildProfileSnapshotFromUser(currentUser);
    }

    return getBackendEditableProfile(currentUser);
}

export async function saveEditableAccountProfile(draft = {}, user = null) {
    const currentUser = user || UserService.getCurrentUserProfile();
    if (!currentUser) {
        throw new Error('No active PromptPrim account is available.');
    }

    const normalizedDraft = normalizeProfileDraft(draft, buildProfileSnapshotFromUser(currentUser));

    if (!UserService.isBackendManagedProfile(currentUser) || !AuthService.isSupabaseEnabled()) {
        const updatedUser = JSON.parse(JSON.stringify(currentUser));
        updatedUser.userName = normalizedDraft.displayName || updatedUser.userName;
        updatedUser.email = normalizedDraft.email || updatedUser.email;
        updatedUser.avatarUrl = normalizedDraft.avatarUrl || '';
        updatedUser.billingProfile = {
            avatarUrl: normalizedDraft.avatarUrl,
            billingName: normalizedDraft.billingName,
            billingCompany: normalizedDraft.billingCompany,
            billingPhone: normalizedDraft.billingPhone,
            billingAddressLine1: normalizedDraft.billingAddressLine1,
            billingAddressLine2: normalizedDraft.billingAddressLine2,
            billingCity: normalizedDraft.billingCity,
            billingState: normalizedDraft.billingState,
            billingPostalCode: normalizedDraft.billingPostalCode,
            billingCountry: normalizedDraft.billingCountry
        };
        UserService.saveFullUserProfile(updatedUser);
        return {
            profile: buildProfileSnapshotFromUser(updatedUser),
            emailChangeRequested: false,
            emailNotice: ''
        };
    }

    const client = AuthService.getSupabaseAuthClient();
    if (!client) {
        throw new Error('Supabase client is not available.');
    }

    const { data: authUserResult, error: authUserError } = await client.auth.getUser();
    if (authUserError) throw authUserError;

    const authUser = authUserResult?.user || null;
    if (!authUser?.id) {
        throw new Error('No authenticated Supabase user is available.');
    }

    const metadataPayload = {
        display_name: normalizedDraft.displayName || 'User'
    };

    const { error: profileError } = await client
        .from('profiles')
        .update({
            display_name: normalizedDraft.displayName || 'User',
            avatar_url: normalizeNullableText(normalizedDraft.avatarUrl, { maxLength: MAX_AVATAR_URL_LENGTH }),
            billing_name: normalizeNullableText(normalizedDraft.billingName, { maxLength: 120 }),
            billing_company: normalizeNullableText(normalizedDraft.billingCompany, { maxLength: 120 }),
            billing_phone: normalizeNullableText(normalizedDraft.billingPhone, { maxLength: 40 }),
            billing_address_line1: normalizeNullableText(normalizedDraft.billingAddressLine1, { maxLength: 160 }),
            billing_address_line2: normalizeNullableText(normalizedDraft.billingAddressLine2, { maxLength: 160 }),
            billing_city: normalizeNullableText(normalizedDraft.billingCity, { maxLength: 120 }),
            billing_state: normalizeNullableText(normalizedDraft.billingState, { maxLength: 120 }),
            billing_postal_code: normalizeNullableText(normalizedDraft.billingPostalCode, { maxLength: 40 }),
            billing_country: normalizeNullableText(normalizedDraft.billingCountry, { maxLength: 80 })
        })
        .eq('id', authUser.id);

    if (profileError) throw profileError;

    const { error: metadataError } = await AuthService.updateCurrentUser({ data: metadataPayload });
    if (metadataError) throw metadataError;

    const currentEmail = normalizeText(authUser.email || '', { maxLength: 320, lowercase: true });
    let emailChangeRequested = false;
    let emailNotice = '';

    if (normalizedDraft.email && normalizedDraft.email !== currentEmail) {
        const { error: emailError } = await AuthService.updateCurrentUser({ email: normalizedDraft.email });
        if (emailError) throw emailError;
        emailChangeRequested = true;
        emailNotice = 'Email change requested. Check your inbox to confirm the new address if your project requires email confirmation.';
    }

    return {
        profile: await getBackendEditableProfile(currentUser),
        emailChangeRequested,
        emailNotice
    };
}

export async function updateCurrentAccountPassword(nextPassword) {
    const normalizedPassword = String(nextPassword || '');
    if (normalizedPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long.');
    }

    const { error } = await AuthService.updateCurrentUser({ password: normalizedPassword });
    if (error) throw error;

    return { success: true };
}

export async function sendAccountRecoveryEmail(email, nextPath = 'app.html') {
    const normalizedEmail = normalizeText(email || '', { maxLength: 320, lowercase: true });
    if (!normalizedEmail) {
        throw new Error('A recovery email address is required.');
    }

    const { error } = await AuthService.requestPasswordRecovery(normalizedEmail, nextPath);
    if (error) throw error;

    return { success: true };
}
