//src/js/modules/admin/admin.ui.js

import * as UserService from '../user/user.service.js';
import * as AdminModelManagerUI from './admin-model-manager.ui.js';
import { showCustomAlert } from '../../core/core.ui.js';
import { stateManager } from '../../core/core.state.js';
import { loadAllProviderModels } from '../../core/core.api.js';
import * as AdminBillingService from './admin-billing.service.js';

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

export function renderBillingInfo() {
    const billingInfo = AdminBillingService.getBillingInfo();
    const totalCreditsIssued = UserService.getTotalCreditsIssued();

    const balanceInput = document.getElementById('billing-balance-usd');
    const usedInput = document.getElementById('billing-used-usd');
    const remainingInput = document.getElementById('billing-remaining-usd');
    const markupInput = document.getElementById('billing-markup-rate');
    const poolInput = document.getElementById('billing-distributable-credits');
    const issuedInput = document.getElementById('billing-issued-credits');
    const warningMessageEl = document.getElementById('billing-warning-message');
    
    const remainingUSD = (billingInfo.balanceUSD || 0) - (billingInfo.usedUSD || 0);
    const markupRate = billingInfo.markupRate || 1;
    const creditPool = remainingUSD * markupRate * 1000000;

    // [NEW] Convert the total issued credits back to its USD value for comparison
    const issuedCreditsUSDValue = totalCreditsIssued / (markupRate * 1000000);

    if (balanceInput) balanceInput.value = (billingInfo.balanceUSD || 0).toFixed(2);
    if (markupInput) markupInput.value = markupRate;
    if (usedInput) usedInput.value = (billingInfo.usedUSD || 0).toFixed(6);
    if (remainingInput) remainingInput.value = remainingUSD.toFixed(8); // Show as currency
    if (poolInput) poolInput.value = creditPool.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (issuedInput) issuedInput.value = `$${issuedCreditsUSDValue.toFixed(2)}`; // Display as USD

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

function saveBillingSettings() {
    const balanceUSD = document.getElementById('billing-balance-usd').value;
    const markupRate = document.getElementById('billing-markup-rate').value;

    AdminBillingService.saveBillingInfo({ balanceUSD, markupRate });
    showCustomAlert('Billing settings saved!', 'Success');
    renderBillingInfo(); // Re-render to confirm
}

export function initAdminUI() {
    populateSystemSettings();

    document.getElementById('save-system-settings-btn')?.addEventListener('click', () => {
        const key = document.getElementById('admin-api-key').value;
        const url = document.getElementById('admin-ollama-url').value;
        UserService.saveSystemApiSettings({ openrouter: key, ollamaBaseUrl: url });
        showCustomAlert('System API settings saved!', 'Success');

        console.log("API Keys saved, triggering model refresh...");
        // [FIX] Pass the newly saved key to the model loader.
        loadAllProviderModels({ apiKey: key, isUserKey: false });
    });

    renderBillingInfo();
    document.getElementById('save-billing-btn')?.addEventListener('click', saveBillingSettings);
    stateManager.bus.subscribe('user:settingsUpdated', renderBillingInfo);

}