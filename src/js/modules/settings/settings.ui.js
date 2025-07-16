// ===============================================
// FILE: src/js/modules/settings/settings.ui.js (สร้างใหม่)
// DESCRIPTION: ผูก Event Listener ทั้งหมดสำหรับ Settings Panel
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleSettingsPanel } from '../../core/core.ui.js'; 


export function initSettingsUI() {
    console.log("🚀 Initializing Settings UI...");

    const bus = stateManager.bus;

    // --- 1. Listeners for Opening/Closing the Panel ---
    document.getElementById('settings-btn')?.addEventListener('click', toggleSettingsPanel);
    document.querySelector('.close-settings-btn')?.addEventListener('click', toggleSettingsPanel);

    // --- 2. Listeners for controls INSIDE the panel ---
    const listen = (elementId, eventType, eventName, valueAccessor = e => e.target.value) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, (e) => {
                bus.publish(eventName, valueAccessor(e));
            });
        }
    };

    // --- Appearance Settings ---
    listen('fontFamilySelect', 'change', 'settings:fontChanged');
    
    // Theme Switcher Listener (จะถูกจัดการโดย `initializeTheme` ใน main.js โดยตรง)
    // ไม่ต้องทำอะไรที่นี่

    // --- API Settings ---
    listen('apiKey', 'change', 'settings:apiKeyChanged');
    listen('ollamaBaseUrl', 'change', 'settings:ollamaUrlChanged');
    listen('load-models-btn', 'click', 'api:loadModels', () => {});

    // --- System Utility Agent Settings ---
    const systemSettingsFields = [
        'system-utility-model-select',
        'system-utility-prompt',
        'system-utility-summary-prompt',
        'system-utility-temperature',
        'system-utility-topP'
    ];
    systemSettingsFields.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', () => bus.publish('settings:systemAgentChanged'));
    });

    listen('save-summary-btn', 'click', 'settings:saveSummaryPreset', () => ({ saveAs: false }));
    listen('save-as-summary-preset-btn', 'click', 'settings:saveSummaryPreset', () => ({ saveAs: true }));
    listen('delete-summary-preset-btn', 'click', 'settings:deleteSummaryPreset', () => {});

    console.log("✅ Settings UI and all its listeners are correctly initialized.");
}
