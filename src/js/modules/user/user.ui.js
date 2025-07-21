// สร้างไฟล์ใหม่ที่: src/js/modules/user/user.ui.js

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';
import * as SettingsUI from '../settings/settings.ui.js';
import * as UserService from './user.service.js';
import * as UserHandlers from './user.handlers.js';

function applyTheme(theme) {
    document.body.classList.remove('dark-mode', 'light-mode');
    const lightThemeSheet = document.getElementById('hljs-light-theme');
    const darkThemeSheet = document.getElementById('hljs-dark-theme');
    
    let isDark = theme === 'dark';
    if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    document.body.classList.add(isDark ? 'dark-mode' : 'light-mode');
    if (lightThemeSheet) lightThemeSheet.disabled = isDark;
    if (darkThemeSheet) darkThemeSheet.disabled = !isDark;
}

function initThemeSwitcher() {
    const themeSwitcher = document.getElementById('theme-switcher-dropdown');
    if (!themeSwitcher) return;

    const themeRadios = themeSwitcher.querySelectorAll('input[type="radio"]');
    const savedTheme = localStorage.getItem('theme') || 'system';
    
    themeRadios.forEach(radio => {
        if (radio.value === savedTheme) radio.checked = true;
        radio.addEventListener('change', (event) => {
            const selectedTheme = event.target.value;
            localStorage.setItem('theme', selectedTheme);
            applyTheme(selectedTheme);
        });
    });

    applyTheme(savedTheme); // Apply initial theme

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem('theme') || 'system') === 'system') {
            applyTheme('system');
        }
    });
}

// [NEW] ฟังก์ชันสำหรับอัปเดตข้อมูล Profile ทั้งหมด
function updateUserProfileDisplay() {
    const profile = UserService.getCurrentUserProfile();
    if (!profile) return;

    const nameSpan = document.querySelector('.user-profile-menu .user-name');
    const planSpan = document.querySelector('.user-profile-menu .user-plan');
    const creditSpan = document.querySelector('#user-userCredits span:last-child');
    const avatarSpan = document.querySelector('#user-profile-btn span');

    if (nameSpan) {
        nameSpan.textContent = profile.userName || 'User';
    }
    if (planSpan) {
        // ทำให้ตัวอักษรแรกเป็นตัวพิมพ์ใหญ่
        planSpan.textContent = profile.plan ? `${profile.plan.charAt(0).toUpperCase()}${profile.plan.slice(1)} Plan` : 'Free Plan';
    }
    if (creditSpan) {
        creditSpan.textContent = Math.floor(profile.userCredits).toLocaleString();
    }
    if (avatarSpan && profile.userName) {
        avatarSpan.textContent = profile.userName.charAt(0).toUpperCase();
    }
}

export function initUserProfileUI() {
    const profileContainer = document.querySelector('.user-profile-container');
    if (!profileContainer) return;

    profileContainer.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (actionTarget) {
            const action = actionTarget.dataset.action;
            
            // หยุดการทำงานของ Event สำหรับรายการเมนู เพื่อไม่ให้หน้าเว็บเลื่อน
            if (action !== 'toggle-menu') {
                e.preventDefault();
            }

            switch (action) {
                case 'toggle-menu':
                    toggleDropdown(e); // << ใช้งานถูกต้องสำหรับปุ่มเปิด/ปิด
                    break;
                case 'user:settings':
                    SettingsUI.renderAndShowSettings();
                    profileContainer.classList.remove('open'); // << [FIX] ใช้วิธีนี้ปิดเมนู
                    break;
                case 'user:exportSettings':
                    UserHandlers.exportUserSettings();
                    profileContainer.classList.remove('open'); // << [FIX] ใช้วิธีนี้ปิดเมนู
                    break;
                case 'user:importSettings':
                    UserHandlers.importUserSettings();
                    profileContainer.classList.remove('open'); // << [FIX] ใช้วิธีนี้ปิดเมนู
                    break;
            }
        }
    });

    initThemeSwitcher();
    
    // [FIX] Subscribe to the correct events published by user.service.js
    stateManager.bus.subscribe('user:settingsLoaded', updateUserProfileDisplay);
    stateManager.bus.subscribe('user:settingsUpdated', updateUserProfileDisplay);

    // [DEFINITIVE FIX] Immediately update the UI with the data that has already been loaded.
    // This solves the issue where the UI shows '0' on refresh because the 'user:settingsLoaded'
    // event was published before this UI module had a chance to subscribe to it.
    updateUserProfileDisplay();

    console.log("✅ User Profile UI Initialized.");
}