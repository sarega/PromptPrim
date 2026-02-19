// [DEFINITIVE & COMPLETE] src/js/modules/models/model-manager.ui.js

import { stateManager } from '../../core/core.state.js';
import * as ModelManagerHandlers from './model-manager.handlers.js';
import * as UserService from '../user/user.service.js';
import { showCustomAlert } from '../../core/core.ui.js';

let selectedModelIdSet = new Set();
let lastCheckedIndex = -1;

export function getFilteredModelsForDisplay() {
    const allModels = stateManager.getState().allProviderModels || [];
    const user = UserService.getCurrentUserProfile();
    if (!user) return [];

    // On the admin page, always show all models.
    if (document.body.classList.contains('admin-page')) {
        return allModels;
    }

    // --- [DEBUGGING STEP] ---
    // We are temporarily disabling the plan-based filtering.
    // Any user that is not blocked will see ALL available models.
    
    // Check if user is blocked or expired.
    const isBlocked = (user.plan === 'free' && user.credits.current <= 0) || 
                      (user.plan === 'pro' && user.planStatus === 'expired');

    if (isBlocked) {
        // Blocked users see an empty list.
        return [];
    } else {
        // For debugging, all other users (Free, Pro, Master) see the full list.
        return allModels;
    }
}

function renderUserAllowedModelList() {
    const container = document.getElementById('model-master-list');
    const searchInput = document.getElementById('model-search-input');
    const filterToggle = document.getElementById('filter-selected-toggle');
    if (!container || !searchInput || !filterToggle) return;

    let modelsToRender = UserService.getAllowedModelsForCurrentUser();

    const searchTerm = searchInput.value.toLowerCase();
    const showSelectedOnly = filterToggle.checked;
    
    if (showSelectedOnly) {
        modelsToRender = modelsToRender.filter(m => selectedModelIdSet.has(m.id));
    }
    if (searchTerm) {
        modelsToRender = modelsToRender.filter(m => 
            m.name.toLowerCase().includes(searchTerm) || 
            m.id.toLowerCase().includes(searchTerm)
        );
    }
    
    container.innerHTML = '';
    modelsToRender.forEach((model, index) => {
        const isChecked = selectedModelIdSet.has(model.id);
        const item = document.createElement('div');
        item.className = 'model-manager-item';
        item.innerHTML = `
            <input type="checkbox" id="user-model-cb-${model.id}" data-model-id="${model.id}" ${isChecked ? 'checked' : ''}>
            <label for="user-model-cb-${model.id}">
                ${model.name} &nbsp;•&nbsp; <small>${model.id}</small>
            </label>
            <button class="btn-icon model-info-btn" data-model-id="${model.id}" title="Model Info">
                <span class="material-symbols-outlined">info</span>
            </button>
        `;
        container.appendChild(item);
    });
}


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
    
    // [THE FIX] Comment out the following two lines to hide the pricing information
    // document.getElementById('info-bar-prompt-price').textContent = `$${model.pricing?.prompt || 'N/A'} / 1M`;
    // document.getElementById('info-bar-completion-price').textContent = `$${model.pricing?.completion || 'N/A'} / 1M`;
    
    // Optional: Hide the parent elements as well if they are still visible
    const promptPriceEl = document.getElementById('info-bar-prompt-price');
    const completionPriceEl = document.getElementById('info-bar-completion-price');
    if (promptPriceEl) promptPriceEl.closest('span').style.display = 'none';
    if (completionPriceEl) completionPriceEl.closest('span').style.display = 'none';

    infoBar.classList.remove('hidden');
}

function renderIncludedList() {
    const includedContainer = document.getElementById('preset-included-list');
    if (!includedContainer) return;
    
    const allAllowedModels = UserService.getAllowedModelsForCurrentUser();
    includedContainer.innerHTML = '';

    const countHeader = document.createElement('div');
    countHeader.className = 'included-models-count';
    countHeader.textContent = `Included: ${selectedModelIdSet.size} models`;
    includedContainer.appendChild(countHeader);

    if (selectedModelIdSet.size === 0) {
        includedContainer.innerHTML += `<p class="no-items-message">Select models from the list.</p>`;
        return;
    }

    allAllowedModels.forEach(model => {
        if (selectedModelIdSet.has(model.id)) {
             const item = document.createElement('div');
             item.className = 'model-manager-item';
             item.innerHTML = `<label>${model.name} &nbsp;•&nbsp; <small>${model.id}</small></label>`;
             includedContainer.appendChild(item);
        }
    });
}

