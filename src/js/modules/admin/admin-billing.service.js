// src/js/modules/admin/admin-billing.service.js

const BILLING_DB_KEY = 'promptPrimAdminBilling_v1';

function getDefaultBillingInfo() {
    return {
        balanceUSD: 10.00,
        usedUSD: 0,
        markupRate: 2.5,
        providerSource: 'manual',
        providerSyncedAt: null,
        providerKeyLabel: '',
        providerLimit: null,
        providerLimitRemaining: null,
        providerLastError: ''
    };
}

// Reads the billing info from its own localStorage entry
export function getBillingInfo() {
    const stored = localStorage.getItem(BILLING_DB_KEY);
    if (stored) {
        return {
            ...getDefaultBillingInfo(),
            ...JSON.parse(stored)
        };
    }
    // Default values if nothing is stored yet
    return getDefaultBillingInfo();
}

// Saves the billing info to its own localStorage entry
export function saveBillingInfo(billingData) {
    const currentInfo = getBillingInfo();
    // Only update the fields that are meant to be saved from the form
    const nextMarkupRate = parseFloat(billingData.markupRate);
    if (Number.isFinite(nextMarkupRate) && nextMarkupRate > 0) {
        currentInfo.markupRate = nextMarkupRate;
    }

    if (currentInfo.providerSource !== 'openrouter') {
        currentInfo.balanceUSD = parseFloat(billingData.balanceUSD) || 0;
    }

    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}

export function saveProviderBalanceSnapshot(snapshot) {
    const currentInfo = getBillingInfo();
    currentInfo.balanceUSD = Number(snapshot?.credits?.totalCredits) || 0;
    currentInfo.usedUSD = Number(snapshot?.credits?.totalUsage) || 0;
    currentInfo.providerSource = 'openrouter';
    currentInfo.providerSyncedAt = snapshot?.syncedAt || new Date().toISOString();
    currentInfo.providerKeyLabel = String(snapshot?.key?.label || '').trim();
    currentInfo.providerLimit = Number.isFinite(Number(snapshot?.key?.limit)) ? Number(snapshot.key.limit) : null;
    currentInfo.providerLimitRemaining = Number.isFinite(Number(snapshot?.key?.limitRemaining))
        ? Number(snapshot.key.limitRemaining)
        : null;
    currentInfo.providerLastError = '';
    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}

export function saveProviderSyncError(message) {
    const currentInfo = getBillingInfo();
    currentInfo.providerLastError = String(message || '').trim();
    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}

export function clearProviderBalanceSnapshot() {
    const currentInfo = getBillingInfo();
    currentInfo.providerSource = 'manual';
    currentInfo.providerSyncedAt = null;
    currentInfo.providerKeyLabel = '';
    currentInfo.providerLimit = null;
    currentInfo.providerLimitRemaining = null;
    currentInfo.providerLastError = '';
    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}

// Logs the cost of an API call made by any user
export function logApiCost(costInUSD) {
    if (typeof costInUSD !== 'number' || costInUSD <= 0) return;
    
    const currentInfo = getBillingInfo();
    currentInfo.usedUSD += costInUSD;
    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}
