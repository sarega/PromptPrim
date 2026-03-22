//File: src/js/modules/user/user.service.js

import { stateManager } from "../../core/core.state.js";
import { showCustomAlert } from "../../core/core.ui.js";
import * as AuthService from "../auth/auth.service.js";
import { getCurrentAccountSnapshot } from "../auth/auth-account.service.js";
import { getBackendAllowedModelIdsForPlan, isBackendModelAccessReady } from "../models/model-access.service.js";

const USER_DB_KEY = 'promptPrimUserDatabase_v1';
const BILLING_DB_KEY = 'promptPrimAdminBilling_v1';
const PLAN_PRESETS_DB_KEY = 'promptPrimPlanPresets_v1';
const ACTIVE_USER_STORAGE_KEY = 'promptPrimActiveUserId';
const PENDING_ACTIVE_USER_STORAGE_KEY = 'promptPrimPendingActiveUserId';
export const ADMIN_USER_ID = 'user_admin';
const LEGACY_ADMIN_USER_ID = 'user_master';
export const FREE_TRIAL_DAYS = 7;
export const FREE_TRIAL_MICROCREDITS = 500000;
export const PRO_INCLUDED_MICROCREDITS = 7500000;
export const ACCESS_PASS_COST_MICROCREDITS = 7000000;
const DEFAULT_PROVIDER_ENABLED = Object.freeze({ openrouter: true, ollama: true, kieai: true });
const PREFERRED_DEFAULT_MODEL_IDS = Object.freeze([
    'openai/gpt-4o-mini',
    'google/gemini-2.0-flash-001',
    'google/gemini-2.0-flash-lite-001',
    'anthropic/claude-3.5-haiku',
    'meta-llama/llama-3.1-8b-instruct',
    'meta-llama/llama-3.1-70b-instruct'
]);
const DEPRIORITIZED_DEFAULT_MODEL_IDS = new Set([
    'google/gemma-3-27b-it'
]);

let userDatabase = [];
let planPresets = {};
let activeUserId = null;

function normalizeStoredUserId(rawValue) {
    if (typeof rawValue !== 'string') return '';
    const trimmed = rawValue.trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/^"+|"+$/g, '');
    return normalized === LEGACY_ADMIN_USER_ID ? ADMIN_USER_ID : normalized;
}

function normalizePlanCode(planCode = 'free') {
    const normalizedPlanCode = String(planCode || 'free').trim().toLowerCase();
    if (!normalizedPlanCode || normalizedPlanCode === 'master') return 'studio';
    return ['free', 'pro', 'studio'].includes(normalizedPlanCode)
        ? normalizedPlanCode
        : 'free';
}

export function normalizeCompatiblePlanCode(planCode = 'free') {
    return normalizePlanCode(planCode);
}

function cloneUserRecord(user) {
    return JSON.parse(JSON.stringify(user));
}

function mergeUserCollections(baseUsers = [], incomingUsers = []) {
    const mergedById = new Map();

    const appendUsers = (users) => {
        (Array.isArray(users) ? users : []).forEach((user) => {
            const userId = String(user?.userId || '').trim();
            if (!userId) return;
            mergedById.set(userId, cloneUserRecord(user));
        });
    };

    appendUsers(baseUsers);
    appendUsers(incomingUsers);

    return Array.from(mergedById.values());
}

async function loadPlanPresets() {
    const storedPresets = localStorage.getItem(PLAN_PRESETS_DB_KEY) || localStorage.getItem('promptPrimMasterPresets_v1');
    if (storedPresets) {
        planPresets = JSON.parse(storedPresets);
        if (planPresets.master_tier && !planPresets.studio_tier) {
            planPresets.studio_tier = {
                ...planPresets.master_tier,
                name: 'Studio Tier'
            };
            delete planPresets.master_tier;
            savePlanModelPresets(planPresets);
        }
        console.log("Loaded plan presets from localStorage.");
    } else {
        // Fallback to loading from the public JSON file for the very first run
        try {
            const filePath = `${import.meta.env.BASE_URL}studio-presets.json`;
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const presetsFromFile = await response.json();
            planPresets = presetsFromFile;
            savePlanModelPresets(planPresets); // Save them to their new home
            console.log("Loaded default plan presets from file.");
        } catch (error) {
            console.error("Failed to load default plan presets:", error);
            planPresets = {};
        }
    }
}

export function isAdminProfile(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return false;
    return String(target.role || '').trim().toLowerCase() === 'admin'
        || target.userId === ADMIN_USER_ID
        || target.userId === LEGACY_ADMIN_USER_ID
        || String(target.backendAccount?.role || '').trim().toLowerCase() === 'admin';
}

export function isStudioProfile(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return false;
    return isAdminProfile(target) || getEffectiveAccountStatus(target) === 'studio_active';
}

export function getEffectiveAccountStatus(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return 'free';
    if (isAdminProfile(target)) return 'studio_active';

    const backendAccountStatus = String(target.backendAccount?.accountStatus || '').trim().toLowerCase();
    const accessPassExpiresAt = target.backendAccount?.accessPassExpiresAt || target.accessPassExpiresAt || null;
    const accessPassExpiresAtMillis = accessPassExpiresAt ? new Date(accessPassExpiresAt).getTime() : NaN;
    if (['free', 'studio_active', 'pro_active', 'paid_suspended'].includes(backendAccountStatus)) {
        if (
            backendAccountStatus === 'studio_active'
            && accessPassExpiresAt
            && Number.isFinite(accessPassExpiresAtMillis)
            && accessPassExpiresAtMillis <= Date.now()
        ) {
            return 'paid_suspended';
        }
        return backendAccountStatus;
    }

    const normalizedPlan = normalizePlanCode(target.backendAccount?.planCode || target.plan || 'free');
    const normalizedPlanStatus = String(target.planStatus || target.backendAccount?.status || 'active').trim().toLowerCase();
    if (normalizedPlan === 'studio') {
        return normalizedPlanStatus === 'active' ? 'studio_active' : 'paid_suspended';
    }
    if (normalizedPlan === 'pro') {
        return normalizedPlanStatus === 'active' ? 'pro_active' : 'paid_suspended';
    }
    return 'free';
}

export function isPaidSuspendedProfile(profile = null) {
    return getEffectiveAccountStatus(profile) === 'paid_suspended';
}

export function getCreditBucketSummary(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) {
        return {
            monthlyMicrocredits: 0,
            topupMicrocredits: 0,
            totalMicrocredits: 0,
            monthlyExpiresAt: null
        };
    }

    const backendAccount = target.backendAccount || {};
    const monthlyMicrocredits = normalizeNumericValue(
        backendAccount.monthlyCreditBalanceMicrocredits,
        normalizeNumericValue(
            target.credits?.monthly,
            normalizePlanCode(target.plan || 'free') === 'free'
                ? normalizeNumericValue(target.credits?.current, 0)
                : 0
        )
    );
    const totalMicrocredits = normalizeNumericValue(
        backendAccount.balanceMicrocredits,
        normalizeNumericValue(target.credits?.current, 0)
    );
    const topupMicrocredits = normalizeNumericValue(
        backendAccount.topupCreditBalanceMicrocredits,
        normalizeNumericValue(
            target.credits?.topup,
            Math.max(totalMicrocredits - monthlyMicrocredits, 0)
        )
    );

    return {
        monthlyMicrocredits,
        topupMicrocredits,
        totalMicrocredits: totalMicrocredits || (monthlyMicrocredits + topupMicrocredits),
        monthlyExpiresAt: backendAccount.monthlyCreditExpiresAt || target.credits?.monthlyExpiresAt || null
    };
}

export function usesPersonalApiKeys(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return false;
    return isAdminProfile(target) || getEffectiveAccountStatus(target) === 'studio_active';
}

export function getEffectivePlanCode(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return 'free';
    if (isAdminProfile(target)) return 'studio';
    return normalizePlanCode(target.backendAccount?.planCode || target.plan || 'free');
}

export function canUseStudioTools(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return false;
    return usesPersonalApiKeys(target);
}

export function canUseMediaStudio(profile = null) {
    return canUseStudioTools(profile);
}

export function canUseLocalOllama(profile = null) {
    return canUseStudioTools(profile);
}

export function canPurchaseTopupCredits(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target || isAdminProfile(target)) return false;
    return getEffectiveAccountStatus(target) === 'pro_active';
}

export function canUseHostedTextWorkflow(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target || usesPersonalApiKeys(target)) return false;

    const effectiveAccountStatus = getEffectiveAccountStatus(target);
    const currentCredits = getCreditBucketSummary(target).totalMicrocredits;

    if (effectiveAccountStatus === 'paid_suspended') return false;
    if (effectiveAccountStatus === 'pro_active') return currentCredits > 0;
    if (effectiveAccountStatus === 'free') {
        return !isFreeTrialExpired(target) && currentCredits > 0;
    }
    return false;
}

export function isFreeTrialExpired(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return false;
    if (normalizePlanCode(target.backendAccount?.planCode || target.plan || 'free') !== 'free') return false;

    const trialEndsAt = target.trialEndsAt || target.backendAccount?.trialEndsAt || null;
    if (!trialEndsAt) return false;

    const parsedTrialEnd = new Date(trialEndsAt).getTime();
    return Number.isFinite(parsedTrialEnd) && parsedTrialEnd <= Date.now();
}

function normalizePlanTier(planCode = 'free') {
    const normalizedPlanCode = normalizePlanCode(planCode);
    if (normalizedPlanCode === 'studio') return 'studio';
    return normalizedPlanCode === 'pro' ? 'pro' : 'free';
}

function getLocalTierModelIds(planCode = 'free') {
    const normalizedTier = normalizePlanTier(planCode);
    const presetKey = normalizedTier === 'pro' ? 'pro_tier' : 'free_tier';
    return Array.isArray(planPresets?.[presetKey]?.modelIds)
        ? [...planPresets[presetKey].modelIds]
        : [];
}

function getTierModelIdsForProfile(profile = null, options = {}) {
    const target = profile || getCurrentUserProfile();
    if (!target || usesPersonalApiKeys(target)) {
        return (stateManager.getState().userProviderModels || []).map(model => model.id);
    }

    const effectivePlanCode = normalizePlanCode(
        options.planCode
        || target.backendAccount?.planCode
        || target.plan
        || 'free'
    );

    if (isBackendManagedProfile(target) && AuthService.isSupabaseEnabled() && isBackendModelAccessReady()) {
        return Array.from(getBackendAllowedModelIdsForPlan(effectivePlanCode));
    }

    return getLocalTierModelIds(effectivePlanCode);
}

