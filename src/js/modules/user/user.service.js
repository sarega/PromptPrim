//File: src/js/modules/user/user.service.js

import { stateManager } from "../../core/core.state.js";
import { showCustomAlert } from "../../core/core.ui.js";

const USER_DB_KEY = 'promptPrimUserDatabase_v1';
const BILLING_DB_KEY = 'promptPrimAdminBilling_v1';
const MASTER_PRESETS_DB_KEY = 'promptPrimMasterPresets_v1'; // <-- NEW: Dedicated key for admin presets
const ACTIVE_USER_STORAGE_KEY = 'promptPrimActiveUserId';
const PENDING_ACTIVE_USER_STORAGE_KEY = 'promptPrimPendingActiveUserId';
export const ADMIN_USER_ID = 'user_master'; 
const DEFAULT_PROVIDER_ENABLED = Object.freeze({ openrouter: true, ollama: true, kieai: true });

let userDatabase = [];
let masterPresets = {}; // <-- NEW: In-memory variable for admin presets
let activeUserId = null;

function normalizeStoredUserId(rawValue) {
    if (typeof rawValue !== 'string') return '';
    const trimmed = rawValue.trim();
    if (!trimmed) return '';
    return trimmed.replace(/^"+|"+$/g, '');
}

async function loadMasterPresets() {
    const storedPresets = localStorage.getItem(MASTER_PRESETS_DB_KEY);
    if (storedPresets) {
        masterPresets = JSON.parse(storedPresets);
        console.log("Loaded master presets from localStorage.");
    } else {
        // Fallback to loading from the public JSON file for the very first run
        try {
            const filePath = `${import.meta.env.BASE_URL}master-presets.json`;
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const presetsFromFile = await response.json();
            masterPresets = presetsFromFile;
            saveMasterModelPresets(masterPresets); // Save them to their new home
            console.log("Loaded default master presets from file.");
        } catch (error) {
            console.error("Failed to load default master presets:", error);
            masterPresets = {};
        }
    }
}

export function isMasterProfile(profile = null) {
    const target = profile || getCurrentUserProfile();
    if (!target) return false;
    return target.userId === ADMIN_USER_ID || target.plan === 'master';
}

export function getAllowedModelsForCurrentUser() {
    const user = getCurrentUserProfile();
    if (!user) return [];

    if (isMasterProfile(user)) {
        // [FIX] Master user reads from their own personal model list in the state
        return stateManager.getState().userProviderModels || [];
    }
    
    // Pro/Free users filter from the system-wide model list
    const systemModels = stateManager.getState().systemProviderModels || [];
    const masterPresets = getMasterModelPresets();

    if (user.plan === 'pro' && user.planStatus === 'active' && user.credits.current > 0) {
        const proModelIds = new Set(masterPresets['pro_tier']?.modelIds || []);
        return systemModels.filter(m => proModelIds.has(m.id));
    }

    if ((user.plan === 'free' && user.credits.current > 0) || user.planStatus === 'grace_period') {
        const freeModelIds = new Set(masterPresets['free_tier']?.modelIds || []);
        return systemModels.filter(m => freeModelIds.has(m.id));
    }
    
    return []; // Blocked users see no models
}
/**
 * Reloads the in-memory database from localStorage and notifies the app.
 * This is a lightweight refresh for cross-tab syncing.
 */
