//src/js/modules/admin/admin.ui.js

import * as UserService from '../user/user.service.js';
import * as AdminModelManagerUI from './admin-model-manager.ui.js';
import * as AdminUserDirectoryService from './admin-user-directory.service.js';
import { showCustomAlert } from '../../core/core.ui.js';
import { stateManager } from '../../core/core.state.js';
import { loadAllProviderModels, loadAllSystemModels } from '../../core/core.api.js';
import * as AdminBillingService from './admin-billing.service.js';
import * as AdminProviderBalanceService from './admin-provider-balance.service.js';
import * as BackendAccountDataService from '../billing/backend-account-data.service.js';
import * as BackendBillingSettingsService from '../billing/backend-billing-settings.service.js';

function setBillingSyncStatusTone(element, tone = 'info') {
    if (!element) return;
    element.classList.remove('is-success', 'is-error', 'is-loading');
    if (tone === 'success') element.classList.add('is-success');
    if (tone === 'error') element.classList.add('is-error');
    if (tone === 'loading') element.classList.add('is-loading');
}

function renderUserEditor() {
    const profile = UserService.getCurrentUserProfile();
    if (!profile) return;
    document.getElementById('admin-user-id').value = profile.userId;
    document.getElementById('admin-user-plan').value = profile.plan;
    document.getElementById('admin-user-credits').value = profile.credits;
}


function saveUserUpdates(userId) {
    const plan = document.getElementById('detail-user-plan').value;
    const credits = parseInt(document.getElementById('detail-user-credits').value, 10);
    const user = UserService.getUserById(userId);

    if (!user) {
        showCustomAlert(`Error: User ${userId} not found.`, 'Error');
        return;
    }
    
    const originalPlan = user.plan;
    user.plan = plan;
    user.credits.current = credits;

    if (user.plan === 'pro' && user.credits.current > 0 && user.planStatus !== 'active') {
        user.planStatus = 'active';
        user.gracePeriodStartDate = null;
        user.logs.push({ timestamp: Date.now(), action: 'Account status reactivated by admin.' });
    }

    if (originalPlan !== plan) {
        user.logs.push({ timestamp: Date.now(), action: `Admin changed plan from ${originalPlan} to ${plan}.` });
    }

    UserService.saveFullUserProfile(user);
    showCustomAlert(`User ${user.userName} updated successfully!`, 'Success');
    renderUserList();
    renderUserDetail(userId);
}

function populateSystemSettings() {
    const systemSettings = UserService.getSystemApiSettings();
    const apiKeyInput = document.getElementById('admin-api-key');
    const ollamaUrlInput = document.getElementById('admin-ollama-url');
    if (apiKeyInput) apiKeyInput.value = systemSettings.openrouterKey || '';
    if (ollamaUrlInput) ollamaUrlInput.value = systemSettings.ollamaBaseUrl || '';
}

function formatSyncTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
}

async function resolveIssuedCreditPoolSummary() {
    const localTotalIssuedMicrocredits = UserService.getTotalCreditsIssued();
    const visibleUserTotalIssuedMicrocredits = AdminUserDirectoryService.getAdminVisibleUsers().reduce((sum, user) => {
        return sum + (Number(user?.credits?.current) || 0);
    }, 0);
    const fallbackIssuedMicrocredits = Math.max(localTotalIssuedMicrocredits, visibleUserTotalIssuedMicrocredits);

    if (!BackendAccountDataService.isBackendAccountDataAvailable()) {
        return {
            totalIssuedMicrocredits: fallbackIssuedMicrocredits,
            source: 'local'
        };
    }

    try {
        const summary = await BackendAccountDataService.fetchBackendWalletPoolSummary();
        const backendIssuedMicrocredits = Math.max(Number(summary?.totalIssuedMicrocredits) || 0, 0);
        return {
            totalIssuedMicrocredits: Math.max(backendIssuedMicrocredits, fallbackIssuedMicrocredits),
            source: backendIssuedMicrocredits >= fallbackIssuedMicrocredits ? 'backend' : 'visible-users'
        };
    } catch (error) {
        console.error('Failed to load backend wallet pool summary. Falling back to local user credits.', error);
        return {
            totalIssuedMicrocredits: fallbackIssuedMicrocredits,
            source: 'local'
        };
    }
}

