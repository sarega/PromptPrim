// ===============================================
// FILE: src/js/modules/settings/settings.ui.js (สร้างใหม่)
// DESCRIPTION: ผูก Event Listener ทั้งหมดสำหรับ Settings Panel
// ===============================================

import { stateManager } from '../../core/core.state.js';

/**
 * Attaches all necessary event listeners to the controls within the settings panel.
 */
export function initSettingsUI() {
    const bus = stateManager.bus;

    // --- Helper function to reduce boilerplate ---
    const listen = (elementId, eventType, eventName, valueAccessor = e => e.target.value) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, (e) => {
                bus.publish(eventName, valueAccessor(e));
            });
        } else {
            console.warn(`Settings element not found: #${elementId}`);
        }
    };

    // --- Appearance Settings ---
    listen('fontFamilySelect', 'change', 'settings:fontChanged');
    const themeSwitcher = document.getElementById('theme-switcher');
    if (themeSwitcher) {
        themeSwitcher.addEventListener('change', (e) => {
            if (e.target.name === 'theme') {
                // The theme logic is handled directly in main.js, no bus event needed,
                // but we keep the listener structure for consistency.
                // The actual theme change logic is in initializeTheme() in main.js
            }
        });
    }

    // --- API Settings ---
    listen('apiKey', 'change', 'settings:apiKeyChanged');
    listen('ollamaBaseUrl', 'change', 'settings:ollamaUrlChanged');
    listen('load-models-btn', 'click', 'api:loadModels', () => {}); // No value needed

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

    listen('system-utility-summary-preset-select', 'change', 'settings:summaryPresetChanged');
    listen('save-summary-preset-btn', 'click', 'settings:saveSummaryPreset', () => {});

    console.log("Settings UI Initialized and Listeners Attached.");
}