function getVisibleAllowedModelIdsForProfile(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return [];
    if (usesPersonalApiKeys(target)) {
        return (stateManager.getState().userProviderModels || []).map(model => model.id);
    }

    const currentCredits = normalizeNumericValue(target.credits?.current, 0);
    const effectiveAccountStatus = getEffectiveAccountStatus(target);

    if (isBackendManagedProfile(target)) {
        if (effectiveAccountStatus === 'paid_suspended') {
            return [];
        }
        if (effectiveAccountStatus === 'free' && (isFreeTrialExpired(target) || currentCredits <= 0)) {
            return [];
        }
        if (effectiveAccountStatus === 'pro_active' && currentCredits <= 0) {
            return [];
        }

        if (AuthService.isSupabaseEnabled() && isBackendModelAccessReady()) {
            return getTierModelIdsForProfile(target);
        }
    }

    if (isFreeTrialExpired(target)) {
        return [];
    }

    if (target.plan === 'pro' && target.planStatus === 'active' && normalizeNumericValue(target.credits?.current, 0) > 0) {
        return getTierModelIdsForProfile(target, { planCode: 'pro' });
    }

    if ((target.plan === 'free' && normalizeNumericValue(target.credits?.current, 0) > 0) || target.planStatus === 'grace_period') {
        return getTierModelIdsForProfile(target, { planCode: 'free' });
    }

    return [];
}

function getAllowedModelsForProfile(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return [];

    const allowedModelIdSet = new Set(getVisibleAllowedModelIdsForProfile(target));
    const sourceModels = usesPersonalApiKeys(target)
        ? (stateManager.getState().userProviderModels || [])
        : (stateManager.getState().systemProviderModels || []);

    return sourceModels.filter(model => allowedModelIdSet.has(model.id));
}

function getPreferredTierModelIdForProfile(profile = null, options = {}) {
    const target = profile || getCurrentUserProfile();
    if (!target) return '';

    const visibleAllowedModels = getAllowedModelsForProfile(target);
    if (visibleAllowedModels.length === 0) return '';

    const visibleAllowedModelIdSet = new Set(visibleAllowedModels.map(model => model.id));
    const currentTierModelIds = getTierModelIdsForProfile(target, {
        planCode: options.planCode
            || target.backendAccount?.planCode
            || target.plan
            || 'free'
    });

    const previousTierModelIds = options.previousPlanCode
        ? new Set(getTierModelIdsForProfile(target, { planCode: options.previousPlanCode }))
        : null;

    if (options.preferTierPromotion && previousTierModelIds) {
        const promotedModelId = currentTierModelIds.find(modelId => (
            visibleAllowedModelIdSet.has(modelId) && !previousTierModelIds.has(modelId)
        ));
        if (promotedModelId) {
            return promotedModelId;
        }
    }

    const preferredStableModelId = PREFERRED_DEFAULT_MODEL_IDS.find(modelId => (
        visibleAllowedModelIdSet.has(modelId)
    ));
    if (preferredStableModelId) {
        return preferredStableModelId;
    }

    const firstTierNonDeprioritizedModelId = currentTierModelIds.find(modelId => (
        visibleAllowedModelIdSet.has(modelId) && !DEPRIORITIZED_DEFAULT_MODEL_IDS.has(modelId)
    ));
    if (firstTierNonDeprioritizedModelId) {
        return firstTierNonDeprioritizedModelId;
    }

    return currentTierModelIds.find(modelId => visibleAllowedModelIdSet.has(modelId))
        || visibleAllowedModels[0]?.id
        || '';
}

function reconcileUserStarterPresetForProfile(profile, options = {}) {
    if (!profile || !profile.modelPresets || typeof profile.modelPresets !== 'object') return false;

    const starterPreset = profile.modelPresets.my_first_preset;
    if (!starterPreset || typeof starterPreset !== 'object') return false;

    const preferredModelId = getPreferredTierModelIdForProfile(profile, options);
    const allowedModelIdSet = new Set(getVisibleAllowedModelIdsForProfile(profile));
    const currentModelIds = Array.isArray(starterPreset.modelIds) ? starterPreset.modelIds.filter(Boolean) : [];
    const nextModelIds = currentModelIds.filter(modelId => allowedModelIdSet.has(modelId));

    const shouldPromoteStarterPreset = Boolean(
        options.preferTierPromotion
        && preferredModelId
        && (
            currentModelIds.length === 0
            || currentModelIds.every(modelId => getTierModelIdsForProfile(profile, { planCode: options.previousPlanCode }).includes(modelId))
        )
    );

    if (shouldPromoteStarterPreset) {
        starterPreset.modelIds = [preferredModelId];
        return true;
    }

    if (nextModelIds.length === 0 && preferredModelId) {
        starterPreset.modelIds = [preferredModelId];
        return true;
    }

    if (JSON.stringify(nextModelIds) !== JSON.stringify(currentModelIds)) {
        starterPreset.modelIds = nextModelIds;
        return true;
    }

    return false;
}

function reconcileCurrentProjectModelsForProfile(profile, options = {}) {
    const target = profile || getCurrentUserProfile();
    if (!target || target.userId !== activeUserId || usesPersonalApiKeys(target)) return false;

    const project = stateManager.getProject();
    if (!project?.globalSettings?.systemUtilityAgent) return false;

    const allowedModels = getAllowedModelsForProfile(target);
    if (allowedModels.length === 0) return false;

    const preferredModelId = getPreferredTierModelIdForProfile(target, options);
    if (!preferredModelId) return false;

    const allowedModelIdSet = new Set(allowedModels.map(model => model.id));
    let changed = false;

    const systemUtilityAgent = project.globalSettings.systemUtilityAgent;
    const currentSystemModelId = String(systemUtilityAgent.model || '').trim();
    const previousTierModelIds = options.previousPlanCode
        ? new Set(getTierModelIdsForProfile(target, { planCode: options.previousPlanCode }))
        : null;
    const shouldPromoteSystemModel = Boolean(
        options.preferTierPromotion
        && previousTierModelIds
        && currentSystemModelId
        && previousTierModelIds.has(currentSystemModelId)
        && currentSystemModelId !== preferredModelId
    );
    const shouldReplaceDeprioritizedSystemModel = Boolean(
        currentSystemModelId
        && DEPRIORITIZED_DEFAULT_MODEL_IDS.has(currentSystemModelId)
        && currentSystemModelId !== preferredModelId
        && allowedModelIdSet.has(preferredModelId)
    );

    if (!currentSystemModelId || !allowedModelIdSet.has(currentSystemModelId) || shouldPromoteSystemModel || shouldReplaceDeprioritizedSystemModel) {
        systemUtilityAgent.model = preferredModelId;
        changed = true;
    }

    const agentPresets = project.agentPresets || {};
    Object.values(agentPresets).forEach((agentPreset) => {
        if (!agentPreset || typeof agentPreset !== 'object') return;
        const currentModelId = String(agentPreset.model || '').trim();
        const shouldReplaceDeprioritizedAgentModel = Boolean(
            currentModelId
            && DEPRIORITIZED_DEFAULT_MODEL_IDS.has(currentModelId)
            && currentModelId !== preferredModelId
            && allowedModelIdSet.has(preferredModelId)
        );
        if (!currentModelId || !allowedModelIdSet.has(currentModelId) || shouldReplaceDeprioritizedAgentModel) {
            agentPreset.model = preferredModelId;
            changed = true;
        }
    });

    if (changed) {
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        stateManager.bus.publish('app:settingsChanged');
    }

    return changed;
}

function applyPlanModelAccessTransition(profile, options = {}) {
    if (!profile || profile.userId !== activeUserId) return;

    const starterPresetChanged = reconcileUserStarterPresetForProfile(profile, options);
    const projectChanged = reconcileCurrentProjectModelsForProfile(profile, options);

    if (starterPresetChanged && !projectChanged) {
        stateManager.bus.publish('user:settingsUpdated', profile);
    }
}

export function getAllowedModelsForCurrentUser() {
    return getAllowedModelsForProfile(getCurrentUserProfile());
}

export function getPreferredModelIdForCurrentUser(options = {}) {
    return getPreferredTierModelIdForProfile(getCurrentUserProfile(), options);
}

