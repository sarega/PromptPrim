// file: src/js/modules/user/user.ui.js

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown, showCustomAlert } from '../../core/core.ui.js'; 
import * as SettingsUI from '../settings/settings.ui.js';
import * as UserService from './user.service.js';
import * as UserHandlers from './user.handlers.js';
import { initThemeSwitcher } from '../../core/core.theme.js';

function updateUserProfileDisplay() {
    const profile = UserService.getCurrentUserProfile();
    if (!profile) return;
    const isMaster = UserService.isMasterProfile(profile);

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

        if (isMaster) {
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
        if (isMaster) {
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
    const userSwitcherModal = document.getElementById('user-switcher-modal');
    if (!profileContainer || !userSwitcherModal) return;

    // --- Event Listener หลักสำหรับ User Profile Dropdown ---
    profileContainer.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        if (action !== 'toggle-menu') e.preventDefault();

        switch (action) {
            case 'toggle-menu':
                toggleDropdown(e);
                break; // << จบการทำงานของ case นี้ ไม่ทำอะไรต่อ
            case 'user:account':
                stateManager.bus.publish('ui:showAccountModal');
                profileContainer.classList.remove('open'); // << ย้ายมาไว้ข้างใน
                break;
            case 'user:settings':
                SettingsUI.renderAndShowSettings();
                profileContainer.classList.remove('open'); // << ย้ายมาไว้ข้างใน
                break;
            case 'user:logout':
                userSwitcherModal.style.display = 'flex';
                profileContainer.classList.remove('open'); // << ย้ายมาไว้ข้างใน
                break;
            // ... case อื่นๆ ...
        }
        // [REMOVED] ลบบรรทัดที่ผิดพลาดออกจากตรงนี้
    });

    // --- Event Listener สำหรับ User Switcher Modal (เหมือนเดิม) ---
    userSwitcherModal.addEventListener('click', (e) => {
        const target = e.target;
        const userButton = target.closest('button[data-user-id]');
        if (userButton) {
            const userIdToSwitch = userButton.dataset.userId;
            const switchedProfile = UserService.setActiveUserId(userIdToSwitch);
            if (!switchedProfile) {
                showCustomAlert(`Could not switch to ${userIdToSwitch}. Please try again.`, "Switch Failed");
                return;
            }

            const profileLabel = UserService.isMasterProfile(switchedProfile)
                ? 'Admin (Master)'
                : (switchedProfile.userName || switchedProfile.userId || userIdToSwitch);

            showCustomAlert(`Switched to ${profileLabel}. Reloading app...`, "Success");
            userSwitcherModal.style.display = 'none';
            setTimeout(() => window.location.reload(), 350);
        }
        if (target.matches('.modal-close-btn') || target === userSwitcherModal) {
            userSwitcherModal.style.display = 'none';
        }
    });

    // --- ส่วนที่เหลือของฟังก์ชัน (initThemeSwitcher, Subscriptions) เหมือนเดิม ---
    initThemeSwitcher('theme-switcher-dropdown');
    stateManager.bus.subscribe('user:settingsLoaded', updateUserProfileDisplay);
    stateManager.bus.subscribe('user:settingsUpdated', updateUserProfileDisplay);
    updateUserProfileDisplay();
}
