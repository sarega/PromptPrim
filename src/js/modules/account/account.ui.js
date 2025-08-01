// Create new file: src/js/modules/account/account.ui.js

import * as UserService from '../user/user.service.js';
import * as AccountHandlers from './account.handlers.js';
import { stateManager } from '../../core/core.state.js';

const modal = document.getElementById('account-modal');
const modalBody = document.getElementById('account-modal-body');

export function showAccountModal() {
    if (!modal) return;
    renderAccountModal();
    modal.style.display = 'flex';
}

function hideAccountModal() {
    if (!modal) return;
    modal.style.display = 'none';
}

// This function builds the content inside the modal
export function renderAccountModal() {
    const user = UserService.getCurrentUserProfile();
    if (!modalBody || !user) {
        modalBody.innerHTML = '<p>Could not load user data.</p>';
        return;
    }

    // --- [FIX] Added logic for the 'master' plan ---
    let planButtonsHTML = '';
    if (user.plan === 'free') {
        planButtonsHTML = '<button class="btn" data-action="switch-plan" data-plan="pro">Upgrade to Pro</button>';
    } else if (user.plan === 'pro') {
        planButtonsHTML = `
            <button class="btn btn-secondary" data-action="switch-plan" data-plan="free">Downgrade to Free</button>
            <button class="btn" data-action="switch-plan" data-plan="master">Upgrade to Master</button>
        `;
    } else if (user.plan === 'master') {
        // This is the missing part
        planButtonsHTML = `
            <button class="btn btn-secondary" data-action="switch-plan" data-plan="pro">Downgrade to Pro</button>
        `;
    }

    // --- Refill buttons ---
    const refillPresets = [10, 30, 50, 100];
    const refillButtonsHTML = refillPresets.map(p => 
        `<button class="btn btn-small btn-secondary" data-action="refill" data-amount="${p}">$${p}</button>`
    ).join('');

    const balanceUSD = convertCreditsToUSD(user.credits.current);

    // --- Final HTML structure (no changes here) ---
    modalBody.innerHTML = `
        <div class="user-detail-grid">
            <div>
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" value="${user.userName}" readonly>
                </div>
                 <div class="form-group">
                    <label>Current Plan</label>
                    <input type="text" value="${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}" readonly>
                </div>
                <div class="form-group">
                    <label>Credits</label>
                    <input type="text" value="${Math.floor(user.credits.current).toLocaleString()}" readonly>
                </div>
                <div class="form-group">
                    <label>Balance</label> 
                    <input type="text" value="$${balanceUSD.toFixed(2)}" readonly>
                </div>
            </div>
            <div>
                <div class="form-group">
                    <label>Change Plan</label>
                    <div>${planButtonsHTML || '<p>No plan changes available.</p>'}</div>
                </div>
                <div class="form-group">
                    <label>Refill Credits (USD)</label>
                    <div class="refill-presets">${user.plan === 'master' ? '<p>Not applicable.</p>' : refillButtonsHTML}</div>
                </div>
            </div>
        </div>
    `;
}
// This function sets up all event listeners for the modal
export function initAccountUI() {
    stateManager.bus.subscribe('ui:showAccountModal', showAccountModal);

    // Use event delegation for the modal
    modal?.addEventListener('click', (e) => {
        const target = e.target;

        // Close buttons
        if (target.matches('.modal-close-btn')) {
            hideAccountModal();
            return;
        }

        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        if (action === 'switch-plan') {
            AccountHandlers.handlePlanChange(actionTarget.dataset.plan);
        } else if (action === 'refill') {
            AccountHandlers.handleSelfRefill(parseInt(actionTarget.dataset.amount, 10));
        }
    });

    // If user data changes anywhere, re-render the modal if it's open
    stateManager.bus.subscribe('user:settingsUpdated', () => {
        if (modal && modal.style.display === 'flex') {
            renderAccountModal();
        }
    });
}