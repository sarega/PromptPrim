// [REVISED & COMPLETE] src/js/modules/user/user.handlers.js

import * as UserService from './user.service.js';
import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';

// --- API Key Handlers ---
export function handleApiKeyChange(key) {
    UserService.updateApiSettings({ openrouterKey: key });
    stateManager.bus.publish('api:loadModels');
}

export function handleOllamaUrlChange(url) {
    UserService.updateApiSettings({ ollamaBaseUrl: url });
}

// --- Export/Import Handlers ---
export function exportUserSettings() {
    try {
        const settings = UserService.getUserSettings();
        if (!settings) throw new Error("No user settings found to export.");

        const dataStr = JSON.stringify(settings, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `promptprim_settings_${settings.userProfile.userId || Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        showCustomAlert(`Error exporting settings: ${error.message}`, "Error");
    }
}

export function importUserSettings() {
    document.getElementById('import-settings-input')?.click();
}

export function handleSettingsFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && data.userProfile && data.appSettings && data.modelPresets) {
                if (confirm("This will overwrite your current settings and reload the application. Are you sure?")) {
                    localStorage.setItem('promptPrimUserSettings_v1', JSON.stringify(data));
                    showCustomAlert("Settings imported! The app will now reload.", "Success");
                    setTimeout(() => window.location.reload(), 1500);
                }
            } else {
                throw new Error("Invalid settings file format.");
            }
        } catch (error) {
            showCustomAlert(`Error importing settings: ${error.message}`, "Error");
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}