function getDefaultFreeTrialEndsAt(baseTimestamp = Date.now()) {
    return baseTimestamp + (FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

function createEmptyBillingProfile(overrides = {}) {
    return {
        avatarUrl: '',
        billingName: '',
        billingCompany: '',
        billingPhone: '',
        billingAddressLine1: '',
        billingAddressLine2: '',
        billingCity: '',
        billingState: '',
        billingPostalCode: '',
        billingCountry: '',
        ...overrides
    };
}

function getNormalizedStoredBillingProfile(user) {
    const billingProfile = (user?.billingProfile && typeof user.billingProfile === 'object')
        ? user.billingProfile
        : {};

    return createEmptyBillingProfile({
        avatarUrl: String(user?.avatarUrl ?? billingProfile.avatarUrl ?? '').trim(),
        billingName: String(billingProfile.billingName ?? user?.userName ?? '').trim(),
        billingCompany: String(billingProfile.billingCompany ?? '').trim(),
        billingPhone: String(billingProfile.billingPhone ?? '').trim(),
        billingAddressLine1: String(billingProfile.billingAddressLine1 ?? '').trim(),
        billingAddressLine2: String(billingProfile.billingAddressLine2 ?? '').trim(),
        billingCity: String(billingProfile.billingCity ?? '').trim(),
        billingState: String(billingProfile.billingState ?? '').trim(),
        billingPostalCode: String(billingProfile.billingPostalCode ?? '').trim(),
        billingCountry: String(billingProfile.billingCountry ?? '').trim()
    });
}

function ensureBillingProfileShape(user) {
    if (!user || typeof user !== 'object') return false;

    let changed = false;
    const normalizedBillingProfile = getNormalizedStoredBillingProfile(user);
    if (user.avatarUrl !== normalizedBillingProfile.avatarUrl) {
        user.avatarUrl = normalizedBillingProfile.avatarUrl;
        changed = true;
    }
    if (JSON.stringify(user.billingProfile) !== JSON.stringify(normalizedBillingProfile)) {
        user.billingProfile = normalizedBillingProfile;
        changed = true;
    }

    return changed;
}

/**
 * Reloads the in-memory database from localStorage and notifies the app.
 * This is a lightweight refresh for cross-tab syncing.
 */
export function reloadDatabaseFromStorage() {
    const storedDb = localStorage.getItem(USER_DB_KEY);
    if (storedDb) {
        let needsSave = false;
        const parsedDatabase = JSON.parse(storedDb);
        const mergedDatabase = AuthService.isSupabaseEnabled()
            ? mergeUserCollections(userDatabase, parsedDatabase)
            : parsedDatabase;

        userDatabase = mergedDatabase
            .map(user => JSON.parse(JSON.stringify(user)))
            .map(user => {
                const migrated = migrateUserObject(user);
                if (migrated.needsSave) needsSave = true;
                return migrated.user;
            });

        if (ensureAdminUserExists()) {
            needsSave = true;
        }
        if (pruneDefaultDemoUsersForSupabase()) {
            needsSave = true;
        }

        if (needsSave) {
            localStorage.setItem(USER_DB_KEY, JSON.stringify(userDatabase));
        }
        // Notify the app that settings have been updated
        stateManager.bus.publish('user:settingsUpdated', getCurrentUserProfile());
        console.log("Cross-tab sync: In-memory user database reloaded.");
    }
}

// --- Helper function to create a default user object ---
function createDefaultUser(userId, userName, email, plan, initialCredits = 0, options = {}) {
    const normalizedPlan = normalizePlanCode(plan);
    const normalizedRole = String(options.role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
    const initialMonthlyCredits = (normalizedPlan === 'free' || normalizedPlan === 'pro') ? initialCredits : 0;
    const initialTopupCredits = normalizedPlan === 'studio' ? initialCredits : 0;
    const user = {
        userId: normalizeStoredUserId(userId),
        userName: userName,
        email: email,
        role: normalizedRole,
        plan: normalizedPlan,
        planStatus: "active",
        gracePeriodStartDate: null,
        trialEndsAt: normalizedPlan === 'free' ? getDefaultFreeTrialEndsAt() : null,
        accessPassExpiresAt: null,
        credits: {
            current: initialCredits,
            monthly: initialMonthlyCredits,
            topup: initialTopupCredits,
            monthlyExpiresAt: normalizedPlan === 'free' ? new Date(getDefaultFreeTrialEndsAt()).toISOString() : null,
            totalUsage: 0,
            totalRefilledUSD: 0,
            tokenUsage: { prompt: 0, completion: 0 },
            totalUsedUSD: 0
        },
        subscriptionEndDate: null, // เพิ่ม property นี้
        avatarUrl: '',
        billingProfile: createEmptyBillingProfile({
            billingName: userName
        }),
        logs: [{ timestamp: Date.now(), action: `Account created with ${normalizedRole === 'admin' ? 'Admin' : normalizedPlan} plan.` }],
        activityLog: [],
        apiSettings: {
            openrouterKey: "",
            ollamaBaseUrl: "http://localhost:11434",
            kieAiApiKey: "",
            providerEnabled: { ...DEFAULT_PROVIDER_ENABLED }
        },
        appSettings: { activeModelPreset: 'my_first_preset' }
    };
    if (normalizedRole !== 'admin') {
        user.modelPresets = { 'my_first_preset': { name: 'My First Preset', modelIds: [] } };
    }
    return user;
}

function getRoleFromExternalAuthUser(authUser) {
    const explicitRole = String(authUser?.role || '').trim().toLowerCase();
    if (explicitRole) return explicitRole;

    const appRole = String(authUser?.app_metadata?.role || '').trim().toLowerCase();
    if (appRole) return appRole;

    const userRole = String(authUser?.user_metadata?.role || '').trim().toLowerCase();
    if (userRole) return userRole;

    return 'user';
}

function getDisplayNameFromExternalAuthUser(authUser) {
    const explicitName = String(
        authUser?.display_name
        || authUser?.full_name
        || authUser?.name
        || authUser?.user_metadata?.display_name
        || authUser?.user_metadata?.full_name
        || authUser?.user_metadata?.name
        || ''
    ).trim();
    if (explicitName) return explicitName;

    const email = String(authUser?.email || '').trim();
    if (email) return email.split('@')[0];

    return 'User';
}

function getShadowUserIdFromExternalAuthUser(authUser) {
    const authUserId = String(authUser?.id || '').trim();
    if (!authUserId) return '';
    return `sb_${authUserId}`;
}

function getShadowUserIdFromBackendUserId(backendUserId) {
    const normalizedBackendUserId = String(backendUserId || '').trim();
    if (!normalizedBackendUserId) return '';
    return `sb_${normalizedBackendUserId}`;
}

function removeDuplicateSupabaseShadowUsersForExternalAccount(backendUserId, keepUserId = '') {
    const normalizedBackendUserId = String(backendUserId || '').trim();
    if (!normalizedBackendUserId) return false;

    const derivedShadowUserId = getShadowUserIdFromBackendUserId(normalizedBackendUserId);
    const normalizedKeepUserId = String(keepUserId || '').trim();
    const nextDatabase = userDatabase.filter((user) => {
        const userId = String(user?.userId || '').trim();
        if (userId && userId === normalizedKeepUserId) {
            return true;
        }

        const linkedBackendUserId = String(
            user?.externalAuthUserId
            || user?.backendAccount?.userId
            || ''
        ).trim();

        if (linkedBackendUserId && linkedBackendUserId === normalizedBackendUserId) {
            return false;
        }

        if (derivedShadowUserId && userId === derivedShadowUserId && userId !== normalizedKeepUserId) {
            return false;
        }

        return true;
    });

    if (nextDatabase.length === userDatabase.length) {
        return false;
    }

    userDatabase = nextDatabase;
    return true;
}

function normalizeNumericValue(rawValue, fallback = 0) {
    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function convertMicrocreditsToUSDValue(microcredits) {
    const billingInfo = getSystemBillingInfo();
    const markupRate = Number(billingInfo?.markupRate) || 0;
    if (!markupRate) return 0;
    return normalizeNumericValue(microcredits, 0) / (markupRate * 1000000);
}

function mapBackendStatusToLocalPlanStatus(accountStatus, status) {
    const normalizedAccountStatus = String(accountStatus || '').trim().toLowerCase();
    const normalizedStatus = String(status || 'active').trim().toLowerCase();
    if (normalizedAccountStatus === 'paid_suspended') return 'expired';
    if (normalizedStatus === 'grace') return 'grace_period';
    if (normalizedStatus === 'suspended') return 'expired';
    return 'active';
}

function mapBackendPlanCodeToLocalPlan(planCode, role = 'user') {
    return normalizePlanCode(planCode);
}

function buildBackendAccountMetadata(snapshot) {
    const authUser = snapshot?.authUser || null;
    const profileRow = snapshot?.profile || null;
    const walletRow = snapshot?.wallet || null;
    const planRow = snapshot?.plan || null;
    const role = getRoleFromExternalAuthUser(authUser || profileRow);
    const planCode = String(profileRow?.plan_code || 'free').trim().toLowerCase() || 'free';
    const trialEndsAt = profileRow?.trial_expires_at
        || (planCode === 'free' && profileRow?.created_at
            ? new Date(new Date(profileRow.created_at).getTime() + (FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000)).toISOString()
            : null);
    let accountStatus = String(profileRow?.account_status || '').trim().toLowerCase() || (planCode === 'pro' ? 'pro_active' : (planCode === 'studio' ? 'studio_active' : 'free'));
    if (
        accountStatus === 'studio_active'
        && profileRow?.access_pass_expires_at
        && Number.isFinite(new Date(profileRow.access_pass_expires_at).getTime())
        && new Date(profileRow.access_pass_expires_at).getTime() <= Date.now()
    ) {
        accountStatus = 'paid_suspended';
    }

    return {
        provider: 'supabase',
        userId: String(authUser?.id || profileRow?.id || '').trim(),
        role,
        status: String(profileRow?.status || 'active').trim().toLowerCase() || 'active',
        accountStatus,
        planCode,
        planName: role === 'admin' ? 'Admin' : String(planRow?.name || planCode || 'Free'),
        trialEndsAt,
        accessPassExpiresAt: profileRow?.access_pass_expires_at || null,
        balanceMicrocredits: normalizeNumericValue(walletRow?.balance_microcredits, 0),
        monthlyCreditBalanceMicrocredits: normalizeNumericValue(walletRow?.monthly_credit_balance_microcredits, 0),
        topupCreditBalanceMicrocredits: normalizeNumericValue(walletRow?.topup_credit_balance_microcredits, 0),
        monthlyCreditExpiresAt: walletRow?.monthly_credit_expires_at || null,
        profileUpdatedAt: profileRow?.updated_at || null,
        walletUpdatedAt: walletRow?.updated_at || null,
        syncedAt: new Date().toISOString()
    };
}

function assignIfChanged(target, key, nextValue) {
    const currentValue = target?.[key];
    if (JSON.stringify(currentValue) === JSON.stringify(nextValue)) {
        return false;
    }
    target[key] = nextValue;
    return true;
}

function syncSupabaseSnapshotIntoLocalUser(localUserId, snapshot) {
    const localUser = userDatabase.find(user => user?.userId === localUserId) || null;
    if (!localUser) return null;

    const previousPlanCode = String(localUser.backendAccount?.planCode || localUser.plan || 'free').trim().toLowerCase() || 'free';
    const authUser = snapshot?.authUser || null;
    const profileRow = snapshot?.profile || null;
    const walletRow = snapshot?.wallet || null;
    const planRow = snapshot?.plan || null;
    const role = getRoleFromExternalAuthUser(authUser || profileRow);
    const nextBackendMetadata = buildBackendAccountMetadata({ authUser, profile: profileRow, wallet: walletRow, plan: planRow });
    const existingCredits = (localUser.credits && typeof localUser.credits === 'object') ? localUser.credits : {};
    const existingBillingProfile = getNormalizedStoredBillingProfile(localUser);
    const nextDisplayName = String(
        profileRow?.display_name
        || getDisplayNameFromExternalAuthUser(authUser)
        || localUser.userName
        || 'User'
    ).trim();
    const nextEmail = String(
        profileRow?.email
        || authUser?.email
        || localUser.email
        || ''
    ).trim();
    const nextAvatarUrl = String(
        profileRow?.avatar_url
        || authUser?.user_metadata?.avatar_url
        || existingBillingProfile.avatarUrl
        || ''
    ).trim();
    const nextBillingProfile = createEmptyBillingProfile({
        avatarUrl: nextAvatarUrl,
        billingName: String(profileRow?.billing_name || existingBillingProfile.billingName || nextDisplayName || '').trim(),
        billingCompany: String(profileRow?.billing_company || existingBillingProfile.billingCompany || '').trim(),
        billingPhone: String(profileRow?.billing_phone || existingBillingProfile.billingPhone || '').trim(),
        billingAddressLine1: String(profileRow?.billing_address_line1 || existingBillingProfile.billingAddressLine1 || '').trim(),
        billingAddressLine2: String(profileRow?.billing_address_line2 || existingBillingProfile.billingAddressLine2 || '').trim(),
        billingCity: String(profileRow?.billing_city || existingBillingProfile.billingCity || '').trim(),
        billingState: String(profileRow?.billing_state || existingBillingProfile.billingState || '').trim(),
        billingPostalCode: String(profileRow?.billing_postal_code || existingBillingProfile.billingPostalCode || '').trim(),
        billingCountry: String(profileRow?.billing_country || existingBillingProfile.billingCountry || '').trim()
    });
    const nextCredits = {
        current: normalizeNumericValue(walletRow?.balance_microcredits, normalizeNumericValue(existingCredits.current, 0)),
        totalUsage: normalizeNumericValue(walletRow?.lifetime_consumed_microcredits, normalizeNumericValue(existingCredits.totalUsage, 0)),
        totalRefilledUSD: convertMicrocreditsToUSDValue(walletRow?.lifetime_purchased_microcredits),
        monthly: normalizeNumericValue(walletRow?.monthly_credit_balance_microcredits, normalizeNumericValue(existingCredits.monthly, 0)),
        topup: normalizeNumericValue(walletRow?.topup_credit_balance_microcredits, normalizeNumericValue(existingCredits.topup, 0)),
        monthlyExpiresAt: walletRow?.monthly_credit_expires_at || existingCredits.monthlyExpiresAt || null,
        tokenUsage: (existingCredits.tokenUsage && typeof existingCredits.tokenUsage === 'object')
            ? existingCredits.tokenUsage
            : { prompt: 0, completion: 0 },
        totalUsedUSD: convertMicrocreditsToUSDValue(walletRow?.lifetime_consumed_microcredits)
    };

    let changed = false;
    changed = assignIfChanged(localUser, 'authSource', 'supabase') || changed;
    changed = assignIfChanged(localUser, 'externalAuthUserId', String(authUser?.id || '').trim()) || changed;
    changed = assignIfChanged(localUser, 'userName', nextDisplayName) || changed;
    changed = assignIfChanged(localUser, 'email', nextEmail) || changed;
    changed = assignIfChanged(localUser, 'avatarUrl', nextAvatarUrl) || changed;
    changed = assignIfChanged(localUser, 'billingProfile', nextBillingProfile) || changed;
    changed = assignIfChanged(localUser, 'plan', mapBackendPlanCodeToLocalPlan(profileRow?.plan_code, role)) || changed;
    changed = assignIfChanged(localUser, 'planStatus', role === 'admin' ? 'active' : mapBackendStatusToLocalPlanStatus(profileRow?.account_status, profileRow?.status)) || changed;
    changed = assignIfChanged(
        localUser,
        'trialEndsAt',
        normalizePlanCode(profileRow?.plan_code || 'free') === 'free'
            ? nextBackendMetadata.trialEndsAt
            : null
    ) || changed;
    changed = assignIfChanged(localUser, 'accessPassExpiresAt', nextBackendMetadata.accessPassExpiresAt) || changed;
    changed = assignIfChanged(localUser, 'subscriptionEndDate', nextBackendMetadata.accessPassExpiresAt || localUser.subscriptionEndDate || null) || changed;
    changed = assignIfChanged(localUser, 'credits', nextCredits) || changed;
    changed = assignIfChanged(localUser, 'backendAccount', nextBackendMetadata) || changed;

    if (ensureUserApiSettingsShape(localUser)) {
        changed = true;
    }
    if (ensureBillingProfileShape(localUser)) {
        changed = true;
    }

    if (changed) {
        saveUserDatabase({ publish: false });
    }

    const nextPlanCode = String(localUser.backendAccount?.planCode || localUser.plan || 'free').trim().toLowerCase() || 'free';
    const planChanged = normalizePlanTier(previousPlanCode) !== normalizePlanTier(nextPlanCode);
    if (localUser.userId === activeUserId) {
        applyPlanModelAccessTransition(localUser, {
            previousPlanCode,
            preferTierPromotion: planChanged && normalizePlanTier(nextPlanCode) === 'pro'
        });
    }

    return localUser;
}

function ensureLocalUserForBackendSnapshot(snapshot) {
    const authUser = snapshot?.authUser || null;
    const profileRow = snapshot?.profile || null;
    const walletRow = snapshot?.wallet || null;
    const backendUserId = String(authUser?.id || profileRow?.id || '').trim();
    const role = getRoleFromExternalAuthUser(authUser || profileRow);

    if (!backendUserId) return '';

    if (role === 'admin') {
        ensureAdminUserExists();
        removeDuplicateSupabaseShadowUsersForExternalAccount(backendUserId, ADMIN_USER_ID);
        return ADMIN_USER_ID;
    }

    const existingUser = userDatabase.find(user => (
        String(user?.externalAuthUserId || user?.backendAccount?.userId || '').trim() === backendUserId
        || user?.userId === getShadowUserIdFromBackendUserId(backendUserId)
    ));
    if (existingUser?.userId) {
        return existingUser.userId;
    }

    const displayName = String(
        profileRow?.display_name
        || getDisplayNameFromExternalAuthUser(authUser)
        || profileRow?.email
        || authUser?.email
        || 'User'
    ).trim();
    const email = String(profileRow?.email || authUser?.email || '').trim() || 'unknown@example.com';
    const localUserId = getShadowUserIdFromBackendUserId(backendUserId);
    if (!localUserId) return '';

    const localUser = createDefaultUser(
        localUserId,
        displayName,
        email,
        mapBackendPlanCodeToLocalPlan(profileRow?.plan_code, role),
        normalizeNumericValue(walletRow?.balance_microcredits, 0)
    );
    localUser.authSource = 'supabase';
    localUser.externalAuthUserId = backendUserId;
    localUser.logs.push({
        timestamp: Date.now(),
        action: 'Shadow profile synced from Supabase admin directory.'
    });
    userDatabase.push(localUser);
    return localUserId;
}


// function migrateUserObject(user) {
//     let needsSave = false;
//     const newUser = { ...user };

//     // Ensure credits object and its properties exist
//     if (typeof newUser.credits !== 'object' || newUser.credits === null) {
//         newUser.credits = {
//             current: typeof newUser.credits === 'number' ? newUser.credits : 0,
//             totalUsage: 0,
//             totalRefilledUSD: 0,
//             tokenUsage: { prompt: 0, completion: 0 }
//         };
//         needsSave = true;
//     }
    
//     // [FIX] Ensure the new tokenUsage and activityLog properties exist
//     if (typeof newUser.credits.tokenUsage !== 'object') {
//         newUser.credits.tokenUsage = { prompt: 0, completion: 0 };
//         needsSave = true;
//     }
//     if (!Array.isArray(newUser.activityLog)) {
//         newUser.activityLog = [];
//         needsSave = true;
//     }

//     if (!Array.isArray(newUser.logs)) {
//         newUser.logs = [{ timestamp: Date.now(), action: 'Log initialized.' }];
//         needsSave = true;
//     }
    
//     return { user: newUser, needsSave: needsSave };
// }

function normalizeApiKey(rawValue) {
    if (typeof rawValue !== 'string') return '';
    const trimmed = rawValue.trim();
    if (!trimmed) return '';
    return trimmed.replace(/^Bearer\s+/i, '').trim();
}

function normalizeOllamaBaseUrl(rawValue) {
    if (typeof rawValue !== 'string') return '';
    let value = rawValue.trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) {
        value = `http://${value}`;
    }
    return value.replace(/\/+$/, '');
}

function normalizeProviderEnabled(rawValue) {
    const source = (rawValue && typeof rawValue === 'object') ? rawValue : {};
    return {
        openrouter: source.openrouter !== false,
        ollama: source.ollama !== false,
        kieai: source.kieai !== false
    };
}

function getNormalizedApiSettings(user) {
    const apiSettings = (user?.apiSettings && typeof user.apiSettings === 'object') ? user.apiSettings : {};
    const rawOllamaBaseUrl = apiSettings.ollamaBaseUrl ?? user?.ollamaBaseUrl;
    return {
        openrouterKey: normalizeApiKey(apiSettings.openrouterKey ?? user?.openrouterKey ?? user?.apiKey ?? ''),
        ollamaBaseUrl: normalizeOllamaBaseUrl(rawOllamaBaseUrl === undefined ? 'http://localhost:11434' : rawOllamaBaseUrl),
        kieAiApiKey: normalizeApiKey(apiSettings.kieAiApiKey ?? user?.kieAiApiKey ?? ''),
        providerEnabled: normalizeProviderEnabled(apiSettings.providerEnabled ?? user?.apiProviderEnabled)
    };
}

function ensureUserApiSettingsShape(user) {
    if (!user || typeof user !== 'object') return false;

    let changed = false;
    if (!user.apiSettings || typeof user.apiSettings !== 'object') {
        user.apiSettings = {};
        changed = true;
    }

    const normalized = getNormalizedApiSettings(user);
    if (user.apiSettings.openrouterKey !== normalized.openrouterKey) {
        user.apiSettings.openrouterKey = normalized.openrouterKey;
        changed = true;
    }
    if (user.apiSettings.ollamaBaseUrl !== normalized.ollamaBaseUrl) {
        user.apiSettings.ollamaBaseUrl = normalized.ollamaBaseUrl;
        changed = true;
    }
    if (user.apiSettings.kieAiApiKey !== normalized.kieAiApiKey) {
        user.apiSettings.kieAiApiKey = normalized.kieAiApiKey;
        changed = true;
    }
    const currentProviderEnabled = normalizeProviderEnabled(user.apiSettings.providerEnabled);
    if (
        currentProviderEnabled.openrouter !== normalized.providerEnabled.openrouter ||
        currentProviderEnabled.ollama !== normalized.providerEnabled.ollama ||
        currentProviderEnabled.kieai !== normalized.providerEnabled.kieai
    ) {
        user.apiSettings.providerEnabled = normalized.providerEnabled;
        changed = true;
    }

    return changed;
}

function migrateUserObject(user) {
    let needsSave = false;

    if (!user || typeof user !== 'object') {
        return { user, needsSave };
    }

    if (user.userId === LEGACY_ADMIN_USER_ID) {
        user.userId = ADMIN_USER_ID;
        needsSave = true;
    }

    if (!user.role) {
        user.role = user.userId === ADMIN_USER_ID ? 'admin' : 'user';
        needsSave = true;
    }

    const normalizedPlan = normalizePlanCode(user.plan || 'free');
    if (user.plan !== normalizedPlan) {
        user.plan = normalizedPlan;
        needsSave = true;
    }

    if (user.role === 'admin' && user.plan !== 'studio') {
        user.plan = 'studio';
        needsSave = true;
    }

    if (!user.credits || typeof user.credits !== 'object') {
        user.credits = { current: 0, totalUsage: 0, totalRefilledUSD: 0, tokenUsage: { prompt: 0, completion: 0 }, totalUsedUSD: 0 };
        needsSave = true;
    }
    if (!Number.isFinite(Number(user.credits.monthly))) {
        user.credits.monthly = ['free', 'pro'].includes(user.plan) ? Number(user.credits.current || 0) : 0;
        needsSave = true;
    }
    if (!Number.isFinite(Number(user.credits.topup))) {
        user.credits.topup = user.plan === 'studio' ? Number(user.credits.current || 0) : 0;
        needsSave = true;
    }
    if (!Object.prototype.hasOwnProperty.call(user.credits, 'monthlyExpiresAt')) {
        user.credits.monthlyExpiresAt = user.plan === 'free' && user.trialEndsAt
            ? new Date(user.trialEndsAt).toISOString()
            : null;
        needsSave = true;
    }
    if (!user.credits.tokenUsage || typeof user.credits.tokenUsage !== 'object') {
        user.credits.tokenUsage = { prompt: 0, completion: 0 };
        needsSave = true;
    }
    if (!Array.isArray(user.activityLog)) {
        user.activityLog = [];
        needsSave = true;
    }
    if (ensureBillingProfileShape(user)) {
        needsSave = true;
    }

    // Backward compatibility for legacy saved profiles.
    if ((!user.apiSettings || typeof user.apiSettings !== 'object') && (user.apiKey || user.openrouterKey || user.ollamaBaseUrl || user.kieAiApiKey)) {
        user.apiSettings = {};
        needsSave = true;
    }

    if (ensureUserApiSettingsShape(user)) {
        needsSave = true;
    }

    if (user.plan === 'free') {
        if (!user.trialEndsAt) {
            const firstLogTimestamp = Number(user.logs?.[0]?.timestamp);
            user.trialEndsAt = getDefaultFreeTrialEndsAt(
                Number.isFinite(firstLogTimestamp) ? firstLogTimestamp : Date.now()
            );
            needsSave = true;
        }
    } else if (user.trialEndsAt) {
        user.trialEndsAt = null;
        needsSave = true;
    }

    if (!Object.prototype.hasOwnProperty.call(user, 'accessPassExpiresAt')) {
        user.accessPassExpiresAt = null;
        needsSave = true;
    }

    // Remove legacy duplicated keys after migration to avoid future ambiguity.
    for (const legacyKey of ['apiKey', 'openrouterKey', 'ollamaBaseUrl', 'kieAiApiKey', 'apiProviderEnabled']) {
        if (Object.prototype.hasOwnProperty.call(user, legacyKey)) {
            delete user[legacyKey];
            needsSave = true;
        }
    }

    return { user, needsSave };
}

function bootstrapDefaultUsers() {
    userDatabase = AuthService.isSupabaseEnabled()
        ? [
            createDefaultUser(ADMIN_USER_ID, 'Admin', 'admin@example.com', 'studio', 0, { role: 'admin' })
        ]
        : [
            createDefaultUser('user_pro', 'Kaiwan (Pro)', 'kai@example.com', 'pro', PRO_INCLUDED_MICROCREDITS),
            createDefaultUser('user_free', 'Demo User (Free)', 'demo@example.com', 'free', FREE_TRIAL_MICROCREDITS),
            createDefaultUser(ADMIN_USER_ID, 'Admin', 'admin@example.com', 'studio', 0, { role: 'admin' })
        ];
    localStorage.setItem(USER_DB_KEY, JSON.stringify(userDatabase));
}

function pruneDefaultDemoUsersForSupabase() {
    if (!AuthService.isSupabaseEnabled()) return false;

    const nextDatabase = userDatabase.filter(user => !['user_pro', 'user_free'].includes(user?.userId));
    if (nextDatabase.length === userDatabase.length) {
        return false;
    }

    userDatabase = nextDatabase;
    return true;
}

function ensureAdminUserExists() {
    const adminUser = userDatabase.find(user => user?.userId === ADMIN_USER_ID);
    if (!adminUser) {
        userDatabase.push(createDefaultUser(ADMIN_USER_ID, 'Admin', 'admin@example.com', 'studio', 0, { role: 'admin' }));
        return true;
    }

    let changed = false;
    if (adminUser.role !== 'admin') {
        adminUser.role = 'admin';
        changed = true;
    }
    if (adminUser.plan !== 'studio') {
        adminUser.plan = 'studio';
        changed = true;
    }
    if (adminUser.planStatus !== 'active') {
        adminUser.planStatus = 'active';
        changed = true;
    }
    if (!adminUser.userName) {
        adminUser.userName = 'Admin';
        changed = true;
    }
    if (!adminUser.email) {
        adminUser.email = 'admin@example.com';
        changed = true;
    }
    if (ensureUserApiSettingsShape(adminUser)) {
        changed = true;
    }
    return changed;
}

function loadUserDatabase() {
    const storedDb = localStorage.getItem(USER_DB_KEY);
    if (!storedDb) {
        bootstrapDefaultUsers();
        return;
    }

    try {
        const parsed = JSON.parse(storedDb);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            console.warn("User database is empty or invalid. Rebuilding default users.");
            bootstrapDefaultUsers();
            return;
        }

        let needsSave = false;
        userDatabase = parsed
            .map(user => JSON.parse(JSON.stringify(user)))
            .map(user => {
                const migrated = migrateUserObject(user);
                if (migrated.needsSave) needsSave = true;
                return migrated.user;
            });

        if (ensureAdminUserExists()) {
            needsSave = true;
        }
        if (pruneDefaultDemoUsersForSupabase()) {
            needsSave = true;
        }

        if (needsSave) {
            localStorage.setItem(USER_DB_KEY, JSON.stringify(userDatabase));
        }
    } catch (error) {
        console.error("Failed to parse user database. Rebuilding default users.", error);
        bootstrapDefaultUsers();
    }
}

function saveUserDatabase(options = {}) {
    let databaseToPersist = userDatabase;

    if (AuthService.isSupabaseEnabled() && options.mergeStoredDb !== false) {
        try {
            const storedDb = localStorage.getItem(USER_DB_KEY);
            if (storedDb) {
                databaseToPersist = mergeUserCollections(JSON.parse(storedDb), userDatabase);
                userDatabase = databaseToPersist;
            }
        } catch (error) {
            console.error('Failed to merge the Supabase shadow user database before saving.', error);
        }
    }

    localStorage.setItem(USER_DB_KEY, JSON.stringify(databaseToPersist));
    if (options.publish !== false) {
        stateManager.bus.publish('user:settingsUpdated', getCurrentUserProfile());
    }
}


// --- MOCK LOGIN / USER SWITCHING ---
export function setActiveUserId(userId) {
    if (userDatabase.length === 0) {
        loadUserDatabase();
    }

    const normalizedUserId = normalizeStoredUserId(userId);
    if (!normalizedUserId) {
        console.warn('setActiveUserId called with empty userId');
        return null;
    }

    const targetUser = userDatabase.find(user => user?.userId === normalizedUserId) || null;
    if (!targetUser) {
        console.warn(`setActiveUserId could not find user: ${normalizedUserId}`);
        return null;
    }

    activeUserId = normalizedUserId;
    try {
        // Primary key used by the app.
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, normalizedUserId);
        // One-shot override to survive reload-time race/overwrite scenarios.
        localStorage.setItem(PENDING_ACTIVE_USER_STORAGE_KEY, normalizedUserId);
    } catch (error) {
        console.error('Failed to persist active user ID to localStorage:', error);
    }

    console.log(`👤 Active user switched to: ${normalizedUserId}`);

    const profile = getCurrentUserProfile();
    if (profile) {
        stateManager.bus.publish('user:settingsLoaded', profile);
        stateManager.bus.publish('user:settingsUpdated', profile);
    }

    return profile;
}

// --- Admin-specific Functions ---
export function getAllUsers() {
    return JSON.parse(JSON.stringify(userDatabase));
}

export function getUserById(userId) {
    const user = userDatabase.find(u => u.userId === userId);
    // Return a deep copy of the user
    return user ? JSON.parse(JSON.stringify(user)) : null;
}


export function updateUser(userId, updates) {
    const userIndex = userDatabase.findIndex(u => u.userId === userId);
    if (userIndex !== -1) {
        if (updates.plan !== undefined) userDatabase[userIndex].plan = updates.plan;
        if (updates.credits !== undefined) userDatabase[userIndex].credits = updates.credits;
        if (updates.plan !== undefined && userDatabase[userIndex].planStatus !== 'active') {
            userDatabase[userIndex].planStatus = 'active';
            userDatabase[userIndex].gracePeriodStartDate = null;
        }
        saveUserDatabase();
    }
}

// --- Functions for the MAIN APP ---

export function getUserSettings() {
    return getCurrentUserProfile();
}


export function getCurrentUserProfile() {
    if (userDatabase.length === 0) loadUserDatabase();
    let profile = userDatabase.find(u => u.userId === activeUserId) || null;
    if (!profile && userDatabase.length > 0) {
        activeUserId = userDatabase[0].userId;
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, activeUserId);
        profile = userDatabase[0];
    }
    return profile;
}

