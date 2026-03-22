//* @file src/js/modules/admin/admin-model-manager.handlers.js //
import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as AuthService from '../auth/auth.service.js';
import * as ModelAccessService from '../models/model-access.service.js';
import * as UserService from '../user/user.service.js';

export async function savePlanPreset(selectedModelIdSet) {
    const presetSelector = document.getElementById('admin-preset-selector');
    const presetNameInput = document.getElementById('admin-preset-name-input');
    const originalKey = presetSelector.value;
    const newName = presetNameInput.value.trim();

    if (AuthService.isSupabaseEnabled() && ModelAccessService.isBackendModelAccessReady()) {
        try {
            const availableModels = stateManager.getState().systemProviderModels || [];
            const managedPreset = await ModelAccessService.saveManagedPlanPreset(
                originalKey,
                Array.from(selectedModelIdSet),
                availableModels
            );
            showCustomAlert(`${managedPreset.name} access saved to Supabase.`, 'Success');
            stateManager.bus.publish('admin:presetsChanged');
        } catch (error) {
            console.error(error);
            showCustomAlert(`Could not save backend model access: ${error.message || 'Unknown error'}`, 'Save Failed');
        }
        return;
    }

    if (!newName) {
        showCustomAlert('Preset name cannot be empty.', 'Error');
        return;
    }

    const newKey = newName.toLowerCase().replace(/\s+/g, '_');
    const allPlanPresets = UserService.getPlanModelPresets();

    // Check if a preset with the new name/key already exists (and it's not the one we're editing)
    if (newKey !== originalKey && allPlanPresets[newKey]) {
        showCustomAlert(`A preset named "${newName}" already exists.`, 'Error');
        return;
    }

    // [FIX] If the key has changed (a rename), delete the old entry.
    if (originalKey !== '--new--' && originalKey !== newKey) {
        delete allPlanPresets[originalKey];
    }
    
    // Create or update the preset with the new key and data.
    allPlanPresets[newKey] = {
        name: newName,
        modelIds: Array.from(selectedModelIdSet)
    };

    UserService.savePlanModelPresets(allPlanPresets);
    showCustomAlert(`Plan Preset "${newName}" saved!`, 'Success');
    stateManager.bus.publish('admin:presetsChanged');
}


export function exportPlanPresets() {
    try {
        const presets = (AuthService.isSupabaseEnabled() && ModelAccessService.isBackendModelAccessReady())
            ? ModelAccessService.getManagedPlanPresets()
            : UserService.getPlanModelPresets();
        const dataStr = JSON.stringify(presets, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `promptprim_plan_presets_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) { 
        showCustomAlert('Error exporting presets.');
        console.error(e); 
    }
}

export function importPlanPresets(event) {
    if (AuthService.isSupabaseEnabled() && ModelAccessService.isBackendModelAccessReady()) {
        showCustomAlert('Import is disabled in Supabase mode. Edit each billing plan allowlist and save it instead.', 'Import Disabled');
        event.target.value = '';
        return;
    }

    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            // Basic validation to see if it looks like a preset file
            if (data && Object.values(data).every(p => p.name && Array.isArray(p.modelIds))) {
                if (confirm("This will overwrite your current plan presets. Are you sure?")) {
                    UserService.savePlanModelPresets(data);
                    stateManager.bus.publish('admin:presetsChanged');
                    showCustomAlert('Plan presets imported successfully!', 'Success');
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

export function deletePlanPreset() {
    if (AuthService.isSupabaseEnabled() && ModelAccessService.isBackendModelAccessReady()) {
        showCustomAlert('Managed billing plans cannot be deleted. Clear the plan selection and save if you want an empty allowlist.', 'Delete Disabled');
        return;
    }

    const presetSelector = document.getElementById('admin-preset-selector');
    if (!presetSelector) return;

    const selectedKey = presetSelector.value;
    if (!selectedKey || selectedKey === '--new--') {
        showCustomAlert('Please select a preset to delete.', 'Info');
        return;
    }

    const allPlanPresets = UserService.getPlanModelPresets();
    const presetName = allPlanPresets[selectedKey]?.name || selectedKey;

    if (!confirm(`Delete plan preset "${presetName}"?`)) return;

    delete allPlanPresets[selectedKey];
    UserService.savePlanModelPresets(allPlanPresets);
    showCustomAlert(`Deleted preset "${presetName}".`, 'Success');
    stateManager.bus.publish('admin:presetsChanged');
}
