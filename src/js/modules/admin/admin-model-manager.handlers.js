//* @file src/js/modules/admin/admin-model-manager.handlers.js //
import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as UserService from '../user/user.service.js';

export function saveMasterPreset(selectedModelIdSet) {
    const presetSelector = document.getElementById('admin-preset-selector');
    const presetNameInput = document.getElementById('admin-preset-name-input');
    const originalKey = presetSelector.value;
    const newName = presetNameInput.value.trim();

    if (!newName) {
        showCustomAlert('Preset name cannot be empty.', 'Error');
        return;
    }

    const newKey = newName.toLowerCase().replace(/\s+/g, '_');
    const allMasterPresets = UserService.getMasterModelPresets();

    // Check if a preset with the new name/key already exists (and it's not the one we're editing)
    if (newKey !== originalKey && allMasterPresets[newKey]) {
        showCustomAlert(`A preset named "${newName}" already exists.`, 'Error');
        return;
    }

    // [FIX] If the key has changed (a rename), delete the old entry.
    if (originalKey !== '--new--' && originalKey !== newKey) {
        delete allMasterPresets[originalKey];
    }
    
    // Create or update the preset with the new key and data.
    allMasterPresets[newKey] = {
        name: newName,
        modelIds: Array.from(selectedModelIdSet)
    };

    UserService.saveMasterModelPresets(allMasterPresets);
    showCustomAlert(`Master Preset "${newName}" saved!`, 'Success');
    stateManager.bus.publish('admin:presetsChanged');
}


export function exportMasterPresets() {
    try {
        const presets = UserService.getMasterModelPresets();
        const dataStr = JSON.stringify(presets, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `promptprim_master_presets_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) { 
        showCustomAlert('Error exporting presets.');
        console.error(e); 
    }
}

export function importMasterPresets(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            // Basic validation to see if it looks like a preset file
            if (data && Object.values(data).every(p => p.name && Array.isArray(p.modelIds))) {
                if (confirm("This will overwrite your current master presets. Are you sure?")) {
                    UserService.saveMasterModelPresets(data);
                    stateManager.bus.publish('admin:presetsChanged');
                    showCustomAlert('Master presets imported successfully!', 'Success');
                }
            } else { 
                throw new Error('Invalid preset file format.'); 
            }
        } catch (error) { 
            showCustomAlert(`Error loading preset file: ${error.message}`); 
            console.error(error);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Clear the input
}