export function isBackendManagedProfile(profile = null) {
    const target = profile || getCurrentUserProfile();
    return String(target?.authSource || '').trim().toLowerCase() === 'supabase';
}

export function syncShadowUserFromExternalAuth(authUser, options = {}) {
    if (!authUser || typeof authUser !== 'object') return null;

    if (userDatabase.length === 0) {
        loadUserDatabase();
    }

    const role = getRoleFromExternalAuthUser(authUser);
    const displayName = getDisplayNameFromExternalAuthUser(authUser);
    const email = String(authUser.email || '').trim() || 'unknown@example.com';
    const shouldPublish = options.publish !== false;
    const initialCredits = Number.isFinite(Number(options.defaultCredits))
        ? Number(options.defaultCredits)
        : FREE_TRIAL_MICROCREDITS;

    if (role === 'admin') {
        ensureAdminUserExists();
        const adminUser = userDatabase.find(user => user?.userId === ADMIN_USER_ID);
        if (!adminUser) return null;

        let changed = false;
        changed = removeDuplicateSupabaseShadowUsersForExternalAccount(String(authUser?.id || '').trim(), ADMIN_USER_ID) || changed;
        changed = assignIfChanged(adminUser, 'authSource', 'supabase') || changed;
        changed = assignIfChanged(adminUser, 'externalAuthUserId', String(authUser?.id || '').trim()) || changed;
        if (displayName && adminUser.userName !== displayName) {
            adminUser.userName = displayName;
            changed = true;
        }
        if (email && adminUser.email !== email) {
            adminUser.email = email;
            changed = true;
        }
        if (changed) {
            saveUserDatabase({ publish: shouldPublish });
        }
        return ADMIN_USER_ID;
    }

    const shadowUserId = getShadowUserIdFromExternalAuthUser(authUser);
    if (!shadowUserId) return null;

    let shadowUser = userDatabase.find(user => user?.userId === shadowUserId) || null;
    if (!shadowUser) {
        shadowUser = createDefaultUser(shadowUserId, displayName, email, 'free', initialCredits);
        shadowUser.logs.push({
            timestamp: Date.now(),
            action: 'Shadow profile bootstrapped from Supabase auth session.'
        });
        userDatabase.push(shadowUser);
        saveUserDatabase({ publish: shouldPublish });
        return shadowUserId;
    }

    let changed = false;
    if (displayName && shadowUser.userName !== displayName) {
        shadowUser.userName = displayName;
        changed = true;
    }
    if (email && shadowUser.email !== email) {
        shadowUser.email = email;
        changed = true;
    }

    if (changed) {
        saveUserDatabase({ publish: shouldPublish });
    }

    return shadowUserId;
}

