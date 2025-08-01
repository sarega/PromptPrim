// สร้างไฟล์ใหม่ที่: src/js/modules/user/user.ui.js

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';
import * as SettingsUI from '../settings/settings.ui.js';
import * as UserService from './user.service.js';
import * as UserHandlers from './user.handlers.js';
// [FIX] Import ฟังก์ชันจัดการ Theme จากไฟล์กลาง
import { initThemeSwitcher } from '../../core/core.theme.js';

function updateUserProfileDisplay() {
    const profile = UserService.getCurrentUserProfile();
    if (!profile) return;

    const nameSpan = document.querySelector('#user-profile-menu .user-name');
    const planSpan = document.querySelector('#user-profile-menu .user-plan');
    const creditItem = document.getElementById('user-userCredits');
    const creditSpan = creditItem?.querySelector('span:last-child');
    const avatarSpan = document.querySelector('#user-profile-btn span');

    if (avatarSpan && profile.userName) avatarSpan.textContent = profile.userName.charAt(0).toUpperCase();
    if (nameSpan) nameSpan.textContent = profile.userName || 'User';

    if (planSpan) {
        let statusText = 'Unknown';
        let statusClass = 'status-blocked';

        if (profile.plan === 'master') {
            statusText = (profile.planStatus === 'active') ? 'Master Plan' : 'Subscription Expired';
            statusClass = (profile.planStatus === 'active') ? 'status-master' : 'status-blocked';
        } else if (profile.plan === 'pro') {
            if (profile.planStatus === 'active' && profile.credits.current > 0) {
                statusText = 'Pro Plan';
                statusClass = 'status-active';
            } else if (profile.planStatus === 'grace_period') {
                statusText = 'Pro (Grace Period)';
                statusClass = 'status-grace';
            } else {
                statusText = 'Account Blocked';
                statusClass = 'status-blocked';
            }
        } else if (profile.plan === 'free') {
            statusText = (profile.credits.current > 0) ? 'Free Plan' : 'Credits Depleted';
            statusClass = (profile.credits.current > 0) ? 'status-free' : 'status-blocked';
        }
        
        planSpan.textContent = statusText;
        planSpan.className = `user-plan ${statusClass}`;
    }

    if (creditItem && creditSpan) {
        if (profile.plan === 'master') {
            creditItem.style.display = 'none';
        } else {
            creditItem.style.display = 'flex';
            // Call the function via the imported UserService
            const balanceUSD = UserService.convertCreditsToUSD(profile.credits?.current ?? 0);
            creditSpan.textContent = `$${balanceUSD.toFixed(2)}`;
        }
    }
}
export function initUserProfileUI() {
    const profileContainer = document.querySelector('.user-profile-container');
    if (!profileContainer) return;

    profileContainer.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (actionTarget) {
            const action = actionTarget.dataset.action;
            if (action !== 'toggle-menu') e.preventDefault();

            switch (action) {
                case 'toggle-menu':
                    toggleDropdown(e);
                    break;
                case 'user:account':
                    stateManager.bus.publish('ui:showAccountModal');
                    profileContainer.classList.remove('open');
                    break;
                case 'user:settings':
                    SettingsUI.renderAndShowSettings();
                    profileContainer.classList.remove('open');
                    break;
                case 'user:importSettings':
                    UserHandlers.importUserSettings();
                    profileContainer.classList.remove('open');
                    break;
                case 'user:exportSettings':
                    UserHandlers.exportUserSettings();
                    profileContainer.classList.remove('open');
                    break;
                // Add other cases for Help, Log Out etc. if needed
            }
        }
    });

    initThemeSwitcher('theme-switcher-dropdown');
    
    stateManager.bus.subscribe('user:settingsLoaded', updateUserProfileDisplay);
    stateManager.bus.subscribe('user:settingsUpdated', updateUserProfileDisplay);

    updateUserProfileDisplay();
}