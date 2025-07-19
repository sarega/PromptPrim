// ===============================================
// FILE: src/js/modules/settings/settings.ui.js (สร้างใหม่)
// DESCRIPTION: ผูก Event Listener ทั้งหมดสำหรับ Settings Panel
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleSettingsPanel } from '../../core/core.ui.js'; 
import { createSearchableModelSelector } from '../../core/core.ui.js'; 
import { debounce } from '../../core/core.utils.js'; // <-- 1. Import debounce เข้ามา

function initTabs() {
    const settingsPanel = document.getElementById('settings-panel');
    if (!settingsPanel) return;
    const tabButtons = settingsPanel.querySelector('.tab-buttons');
    const tabContents = settingsPanel.querySelectorAll('.tab-content');
    tabButtons.addEventListener('click', (e) => {
        if (e.target.matches('.tab-btn')) {
            const tabName = e.target.dataset.tab;
            tabButtons.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            tabContents.forEach(content => {
                content.classList.toggle('active', content.dataset.tabContent === tabName);
            });
        }
    });
}
function initSearchableModelSelector() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings || !project.globalSettings.systemUtilityAgent) {
        console.warn("initSearchableModelSelector: Project data not ready yet. Skipping.");
        return;
    }

    const wrapper = document.getElementById('system-model-search-wrapper');
    const searchInput = document.getElementById('system-model-search-input');
    const valueInput = document.getElementById('system-utility-model-select');
    const optionsContainer = document.getElementById('system-model-options-container');
    if (!wrapper || !searchInput || !valueInput || !optionsContainer) return;

    const allModels = stateManager.getState().allProviderModels || [];
    const currentModelId = project.globalSettings.systemUtilityAgent.model;

    const renderOptions = (modelsToRender) => {
        optionsContainer.innerHTML = '';
        if (modelsToRender.length === 0) {
            optionsContainer.innerHTML = `<div class="searchable-option-item">No models found.</div>`;
            return;
        }
        modelsToRender.forEach(model => {
            const item = document.createElement('div');
            item.className = 'searchable-option-item';
            item.dataset.value = model.id;
            item.innerHTML = `${model.name} <small>${model.id}</small>`;
            item.addEventListener('click', () => {
                searchInput.value = model.name;
                valueInput.value = model.id;
                optionsContainer.classList.add('hidden');
                valueInput.dispatchEvent(new Event('change', { bubbles: true }));
            });
            optionsContainer.appendChild(item);
        });
    };

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredModels = allModels.filter(m => 
            m.name.toLowerCase().includes(searchTerm) || 
            m.id.toLowerCase().includes(searchTerm)
        );
        renderOptions(filteredModels);
    });

    searchInput.addEventListener('focus', () => {
        renderOptions(allModels);
        optionsContainer.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            optionsContainer.classList.add('hidden');
        }
    });

    const currentModel = allModels.find(m => m.id === currentModelId);
    if (currentModel) {
        searchInput.value = currentModel.name;
        valueInput.value = currentModel.id;
    } else {
        searchInput.value = '';
        valueInput.value = '';
    }
}

function renderSettingsPanel() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;

    const gs = project.globalSettings;
        console.log("UI sees these globalSettings:", gs);

    const sysAgent = gs.systemUtilityAgent || {};

    // API Settings
    document.getElementById('apiKey').value = gs.apiKey || "";
    document.getElementById('ollamaBaseUrl').value = gs.ollamaBaseUrl || "";

    // System Utility Agent Fields
    document.getElementById('system-utility-prompt').value = sysAgent.systemPrompt || '';
    document.getElementById('system-utility-temperature').value = sysAgent.temperature ?? 1.0;
    document.getElementById('system-utility-topP').value = sysAgent.topP ?? 1.0;

    // Call the searchable dropdown component
    createSearchableModelSelector(
        'settings-system-model-wrapper',
        sysAgent.model,
        (selectedModelId) => {
            const proj = stateManager.getProject();
            if (proj.globalSettings.systemUtilityAgent) {
                proj.globalSettings.systemUtilityAgent.model = selectedModelId;
            }
            stateManager.bus.publish('settings:systemAgentChanged');
        }
    );
}
export function renderAndShowSettings() {
    renderSettingsPanel(); // 1. วาดข้อมูลล่าสุดก่อน
    toggleSettingsPanel(); // 2. แล้วค่อยเปิด Panel
}

export function initSettingsUI() {
    console.log("🚀 Initializing Settings UI...");
    initTabs();
    
    const bus = stateManager.bus;

    // --- Event Listeners for inputs ---
    const apiKeyInput = document.getElementById('apiKey');
    if (apiKeyInput) {
        apiKeyInput.addEventListener('input', debounce((e) => {
            bus.publish('settings:apiKeyChanged', e.target.value);
        }, 500));
    }

    const ollamaUrlInput = document.getElementById('ollamaBaseUrl');
    if (ollamaUrlInput) {
        ollamaUrlInput.addEventListener('input', debounce((e) => {
            bus.publish('settings:ollamaUrlChanged', e.target.value);
        }, 500));
    }

    const loadModelsBtn = document.getElementById('load-models-btn');
    if (loadModelsBtn) {
        loadModelsBtn.addEventListener('click', () => bus.publish('api:loadModels'));
    }

    const systemSettingsFields = ['system-utility-prompt', 'system-utility-temperature', 'system-utility-topP'];
    systemSettingsFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => bus.publish('settings:systemAgentChanged'));
        }
    });

    // --- [FIX] Subscribe to 'models:loaded' to refresh the panel if it's open ---
    stateManager.bus.subscribe('models:loaded', () => {
        const settingsPanel = document.getElementById('settings-panel');
        // สั่งให้วาดข้อมูลใน Panel ใหม่ เฉพาะในกรณีที่ Panel กำลังเปิดอยู่เท่านั้น
        if (settingsPanel && settingsPanel.classList.contains('open')) {
            console.log('[SettingsUI] Models loaded. Refreshing settings panel content.');
            renderSettingsPanel();
        }
    });

    console.log("✅ Settings UI and all its listeners are correctly initialized.");
}