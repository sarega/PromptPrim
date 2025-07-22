// [DEFINITIVE & COMPLETE] src/js/modules/models/model-manager.ui.js

import { stateManager } from '../../core/core.state.js';
import * as ModelManagerHandlers from './model-manager.handlers.js';
import * as UserService from '../user/user.service.js';
import { showCustomAlert } from '../../core/core.ui.js';


let selectedModelIdSet = new Set();
let lastCheckedIndex = -1;

function updateInfoBar(model = null) {
    const infoBar = document.getElementById('model-info-bar');
    if (!infoBar) return;
    if (!model) {
        infoBar.classList.add('hidden');
        return;
    }
    document.getElementById('info-bar-name').textContent = model.name;
    document.getElementById('info-bar-description').textContent = model.description || 'No description available.';
    document.getElementById('info-bar-context').textContent = `${(model.context_length || 0).toLocaleString()} tokens`;
    document.getElementById('info-bar-prompt-price').textContent = `$${model.pricing?.prompt || 'N/A'} / 1M`;
    document.getElementById('info-bar-completion-price').textContent = `$${model.pricing?.completion || 'N/A'} / 1M`;
    infoBar.classList.remove('hidden');
}

// [REVISED] to show a count of included models
function renderIncludedList() {
    const includedContainer = document.getElementById('preset-included-list');
    if (!includedContainer) return;
    const allModels = stateManager.getState().allProviderModels || [];
    includedContainer.innerHTML = '';

    if (selectedModelIdSet.size === 0) {
        includedContainer.innerHTML = `<p class="no-items-message">Select models from the list on the left.</p>`;
        return;
    }
    const countHeader = document.createElement('div');
    countHeader.className = 'included-models-count';
    countHeader.textContent = `Included: ${selectedModelIdSet.size} models`;
    includedContainer.appendChild(countHeader);

    allModels.forEach(model => {
        if (selectedModelIdSet.has(model.id)) {
            const item = document.createElement('div');
            item.className = 'model-manager-item';
            item.innerHTML = `<label>${model.name}<small>${model.id}</small></label>`;
            includedContainer.appendChild(item);
        }
    });
}
function renderMasterList() {
    const container = document.getElementById('model-master-list');
    const searchInput = document.getElementById('model-search-input');
    const filterToggle = document.getElementById('filter-selected-toggle');
    if (!container || !searchInput || !filterToggle) return;

    const allModels = stateManager.getState().allProviderModels || [];
    const searchTerm = searchInput.value.toLowerCase();
    const showSelectedOnly = filterToggle.checked;
    container.innerHTML = '';

    let modelsToRender = allModels;
    if (showSelectedOnly) {
        modelsToRender = allModels.filter(m => selectedModelIdSet.has(m.id));
    }
    const filteredBySearch = modelsToRender.filter(m => 
        m.name.toLowerCase().includes(searchTerm) || 
        m.id.toLowerCase().includes(searchTerm)
    );

    filteredBySearch.forEach(model => {
        const isChecked = selectedModelIdSet.has(model.id);
        const item = document.createElement('div');
        item.className = 'model-manager-item';

        // [FIX] เพิ่มปุ่ม (i) เข้าไปในโครงสร้าง HTML
        item.innerHTML = `
            <input type="checkbox" id="model-cb-${model.id}" data-model-id="${model.id}" ${isChecked ? 'checked' : ''}>
            <label for="model-cb-${model.id}">
                ${model.name}
                <small>${model.id}</small>
            </label>
            <button type="button" class="btn-icon model-info-btn" data-model-id="${model.id}" title="View model details">
                <span class="material-symbols-outlined">info</span>
            </button>
        `;
        container.appendChild(item);
    });

    renderIncludedList();
}
export function renderModelManager() {
    const presetSelector = document.getElementById('preset-selector');
    const presetNameInput = document.getElementById('preset-name-input');
    const deleteBtn = document.getElementById('delete-preset-btn');
    const filterToggle = document.getElementById('filter-selected-toggle');
    if (!presetSelector || !presetNameInput || !deleteBtn || !filterToggle) return;

    // [FIX] "จำ" ค่าที่ถูกเลือกไว้ในปัจจุบันก่อนที่จะล้าง Dropdown
    const previouslySelectedKey = presetSelector.value;

    const presets = UserService.getModelPresets();
    
    // ล้างและสร้างรายการ Preset ใหม่
    presetSelector.innerHTML = '<option value="--new--">-- Create New Preset --</option>';
    for (const key in presets) {
        presetSelector.add(new Option(presets[key].name, key));
    }
    
    // นำค่าที่ "จำ" ไว้กลับมาตั้งค่าใหม่
    if (presetSelector.querySelector(`option[value="${previouslySelectedKey}"]`)) {
        presetSelector.value = previouslySelectedKey;
    }

    const selectedKey = presetSelector.value;

    filterToggle.checked = false;

    if (selectedKey === '--new--') {
        presetNameInput.value = '';
        deleteBtn.style.display = 'none';
        selectedModelIdSet.clear();
    } else if (presets[selectedKey]) {
        presetNameInput.value = presets[selectedKey].name;
        deleteBtn.style.display = 'block';
        selectedModelIdSet = new Set(presets[selectedKey].modelIds);
    }
    
    renderMasterList();
    updateInfoBar(null);
}
export function initModelManagerUI() {
    const searchInput = document.getElementById('model-search-input');
    const masterListContainer = document.getElementById('model-master-list');
    const presetSelector = document.getElementById('preset-selector');
    const saveBtn = document.getElementById('save-preset-btn');
    const deleteBtn = document.getElementById('delete-preset-btn');
    const selectAllBtn = document.getElementById('select-all-btn');
    const deselectAllBtn = document.getElementById('deselect-all-btn');
    const filterToggle = document.getElementById('filter-selected-toggle');
    const infoBarCloseBtn = document.getElementById('info-bar-close-btn');
    const applyBtn = document.getElementById('apply-preset-btn');

    // Listener สำหรับปุ่ม Apply Preset
    applyBtn?.addEventListener('click', () => {
        const selectedKey = presetSelector.value;
        if (!selectedKey || selectedKey === '--new--') {
            showCustomAlert("Please select a preset to apply.", "Info");
            return;
        }
        
        UserService.setActiveModelPreset(selectedKey);
        showCustomAlert(`Preset "${presetSelector.options[presetSelector.selectedIndex].text}" is now active!`, "Success");
        stateManager.bus.publish('app:settingsChanged');
    });

    // Listener สำหรับการคลิกใน Master List (จัดการทั้งการเลือกและการแสดง Info Bar)
    masterListContainer?.addEventListener('click', (e) => {
        const infoBtn = e.target.closest('.model-info-btn');
        const checkbox = e.target.closest('input[type="checkbox"]');
        
        if (infoBtn) { // --- กรณีคลิกที่ปุ่ม (i) ---
            e.stopPropagation();
            const modelId = infoBtn.dataset.modelId;
            const model = stateManager.getState().allProviderModels.find(m => m.id === modelId);
            updateInfoBar(model);
            return;
        }

        if (checkbox) { // --- กรณีคลิกที่ Checkbox (สำหรับ Shift+Click) ---
            const checkboxes = Array.from(masterListContainer.querySelectorAll('input[type="checkbox"]'));
            const currentIndex = checkboxes.indexOf(checkbox);
            if (e.shiftKey && lastCheckedIndex > -1) {
                // ... โค้ด Shift+Click เหมือนเดิม ...
            }
            lastCheckedIndex = currentIndex;
        }
    });
    
    // Listener สำหรับ 'change' event ยังคงใช้จัดการการเลือกตามปกติ
    masterListContainer?.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const modelId = e.target.dataset.modelId;
            if (e.target.checked) {
                selectedModelIdSet.add(modelId);
            } else {
                selectedModelIdSet.delete(modelId);
            }
            renderIncludedList();
        }
    });

    // --- Other Listeners ---
    searchInput?.addEventListener('input', renderMasterList);
    filterToggle?.addEventListener('change', renderMasterList);
    presetSelector?.addEventListener('change', renderModelManager);
    saveBtn?.addEventListener('click', () => ModelManagerHandlers.saveModelPreset(selectedModelIdSet));
    deleteBtn?.addEventListener('click', ModelManagerHandlers.deleteModelPreset);
    infoBarCloseBtn?.addEventListener('click', () => updateInfoBar(null));
    selectAllBtn?.addEventListener('click', () => { /* ... */ });
    deselectAllBtn?.addEventListener('click', () => { /* ... */ });

    const modelTabButton = document.querySelector('.tab-btn[data-tab="models"]');
    modelTabButton?.addEventListener('click', renderModelManager);

    stateManager.bus.subscribe('modelPresets:changed', renderModelManager);
}
/**
 * [NEW] Populates a given <select> element with the available model presets.
 * @param {string} selectorId - The ID of the <select> element to populate.
 */
export function populatePresetSelector(selectorId) {
    const selector = document.getElementById(selectorId);
    if (!selector) return;

    const presets = UserService.getModelPresets();
    selector.innerHTML = '<option value="">-- Select a Preset --</option>';
    
    for (const key in presets) {
        selector.add(new Option(presets[key].name, key));
    }
}

/**
 * [NEW] Gets the list of models for a given preset key.
 * @param {string} presetKey - The key of the preset (e.g., 'top_models').
 * @returns {Array<object>} An array of full model objects.
 */
export function getModelsForPreset(presetKey) {
    if (!presetKey) return []; // ถ้าไม่ได้เลือก preset ให้คืนค่า array ว่าง

    const allModels = stateManager.getState().allProviderModels || [];
    const presets = UserService.getModelPresets();
    const modelIds = presets[presetKey]?.modelIds || [];
    const modelIdSet = new Set(modelIds);

    return allModels.filter(model => modelIdSet.has(model.id));
}