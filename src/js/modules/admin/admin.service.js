// [NEW FILE] src/js/modules/admin/admin.service.js

import * as UserService from '../user/user.service.js';

/**
 * Gets the plan model presets directly from the user settings.
 * This is the "source of truth" that the admin edits.
 */
export function getPlanModelPresets() {
    const settings = UserService.getUserSettings();
    return settings?.modelPresets || {};
}

/**
 * Saves the plan model presets back to the user settings.
 * @param {object} presets - The complete presets object to save.
 */
export function savePlanModelPresets(presets) {
    const settings = UserService.getUserSettings();
    if (settings) {
        settings.modelPresets = presets;
        UserService.saveUserSettings();
    }
}
