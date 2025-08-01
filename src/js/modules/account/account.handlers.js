// Create new file: src/js/modules/account/account.handlers.js

import * as UserService from '../user/user.service.js';
import { showCustomAlert } from '../../core/core.ui.js';
import { renderAccountModal } from './account.ui.js'; // We'll need this to refresh the modal

/**
 * Handles the user's request to change their own plan.
 * @param {string} newPlan The plan to switch to.
 */
export function handlePlanChange(newPlan) {
    const currentUser = UserService.getCurrentUserProfile();
    if (!currentUser) return;

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

    console.log(`HANDLER: Refilling $${amountUSD} for ${currentUser.userId}`);
    UserService.refillCredits(currentUser.userId, amountUSD); // This also triggers the save and event
    showCustomAlert(`Successfully added credits worth $${amountUSD}!`, 'Success');
}