export async function refreshCurrentUserFromBackend(authUser = null, options = {}) {
    if (!AuthService.isSupabaseEnabled()) {
        return getCurrentUserProfile();
    }

    let currentAuthUser = authUser;
    if (!currentAuthUser) {
        const { data, error } = await AuthService.getCurrentUser();
        if (error) {
            console.error('Failed to resolve the current Supabase user.', error);
            return getCurrentUserProfile();
        }
        currentAuthUser = data.user;
    }

    if (!currentAuthUser) {
        return getCurrentUserProfile();
    }

    const localUserId = options.localUserId || syncShadowUserFromExternalAuth(currentAuthUser, { publish: false });
    if (!localUserId) {
        return getCurrentUserProfile();
    }

    const { data, error } = await getCurrentAccountSnapshot(currentAuthUser);
    if (error) {
        console.error('Failed to load the Supabase account snapshot.', error);
        return getCurrentUserProfile();
    }

    if (!data) {
        return getCurrentUserProfile();
    }

    const syncedProfile = syncSupabaseSnapshotIntoLocalUser(localUserId, data) || getCurrentUserProfile();
    if (options.publish !== false && syncedProfile) {
        stateManager.bus.publish('user:settingsLoaded', syncedProfile);
        stateManager.bus.publish('user:settingsUpdated', syncedProfile);
    }

    return syncedProfile;
}

