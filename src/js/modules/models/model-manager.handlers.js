import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as UserService from '../user/user.service.js';

/**
 * Publishes an event to signal that the user preset selection in the UI has changed.
 */
export function handlePresetSelectionChange() {
    stateManager.bus.publish('user:presetSelectionChanged');
}

/**
 * Saves a user's custom model preset.
 * @param {Set<string>} selectedModelIdSet - A set of model IDs selected by the user.
 */
export function saveUserModelPreset(selectedModelIdSet) {
    const presetSelector = document.getElementById('preset-selector');
    const presetNameInput = document.getElementById('preset-name-input');
    const presetKey = presetSelector.value;
    const presetName = presetNameInput.value.trim();

    if (!presetName) {
        showCustomAlert('Preset name cannot be empty.', 'Error');
        return;
    }
    if (selectedModelIdSet.size === 0) {
        showCustomAlert('Please select at least one model for the preset.', 'Error');
        return;
    }

    const newPresetKey = presetName.toLowerCase().replace(/\s+/g, '_');
    const allUserPresets = UserService.getUserModelPresets();

    if (presetKey !== '--new--' && presetKey !== newPresetKey) {
        delete allUserPresets[presetKey];
    }
    
    allUserPresets[newPresetKey] = {
        name: presetName,
        modelIds: Array.from(selectedModelIdSet)
    };
    
    UserService.saveUserModelPresets(allUserPresets);
    showCustomAlert(`User Preset "${presetName}" saved successfully!`, 'Success');
    stateManager.bus.publish('user:presetsChanged');
}

/**
 * Deletes a user's custom model preset.
 */
export function deleteUserModelPreset() {
    const presetSelector = document.getElementById('preset-selector');
    const presetKey = presetSelector.value;

    if (presetKey === '--new--') {
        showCustomAlert('No preset selected to delete.', 'Info');
        return;
    }

    if (confirm(`Are you sure you want to delete your preset "${presetSelector.options[presetSelector.selectedIndex].text}"?`)) {
        const allUserPresets = UserService.getUserModelPresets();
        delete allUserPresets[presetKey];
        UserService.saveUserModelPresets(allUserPresets);

        showCustomAlert('User Preset deleted.', 'Success');
        stateManager.bus.publish('user:presetsChanged');
    }
}