function renderMasterList() {
    const container = document.getElementById('model-master-list');
    const searchInput = document.getElementById('model-search-input');
    const filterToggle = document.getElementById('filter-selected-toggle');
    if (!container || !searchInput || !filterToggle) return;

    // [REVISED] Use the new filtering function to get the base list of models
    let modelsToRender = getFilteredModelsForDisplay();

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
            <input type="checkbox" id="model-cb-${model.id}" data-model-id="${model.id}" data-index="${index}" ${isChecked ? 'checked' : ''}>
            <label for="model-cb-${model.id}">
                ${model.name}
                <small>${model.id}</small>
            </label>
        `;
        container.appendChild(item);
    });
    renderIncludedList();
}

export function renderModelManager() {
    const presetSelector = document.getElementById('preset-selector');
    const presetNameInput = document.getElementById('preset-name-input');
    if (!presetSelector || !presetNameInput) return;

    const userPresets = UserService.getUserModelPresets();
    const previouslySelectedKey = presetSelector.value;
    
    presetSelector.innerHTML = '<option value="--new--">-- Create New Preset --</option>';
    for (const key in userPresets) {
        presetSelector.add(new Option(userPresets[key].name, key));
    }

    if (userPresets[previouslySelectedKey]) {
        presetSelector.value = previouslySelectedKey;
    }

    const selectedKey = presetSelector.value;
    if (selectedKey === '--new--') {
        presetNameInput.value = '';
        selectedModelIdSet.clear();
    } else if (userPresets[selectedKey]) {
        presetNameInput.value = userPresets[selectedKey].name;
        selectedModelIdSet = new Set(userPresets[selectedKey].modelIds);
    }

    renderUserAllowedModelList();
    renderIncludedList();
    updateInfoBar(null); // Hide info bar when changing presets
}

export function initModelManagerUI() {
    // Get all interactive elements
    const modelTabButton = document.querySelector('.tab-btn[data-tab="models"]');
    const presetSelector = document.getElementById('preset-selector');
    const searchInput = document.getElementById('model-search-input');
    const filterToggle = document.getElementById('filter-selected-toggle');
    const selectAllBtn = document.getElementById('select-all-btn');
    const deselectAllBtn = document.getElementById('deselect-all-btn');
    const savePresetBtn = document.getElementById('save-preset-btn');
    const deletePresetBtn = document.getElementById('delete-preset-btn');
    const modelListContainer = document.getElementById('model-master-list');
    const infoBarCloseBtn = document.getElementById('info-bar-close-btn');

    // Attach main listeners
    modelTabButton?.addEventListener('click', renderModelManager);
    presetSelector?.addEventListener('change', renderModelManager);
    searchInput?.addEventListener('input', renderUserAllowedModelList);
    filterToggle?.addEventListener('change', renderUserAllowedModelList);
    infoBarCloseBtn?.addEventListener('click', () => updateInfoBar(null));

    // Button listeners
    selectAllBtn?.addEventListener('click', () => {
        modelListContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (!cb.checked) {
                cb.checked = true;
                selectedModelIdSet.add(cb.dataset.modelId);
            }
        });
        renderIncludedList();
    });
    
    deselectAllBtn?.addEventListener('click', () => {
        modelListContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.checked) {
                cb.checked = false;
                selectedModelIdSet.delete(cb.dataset.modelId);
            }
        });
        renderIncludedList();
    });

    savePresetBtn?.addEventListener('click', () => ModelManagerHandlers.saveUserModelPreset(selectedModelIdSet));
    deletePresetBtn?.addEventListener('click', ModelManagerHandlers.deleteUserModelPreset);

    // [FIX] Add back the event delegation for checkbox clicks and the info button
    modelListContainer?.addEventListener('click', (e) => {
        const checkbox = e.target.closest('input[type="checkbox"]');
        const infoButton = e.target.closest('.model-info-btn');

        if (checkbox) {
            const modelId = checkbox.dataset.modelId;
            if (checkbox.checked) {
                selectedModelIdSet.add(modelId);
            } else {
                selectedModelIdSet.delete(modelId);
            }
            renderIncludedList();
        }

        if (infoButton) {
            const modelId = infoButton.dataset.modelId;
            const allModels = UserService.getAllowedModelsForCurrentUser();
            const model = allModels.find(m => m.id === modelId);
            if (model) {
                updateInfoBar(model);
            }
        }
    });
    
    // Subscribe to events that should cause a re-render
    stateManager.bus.subscribe('user:settingsUpdated', () => {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal?.style.display === 'flex' && document.querySelector('.tab-btn[data-tab="models"]')?.classList.contains('active')) {
             renderModelManager();
        }
    });
}

export function populatePresetSelector(selectorId) {
    const selector = document.getElementById(selectorId);
    if (!selector) return;

    const presets = UserService.getUserModelPresets();
    selector.innerHTML = '<option value="">-- Select a Preset --</option>';
    
    for (const key in presets) {
        selector.add(new Option(presets[key].name, key));
    }
}