export function reloadDatabaseFromStorage() {
    const storedDb = localStorage.getItem(USER_DB_KEY);
    if (storedDb) {
        let needsSave = false;
        userDatabase = JSON.parse(storedDb)
            .map(user => JSON.parse(JSON.stringify(user)))
            .map(user => {
                const migrated = migrateUserObject(user);
                if (migrated.needsSave) needsSave = true;
                return migrated.user;
            });

        if (ensureAdminUserExists()) {
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
function createDefaultUser(userId, userName, email, plan, initialCredits = 0) {
    const user = {
        userId: userId,
        userName: userName,
        email: email,
        plan: plan,
        planStatus: "active",
        gracePeriodStartDate: null,
        credits: { current: initialCredits, totalUsage: 0, totalRefilledUSD: 0, tokenUsage: { prompt: 0, completion: 0 }, totalUsedUSD: 0 },
        subscriptionEndDate: null, // เพิ่ม property นี้
        logs: [{ timestamp: Date.now(), action: `Account created with ${plan} plan.` }],
        activityLog: [],
        apiSettings: {
            openrouterKey: "",
            ollamaBaseUrl: "http://localhost:11434",
            kieAiApiKey: "",
            providerEnabled: { ...DEFAULT_PROVIDER_ENABLED }
        },
        appSettings: { activeModelPreset: 'my_first_preset' }
    };
    if (plan !== 'master') {
        user.modelPresets = { 'my_first_preset': { name: 'My First Preset', modelIds: [] } };
    }
    return user;
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

    if (!user.credits || typeof user.credits !== 'object') {
        user.credits = { current: 0, totalUsage: 0, totalRefilledUSD: 0, tokenUsage: { prompt: 0, completion: 0 }, totalUsedUSD: 0 };
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

    // Backward compatibility for legacy saved profiles.
    if ((!user.apiSettings || typeof user.apiSettings !== 'object') && (user.apiKey || user.openrouterKey || user.ollamaBaseUrl || user.kieAiApiKey)) {
        user.apiSettings = {};
        needsSave = true;
    }

    if (ensureUserApiSettingsShape(user)) {
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
    userDatabase = [
        createDefaultUser('user_pro', 'Kaiwan (Pro)', 'kai@example.com', 'pro', 1000000),
        createDefaultUser('user_free', 'Demo User (Free)', 'demo@example.com', 'free', 50000),
        createDefaultUser(ADMIN_USER_ID, 'Admin (Master)', 'admin@example.com', 'master', 0)
    ];
    localStorage.setItem(USER_DB_KEY, JSON.stringify(userDatabase));
}

function ensureAdminUserExists() {
    const adminUser = userDatabase.find(user => user?.userId === ADMIN_USER_ID);
    if (!adminUser) {
        userDatabase.push(createDefaultUser(ADMIN_USER_ID, 'Admin (Master)', 'admin@example.com', 'master', 0));
        return true;
    }

    let changed = false;
    if (adminUser.plan !== 'master') {
        adminUser.plan = 'master';
        changed = true;
    }
    if (adminUser.planStatus !== 'active') {
        adminUser.planStatus = 'active';
        changed = true;
    }
    if (!adminUser.userName) {
        adminUser.userName = 'Admin (Master)';
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

        if (needsSave) {
            localStorage.setItem(USER_DB_KEY, JSON.stringify(userDatabase));
        }
    } catch (error) {
        console.error("Failed to parse user database. Rebuilding default users.", error);
        bootstrapDefaultUsers();
    }
}

function saveUserDatabase() {
    localStorage.setItem(USER_DB_KEY, JSON.stringify(userDatabase));
    stateManager.bus.publish('user:settingsUpdated', getCurrentUserProfile());
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

export async function initUserSettings() {
    await loadMasterPresets();
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
    if (!user || user.plan === 'master') return;

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

    user.credits.current -= creditsToBurn;
    user.credits.totalUsage += creditsToBurn;
    if (user.credits.current < 0) user.credits.current = 0;

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
        details: `API Usage on model: ${modelId}`,
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

    if (isMasterProfile(profile)) {
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

    if (isMasterProfile(profile)) {
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

    if (isMasterProfile(profile)) {
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

    if (isMasterProfile(profile)) {
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

export function getMasterModelPresets() {
    return masterPresets;
}


export function saveMasterModelPresets(presets) {
    masterPresets = presets;
    localStorage.setItem(MASTER_PRESETS_DB_KEY, JSON.stringify(masterPresets));
}

// Add this new async function to load the default presets
async function loadDefaultMasterPresets() {
    try {
        const filePath = `${import.meta.env.BASE_URL}master-presets.json`;
        console.log(`Attempting to fetch presets from: ${filePath}`);
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Could not fetch master-presets.json (status: ${response.status})`);
        }
        const defaultPresets = await response.json();
        console.log("Loaded master presets from /public/master-presets.json", defaultPresets);
        return defaultPresets;
    } catch (error) {
        console.error("Failed to load default master presets:", error);
        return null;
    }
}


export function getUserModelPresets() {
    const profile = getCurrentUserProfile();
    // Return personal presets, or an empty object if it's the master user (who doesn't have them)
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

export function refillCredits(userId, amountUSD) {
    // 1. Get a safe, deep copy of the user.
    const userToUpdate = getUserById(userId);
    if (!userToUpdate) return;
    
    // [NEW LOGIC] เพิ่มส่วนนี้เข้าไป
    // ตรวจสอบถ้าเป็น Free plan ให้ทำการอัปเกรด
    if (userToUpdate.plan === 'free') {
        userToUpdate.plan = 'pro';
        userToUpdate.planStatus = 'active'; // ตั้งสถานะเป็น active ทันที
        userToUpdate.logs.push({
            timestamp: Date.now(),
            action: `Upgraded to Pro plan via first refill of $${amountUSD.toFixed(2)}.`
        });
        console.log(`User ${userId} automatically upgraded to Pro.`);
    }
    // สิ้นสุดส่วนที่เพิ่มใหม่
    const billingInfo = getSystemBillingInfo();
    const creditsToAdd = amountUSD * billingInfo.markupRate * 1000000;

    // 2. Modify the copy.
    userToUpdate.credits.current += creditsToAdd;
    userToUpdate.credits.totalRefilledUSD += amountUSD;

    // [FIX] เปลี่ยนจากการบันทึก Log แบบ String เป็นแบบ Object
    const balanceAfterUSD = convertCreditsToUSD(userToUpdate.credits.current);
    userToUpdate.logs.push({
        timestamp: Date.now(),
        event: 'Refill',
        details: `Credit Refill`,
        amountUSD: amountUSD,
        balanceAfterUSD: balanceAfterUSD
    });

        if (userToUpdate.plan === 'master') {
        console.warn(`Attempted to refill credits for a Master plan user (${userId}). Operation blocked.`);
        return; // ออกจากฟังก์ชันทันที
    }

    if (userToUpdate.plan === 'pro' && userToUpdate.planStatus !== 'active') {
        userToUpdate.planStatus = 'active';
        userToUpdate.logs.push({ timestamp: Date.now(), action: 'Account status reactivated.' });
    }

    // 3. Save the modified copy back to the database.
    saveFullUserProfile(userToUpdate);
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
    const userIndex = userDatabase.findIndex(u => u.userId === updatedUser.userId);
    if (userIndex !== -1) {
        // Replace the old object with the new one.
        userDatabase[userIndex] = updatedUser;
        saveUserDatabase();
    }
}

export function extendMasterSubscription(userId) {
    const user = getUserById(userId);
    if (!user || user.plan !== 'master') return;

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
    // [FIX] New users start as 'free' with 50,000 credits
    const newUser = createDefaultUser(newId, userName, email, 'free', 50000); 
    userDatabase.push(newUser);
    saveUserDatabase();
    return newUser;
}

/**
 * Changes a user's plan and resets their status to active.
 * @param {string} userId The ID of the user.
 * @param {string} newPlan The new plan ('free', 'pro', 'master').
 */
export function changeUserPlan(userId, newPlan) {
    const user = getUserById(userId);
    if (!user) return;
    if (user.userId === ADMIN_USER_ID && newPlan !== 'master') {
        console.warn('Blocked plan change for master profile.');
        return;
    }

    const oldPlan = user.plan;
    if (oldPlan === newPlan) return; // No change needed

    user.plan = newPlan;
    user.planStatus = 'active'; // Always become active on a manual plan change
    user.gracePeriodStartDate = null; // Clear grace period

    // Add a log entry for the change
    user.logs.push({
        timestamp: Date.now(),
        action: `Plan changed from ${oldPlan} to ${newPlan}.`
    });

    saveUserDatabase();
}

/**
 * Calculates the sum of all current credits held by Free and Pro users.
 * @returns {number} The total number of credits issued.
 */
export function getTotalCreditsIssued() {
    return userDatabase
        .filter(user => user.plan === 'pro' || user.plan === 'free')
        .reduce((total, user) => total + (user.credits?.current || 0), 0);
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
    const allUsers = userDatabase.filter(u => u.plan !== 'master');

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
        .filter(u => u.plan !== 'master')
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