async function renderBillingInfoAsync() {
    const billingInfo = AdminBillingService.getBillingInfo();
    const { totalIssuedMicrocredits, source: issuedCreditsSource } = await resolveIssuedCreditPoolSummary();

    const balanceInput = document.getElementById('billing-balance-usd');
    const usedInput = document.getElementById('billing-used-usd');
    const remainingInput = document.getElementById('billing-remaining-usd');
    const markupInput = document.getElementById('billing-markup-rate');
    const poolInput = document.getElementById('billing-distributable-credits');
    const issuedInput = document.getElementById('billing-issued-credits');
    const warningMessageEl = document.getElementById('billing-warning-message');
    const syncStatusEl = document.getElementById('billing-sync-status');
    const syncBtn = document.getElementById('sync-openrouter-balance-btn');
    
    const remainingUSD = (billingInfo.balanceUSD || 0) - (billingInfo.usedUSD || 0);
    const markupRate = billingInfo.markupRate || 1;
    const creditPool = remainingUSD * markupRate * 1000000;

    // Compare the live provider balance against the total balance currently sitting in user wallets.
    const issuedCreditsUSDValue = totalIssuedMicrocredits / (markupRate * 1000000);

    if (balanceInput) balanceInput.value = (billingInfo.balanceUSD || 0).toFixed(2);
    if (balanceInput) balanceInput.readOnly = billingInfo.providerSource === 'openrouter';
    if (markupInput) markupInput.value = markupRate;
    if (usedInput) usedInput.value = (billingInfo.usedUSD || 0).toFixed(6);
    if (remainingInput) remainingInput.value = remainingUSD.toFixed(8); // Show as currency
    if (poolInput) poolInput.value = creditPool.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (issuedInput) issuedInput.value = `$${issuedCreditsUSDValue.toFixed(2)}`; // Display as USD
    if (issuedInput) {
        issuedInput.title = issuedCreditsSource === 'backend'
            ? 'Calculated from the live sum of all non-admin Supabase wallet balances.'
            : issuedCreditsSource === 'visible-users'
                ? 'Calculated from the highest visible non-admin wallet total to avoid understating issued credits.'
            : 'Calculated from the local user credit cache.';
    }

    if (syncBtn) {
        syncBtn.disabled = !AdminProviderBalanceService.isProviderBalanceSyncAvailable();
    }

    if (syncStatusEl) {
        if (!AdminProviderBalanceService.isProviderBalanceSyncAvailable()) {
            syncStatusEl.textContent = 'Provider sync requires Supabase auth and a deployed Edge Function.';
            setBillingSyncStatusTone(syncStatusEl, 'info');
        } else if (billingInfo.providerLastError && billingInfo.providerSource === 'openrouter') {
            const syncedAtLabel = formatSyncTimestamp(billingInfo.providerSyncedAt);
            syncStatusEl.textContent = syncedAtLabel
                ? `Last OpenRouter sync was ${syncedAtLabel}. Latest sync failed: ${billingInfo.providerLastError}`
                : `Latest provider sync failed: ${billingInfo.providerLastError}`;
            setBillingSyncStatusTone(syncStatusEl, 'error');
        } else if (billingInfo.providerLastError) {
            syncStatusEl.textContent = `Provider sync unavailable: ${billingInfo.providerLastError}`;
            setBillingSyncStatusTone(syncStatusEl, 'error');
        } else if (billingInfo.providerSource === 'openrouter') {
            const syncedAtLabel = formatSyncTimestamp(billingInfo.providerSyncedAt);
            const keyLabel = billingInfo.providerKeyLabel ? ` Key: ${billingInfo.providerKeyLabel}.` : '';
            syncStatusEl.textContent = syncedAtLabel
                ? `Live OpenRouter balance synced at ${syncedAtLabel}.${keyLabel}`
                : `Live OpenRouter balance is active.${keyLabel}`;
            setBillingSyncStatusTone(syncStatusEl, 'success');
        } else {
            syncStatusEl.textContent = 'Using local billing values until provider sync succeeds.';
            setBillingSyncStatusTone(syncStatusEl, 'info');
        }
    }

    if (warningMessageEl) {
        if (issuedCreditsUSDValue > remainingUSD) {
            const usdNeeded = issuedCreditsUSDValue - remainingUSD;
            warningMessageEl.innerHTML = `⚠️ **Warning:** You have issued credits worth ~$${issuedCreditsUSDValue.toFixed(2)}, but only have ~$${remainingUSD.toFixed(2)} remaining. You have a deficit of <strong>$${usdNeeded.toFixed(2)}</strong>.`;
            warningMessageEl.classList.remove('hidden', 'billing-safe');
            warningMessageEl.classList.add('billing-warning');
        } else {
            warningMessageEl.textContent = `✅ Credit pool is sufficient to cover all issued credits.`;
            warningMessageEl.classList.remove('hidden', 'billing-warning');
            warningMessageEl.classList.add('billing-safe');
        }
    }
}

