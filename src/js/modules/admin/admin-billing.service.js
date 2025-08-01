// src/js/modules/admin/admin-billing.service.js

const BILLING_DB_KEY = 'promptPrimAdminBilling_v1';

// Reads the billing info from its own localStorage entry
export function getBillingInfo() {
    const stored = localStorage.getItem(BILLING_DB_KEY);
    if (stored) {
        return JSON.parse(stored);
    }
    // Default values if nothing is stored yet
    return { balanceUSD: 10.00, usedUSD: 0, markupRate: 2.5 };
}

// Saves the billing info to its own localStorage entry
export function saveBillingInfo(billingData) {
    const currentInfo = getBillingInfo();
    // Only update the fields that are meant to be saved from the form
    currentInfo.balanceUSD = parseFloat(billingData.balanceUSD) || 0;
    currentInfo.markupRate = parseFloat(billingData.markupRate) || 1;
    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}

// Logs the cost of an API call made by any user
export function logApiCost(costInUSD) {
    if (typeof costInUSD !== 'number' || costInUSD <= 0) return;
    
    const currentInfo = getBillingInfo();
    currentInfo.usedUSD += costInUSD;
    localStorage.setItem(BILLING_DB_KEY, JSON.stringify(currentInfo));
}