// ===============================================
// FILE: src/js/core/core.keyboard.js
// ===============================================
/**
 * @file core.keyboard.js
 * @description Initializes global keyboard shortcuts for the application,
 * focusing on modal interactions.
 */

/**
 * Initializes global keyboard event listeners to handle modal actions.
 * - 'Escape' key will trigger the cancel/close action.
 * - 'Enter' key will trigger the primary confirmation action.
 */
export function initGlobalKeybindings() {
    document.addEventListener('keydown', (e) => {
        // Find if any modal or the settings panel is currently visible.
        const visibleModal = document.querySelector('.modal-overlay[style*="display: flex"]');
        const settingsPanel = document.getElementById('settings-panel');
        const settingsPanelVisible = settingsPanel?.classList.contains('visible');

        // If no modal or panel is active, do nothing.
        if (!visibleModal && !settingsPanelVisible) {
            return;
        }

        // --- Handle Escape Key for closing modals/panels ---
        if (e.key === 'Escape') {
            e.preventDefault();
            if (visibleModal) {
                // The cancel button is usually a .btn-secondary.
                // For simple alerts with one button, it will be the only .btn.
                const cancelButton = visibleModal.querySelector('.btn-secondary') || visibleModal.querySelector('.modal-actions .btn');
                if (cancelButton) {
                    cancelButton.click();
                }
            } else if (settingsPanelVisible) {
                const closeSettingsBtn = settingsPanel.querySelector('.close-settings-btn');
                if (closeSettingsBtn) {
                    closeSettingsBtn.click();
                }
            }
        }

        // --- Handle Enter Key for confirming modals ---
        if (e.key === 'Enter' && !e.shiftKey) {
            // Do not trigger this shortcut if the focus is on a textarea or a button itself.
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') {
                return;
            }

            if (visibleModal) {
                e.preventDefault();
                // The primary action button is typically the one that is NOT .btn-secondary or .btn-danger.
                const primaryButton = visibleModal.querySelector('.modal-actions .btn:not(.btn-secondary):not(.btn-danger)');
                
                if (primaryButton) {
                    primaryButton.click();
                } else {
                    // Fallback for simple dialogs with only one button (e.g., Alert, Context Inspector).
                    const singleButton = visibleModal.querySelector('.modal-actions .btn');
                    if (singleButton) {
                        singleButton.click();
                    }
                }
            }
        }
    });

    console.log("Global keyboard bindings initialized.");
}