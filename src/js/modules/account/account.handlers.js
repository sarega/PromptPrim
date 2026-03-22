// Create new file: src/js/modules/account/account.handlers.js

import * as UserService from '../user/user.service.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as StripeBillingService from '../billing/stripe-billing.service.js';
import * as AccountProfileService from './account-profile.service.js';

function getTopupBlockedMessage(currentUser) {
    if (!currentUser) {
        return 'Only active Pro accounts can purchase Top-up Credits.';
    }
    if (UserService.isStudioProfile(currentUser)) {
        return 'Studio Plan is strict BYOK. It does not purchase or use PromptPrim Top-up Credits for normal model usage.';
    }
    if (UserService.isPaidSuspendedProfile(currentUser)) {
        return 'Top-up Credits stay in your wallet, but you need to renew Pro or activate Studio Access Pass before buying or using them again.';
    }
    return 'Free is trial-only. Upgrade to Pro to purchase Top-up Credits.';
}

/**
 * Handles the user's request to change their own plan.
 * @param {string} newPlan The plan to switch to.
 */
export function handlePlanChange(newPlan) {
    const currentUser = UserService.getCurrentUserProfile();
    if (!currentUser) return;
    if (UserService.isAdminProfile(currentUser)) {
        showCustomAlert('Admin account plan is fixed and cannot be changed here.', 'Plan Locked');
        return;
    }
    if (UserService.isBackendManagedProfile(currentUser)) {
        showCustomAlert('Use the live billing offering buttons in your account panel for Supabase accounts.', 'Use Checkout');
        return;
    }

    if (confirm(`Are you sure you want to switch to the ${newPlan} plan?`)) {
        console.log(`HANDLER: Changing plan for ${currentUser.userId} to ${newPlan}`);
        UserService.changeUserPlan(currentUser.userId, newPlan); // This will trigger the save and publish the event
        showCustomAlert(`Successfully switched to ${newPlan} plan!`, 'Success');
        // No need to call renderAccountModal here anymore, the event listener will handle it
    }
}

/**
 * Handles the user's request to refill their own credits.
 * @param {number} amountUSD The USD amount to refill.
 */
export function handleSelfRefill(amountUSD) {
    const currentUser = UserService.getCurrentUserProfile();
    if (!currentUser) return;
    if (!UserService.canPurchaseTopupCredits(currentUser)) {
        showCustomAlert(getTopupBlockedMessage(currentUser), 'Top-up Credits');
        return;
    }
    if (UserService.isBackendManagedProfile(currentUser)) {
        showCustomAlert('Use the live billing offering buttons in your account panel for Supabase accounts.', 'Use Checkout');
        return;
    }

    console.log(`HANDLER: Refilling $${amountUSD} for ${currentUser.userId}`);
    const success = UserService.refillCredits(currentUser.userId, amountUSD);
    if (!success) {
        showCustomAlert(getTopupBlockedMessage(currentUser), 'Top-up Credits');
        return;
    }
    showCustomAlert(`Successfully added credits worth $${amountUSD}!`, 'Success');
}

export async function handleCheckoutOffering(offeringKey, offeringKind = '') {
    const currentUser = UserService.getCurrentUserProfile();
    const normalizedOfferingKey = String(offeringKey || '').trim();
    const normalizedOfferingKind = String(offeringKind || '').trim().toLowerCase();
    const isTopupOffering = normalizedOfferingKind === 'topup' || normalizedOfferingKey.startsWith('topup_');

    if (currentUser && isTopupOffering && !UserService.canPurchaseTopupCredits(currentUser)) {
        showCustomAlert(getTopupBlockedMessage(currentUser), 'Top-up Credits');
        return;
    }

    try {
        const result = await StripeBillingService.createCheckoutSession(normalizedOfferingKey);
        const checkoutUrl = String(result?.url || '').trim();
        if (!checkoutUrl) {
            throw new Error('Stripe checkout did not return a redirect URL.');
        }
        window.location.href = checkoutUrl;
    } catch (error) {
        showCustomAlert(
            error instanceof Error ? error.message : 'Could not start Stripe checkout.',
            'Checkout Failed'
        );
    }
}

