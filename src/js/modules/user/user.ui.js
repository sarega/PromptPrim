// file: src/js/modules/user/user.ui.js

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown, showCustomAlert } from '../../core/core.ui.js'; 
import * as SettingsUI from '../settings/settings.ui.js';
import * as UserService from './user.service.js';
import * as UserHandlers from './user.handlers.js';
import * as AuthService from '../auth/auth.service.js';
import { initThemeSwitcher } from '../../core/core.theme.js';

function getSanitizedAvatarUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
    if (/^blob:\S+$/i.test(trimmed)) return trimmed;
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed;
    return '';
}

function updateUserProfileDisplay() {
    const profile = UserService.getCurrentUserProfile();
    if (!profile) return;
    const isAdmin = UserService.isAdminProfile(profile);
    const effectiveAccountStatus = UserService.getEffectiveAccountStatus(profile);
    const isStudio = effectiveAccountStatus === 'studio_active';
    const creditBuckets = UserService.getCreditBucketSummary(profile);

    const nameSpan = document.querySelector('#user-profile-menu .user-name');
    const planSpan = document.querySelector('#user-profile-menu .user-plan');
    const creditItem = document.getElementById('user-userCredits');
    const creditSpan = creditItem?.querySelector('span:last-child');
    const avatarButton = document.getElementById('user-profile-btn');
    const safeAvatarUrl = getSanitizedAvatarUrl(profile.avatarUrl || profile.billingProfile?.avatarUrl || '');

    if (avatarButton) {
        avatarButton.replaceChildren();
        if (safeAvatarUrl) {
            const avatarImage = document.createElement('img');
            avatarImage.src = safeAvatarUrl;
            avatarImage.alt = '';
            avatarImage.decoding = 'async';
            avatarButton.appendChild(avatarImage);
            avatarButton.classList.add('has-image');
        } else {
            const avatarSpan = document.createElement('span');
            avatarSpan.textContent = profile.userName ? profile.userName.charAt(0).toUpperCase() : 'U';
            avatarButton.appendChild(avatarSpan);
            avatarButton.classList.remove('has-image');
        }
    }
    if (nameSpan) nameSpan.textContent = profile.userName || 'User';

    if (planSpan) {
        let statusText = 'Unknown';
        let statusClass = 'status-blocked';

        if (isAdmin) {
            statusText = 'Admin';
            statusClass = 'status-studio';
        } else if (effectiveAccountStatus === 'paid_suspended') {
            statusText = 'Access Suspended';
            statusClass = 'status-blocked';
        } else if (isStudio) {
            statusText = 'Studio Plan';
            statusClass = 'status-studio';
        } else if (effectiveAccountStatus === 'pro_active' || profile.plan === 'pro') {
            if (profile.credits.current > 0) {
                statusText = 'Pro Plan';
                statusClass = 'status-active';
            } else if (profile.planStatus === 'grace_period') {
                statusText = 'Pro (Grace Period)';
                statusClass = 'status-grace';
            } else {
                statusText = 'Credits Depleted';
                statusClass = 'status-blocked';
            }
        } else if (effectiveAccountStatus === 'free' || profile.plan === 'free') {
            const freeTrialExpired = UserService.isFreeTrialExpired(profile);
            statusText = freeTrialExpired
                ? 'Free Trial Ended'
                : ((profile.credits.current > 0) ? 'Free Plan' : 'Credits Depleted');
            statusClass = (!freeTrialExpired && profile.credits.current > 0) ? 'status-free' : 'status-blocked';
        }
        
        planSpan.textContent = statusText;
        planSpan.className = `user-plan ${statusClass}`;
    }

    if (creditItem && creditSpan) {
        if (isAdmin || isStudio) {
            creditItem.style.display = 'none';
        } else {
            creditItem.style.display = 'flex';
            const balanceUSD = UserService.convertCreditsToUSD(creditBuckets.totalMicrocredits);
            creditSpan.textContent = `$${balanceUSD.toFixed(2)}`;
        }
    }
}
export function initUserProfileUI() {
    const profileContainer = document.querySelector('.user-profile-container');
    const userSwitcherModal = document.getElementById('user-switcher-modal');
    if (!profileContainer || !userSwitcherModal) return;

    // --- Event Listener หลักสำหรับ User Profile Dropdown ---
    profileContainer.addEventListener('click', async (e) => {
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
                profileContainer.classList.remove('open');
                if (AuthService.isSupabaseEnabled()) {
                    const { error } = await AuthService.signOut();
                    if (error) {
                        showCustomAlert(`Could not sign out: ${error.message}`, "Sign Out Failed");
                        break;
                    }
                    window.location.href = AuthService.getAuthPageUrl('app.html');
                    break;
                }
                userSwitcherModal.style.display = 'flex';
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

            const profileLabel = UserService.isAdminProfile(switchedProfile)
                ? 'Admin'
                : (UserService.isStudioProfile(switchedProfile)
                    ? `${switchedProfile.userName || switchedProfile.userId || userIdToSwitch} (Studio)`
                    : (switchedProfile.userName || switchedProfile.userId || userIdToSwitch));

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