export function renderBillingInfo() {
    renderBillingInfoAsync().catch((error) => {
        console.error('Failed to render admin billing info.', error);
    });
}

async function syncOpenRouterBalance() {
    const syncBtn = document.getElementById('sync-openrouter-balance-btn');
    const syncStatusEl = document.getElementById('billing-sync-status');

    if (!AdminProviderBalanceService.isProviderBalanceSyncAvailable()) {
        if (syncStatusEl) {
            syncStatusEl.textContent = 'Provider sync requires Supabase auth plus a deployed Edge Function.';
            setBillingSyncStatusTone(syncStatusEl, 'error');
        }
        return;
    }

    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
    }
    if (syncStatusEl) {
        syncStatusEl.textContent = 'Syncing live OpenRouter balance...';
        setBillingSyncStatusTone(syncStatusEl, 'loading');
    }

    try {
        const snapshot = await AdminProviderBalanceService.syncOpenRouterProviderBalance();
        AdminBillingService.saveProviderBalanceSnapshot(snapshot);
        renderBillingInfo();
    } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown sync error.';
        AdminBillingService.saveProviderSyncError(errorMessage);
        renderBillingInfo();
    } finally {
        if (syncBtn) {
            syncBtn.disabled = !AdminProviderBalanceService.isProviderBalanceSyncAvailable();
            syncBtn.textContent = 'Sync OpenRouter Balance';
        }
    }
}

async function saveBillingSettings() {
    const billingInfo = AdminBillingService.getBillingInfo();
    const balanceUSD = billingInfo.providerSource === 'openrouter'
        ? billingInfo.balanceUSD
        : document.getElementById('billing-balance-usd').value;
    const markupRate = document.getElementById('billing-markup-rate').value;

    if (BackendBillingSettingsService.isBackendBillingSettingsAvailable()) {
        try {
            await BackendBillingSettingsService.saveBackendMarkupRate(markupRate);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Could not save backend billing settings.';
            showCustomAlert(errorMessage, 'Save Failed');
            return;
        }
    }

    AdminBillingService.saveBillingInfo({ balanceUSD, markupRate });
    showCustomAlert('Billing settings saved!', 'Success');
    renderBillingInfo(); // Re-render to confirm
}

export function initAdminUI() {
    populateSystemSettings();

    document.getElementById('save-system-settings-btn')?.addEventListener('click', () => {
        const key = document.getElementById('admin-api-key').value;
        const url = document.getElementById('admin-ollama-url').value;
        
        // 1. บันทึก Keys (เหมือนเดิม)
        UserService.saveSystemApiSettings({ openrouter: key, ollamaBaseUrl: url });
        showCustomAlert('System API settings saved!', 'Success');

        // 2. [CRITICAL FIX] เรียกใช้ฟังก์ชัน "loadAllSystemModels" ตัวใหม่
        console.log("API Keys saved, triggering a full model refresh...");
        loadAllSystemModels(); 
    });


    // ... Event Listener และ Subscriptions อื่นๆ ยังคงเหมือนเดิม ...
    renderBillingInfo();
    document.getElementById('sync-openrouter-balance-btn')?.addEventListener('click', syncOpenRouterBalance);
    document.getElementById('save-billing-btn')?.addEventListener('click', () => {
        saveBillingSettings().catch((error) => {
            console.error('Failed to save billing settings.', error);
        });
    });
    stateManager.bus.subscribe('user:settingsUpdated', renderBillingInfo);

    if (AdminProviderBalanceService.isProviderBalanceSyncAvailable()) {
        syncOpenRouterBalance().catch((error) => {
            console.error('Initial provider balance sync failed.', error);
        });
    }
}
