// สร้างไฟล์ใหม่ที่: src/js/modules/user/user.ui.js

import { stateManager } from '../../core/core.state.js';
import { toggleSettingsPanel } from '../../core/core.ui.js';
import { toggleDropdown } from '../../core/core.ui.js';
import * as SettingsUI from '../settings/settings.ui.js';

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

export function initUserProfileUI() {
    const profileContainer = document.querySelector('.user-profile-container');
    if (!profileContainer) return;

    profileContainer.addEventListener('click', (e) => {
        const target = e.target;
        const actionTarget = target.closest('[data-action]');

        if (actionTarget) {
            const action = actionTarget.dataset.action;
            switch(action) {
                case 'toggle-menu':
                    toggleDropdown(e);
                    break;
                case 'user:settings':
                    // [แก้ไข] เปลี่ยนมาเรียกใช้ฟังก์ชันใหม่จาก SettingsUI
                    SettingsUI.renderAndShowSettings();
                    profileContainer.classList.remove('open');
                    break;
                // ...
            }
        }
    });

    initThemeSwitcher();
    console.log("✅ User Profile UI Initialized.");
}