export function syncBackendUserDirectoryFromSnapshots(snapshots, options = {}) {
    if (userDatabase.length === 0) {
        loadUserDatabase();
    }

    const syncedLocalUserIds = [];

    (Array.isArray(snapshots) ? snapshots : []).forEach((snapshot) => {
        const localUserId = ensureLocalUserForBackendSnapshot(snapshot);
        if (!localUserId) return;

        const syncedProfile = syncSupabaseSnapshotIntoLocalUser(localUserId, snapshot);
        if (syncedProfile?.userId) {
            syncedLocalUserIds.push(syncedProfile.userId);
        }
    });

    if (options.publish !== false) {
        stateManager.bus.publish('user:settingsUpdated', getCurrentUserProfile());
    }

    return Array.from(new Set(syncedLocalUserIds));
}

export async function activateExternalAuthUser(authUser) {
    if (!authUser || typeof authUser !== 'object') return null;
    if (userDatabase.length === 0) {
        loadUserDatabase();
    }

    const localUserId = syncShadowUserFromExternalAuth(authUser, { publish: false });
    if (!localUserId) return null;

    activeUserId = localUserId;
    try {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, localUserId);
        localStorage.setItem(PENDING_ACTIVE_USER_STORAGE_KEY, localUserId);
    } catch (error) {
        console.error('Failed to persist external auth user selection:', error);
    }

    const syncedProfile = await refreshCurrentUserFromBackend(authUser, {
        localUserId,
        publish: false
    });
    const currentProfile = syncedProfile || getCurrentUserProfile();

    if (currentProfile) {
        stateManager.bus.publish('user:settingsLoaded', currentProfile);
        stateManager.bus.publish('user:settingsUpdated', currentProfile);
    }

    return currentProfile;
}

export async function initUserSettings() {
    await loadPlanPresets();
    loadUserDatabase();
    
    const pendingUserId = normalizeStoredUserId(localStorage.getItem(PENDING_ACTIVE_USER_STORAGE_KEY));
    const lastUserId = normalizeStoredUserId(localStorage.getItem(ACTIVE_USER_STORAGE_KEY));
    const preferredUserId = [pendingUserId, lastUserId].find(candidate => (
        candidate && userDatabase.some(u => u.userId === candidate)
    ));

    if (preferredUserId) {
        activeUserId = preferredUserId;
    } else if (!activeUserId || !userDatabase.some(u => u.userId === activeUserId)) {
        if (userDatabase.length > 0) {
            activeUserId = userDatabase[0].userId;
        }
    }

    if (activeUserId) {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, activeUserId);
    } else if (userDatabase.length > 0) {
        activeUserId = userDatabase[0].userId;
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, activeUserId);
    }
    if (pendingUserId) {
        try {
            localStorage.removeItem(PENDING_ACTIVE_USER_STORAGE_KEY);
        } catch (_) {
            // ignore localStorage cleanup failures
        }
    }
    
    const currentUser = getCurrentUserProfile();
    if (currentUser) {
        checkGracePeriod(currentUser);
    }

    console.log("👤 Current User Profile Initialized:", currentUser);
    stateManager.bus.publish('user:settingsLoaded', currentUser);
    return currentUser;
}
/**
 * Converts a user's internal credit balance back to a USD value for display.
 * @param {number} credits The user's internal credit balance.
 * @returns {number} The equivalent value in USD.
 */
export function convertCreditsToUSD(credits) {
    // This uses getSystemBillingInfo, which is correct.
    const billingInfo = getSystemBillingInfo();
    if (!billingInfo || !billingInfo.markupRate || billingInfo.markupRate === 0) {
        return 0;
    }
    return credits / (billingInfo.markupRate * 1000000);
}

// --- [NEW] Credit & Plan Management Logic ---

export function burnCreditsForUsage(usage, modelId, costUSDFromHeader = 0) {
    const user = getCurrentUserProfile();
    if (!user || usesPersonalApiKeys(user)) return;

    const billingInfo = getSystemBillingInfo();
    const markupRate = billingInfo.markupRate || 1.0;
    
    let actualCostUSD = 0;

    // --- [THE FIX] Logic การคำนวณค่าใช้จ่ายตามลำดับความน่าเชื่อถือ ---
    // Priority 1: ใช้ Cost จริงจาก Header ของ OpenRouter ถ้ามี (แม่นยำที่สุด)
    if (costUSDFromHeader > 0) {
        actualCostUSD = costUSDFromHeader;
    }
    // Priority 2: ถ้าไม่มี Cost จาก Header ให้คำนวณจาก Token Count จริงที่ได้จาก API
    else if (usage && usage.prompt_tokens > 0) {
        actualCostUSD = calculateCost(modelId, usage); // ใช้ฟังก์ชันคำนวณที่เรามีอยู่แล้ว
    }
    // Priority 3: (Fallback) ถ้าไม่มีข้อมูลอะไรเลยจริงๆ (เช่น Error) จะไม่หักเงิน
    else {
        console.warn(`Could not determine cost for model ${modelId}. No credits were burned.`);
        return; // ไม่หักเครดิตถ้าคำนวณไม่ได้
    }

    // หักเครดิตตาม Cost จริง x Markup Rate
    const creditsToBurn = actualCostUSD * markupRate * 1000000;
    const currentBuckets = getCreditBucketSummary(user);
    const monthlyCharge = Math.min(currentBuckets.monthlyMicrocredits, creditsToBurn);
    const topupCharge = Math.min(currentBuckets.topupMicrocredits, Math.max(creditsToBurn - monthlyCharge, 0));

    user.credits.monthly = Math.max(currentBuckets.monthlyMicrocredits - monthlyCharge, 0);
    user.credits.topup = Math.max(currentBuckets.topupMicrocredits - topupCharge, 0);
    user.credits.current = user.credits.monthly + user.credits.topup;
    user.credits.totalUsage += (monthlyCharge + topupCharge);

    // บันทึกการใช้จ่ายเป็น USD จริง
    if (!user.credits.totalUsedUSD) user.credits.totalUsedUSD = 0;
    user.credits.totalUsedUSD += actualCostUSD;

    // บันทึก Token Usage จริง
    if (!user.credits.tokenUsage) user.credits.tokenUsage = { prompt: 0, completion: 0 };
    user.credits.tokenUsage.prompt += (usage.prompt_tokens || 0);
    user.credits.tokenUsage.completion += (usage.completion_tokens || 0);

    const balanceAfterUSD = convertCreditsToUSD(user.credits.current);
    user.logs.push({
        timestamp: Date.now(),
        event: 'Usage',
        details: `API Usage on model: ${modelId} (monthly: ${monthlyCharge}, top-up: ${topupCharge})`,
        amountUSD: -actualCostUSD,
        balanceAfterUSD: balanceAfterUSD
    });

    saveUserDatabase();
}

