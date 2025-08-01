//src/js/modules/admin/admin-model-manager.ui.js
import { stateManager } from '../../core/core.state.js';
import * as AdminModelHandlers from './admin-model-manager.handlers.js';
import * as UserService from '../user/user.service.js';

let selectedModelIdSet = new Set();
let lastCheckedIndex = -1;

function renderIncludedList() {
    const includedContainer = document.getElementById('admin-preset-included-list');
    if (!includedContainer) return;
    
    // [FIX] Read from the correct state property: 'systemProviderModels'
    const allModels = stateManager.getState().systemProviderModels || [];
    includedContainer.innerHTML = '';

    const countHeader = document.createElement('div');
    countHeader.className = 'included-models-count';
    countHeader.textContent = `Included: ${selectedModelIdSet.size} models`;
    includedContainer.appendChild(countHeader);

    if (selectedModelIdSet.size === 0) {
        includedContainer.innerHTML += `<p class="no-items-message">Select models from the list on the left.</p>`;
        return;
    }

    // This logic is now correct because it's iterating over the correct model list.
    const selectedModels = allModels.filter(model => selectedModelIdSet.has(model.id));
    selectedModels.forEach(model => {
        const item = document.createElement('div');
        item.className = 'model-manager-item';
        item.innerHTML = `<label>${model.name} &nbsp;•&nbsp; <small>${model.id}</small></label>`;
        includedContainer.appendChild(item);
    });
}

function renderMasterList() {
    const container = document.getElementById('admin-model-master-list');
    const searchInput = document.getElementById('admin-model-search-input');
    const filterToggle = document.getElementById('admin-filter-selected-toggle');
    if (!container || !searchInput || !filterToggle) return;

    // [FIX] Read from the correct state property: 'systemProviderModels' instead of 'allProviderModels'
    const allModels = stateManager.getState().systemProviderModels || [];
    
    let modelsToRender = allModels;

    const searchTerm = searchInput.value.toLowerCase();
    const showSelectedOnly = filterToggle.checked;
    container.innerHTML = '';

    if (showSelectedOnly) {
        modelsToRender = modelsToRender.filter(m => selectedModelIdSet.has(m.id));
    }
    
    const filteredBySearch = modelsToRender.filter(m => 
        m.name.toLowerCase().includes(searchTerm) || 
        m.id.toLowerCase().includes(searchTerm)
    );

    filteredBySearch.forEach((model, index) => {
        const isChecked = selectedModelIdSet.has(model.id);
        const item = document.createElement('div');
        item.className = 'model-manager-item';
        item.innerHTML = `
            <input type="checkbox" id="admin-model-cb-${model.id}" data-model-id="${model.id}" data-index="${index}" ${isChecked ? 'checked' : ''}>
            <label for="admin-model-cb-${model.id}">
                ${model.name} &nbsp;•&nbsp; <small>${model.id}</small>
            </label>
        `;
        container.appendChild(item);
    });
}

export function renderAdminModelManager() {
    const presets = UserService.getMasterModelPresets();
    const presetSelector = document.getElementById('admin-preset-selector');
    const presetNameInput = document.getElementById('admin-preset-name-input');
    if (!presetSelector || !presetNameInput) return;

    const previouslySelectedKey = presetSelector.value;
    presetSelector.innerHTML = '<option value="--new--">-- Create New Master Preset --</option>';
    for (const key in presets) {
        presetSelector.add(new Option(presets[key].name, key));
    }
    if (presets[previouslySelectedKey]) {
        presetSelector.value = previouslySelectedKey;
    }

    const selectedKey = presetSelector.value;
    if (selectedKey === '--new--') {
        presetNameInput.value = '';
        selectedModelIdSet.clear();
    } else if (presets[selectedKey]) {
        presetNameInput.value = presets[selectedKey].name;
        selectedModelIdSet = new Set(presets[selectedKey].modelIds);
    }
    renderMasterList();
    renderIncludedList();
}

export function initAdminModelManagerUI() {
    const saveBtn = document.getElementById('admin-save-preset-btn');
    const deleteBtn = document.getElementById('admin-delete-preset-btn');
    const presetSelector = document.getElementById('admin-preset-selector');
    const masterListContainer = document.getElementById('admin-model-master-list');
    const searchInput = document.getElementById('admin-model-search-input');
    const filterToggle = document.getElementById('admin-filter-selected-toggle');
    const selectAllBtn = document.getElementById('admin-select-all-btn');
    const deselectAllBtn = document.getElementById('admin-deselect-all-btn');
    // [ADD THIS] Add listeners for the new import/export buttons
    const importBtn = document.getElementById('import-presets-btn');
    const exportBtn = document.getElementById('export-presets-btn');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    
    importBtn?.addEventListener('click', () => fileInput.click());
    exportBtn?.addEventListener('click', AdminModelHandlers.exportMasterPresets);
    fileInput.addEventListener('change', AdminModelHandlers.importMasterPresets);

    saveBtn?.addEventListener('click', () => AdminModelHandlers.saveMasterPreset(selectedModelIdSet));
    deleteBtn?.addEventListener('click', AdminModelHandlers.deleteMasterPreset);
    presetSelector?.addEventListener('change', renderAdminModelManager);
    searchInput?.addEventListener('input', renderMasterList);
    filterToggle?.addEventListener('change', renderMasterList);

    selectAllBtn?.addEventListener('click', () => {
        const visibleCheckboxes = masterListContainer.querySelectorAll('.model-manager-item input[type="checkbox"]');
        visibleCheckboxes.forEach(cb => {
            cb.checked = true;
            selectedModelIdSet.add(cb.dataset.modelId);
        });
        renderIncludedList();
    });

    deselectAllBtn?.addEventListener('click', () => {
        const visibleCheckboxes = masterListContainer.querySelectorAll('.model-manager-item input[type="checkbox"]');
        visibleCheckboxes.forEach(cb => {
            cb.checked = false;
            selectedModelIdSet.delete(cb.dataset.modelId);
        });
        renderIncludedList();
    });

    masterListContainer?.addEventListener('click', (e) => {
        const checkbox = e.target.closest('input[type="checkbox"]');
        if (!checkbox) return;
        const checkboxes = Array.from(masterListContainer.querySelectorAll('input[type="checkbox"]'));
        const currentIndex = checkboxes.indexOf(checkbox);
        if (e.altKey || e.metaKey) {
            e.preventDefault();
            const modelId = checkbox.dataset.modelId;
            const isCurrentlyChecked = selectedModelIdSet.has(modelId) && selectedModelIdSet.size === 1;
            selectedModelIdSet.clear();
            if (!isCurrentlyChecked) selectedModelIdSet.add(modelId);
            checkboxes.forEach(cb => cb.checked = selectedModelIdSet.has(cb.dataset.modelId));
        } else if (e.shiftKey && lastCheckedIndex > -1) {
            e.preventDefault();
            const start = Math.min(currentIndex, lastCheckedIndex);
            const end = Math.max(currentIndex, lastCheckedIndex);
            for (let i = start; i <= end; i++) {
                checkboxes[i].checked = true;
                selectedModelIdSet.add(checkboxes[i].dataset.modelId);
            }
        } else {
            const modelId = checkbox.dataset.modelId;
            if (checkbox.checked) {
                selectedModelIdSet.add(modelId);
            } else {
                selectedModelIdSet.delete(modelId);
            }
        }
        lastCheckedIndex = currentIndex;
        renderIncludedList();
    });

    stateManager.bus.subscribe('models:loaded', renderAdminModelManager);
    stateManager.bus.subscribe('admin:presetsChanged', renderAdminModelManager);
}
