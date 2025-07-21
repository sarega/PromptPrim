import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';
import { renderModelManager } from './model-manager.ui.js';
import * as UserService from '../user/user.service.js';

export function handlePresetSelectionChange() {
    renderModelManager(); // สั่งวาด UI ใหม่ทั้งหมดเมื่อมีการเลือก Preset
}

export function saveModelPreset(selectedModelIdSet) {
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
    
    const allPresets = UserService.getModelPresets();
    
    if (presetKey !== '--new--' && presetKey !== newPresetKey) {
        delete allPresets[presetKey];
    }
    
    allPresets[newPresetKey] = {
        name: presetName,
        modelIds: Array.from(selectedModelIdSet) // <-- แปลง Set เป็น Array ตอนบันทึก
    };
    
    UserService.saveModelPresets(allPresets);
    
    showCustomAlert(`Preset "${presetName}" saved successfully!`, 'Success');
    renderModelManager();
}

export function deleteModelPreset() {
    const presetSelector = document.getElementById('preset-selector');
    const presetKey = presetSelector.value;

    if (presetKey === '--new--') {
        showCustomAlert('No preset selected to delete.', 'Info');
        return;
    }

    if (confirm(`Are you sure you want to delete the "${presetSelector.options[presetSelector.selectedIndex].text}" preset?`)) {
        // [FIX 4] อ่าน Presets ทั้งหมดมาจาก UserService
        const allPresets = UserService.getModelPresets();
        
        // [FIX 5] ลบ Preset ที่ต้องการ
        delete allPresets[presetKey];
        
        // [FIX 6] บันทึก Presets ที่อัปเดตแล้วกลับไป
        UserService.saveModelPresets(allPresets);

        showCustomAlert('Preset deleted.', 'Success');
        renderModelManager();
    }
}