export function downgradeToGracePeriod() {
    const user = getCurrentUserProfile();
    if (!user || user.plan !== 'pro' || user.planStatus !== 'active') return;

    user.planStatus = 'grace_period';
    user.gracePeriodStartDate = Date.now();
    saveUserDatabase();
    showCustomAlert("Your Pro credits have run out. You now have 7 days of Free Plan access before your account is suspended. Please refill your credits.", "Credits Depleted");
}

/**
 * [FIX] This function now takes a user object as an argument.
 * It no longer calls getCurrentUserProfile itself.
 * @param {object} user - The user object to check.
 */
function checkGracePeriod(user) {
    if (!user || user.planStatus !== 'grace_period') return;

    const sevenDaysInMillis = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - user.gracePeriodStartDate > sevenDaysInMillis) {
        user.planStatus = 'expired';
        saveUserDatabase();
        showCustomAlert("Your grace period has expired. Please refill your credits to continue using the service.", "Account Suspended");
    }
}

// --- [FIX] Re-add getSystemApiSettings and ensure it's exported ---
export function getSystemApiSettings() {
    const adminUser = userDatabase.find(u => u.userId === ADMIN_USER_ID);
    return getNormalizedApiSettings(adminUser);
}

function resolveProviderEnabledForCurrentUser(provider) {
    const profile = getCurrentUserProfile();
    const adminUser = userDatabase.find(u => u.userId === ADMIN_USER_ID);
    const profileSettings = getNormalizedApiSettings(profile);
    const adminSettings = getNormalizedApiSettings(adminUser);

    if (usesPersonalApiKeys(profile)) {
        return profileSettings.providerEnabled[provider];
    }
    return adminSettings.providerEnabled[provider];
}

export function isApiProviderEnabled(provider, options = {}) {
    const normalizedProvider = String(provider || '').toLowerCase();
    const useSystemSettings = options?.useSystemSettings === true;
    if (!['openrouter', 'ollama', 'kieai'].includes(normalizedProvider)) return false;

    if (useSystemSettings) {
        return getSystemApiSettings().providerEnabled[normalizedProvider] !== false;
    }

    return resolveProviderEnabledForCurrentUser(normalizedProvider) !== false;
}

// --- Specific Getters and Setters ---
// [✅ NEW: Getter สำหรับ Kie.ai Key]
export function getKieAiApiKey() {
    if (!isApiProviderEnabled('kieai')) {
        return '';
    }
    const profile = getCurrentUserProfile();
    const adminUser = userDatabase.find(u => u.userId === ADMIN_USER_ID);
    const profileSettings = getNormalizedApiSettings(profile);
    const adminSettings = getNormalizedApiSettings(adminUser);

    if (usesPersonalApiKeys(profile)) {
        return profileSettings.kieAiApiKey;
    }
    // Fallback to own profile key if admin key is not configured.
    return adminSettings.kieAiApiKey || profileSettings.kieAiApiKey || '';
}

export function getApiKey() {
    if (!isApiProviderEnabled('openrouter')) {
        return '';
    }
    const profile = getCurrentUserProfile();
    const adminUser = userDatabase.find(u => u.userId === ADMIN_USER_ID);
    const profileSettings = getNormalizedApiSettings(profile);
    const adminSettings = getNormalizedApiSettings(adminUser);

    if (usesPersonalApiKeys(profile)) {
        return profileSettings.openrouterKey;
    }

    return adminSettings.openrouterKey || profileSettings.openrouterKey || '';
}

export function getOllamaUrl() {
    if (!isApiProviderEnabled('ollama')) {
        return '';
    }
    const profile = getCurrentUserProfile();
    const adminUser = userDatabase.find(u => u.userId === ADMIN_USER_ID);
    const profileSettings = getNormalizedApiSettings(profile);
    const adminSettings = getNormalizedApiSettings(adminUser);

    if (usesPersonalApiKeys(profile)) {
        return profileSettings.ollamaBaseUrl;
    }
    return adminSettings.ollamaBaseUrl || profileSettings.ollamaBaseUrl || '';
}


export function saveSystemApiSettings({ openrouter, ollamaBaseUrl, kieAiApiKey, providerEnabled } = {}) {
    const adminUser = userDatabase.find(u => u.userId === ADMIN_USER_ID);
    if (adminUser) {
        if (!adminUser.apiSettings || typeof adminUser.apiSettings !== 'object') {
            adminUser.apiSettings = {};
        }
        if (openrouter !== undefined) {
            adminUser.apiSettings.openrouterKey = normalizeApiKey(openrouter);
        }
        if (ollamaBaseUrl !== undefined) {
            adminUser.apiSettings.ollamaBaseUrl = normalizeOllamaBaseUrl(ollamaBaseUrl);
        }
        if (kieAiApiKey !== undefined) {
            adminUser.apiSettings.kieAiApiKey = normalizeApiKey(kieAiApiKey);
        }
        if (providerEnabled !== undefined) {
            const mergedEnabled = normalizeProviderEnabled({
                ...normalizeProviderEnabled(adminUser.apiSettings.providerEnabled),
                ...(typeof providerEnabled === 'object' ? providerEnabled : {})
            });
            adminUser.apiSettings.providerEnabled = mergedEnabled;
        }
        ensureUserApiSettingsShape(adminUser);
        saveUserDatabase();
    }
}

export function updateApiSettings({ openrouterKey, ollamaBaseUrl, kieAiApiKey, providerEnabled } = {}) {
    const profile = getCurrentUserProfile();
    if (!profile) return;

    if (!profile.apiSettings || typeof profile.apiSettings !== 'object') {
        profile.apiSettings = {};
    }

    if (openrouterKey !== undefined) {
        profile.apiSettings.openrouterKey = normalizeApiKey(openrouterKey);
    }
    if (ollamaBaseUrl !== undefined) {
        profile.apiSettings.ollamaBaseUrl = normalizeOllamaBaseUrl(ollamaBaseUrl);
    }
    if (kieAiApiKey !== undefined) {
        profile.apiSettings.kieAiApiKey = normalizeApiKey(kieAiApiKey);
    }
    if (providerEnabled !== undefined) {
        const mergedEnabled = normalizeProviderEnabled({
            ...normalizeProviderEnabled(profile.apiSettings.providerEnabled),
            ...(typeof providerEnabled === 'object' ? providerEnabled : {})
        });
        profile.apiSettings.providerEnabled = mergedEnabled;
    }

    ensureUserApiSettingsShape(profile);
    saveFullUserProfile(profile);
}

export function getPlanModelPresets() {
    return planPresets;
}


export function savePlanModelPresets(presets) {
    planPresets = presets;
    localStorage.setItem(PLAN_PRESETS_DB_KEY, JSON.stringify(planPresets));
}

