// [NEW FILE] src/js/modules/admin/admin.service.js

import * as UserService from '../user/user.service.js';

/**
 * Gets the master model presets directly from the user settings.
 * This is the "source of truth" that the admin edits.
 */
export function getMasterModelPresets() {
    const settings = UserService.getUserSettings();
    return settings?.modelPresets || {};
}

/**
 * Saves the master model presets back to the user settings.
 * @param {object} presets - The complete presets object to save.
 */
export function saveMasterModelPresets(presets) {
    const settings = UserService.getUserSettings();
    if (settings) {
        settings.modelPresets = presets;
        UserService.saveUserSettings();
    }
}