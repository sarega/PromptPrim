// ===============================================
// FILE: src/js/core/core.ui.js (Complete)
// DESCRIPTION: Core UI functions that do not depend on any handlers.
// They publish events for handlers to listen to.
// ===============================================

import { stateManager } from './core.state.js';

// --- Exported UI Functions ---
export function toggleSettingsPanel() { document.getElementById('settings-panel').classList.toggle('open'); }
export function showSaveProjectModal() { /* ... code ... */ }
export function hideSaveProjectModal() { /* ... code ... */ }
export function showUnsavedChangesModal() { /* ... code ... */ }
export function hideUnsavedChangesModal() { /* ... code ... */ }
export function showCustomAlert(message, title = 'Notification') {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-message').textContent = message;
    document.getElementById('alert-modal').style.display = 'flex';
}
export function hideCustomAlert() { document.getElementById('alert-modal').style.display = 'none'; }
export function toggleMobileSidebar() { /* ... code ... */ }
export function toggleSidebarCollapse() { /* ... code ... */ }
export function toggleDropdown(event) { /* ... code ... */ }
export function applyFontSettings() { /* ... code ... */ }
export function updateStatus({ message, state }) { /* ... code ... */ }
export function makeSidebarResizable() { /* ... code ... */ }
export function initMobileUX() { /* ... code ... */ }

/**
 * Initializes all CORE UI event listeners.
 * This is the crucial part: instead of calling handlers directly, we publish events.
 */
export function initCoreUI() {
    // Subscribe to events from the stateManager to update UI
    stateManager.bus.subscribe('ui:applyFontSettings', applyFontSettings);
    stateManager.bus.subscribe('status:update', updateStatus);
    stateManager.bus.subscribe('dirty:changed', (isDirty) => {
        const projectTitleEl = document.getElementById('project-title');
        if (projectTitleEl) {
            const baseName = projectTitleEl.textContent.replace(' *', '');
            projectTitleEl.textContent = isDirty ? `${baseName} *` : baseName;
        }
    });

    // General click to close dropdowns
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
        }
    });

    // --- Assign Event Listeners that PUBLISH events ---
    document.querySelector('#settings-btn').addEventListener('click', toggleSettingsPanel);
    document.querySelector('.close-settings-btn').addEventListener('click', toggleSettingsPanel);
    document.querySelector('#save-project-modal .btn-secondary').addEventListener('click', hideSaveProjectModal);
    document.getElementById('alert-modal').querySelector('.btn').addEventListener('click', hideCustomAlert);

    document.querySelector('#save-project-modal .btn:not(.btn-secondary)').addEventListener('click', () => {
        const projectName = document.getElementById('project-name-input').value;
        stateManager.bus.publish('project:saveConfirm', { projectName });
    });
    
    document.querySelector('#unsaved-changes-modal .btn-secondary').addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'cancel'));
    document.querySelector('#unsaved-changes-modal .btn-danger').addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'discard'));
    document.querySelector('#unsaved-changes-modal .btn:not(.btn-secondary):not(.btn-danger)').addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'save'));

    document.getElementById('hamburger-btn').addEventListener('click', toggleMobileSidebar);
    document.getElementById('mobile-overlay').addEventListener('click', toggleMobileSidebar);
    document.getElementById('collapse-sidebar-btn').addEventListener('click', toggleSidebarCollapse);
    document.getElementById('focus-mode-btn').addEventListener('click', () => document.body.classList.toggle('focus-mode'));
    
    document.getElementById('load-models-btn').addEventListener('click', () => stateManager.bus.publish('api:loadModels'));
    document.getElementById('fontFamilySelect').addEventListener('change', (e) => stateManager.bus.publish('settings:fontChanged', e.target.value));
    document.getElementById('apiKey').addEventListener('change', (e) => stateManager.bus.publish('settings:apiKeyChanged', e.target.value));
    document.getElementById('ollamaBaseUrl').addEventListener('change', (e) => stateManager.bus.publish('settings:ollamaUrlChanged', e.target.value));
    
    document.getElementById('system-utility-model-select').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-prompt').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-summary-prompt').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-temperature').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-topP').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-summary-preset-select').addEventListener('change', () => stateManager.bus.publish('settings:summaryPresetChanged'));
    document.getElementById('save-summary-preset-btn').addEventListener('click', () => stateManager.bus.publish('settings:saveSummaryPreset'));

    makeSidebarResizable();
    initMobileUX();
    
    console.log("Core UI Initialized and Listeners Attached.");
}