export async function handleManageBilling() {
    try {
        const result = await StripeBillingService.createCustomerPortalSession();
        const portalUrl = String(result?.url || '').trim();
        if (!portalUrl) {
            throw new Error('Stripe customer portal did not return a redirect URL.');
        }
        window.location.href = portalUrl;
    } catch (error) {
        showCustomAlert(
            error instanceof Error ? error.message : 'Could not open Stripe customer portal.',
            'Billing Portal Failed'
        );
    }
}

export async function handleActivateAccessPass() {
    const currentUser = UserService.getCurrentUserProfile();
    if (!currentUser || !UserService.isBackendManagedProfile(currentUser)) {
        showCustomAlert('Studio Access Pass is only available for Supabase-backed accounts.', 'Unavailable');
        return;
    }

    if (!confirm('Activate Studio Access Pass for 30 days? This will deduct $7 from your Top-up Credits.')) {
        return;
    }

    try {
        await StripeBillingService.activateStudioAccessPass();
        await UserService.refreshCurrentUserFromBackend(null, { publish: true });
        showCustomAlert('Studio Access Pass activated for 30 days.', 'Success');
    } catch (error) {
        showCustomAlert(
            error instanceof Error ? error.message : 'Could not activate Studio Access Pass.',
            'Activation Failed'
        );
    }
}

export async function handleSaveAccountProfile(draft, options = {}) {
    const currentUser = UserService.getCurrentUserProfile();
    if (!currentUser) {
        showCustomAlert('No active account is available.', 'Profile');
        return;
    }

    try {
        const result = await AccountProfileService.saveEditableAccountProfile(draft, currentUser);
        if (UserService.isBackendManagedProfile(currentUser)) {
            await UserService.refreshCurrentUserFromBackend(null, { publish: true });
        }

        if (options.silentSuccess === true) {
            return true;
        }

        const successMessage = options.successMessage || 'Your account profile has been updated.';
        const extraNotice = String(result?.emailNotice || '').trim();
        showCustomAlert(
            extraNotice ? `${successMessage}\n\n${extraNotice}` : successMessage,
            options.successTitle || 'Profile Saved'
        );
        return true;
    } catch (error) {
        showCustomAlert(
            error instanceof Error ? error.message : 'Could not save your account profile.',
            options.errorTitle || 'Save Failed'
        );
        return false;
    }
}

export async function handleChangePassword({ nextPassword, confirmPassword } = {}) {
    const normalizedPassword = String(nextPassword || '');
    const normalizedConfirmation = String(confirmPassword || '');

    if (normalizedPassword.length < 8) {
        showCustomAlert('Password must be at least 8 characters long.', 'Password');
        return false;
    }

    if (normalizedPassword !== normalizedConfirmation) {
        showCustomAlert('Password confirmation does not match.', 'Password');
        return false;
    }

    try {
        await AccountProfileService.updateCurrentAccountPassword(normalizedPassword);
        showCustomAlert('Your password has been updated.', 'Password Updated');
        return true;
    } catch (error) {
        showCustomAlert(
            error instanceof Error ? error.message : 'Could not update your password.',
            'Password Update Failed'
        );
        return false;
    }
}

export async function handleSendRecoveryEmail(email) {
    try {
        await AccountProfileService.sendAccountRecoveryEmail(email);
        showCustomAlert(
            'Recovery instructions were sent. Check your email for the reset link.',
            'Recovery Email Sent'
        );
        return true;
    } catch (error) {
        showCustomAlert(
            error instanceof Error ? error.message : 'Could not send a recovery email.',
            'Recovery Failed'
        );
        return false;
    }
}
