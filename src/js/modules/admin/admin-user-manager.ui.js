// src/js/modules/admin/admin-user-manager.ui.js
// [CONSOLIDATED FILE] Merged with handlers to fix import issues.

import { showActivityLogModal } from './admin-activity-log.ui.js';
import { showAccountLogModal } from './admin-account-log.ui.js';
import { stateManager } from '../../core/core.state.js';
import * as UserService from '../user/user.service.js';
import * as AdminUserAccountService from './admin-user-account.service.js';
import * as AdminUserDirectoryService from './admin-user-directory.service.js';
import { showCustomAlert } from '../../core/core.ui.js';
import { formatTimestamp } from '../../core/core.utils.js';

let selectedUserId = null;
let lastDirectoryRefreshAt = 0;
let activeAdminUserSearchQuery = '';

function normalizeNonNegativeInteger(value, fallback = 0) {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

function getAutomaticAccountStatusForPlan(planCode = 'free', role = 'user') {
    const normalizedRole = String(role || 'user').trim().toLowerCase();
    if (normalizedRole === 'admin') return 'studio_active';

    const normalizedPlan = UserService.normalizeCompatiblePlanCode(planCode || 'free');
    if (normalizedPlan === 'pro') return 'pro_active';
    if (normalizedPlan === 'studio') return 'studio_active';
    return 'free';
}

function toDatetimeLocalValue(value) {
    if (!value) return '';
    const parsedValue = new Date(value);
    if (Number.isNaN(parsedValue.getTime())) return '';

    const localValue = new Date(parsedValue.getTime() - (parsedValue.getTimezoneOffset() * 60000));
    return localValue.toISOString().slice(0, 16);
}

function getDateTimeInputISOString(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return null;

    const normalizedValue = String(input.value || '').trim();
    if (!normalizedValue) return null;

    const parsedValue = new Date(normalizedValue);
    return Number.isNaN(parsedValue.getTime()) ? null : parsedValue.toISOString();
}

function getDetailFormState(originalUser) {
    const creditBuckets = UserService.getCreditBucketSummary(originalUser);
    const planInput = document.getElementById('detail-user-plan');
    const accountStatusInput = document.getElementById('detail-user-account-status');
    const monthlyCreditsInput = document.getElementById('detail-user-monthly-credits');
    const topupCreditsInput = document.getElementById('detail-user-topup-credits');

    const plan = UserService.isAdminProfile(originalUser)
        ? 'studio'
        : String(planInput?.value || originalUser.plan || 'free').trim().toLowerCase();

    return {
        plan,
        accountStatus: String(accountStatusInput?.value || 'auto').trim().toLowerCase() || 'auto',
        monthlyCredits: normalizeNonNegativeInteger(monthlyCreditsInput?.value, creditBuckets.monthlyMicrocredits),
        topupCredits: normalizeNonNegativeInteger(topupCreditsInput?.value, creditBuckets.topupMicrocredits)
    };
}

function applyLocalAccountSnapshotToUser(updatedUser, options = {}) {
    if (!updatedUser) return updatedUser;

    const requestedAccountStatus = String(options.accountStatus || '').trim().toLowerCase();
    const nextPlan = UserService.isAdminProfile(updatedUser)
        ? 'studio'
        : UserService.normalizeCompatiblePlanCode(options.plan || updatedUser.plan || 'free');
    const effectiveAccountStatus = requestedAccountStatus && requestedAccountStatus !== 'auto'
        ? requestedAccountStatus
        : getAutomaticAccountStatusForPlan(nextPlan, updatedUser.role);

    updatedUser.plan = nextPlan;
    updatedUser.planStatus = effectiveAccountStatus === 'paid_suspended' ? 'expired' : 'active';
    updatedUser.gracePeriodStartDate = null;

    if (options.clearTrialExpiresAt === true) {
        updatedUser.trialEndsAt = null;
    } else if (Object.prototype.hasOwnProperty.call(options, 'trialExpiresAt')) {
        updatedUser.trialEndsAt = options.trialExpiresAt || null;
    } else if (nextPlan === 'free' && !updatedUser.trialEndsAt) {
        updatedUser.trialEndsAt = new Date(Date.now() + (UserService.FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000)).toISOString();
    } else if (nextPlan !== 'free') {
        updatedUser.trialEndsAt = null;
    }

    if (options.clearAccessPassExpiresAt === true) {
        updatedUser.accessPassExpiresAt = null;
        updatedUser.subscriptionEndDate = null;
    } else if (Object.prototype.hasOwnProperty.call(options, 'accessPassExpiresAt')) {
        updatedUser.accessPassExpiresAt = options.accessPassExpiresAt || null;
        updatedUser.subscriptionEndDate = options.accessPassExpiresAt || null;
    }

    const resolvedMonthlyCredits = effectiveAccountStatus === 'paid_suspended'
        ? 0
        : normalizeNonNegativeInteger(options.monthlyCredits, Number(updatedUser.credits?.monthly) || 0);
    const resolvedTopupCredits = normalizeNonNegativeInteger(options.topupCredits, Number(updatedUser.credits?.topup) || 0);

    updatedUser.credits.monthly = resolvedMonthlyCredits;
    updatedUser.credits.topup = resolvedTopupCredits;
    updatedUser.credits.current = resolvedMonthlyCredits + resolvedTopupCredits;
    updatedUser.credits.monthlyExpiresAt = resolvedMonthlyCredits > 0
        ? (
            updatedUser.plan === 'free' && updatedUser.trialEndsAt
                ? updatedUser.trialEndsAt
                : (updatedUser.credits.monthlyExpiresAt || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString())
        )
        : null;

    if (!updatedUser.backendAccount || typeof updatedUser.backendAccount !== 'object') {
        updatedUser.backendAccount = {};
    }
    updatedUser.backendAccount.planCode = nextPlan;
    updatedUser.backendAccount.status = effectiveAccountStatus === 'paid_suspended' ? 'suspended' : 'active';
    updatedUser.backendAccount.accountStatus = effectiveAccountStatus;
    updatedUser.backendAccount.balanceMicrocredits = updatedUser.credits.current;
    updatedUser.backendAccount.monthlyCreditBalanceMicrocredits = updatedUser.credits.monthly;
    updatedUser.backendAccount.topupCreditBalanceMicrocredits = updatedUser.credits.topup;
    updatedUser.backendAccount.monthlyCreditExpiresAt = updatedUser.credits.monthlyExpiresAt || null;
    updatedUser.backendAccount.accessPassExpiresAt = updatedUser.accessPassExpiresAt || null;
    updatedUser.backendAccount.trialEndsAt = updatedUser.trialEndsAt || null;
    updatedUser.backendAccount.syncedAt = new Date().toISOString();

    if (options.reason) {
        updatedUser.logs.push({
            timestamp: Date.now(),
            action: options.reason
        });
    }

    return updatedUser;
}

function normalizeAdminUserSearchQuery(rawValue = '') {
    return String(rawValue || '').trim();
}

function syncAdminUserSearchInputFromState() {
    const searchInput = document.getElementById('user-search-input');
    if (!searchInput) return;
    if (document.activeElement === searchInput) return;
    if (searchInput.value !== activeAdminUserSearchQuery) {
        searchInput.value = activeAdminUserSearchQuery;
    }
}

async function refreshUserDirectoryIfNeeded(options = {}) {
    const force = options.force === true;
    const now = Date.now();
    if (!force && (now - lastDirectoryRefreshAt) < 4000) {
        return;
    }

    try {
        await AdminUserDirectoryService.refreshAdminUserDirectory();
        lastDirectoryRefreshAt = Date.now();
    } catch (error) {
        console.error('Could not refresh the Supabase-backed admin user directory.', error);
        if (options.showError === true) {
            showCustomAlert(
                error instanceof Error ? error.message : 'Could not refresh users from Supabase.',
                'Refresh Failed'
            );
        }
    }
}

// --- Handler Logic (Moved from handlers.js) ---

function applyBackendAccountSnapshotToLocalUser(updatedUser, snapshot) {
    if (!updatedUser || !snapshot || typeof snapshot !== 'object') return updatedUser;

    const isAdminProfile = UserService.isAdminProfile(updatedUser);
    const normalizedPlanCode = UserService.normalizeCompatiblePlanCode(snapshot.plan_code || updatedUser.plan || 'free');
    updatedUser.plan = isAdminProfile
        ? 'studio'
        : normalizedPlanCode;
    updatedUser.planStatus = isAdminProfile
        ? 'active'
        : (String(snapshot.account_status || snapshot.status || 'active').trim().toLowerCase() === 'paid_suspended'
            || String(snapshot.status || 'active').trim().toLowerCase() === 'suspended'
            ? 'expired'
            : 'active');
    updatedUser.trialEndsAt = updatedUser.plan === 'free'
        ? (snapshot.trial_expires_at || updatedUser.trialEndsAt || null)
        : null;

    if (!updatedUser.credits || typeof updatedUser.credits !== 'object') {
        updatedUser.credits = {};
    }
    updatedUser.credits.current = Number(snapshot.balance_microcredits) || 0;
    updatedUser.credits.monthly = Number(snapshot.monthly_credit_balance_microcredits) || 0;
    updatedUser.credits.topup = Number(snapshot.topup_credit_balance_microcredits) || 0;
    updatedUser.credits.monthlyExpiresAt = snapshot.monthly_credit_expires_at || null;
    updatedUser.credits.totalUsage = Number(snapshot.lifetime_consumed_microcredits) || 0;
    updatedUser.credits.totalRefilledUSD = UserService.convertCreditsToUSD(Number(snapshot.lifetime_purchased_microcredits) || 0);
    updatedUser.credits.totalUsedUSD = UserService.convertCreditsToUSD(Number(snapshot.lifetime_consumed_microcredits) || 0);
    updatedUser.credits.tokenUsage = updatedUser.credits.tokenUsage || { prompt: 0, completion: 0 };
    updatedUser.accessPassExpiresAt = snapshot.access_pass_expires_at || null;
    updatedUser.subscriptionEndDate = snapshot.access_pass_expires_at || updatedUser.subscriptionEndDate || null;

    updatedUser.backendAccount = {
        ...(updatedUser.backendAccount || {}),
        planCode: String(snapshot.plan_code || updatedUser.backendAccount?.planCode || updatedUser.plan || 'free').trim().toLowerCase(),
        status: String(snapshot.status || updatedUser.backendAccount?.status || 'active').trim().toLowerCase(),
        accountStatus: String(snapshot.account_status || updatedUser.backendAccount?.accountStatus || '').trim().toLowerCase(),
        balanceMicrocredits: Number(snapshot.balance_microcredits) || 0,
        monthlyCreditBalanceMicrocredits: Number(snapshot.monthly_credit_balance_microcredits) || 0,
        topupCreditBalanceMicrocredits: Number(snapshot.topup_credit_balance_microcredits) || 0,
        monthlyCreditExpiresAt: snapshot.monthly_credit_expires_at || null,
        accessPassExpiresAt: snapshot.access_pass_expires_at || null,
        walletUpdatedAt: new Date().toISOString(),
        profileUpdatedAt: new Date().toISOString(),
        syncedAt: new Date().toISOString()
    };

    return updatedUser;
}

async function saveUserUpdates(userId, overrides = {}) {
    const originalUser = AdminUserDirectoryService.getAdminVisibleUserById(userId) || UserService.getUserById(userId);
    if (!originalUser) {
        showCustomAlert(`Error: User ${userId} not found.`, 'Error');
        return;
    }
    
    // 1. Create a deep copy to prevent any data contamination.
    const updatedUser = JSON.parse(JSON.stringify(originalUser));
    
    const formState = getDetailFormState(originalUser);
    const newPlan = overrides.plan ?? formState.plan;
    const newAccountStatus = overrides.accountStatus ?? formState.accountStatus;
    const newMonthlyCredits = overrides.monthlyCredits ?? formState.monthlyCredits;
    const newTopupCredits = overrides.topupCredits ?? formState.topupCredits;
    const newCredits = newMonthlyCredits + newTopupCredits;
    const trialExpiresAt = Object.prototype.hasOwnProperty.call(overrides, 'trialExpiresAt')
        ? overrides.trialExpiresAt
        : getDateTimeInputISOString('detail-user-trial-expires-at');
    const accessPassExpiresAt = Object.prototype.hasOwnProperty.call(overrides, 'accessPassExpiresAt')
        ? overrides.accessPassExpiresAt
        : getDateTimeInputISOString('detail-user-access-pass-expires-at');
    const clearTrialExpiresAt = overrides.clearTrialExpiresAt === true;
    const clearAccessPassExpiresAt = overrides.clearAccessPassExpiresAt === true;
    const saveReason = String(
        overrides.reason
        || `Admin saved user account controls for ${updatedUser.userName}.`
    ).trim();
    
    // 3. Apply changes to the copied object.
    if (updatedUser.plan !== newPlan) {
        updatedUser.logs.push({
            timestamp: Date.now(),
            action: `Admin changed plan from ${updatedUser.plan} to ${newPlan}.`
        });
        updatedUser.plan = newPlan;
    }
    updatedUser.credits.current = newCredits;
    updatedUser.credits.monthly = newMonthlyCredits;
    updatedUser.credits.topup = newTopupCredits;

    if (updatedUser.plan === 'pro' && updatedUser.credits.current > 0 && updatedUser.planStatus !== 'active') {
        updatedUser.planStatus = 'active';
        updatedUser.gracePeriodStartDate = null;
        updatedUser.logs.push({ timestamp: Date.now(), action: 'Account status reactivated by admin.' });
    }

    const isBackendManaged = UserService.isBackendManagedProfile(originalUser);
    if (isBackendManaged) {
        const backendPlanToSave = UserService.isAdminProfile(originalUser)
            ? String(originalUser.backendAccount?.planCode || 'studio').trim().toLowerCase() || 'studio'
            : newPlan;

        try {
            const snapshot = await AdminUserAccountService.saveBackendManagedUserAccount(originalUser, {
                plan: backendPlanToSave,
                credits: newCredits,
                monthlyCredits: newMonthlyCredits,
                topupCredits: newTopupCredits,
                accountStatus: newAccountStatus,
                trialExpiresAt,
                clearTrialExpiresAt,
                accessPassExpiresAt,
                clearAccessPassExpiresAt,
                reason: saveReason
            });
            applyBackendAccountSnapshotToLocalUser(updatedUser, snapshot);
        } catch (error) {
            showCustomAlert(error instanceof Error ? error.message : 'Could not save the Supabase user profile.', 'Save Failed');
            return;
        }
    } else {
        applyLocalAccountSnapshotToUser(updatedUser, {
            plan: newPlan,
            monthlyCredits: newMonthlyCredits,
            topupCredits: newTopupCredits,
            accountStatus: newAccountStatus,
            trialExpiresAt,
            clearTrialExpiresAt,
            accessPassExpiresAt,
            clearAccessPassExpiresAt,
            reason: saveReason
        });
    }

    // 4. Save the updated local shadow copy so the admin UI stays in sync.
    UserService.saveFullUserProfile(updatedUser);
    AdminUserDirectoryService.upsertAdminVisibleUser(updatedUser);

    if (overrides.showSuccess !== false) {
        showCustomAlert(overrides.successMessage || `User ${updatedUser.userName} updated successfully!`, 'Success');
    }
    renderUserList();
    renderUserDetail(userId);
}

async function refillUserCredits(userId, amountUSD) {
    const originalUser = AdminUserDirectoryService.getAdminVisibleUserById(userId) || UserService.getUserById(userId);
    if (!originalUser) {
        showCustomAlert(`Error: User ${userId} not found.`, 'Error');
        return;
    }

    if (UserService.isAdminProfile(originalUser)) {
        showCustomAlert('Admin profiles do not use platform refill credits here.', 'Not Applicable');
        return;
    }

    const isBackendManaged = UserService.isBackendManagedProfile(originalUser);
    if (!isBackendManaged) {
        const success = UserService.refillCredits(userId, amountUSD, { bypassPolicy: true });
        if (!success) {
            showCustomAlert(`Could not add credits to ${originalUser.userName}.`, 'Refill Failed');
            return;
        }
        renderUserList();
        renderUserDetail(userId);
        showCustomAlert(`Successfully added credits worth $${amountUSD.toFixed(2)} to ${originalUser.userName}.`, 'Success');
        return;
    }

    const updatedUser = JSON.parse(JSON.stringify(originalUser));
    const billingInfo = UserService.getSystemBillingInfo();
    const markupRate = Number(billingInfo?.markupRate) || 1;
    const creditsToAdd = amountUSD * markupRate * 1000000;
    const nextPlan = updatedUser.plan;
    const currentCreditBuckets = UserService.getCreditBucketSummary(updatedUser);
    const nextTopupCredits = currentCreditBuckets.topupMicrocredits + creditsToAdd;

    updatedUser.logs.push({
        timestamp: Date.now(),
        action: `Admin refilled $${amountUSD.toFixed(2)} for ${updatedUser.userName}.`
    });

    try {
        const snapshot = await AdminUserAccountService.saveBackendManagedUserAccount(originalUser, {
            plan: nextPlan,
            monthlyCredits: currentCreditBuckets.monthlyMicrocredits,
            topupCredits: nextTopupCredits,
            reason: `Admin refill of $${amountUSD.toFixed(2)} for ${updatedUser.userName}.`
        });
        applyBackendAccountSnapshotToLocalUser(updatedUser, snapshot);
        UserService.saveFullUserProfile(updatedUser);
        AdminUserDirectoryService.upsertAdminVisibleUser(updatedUser);
        showCustomAlert(`Successfully added credits worth $${amountUSD.toFixed(2)} to ${updatedUser.userName}.`, 'Success');
    } catch (error) {
        showCustomAlert(error instanceof Error ? error.message : 'Could not refill the Supabase user wallet.', 'Refill Failed');
        return;
    }
}

async function deleteUserAccount(userId) {
    const originalUser = AdminUserDirectoryService.getAdminVisibleUserById(userId) || UserService.getUserById(userId);
    if (!originalUser) {
        showCustomAlert(`Error: User ${userId} not found.`, 'Error');
        return;
    }

    if (UserService.isAdminProfile(originalUser)) {
        showCustomAlert('Admin accounts cannot be removed here.', 'Protected');
        return;
    }

    if (!confirm(`Delete user "${originalUser.userName}" (${originalUser.email || originalUser.userId})? This cannot be undone.`)) {
        return;
    }

    try {
        const linkedBackendUserId = String(
            originalUser.externalAuthUserId
            || originalUser.backendAccount?.userId
            || ''
        ).trim();

        if (UserService.isBackendManagedProfile(originalUser)) {
            await AdminUserAccountService.deleteBackendManagedUserAccount(originalUser);
        }

        UserService.deleteUserProfile(originalUser.userId, { removeLinkedBackendShadows: true });
        AdminUserDirectoryService.removeAdminVisibleUser(originalUser.userId, { linkedBackendUserId });
        selectedUserId = null;

        const detailSection = document.getElementById('user-detail-section');
        if (detailSection) {
            detailSection.classList.add('hidden');
            detailSection.innerHTML = '';
            detailSection.dataset.userId = '';
        }

        renderUserList();
        showCustomAlert(`Deleted ${originalUser.userName}.`, 'User Removed');
    } catch (error) {
        showCustomAlert(error instanceof Error ? error.message : 'Could not delete this user.', 'Delete Failed');
    }
}

function getQuickActionOverrides(action, user) {
    const creditBuckets = UserService.getCreditBucketSummary(user);
    const now = Date.now();
    const sevenDaysFromNow = new Date(now + (UserService.FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000)).toISOString();
    const thirtyDaysFromNow = new Date(now + (30 * 24 * 60 * 60 * 1000)).toISOString();

    switch (action) {
        case 'reset-credits':
            return {
                monthlyCredits: 0,
                topupCredits: 0,
                reason: `Admin reset all credits for ${user.userName}.`,
                successMessage: `Credits reset for ${user.userName}.`
            };
        case 'suspend-account':
            return {
                accountStatus: 'paid_suspended',
                reason: `Admin suspended access for ${user.userName}.`,
                successMessage: `${user.userName} is now suspended.`
            };
        case 'reactivate-account':
            return {
                accountStatus: 'auto',
                reason: `Admin reactivated ${user.userName} from the current plan.`,
                successMessage: `${user.userName} reactivated from plan settings.`
            };
        case 'reset-trial':
            return {
                plan: 'free',
                accountStatus: 'free',
                trialExpiresAt: sevenDaysFromNow,
                monthlyCredits: Math.max(creditBuckets.monthlyMicrocredits, UserService.FREE_TRIAL_MICROCREDITS),
                reason: `Admin reset the free trial for ${user.userName}.`,
                successMessage: `Free trial reset for ${user.userName}.`
            };
        case 'expire-trial':
            return {
                plan: 'free',
                accountStatus: 'free',
                trialExpiresAt: new Date(now - (60 * 1000)).toISOString(),
                monthlyCredits: 0,
                reason: `Admin expired the free trial for ${user.userName}.`,
                successMessage: `Free trial expired for ${user.userName}.`
            };
        case 'grant-access-pass':
            return {
                plan: 'studio',
                accountStatus: 'studio_active',
                accessPassExpiresAt: thirtyDaysFromNow,
                reason: `Admin granted a 30-day Studio Access Pass to ${user.userName}.`,
                successMessage: `30-day Studio Access Pass granted to ${user.userName}.`
            };
        case 'expire-access-pass':
            return {
                accessPassExpiresAt: new Date(now - (60 * 1000)).toISOString(),
                accountStatus: 'paid_suspended',
                reason: `Admin expired the Studio Access Pass for ${user.userName}.`,
                successMessage: `Studio Access Pass expired for ${user.userName}.`
            };
        default:
            return null;
    }
}

function runAdminQuickAction(userId, action) {
    const user = AdminUserDirectoryService.getAdminVisibleUserById(userId) || UserService.getUserById(userId);
    if (!user) {
        showCustomAlert(`Error: User ${userId} not found.`, 'Error');
        return;
    }

    const overrides = getQuickActionOverrides(action, user);
    if (!overrides) return;

    saveUserUpdates(userId, overrides);
}


function handleAddNewUser() {
    const userName = prompt("Enter the new user's name:");
    if (!userName) return;

    const email = prompt(`Enter the email for ${userName}:`);
    if (!email) return;

    const newUser = UserService.addNewUser(userName, email);

    if (newUser) {
        showCustomAlert(`Successfully created user: ${userName} (ID: ${newUser.userId})`, 'User Created');
        renderUserList();
    } else {
        showCustomAlert('Failed to create user. Please check the console.', 'Error');
    }
}


// --- UI Rendering Logic ---

function getUserStatus(user) {
    if (!user || !user.plan) return { text: 'Error', class: 'status-blocked' };
    const credits = user.credits?.current ?? 0;
    const effectiveAccountStatus = UserService.getEffectiveAccountStatus(user);

    if (UserService.isAdminProfile(user)) return { text: 'Admin', class: 'status-active' };
    if (effectiveAccountStatus === 'studio_active') return { text: 'Studio', class: 'status-active' };
    if (effectiveAccountStatus === 'paid_suspended') return { text: 'Suspended', class: 'status-blocked' };
    
    if (user.plan === 'free') {
        if (UserService.isFreeTrialExpired(user)) {
            return { text: 'Trial Ended', class: 'status-blocked' };
        }
        return credits > 0 ? 
               { text: 'Free', class: 'status-free' } : 
               { text: 'Blocked', class: 'status-blocked' };
    }
    if (user.plan === 'pro') {
        if (user.planStatus === 'active' && credits > 0) return { text: 'Active', class: 'status-active' };
        if (user.planStatus === 'grace_period') return { text: 'Grace Period', class: 'status-grace' };
        return { text: 'Blocked', class: 'status-blocked' };
    }
    return { text: 'Unknown', class: '' };
}

function createUserListItem(user) {
    const item = document.createElement('div');
    item.className = 'user-list-item';
    if (user.userId === selectedUserId) item.classList.add('active');
    item.dataset.userId = user.userId;

    const status = getUserStatus(user);
    const planName = UserService.isAdminProfile(user) ? 'Admin' : (user.plan || 'unknown');
    const currentCredits = user.credits?.current ?? 0;
    
    // [FIX] Call the function via the imported UserService
    const balanceUSD = UserService.convertCreditsToUSD(currentCredits);

    item.innerHTML = `
        <div><span class="status-indicator ${status.class}">${status.text}</span></div>
        <div class="user-name-email">
            ${user.userName || 'N/A'}
            <small>${user.userId} / ${user.email || 'N/A'}</small>
        </div>
        <div>${planName.charAt(0).toUpperCase() + planName.slice(1)}</div>
        <div>$${balanceUSD.toFixed(2)}</div>
        <div class="quick-actions">
             <button class="btn-icon" title="Edit User" data-action="edit">✏️</button>
        </div>
    `;
    return item;
}
export function renderUserList() {
    const container = document.getElementById('user-list-container');
    const searchInput = normalizeAdminUserSearchQuery(activeAdminUserSearchQuery).toLowerCase();
    const planFilter = document.getElementById('user-plan-filter').value;
    if (!container) return;
    syncAdminUserSearchInputFromState();
    const allUsers = AdminUserDirectoryService.getAdminVisibleUsers();
    const filteredUsers = allUsers.filter(user => {
        if (!user || !user.plan) return false;
        if (planFilter !== 'all' && user.plan !== planFilter) return false;

        if (!searchInput) return true;

        const userName = String(user.userName || '').toLowerCase();
        const email = String(user.email || '').toLowerCase();
        const userId = String(user.userId || '').toLowerCase();
        return userName.includes(searchInput) || email.includes(searchInput) || userId.includes(searchInput);
    });
    container.innerHTML = '';
    filteredUsers.forEach(user => container.appendChild(createUserListItem(user)));
}

async function refreshAndRenderUserList(options = {}) {
    await refreshUserDirectoryIfNeeded(options);
    renderUserList();

    if (selectedUserId) {
        const selectedUser = AdminUserDirectoryService.getAdminVisibleUserById(selectedUserId) || UserService.getUserById(selectedUserId);
        if (selectedUser) {
            renderUserDetail(selectedUserId);
        } else {
            const detailSection = document.getElementById('user-detail-section');
            if (detailSection) {
                detailSection.classList.add('hidden');
                detailSection.innerHTML = '';
                detailSection.dataset.userId = '';
            }
            selectedUserId = null;
        }
    }
}

export function renderUserDetail(userId) {
    selectedUserId = userId;
    const detailSection = document.getElementById('user-detail-section');
    if (!detailSection) return;
    detailSection.dataset.userId = userId;

    const user = AdminUserDirectoryService.getAdminVisibleUserById(userId) || UserService.getUserById(userId);
    if (!user) {
        detailSection.classList.add('hidden');
        return;
    }

    const isBackendManaged = UserService.isBackendManagedProfile(user);
    const isProtectedAdmin = UserService.isAdminProfile(user);
    const disableControls = isProtectedAdmin ? 'disabled' : '';
    const planOptionsHTML = UserService.isAdminProfile(user)
        ? '<option value="studio" selected>Studio (Admin-managed)</option>'
        : (isBackendManaged
        ? `
            <option value="free" ${user.plan === 'free' ? 'selected' : ''}>Free</option>
            <option value="pro" ${user.plan === 'pro' ? 'selected' : ''}>Pro</option>
            <option value="studio" ${user.plan === 'studio' ? 'selected' : ''}>Studio</option>
        `
        : `
            <option value="free" ${user.plan === 'free' ? 'selected' : ''}>Free</option>
            <option value="pro" ${user.plan === 'pro' ? 'selected' : ''}>Pro</option>
            <option value="studio" ${user.plan === 'studio' ? 'selected' : ''}>Studio</option>
        `);
    let studioPlanSection = '';
    if (user.plan === 'studio' && !UserService.isAdminProfile(user)) {
        if (isBackendManaged) {
            const accessPassExpiry = user.backendAccount?.accessPassExpiresAt || user.accessPassExpiresAt || null;
            studioPlanSection = `
                <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <label>Studio Access</label>
                    <input type="text" value="${accessPassExpiry ? formatTimestamp(accessPassExpiry) : 'Managed by Stripe subscription / no active access pass'}" readonly class="read-only-display">
                </div>
            `;
        } else {
            const endDate = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
            const daysRemaining = endDate ? Math.ceil((endDate - Date.now()) / (1000 * 60 * 60 * 24)) : 'N/A';
            const statusText = daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expired';

            studioPlanSection = `
                <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <label>Studio Subscription</label>
                    <input type="text" value="${endDate ? endDate.toLocaleDateString() : 'Not set'} (${statusText})" readonly class="read-only-display">
                    <button class="btn btn-small" data-action="extend-sub" style="margin-top: 5px;">Extend 30 Days</button>
                </div>
            `;
        }
    }

    const creditBuckets = UserService.getCreditBucketSummary(user);
    const balanceUSD = UserService.convertCreditsToUSD(creditBuckets.totalMicrocredits);
    const tokenUsage = user.credits.tokenUsage || { prompt: 0, completion: 0 };
    const totalTokenSpend = tokenUsage.prompt + tokenUsage.completion;
    const monthlyCreditsUSD = UserService.convertCreditsToUSD(creditBuckets.monthlyMicrocredits);
    const topupCreditsUSD = UserService.convertCreditsToUSD(creditBuckets.topupMicrocredits);
    const accessPassExpiry = user.backendAccount?.accessPassExpiresAt || user.accessPassExpiresAt || null;
    const trialExpiry = user.trialEndsAt || user.backendAccount?.trialEndsAt || null;
    const effectiveAccountStatus = isProtectedAdmin
        ? 'studio_active'
        : UserService.getEffectiveAccountStatus(user);
    const automaticAccountStatus = getAutomaticAccountStatusForPlan(user.plan, user.role);
    const selectedAccountStatusValue = effectiveAccountStatus === automaticAccountStatus
        ? 'auto'
        : effectiveAccountStatus;
    const trialExpiresAtValue = toDatetimeLocalValue(trialExpiry);
    const accessPassExpiresAtValue = toDatetimeLocalValue(accessPassExpiry);

    detailSection.innerHTML = `
        <h4>Details for ${user.userName} (${user.userId})</h4>
        <div class="user-detail-grid">
            <div>
                <div class="form-group">
                    <label>Plan</label>
                    <select id="detail-user-plan" ${disableControls}>
                        ${planOptionsHTML}
                    </select>
                </div>
                <div class="form-group">
                    <label>Account Status</label>
                    <select id="detail-user-account-status" ${disableControls}>
                        <option value="auto" ${selectedAccountStatusValue === 'auto' ? 'selected' : ''}>Auto From Plan</option>
                        <option value="free" ${selectedAccountStatusValue === 'free' ? 'selected' : ''}>Free</option>
                        <option value="studio_active" ${selectedAccountStatusValue === 'studio_active' ? 'selected' : ''}>Studio Active</option>
                        <option value="pro_active" ${selectedAccountStatusValue === 'pro_active' ? 'selected' : ''}>Pro Active</option>
                        <option value="paid_suspended" ${selectedAccountStatusValue === 'paid_suspended' ? 'selected' : ''}>Paid Suspended</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Monthly Credits (Microcredits)</label>
                    <input type="number" id="detail-user-monthly-credits" min="0" value="${creditBuckets.monthlyMicrocredits}" ${disableControls}>
                </div>
                <div class="form-group">
                    <label>Top-up Credits (Microcredits)</label>
                    <input type="number" id="detail-user-topup-credits" min="0" value="${creditBuckets.topupMicrocredits}" ${disableControls}>
                </div>
                <div class="form-group">
                    <label>Trial Expires At</label>
                    <input type="datetime-local" id="detail-user-trial-expires-at" value="${trialExpiresAtValue}" ${disableControls}>
                </div>
                <div class="form-group">
                    <label>Access Pass Expires At</label>
                    <input type="datetime-local" id="detail-user-access-pass-expires-at" value="${accessPassExpiresAtValue}" ${disableControls}>
                </div>
                <div class="form-group">
                    <label>Money Refill (USD)</label>
                    <div class="refill-presets">
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="5" ${disableControls}>$5</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="10" ${disableControls}>$10</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="30" ${disableControls}>$30</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="50" ${disableControls}>$50</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="100" ${disableControls}>$100</button>
                    </div>
                </div>
                <button id="detail-save-user-btn" class="btn" ${disableControls}>Save Account Controls</button>
                <div class="admin-test-controls">
                    <label>Quick Test Controls</label>
                    <div class="admin-quick-action-grid">
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="reset-credits" ${disableControls}>Reset Credits</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="suspend-account" ${disableControls}>Suspend</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="reactivate-account" ${disableControls}>Reactivate</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="reset-trial" ${disableControls}>Reset Trial</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="expire-trial" ${disableControls}>Expire Trial</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="grant-access-pass" ${disableControls}>Grant Access Pass</button>
                        <button class="btn btn-small btn-secondary" data-action="quick-test" data-quick-action="expire-access-pass" ${disableControls}>Expire Access Pass</button>
                        <button class="btn btn-small btn-danger" data-action="delete-user" ${disableControls}>Delete User</button>
                    </div>
                </div>
                <div>
                    ${studioPlanSection}
                </div>
            </div>
            <div>
                <div class="form-group">
                    <label>Balance (USD Value)</label>
                    <input type="text" value="$${balanceUSD.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Effective Account Status</label>
                    <input type="text" value="${effectiveAccountStatus}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Monthly Credits (Pro)</label>
                    <input type="text" value="$${monthlyCreditsUSD.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Top-up Credits</label>
                    <input type="text" value="$${topupCreditsUSD.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Studio Access Pass</label>
                    <input type="text" value="${accessPassExpiry ? formatTimestamp(accessPassExpiry) : 'Not active'}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Trial Ends</label>
                    <input type="text" value="${trialExpiry ? formatTimestamp(trialExpiry) : 'Not active'}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Usage (USD Value)</label>
                    <input type="text" value="$${(user.credits.totalUsedUSD || 0).toFixed(6)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Refilled (USD)</label>
                    <input type="text" value="$${(user.credits.totalRefilledUSD || 0).toFixed(2)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Usage Cost (USD)</label>
                    <input type="text" value="$${(user.credits.totalUsedUSD || 0).toFixed(6)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Tokens</label>
                    <input type="text" value="${totalTokenSpend.toLocaleString()}" readonly class="read-only-display">
                </div>
                <button id="view-activity-log-btn" class="btn btn-secondary">View Activity Log</button>
                <button id="view-account-log-btn" class="btn btn-secondary">View Account Log</button>
            </div>
        </div>
    `;
    detailSection.classList.remove('hidden');

    renderUserList();
}

export async function initAdminUserManagerUI() {
    await refreshAndRenderUserList();
    const userSearchInput = document.getElementById('user-search-input');
    if (userSearchInput) {
        userSearchInput.setAttribute('autocomplete', 'off');
        userSearchInput.setAttribute('autocapitalize', 'off');
        userSearchInput.setAttribute('spellcheck', 'false');
        userSearchInput.value = activeAdminUserSearchQuery;
        userSearchInput.addEventListener('input', (event) => {
            activeAdminUserSearchQuery = normalizeAdminUserSearchQuery(event.target.value);
            renderUserList();
        });
    }
    document.getElementById('user-plan-filter')?.addEventListener('change', renderUserList);
    document.getElementById('refresh-users-btn')?.addEventListener('click', () => {
        refreshAndRenderUserList({ force: true, showError: true }).catch((error) => {
            console.error('Could not refresh the admin user list.', error);
        });
    });
    
    document.getElementById('user-list-container')?.addEventListener('click', (e) => {
        const userItem = e.target.closest('.user-list-item');
        if (!userItem) return;
        const userId = userItem.dataset.userId;
        renderUserDetail(userId);
    });

    document.getElementById('add-new-user-btn')?.addEventListener('click', handleAddNewUser);

    const detailSection = document.getElementById('user-detail-section');
    if (detailSection) {
        detailSection.addEventListener('click', (e) => {
            const target = e.target;
            const currentUserId = detailSection.dataset.userId;
            if (!currentUserId) return;

            if (target.id === 'detail-save-user-btn') {
                saveUserUpdates(currentUserId);
            }
            if (target.dataset.action === 'refill') {
                const amount = parseInt(target.dataset.amount, 10);
                refillUserCredits(currentUserId, amount);
            }
            if (target.dataset.action === 'quick-test') {
                runAdminQuickAction(currentUserId, target.dataset.quickAction);
            }
            if (target.dataset.action === 'delete-user') {
                deleteUserAccount(currentUserId);
            }
            if (target.id === 'view-activity-log-btn') {
                showActivityLogModal(currentUserId); 
            }
            if (target.id === 'view-account-log-btn') {
                showAccountLogModal(currentUserId);
            }
            
            if (target.dataset.action === 'extend-sub') {
                UserService.extendStudioSubscription(currentUserId);
                renderUserDetail(currentUserId);
            }
        });
    }

    stateManager.bus.subscribe('user:settingsUpdated', () => {
        console.log("Admin UI received 'user:settingsUpdated' event. Re-rendering user list.");
        renderUserList();
        if (selectedUserId) {
            renderUserDetail(selectedUserId);
        }
    });

    window.addEventListener('focus', () => {
        refreshAndRenderUserList({ force: true }).catch((error) => {
            console.error('Could not refresh users on window focus.', error);
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshAndRenderUserList({ force: true }).catch((error) => {
                console.error('Could not refresh users when admin tab became visible.', error);
            });
        }
    });
}

// ประกาศตัวแปรสำหรับ Modal ใหม่
const accountLogModal = document.getElementById('account-log-modal');
const accountLogModalBody = document.getElementById('account-log-body');
const accountLogModalTitle = document.getElementById('account-log-title');
let accountLogCurrentUserId = null;


// [IMPORTANT] สร้างฟังก์ชัน init เพื่อผูก Event Listener ทั้งหมด
// export function initAccountLogUI() {
//     // 1. ผูก Event กับปุ่ม "View Account Log" ที่อยู่ใน Detail Panel
//     const detailSection = document.getElementById('user-detail-section');
//     detailSection?.addEventListener('click', (e) => {
//         if (e.target.id === 'view-account-log-btn') {
//             const userId = e.currentTarget.dataset.userId;
//             if (userId) showAccountLogModal(userId);
//         }
//     });

//     // 2. ผูก Event กับปุ่มใน Modal
//     accountLogModal?.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', hideAccountLogModal));
//     accountLogModal?.querySelector('#export-account-log-csv-btn')?.addEventListener('click', exportAccountLogToCSV);
// }