// Add this new async function to load the default presets
async function loadDefaultPlanPresets() {
    try {
        const filePath = `${import.meta.env.BASE_URL}studio-presets.json`;
        console.log(`Attempting to fetch presets from: ${filePath}`);
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Could not fetch studio-presets.json (status: ${response.status})`);
        }
        const defaultPresets = await response.json();
        console.log("Loaded plan presets from /public/studio-presets.json", defaultPresets);
        return defaultPresets;
    } catch (error) {
        console.error("Failed to load default plan presets:", error);
        return null;
    }
}


export function getUserModelPresets() {
    const profile = getCurrentUserProfile();
    // Return personal presets, or an empty object for the admin profile (who doesn't have them)
    return profile?.modelPresets || {};
}

export function saveUserModelPresets(presets) {
    const profile = getCurrentUserProfile();
    if (profile) {
        profile.modelPresets = presets;
        saveUserDatabase();
    }
}

// --- [NEW] System Billing Information Management ---
// This logic is for the app owner/admin, not individual users.

export function getSystemBillingInfo() {
    const stored = localStorage.getItem(BILLING_DB_KEY);
    if (stored) {
        return JSON.parse(stored);
    }
    return { balanceUSD: 10.00, usedUSD: 0, markupRate: 2.5 };
}

export function saveSystemBillingInfo(billingData) {
    const currentInfo = getSystemBillingInfo();
    currentInfo.balanceUSD = parseFloat(billingData.balanceUSD) || 0;
    currentInfo.markupRate = parseFloat(billingData.markupRate) || 1;
    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}

export function logSystemApiCost(costInUSD) {
    if (typeof costInUSD !== 'number' || costInUSD <= 0) return;
    const currentInfo = getSystemBillingInfo();
    currentInfo.usedUSD += costInUSD;
    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}

export function refillCredits(userId, amountUSD, options = {}) {
    const userToUpdate = getUserById(userId);
    if (!userToUpdate) return false;

    const normalizedAmountUSD = Number(amountUSD);
    if (!Number.isFinite(normalizedAmountUSD) || normalizedAmountUSD <= 0) {
        return false;
    }

    const bypassPolicy = options?.bypassPolicy === true;
    if (!bypassPolicy && !canPurchaseTopupCredits(userToUpdate)) {
        console.warn(`Attempted to purchase Top-up Credits without Pro access for user ${userId}.`);
        return false;
    }

    const previousPlanCode = String(userToUpdate.backendAccount?.planCode || userToUpdate.plan || 'free').trim().toLowerCase() || 'free';
    const billingInfo = getSystemBillingInfo();
    const markupRate = Number(billingInfo?.markupRate) || 1;
    const creditsToAdd = normalizedAmountUSD * markupRate * 1000000;

    userToUpdate.credits.topup = normalizeNumericValue(userToUpdate.credits.topup, 0) + creditsToAdd;
    userToUpdate.credits.current = normalizeNumericValue(userToUpdate.credits.monthly, 0) + userToUpdate.credits.topup;
    userToUpdate.credits.totalRefilledUSD = normalizeNumericValue(userToUpdate.credits.totalRefilledUSD, 0) + normalizedAmountUSD;
    const balanceAfterUSD = convertCreditsToUSD(userToUpdate.credits.current);
    userToUpdate.logs.push({
        timestamp: Date.now(),
        event: 'Refill',
        details: bypassPolicy ? 'Admin/Test Credit Refill' : 'Top-up Credit Purchase',
        amountUSD: normalizedAmountUSD,
        balanceAfterUSD: balanceAfterUSD
    });

    if (!bypassPolicy && userToUpdate.plan === 'pro' && userToUpdate.planStatus !== 'active') {
        userToUpdate.planStatus = 'active';
        userToUpdate.logs.push({ timestamp: Date.now(), action: 'Account status reactivated.' });
    }

    if (userToUpdate.userId === activeUserId) {
        applyPlanModelAccessTransition(userToUpdate, {
            previousPlanCode,
            preferTierPromotion: normalizePlanTier(previousPlanCode) !== normalizePlanTier(userToUpdate.plan)
                && normalizePlanTier(userToUpdate.plan) === 'pro'
        });
    }

    saveFullUserProfile(userToUpdate);
    return true;
}


function saveUserUpdates(userId) {
    const originalUser = UserService.getUserById(userId);
    if (!originalUser) {
        showCustomAlert(`Error: User ${userId} not found.`, 'Error');
        return;
    }
    
    // 1. Create a deep copy to prevent any data contamination.
    const updatedUser = JSON.parse(JSON.stringify(originalUser));
    
    // 2. Get the new values from the form.
    const newPlan = document.getElementById('detail-user-plan').value;
    const newCredits = parseInt(document.getElementById('detail-user-credits').value, 10);
    
    // 3. Apply changes to the copied object.
    if (updatedUser.plan !== newPlan) {
        updatedUser.logs.push({
            timestamp: Date.now(),
            action: `Admin changed plan from ${updatedUser.plan} to ${newPlan}.`
        });
        updatedUser.plan = newPlan;
    }
    updatedUser.credits.current = newCredits;

    if (updatedUser.plan === 'pro' && updatedUser.credits.current > 0 && updatedUser.planStatus !== 'active') {
        updatedUser.planStatus = 'active';
        updatedUser.gracePeriodStartDate = null;
        updatedUser.logs.push({ timestamp: Date.now(), action: 'Account status reactivated by admin.' });
    }

    // 4. Save the completely new, updated user object.
    UserService.saveFullUserProfile(updatedUser);

    showCustomAlert(`User ${updatedUser.userName} updated successfully!`, 'Success');
    renderUserList();
    renderUserDetail(userId);
}

export function saveFullUserProfile(updatedUser) {
    if (updatedUser && typeof updatedUser === 'object') {
        updatedUser.userId = normalizeStoredUserId(updatedUser.userId);
        updatedUser.plan = normalizePlanCode(updatedUser.plan || 'free');
        updatedUser.role = String(updatedUser.role || (updatedUser.userId === ADMIN_USER_ID ? 'admin' : 'user')).trim().toLowerCase() === 'admin'
            ? 'admin'
            : 'user';
        ensureBillingProfileShape(updatedUser);
        ensureUserApiSettingsShape(updatedUser);
    }
    const userIndex = userDatabase.findIndex(u => u.userId === updatedUser.userId);
    if (userIndex !== -1) {
        // Replace the old object with the new one.
        userDatabase[userIndex] = updatedUser;
    } else {
        userDatabase.push(updatedUser);
    }
    saveUserDatabase();
}

export function deleteUserProfile(userId, options = {}) {
    if (userDatabase.length === 0) {
        loadUserDatabase();
    }

    const normalizedUserId = normalizeStoredUserId(userId);
    if (!normalizedUserId) return false;

    const targetUser = userDatabase.find(user => user?.userId === normalizedUserId) || null;
    if (!targetUser) return false;

    if (isAdminProfile(targetUser)) {
        console.warn('Blocked deletion of admin profile.');
        return false;
    }

    const linkedBackendUserId = String(
        targetUser.externalAuthUserId
        || targetUser.backendAccount?.userId
        || ''
    ).trim();

    userDatabase = userDatabase.filter((user) => {
        const candidateUserId = String(user?.userId || '').trim();
        if (!candidateUserId) return false;
        if (candidateUserId === normalizedUserId) return false;

        if (options.removeLinkedBackendShadows !== false && linkedBackendUserId) {
            const candidateBackendUserId = String(
                user?.externalAuthUserId
                || user?.backendAccount?.userId
                || ''
            ).trim();
            if (candidateBackendUserId && candidateBackendUserId === linkedBackendUserId) {
                return false;
            }

            if (candidateUserId === `sb_${linkedBackendUserId}`) {
                return false;
            }
        }

        return true;
    });

    if (!userDatabase.some(user => user?.userId === activeUserId)) {
        const fallbackUser = userDatabase.find(user => isAdminProfile(user)) || userDatabase[0] || null;
        activeUserId = fallbackUser?.userId || null;
        try {
            if (activeUserId) {
                localStorage.setItem(ACTIVE_USER_STORAGE_KEY, activeUserId);
                localStorage.setItem(PENDING_ACTIVE_USER_STORAGE_KEY, activeUserId);
            } else {
                localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
                localStorage.removeItem(PENDING_ACTIVE_USER_STORAGE_KEY);
            }
        } catch (error) {
            console.error('Failed to persist fallback active user after deletion:', error);
        }
    }

    saveUserDatabase({
        publish: options.publish !== false,
        mergeStoredDb: false
    });
    return true;
}

export function extendStudioSubscription(userId) {
    const user = getUserById(userId);
    if (!user || user.plan !== 'studio') return;

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // ถ้าเคยมีวันหมดอายุและยังไม่หมด ให้ต่อจากวันเดิม, ถ้าหมดแล้วหรือไม่มีให้ต่อจากวันนี้
    const startDate = (user.subscriptionEndDate && user.subscriptionEndDate > now) ? user.subscriptionEndDate : now;
    
    user.subscriptionEndDate = startDate + thirtyDays;
    user.logs.push({ timestamp: now, action: 'Subscription extended by 30 days.' });
    
    saveFullUserProfile(user);
}


/**
 * Generates a simple unique user ID.
 * e.g., u123, u456
 */
function generateUniqueId() {
    const newId = `u${Math.floor(Math.random() * 900) + 100}`;
    // Ensure the ID is truly unique within the current database
    if (userDatabase.some(user => user.userId === newId)) {
        return generateUniqueId();
    }
    return newId;
}

/**
 * Creates a new user with default values and adds them to the database.
 * @param {string} userName The name for the new user.
 * @param {string} email The email for the new user.
 */
export function addNewUser(userName, email) {
    if (!userName || !email) {
        console.error("Username and email are required.");
        return null;
    }
    const newId = generateUniqueId();
    const newUser = createDefaultUser(newId, userName, email, 'free', FREE_TRIAL_MICROCREDITS); 
    userDatabase.push(newUser);
    saveUserDatabase();
    return newUser;
}

/**
 * Changes a user's plan and resets their status to active.
 * @param {string} userId The ID of the user.
 * @param {string} newPlan The new plan ('free', 'pro', 'studio').
 */
export function changeUserPlan(userId, newPlan) {
    const user = getUserById(userId);
    if (!user) return;
    if (isAdminProfile(user) && normalizePlanCode(newPlan) !== 'studio') {
        console.warn('Blocked plan change for admin profile.');
        return;
    }

    const oldPlan = user.plan;
    const normalizedNewPlan = normalizePlanCode(newPlan);
    if (oldPlan === normalizedNewPlan) return; // No change needed

    user.plan = normalizedNewPlan;
    user.trialEndsAt = normalizedNewPlan === 'free' ? getDefaultFreeTrialEndsAt() : null;
    user.planStatus = 'active'; // Always become active on a manual plan change
    user.gracePeriodStartDate = null; // Clear grace period

    // Add a log entry for the change
    user.logs.push({
        timestamp: Date.now(),
        action: `Plan changed from ${oldPlan} to ${normalizedNewPlan}.`
    });

    if (user.userId === activeUserId) {
        applyPlanModelAccessTransition(user, {
            previousPlanCode: oldPlan,
            preferTierPromotion: normalizePlanTier(oldPlan) !== normalizePlanTier(normalizedNewPlan)
                && normalizePlanTier(normalizedNewPlan) === 'pro'
        });
    }

    saveFullUserProfile(user);
}

/**
 * Calculates the sum of all current credits held by all tracked users.
 * @returns {number} The total number of credits issued.
 */
export function getTotalCreditsIssued() {
    return userDatabase
        .reduce((total, user) => total + (Number(user?.credits?.current) || 0), 0);
}

/**
 * Adds a new API call record to a user's activity log.
 * @param {string} userId The user's ID.
 * @param {object} logEntry The activity data to log.
 */
export function logUserActivity(userId, logEntry) {
    const user = getUserById(userId);
    if (user) {
        if (!Array.isArray(user.activityLog)) {
            user.activityLog = [];
        }
        user.activityLog.push(logEntry);
        saveFullUserProfile(user); 
    }
}

/**
 * Calculates and returns a summary of all key financial and usage metrics.
 * @returns {object} A summary object.
 */
export function getFinancialSummary() {
    const billingInfo = getSystemBillingInfo();
    const allUsers = userDatabase.filter(u => !isAdminProfile(u));

    const totalRevenue = allUsers.reduce((sum, user) => sum + (user.credits.totalRefilledUSD || 0), 0);
    const totalApiCost = billingInfo.usedUSD || 0;
    const totalTokens = allUsers.reduce((sum, user) => sum + (user.credits.tokenUsage?.prompt || 0) + (user.credits.tokenUsage?.completion || 0), 0);
    const totalApiCalls = allUsers.reduce((sum, user) => sum + (user.activityLog?.length || 0), 0);

    return {
        grossRevenue: totalRevenue,
        totalCosts: totalApiCost,
        netProfit: totalRevenue - totalApiCost,
        activeUsers: allUsers.length,
        totalApiCalls: totalApiCalls,
        totalTokensProcessed: totalTokens
    };
}

/**
 * Calculates and returns a breakdown of financial metrics for each user.
 * @returns {Array<object>} An array of objects, each representing a user's financial summary.
 */
export function getPerUserFinancials() {
    return userDatabase
        .filter(u => !isAdminProfile(u))
        .map(user => {
            const totalRefilled = user.credits.totalRefilledUSD || 0;
            const totalUsageUSD = user.credits.totalUsedUSD || 0;
            return {
                userName: user.userName,
                userId: user.userId,
                plan: user.plan,
                totalRefilledUSD: totalRefilled,
                totalUsageUSD: totalUsageUSD,
                netValue: totalRefilled - totalUsageUSD
            };
        });
}
