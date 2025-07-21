// ===============================================
// FILE: src/js/modules/settings/settings.ui.js (สร้างใหม่)
// DESCRIPTION: ผูก Event Listener ทั้งหมดสำหรับ Settings Panel
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { createSearchableModelSelector, showSettingsModal, hideSettingsModal } from '../../core/core.ui.js';
import { debounce } from '../../core/core.utils.js'; // <-- 1. Import debounce เข้ามา
import * as UserService from '../user/user.service.js';
import { populatePresetSelector, getModelsForPreset } from '../models/model-manager.ui.js';

function initTabs() {
    // [FIX] Search from the top-level modal overlay ID, not the inner panel
    const settingsModal = document.getElementById('settings-modal'); 
    if (!settingsModal) return;

    const tabButtons = settingsModal.querySelector('.tab-buttons');
    const tabContents = settingsModal.querySelectorAll('.tab-content');

    // Ensure tabButtons is found before adding a listener
    if (!tabButtons) return; 

    tabButtons.addEventListener('click', (e) => {
        if (e.target.matches('.tab-btn')) {
            const tabName = e.target.dataset.tab;
            if (tabButtons && tabContents) {
                tabButtons.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                tabContents.forEach(content => {
                    content.classList.toggle('active', content.dataset.tabContent === tabName);
                });
            }
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
    const userSettings = UserService.getUserSettings();
    const project = stateManager.getProject();
    if (!project || !userSettings) return;

    // --- [DEFINITIVE FIX for System Agent Defaults] ---
    // 1. ดึงค่าเริ่มต้นของ System Agent มาจาก User Settings ก่อน
    const systemAgentDefaults = userSettings.systemAgentDefaults?.utilityAgent || {};

    // 2. พยายามดึงค่าจากโปรเจกต์ปัจจุบัน, ถ้าไม่เจอก็ใช้ค่าเริ่มต้นที่ดึงมา
    const sysAgent = project.globalSettings?.systemUtilityAgent || systemAgentDefaults;
    
    // --- API Settings (อ่านจาก User Settings) ---
    document.getElementById('apiKey').value = userSettings.appSettings.apiKeys.openrouter || "";
    document.getElementById('ollamaBaseUrl').value = userSettings.appSettings.apiKeys.ollamaBaseUrl || "";

    // --- System Utility Agent (ใช้ค่าที่ถูกต้องแล้ว) ---
    document.getElementById('system-utility-prompt').value = sysAgent.systemPrompt || '';
    document.getElementById('system-utility-temperature').value = sysAgent.temperature ?? 1.0;
    document.getElementById('system-utility-topP').value = sysAgent.topP ?? 1.0;

    // --- Logic การกรอง Model (ยังคงเหมือนเดิม) ---
    const activePresetKey = userSettings.appSettings.activeModelPreset || 'top_models';
    const modelsToShow = getModelsForPreset(activePresetKey);
    
    createSearchableModelSelector(
        'settings-system-model-wrapper',
        sysAgent.model, // <-- ใช้ Model ID จาก sysAgent ที่ถูกต้อง
        modelsToShow 
    );
}

export function renderAndShowSettings() {
    renderSettingsPanel(); // 1. วาดข้อมูลล่าสุดก่อน
    showSettingsModal(); // <-- แก้ไขตรงนี้
}

export function initSettingsUI() {
    initTabs();
    
    const bus = stateManager.bus;

    // --- Event Listeners ---
    document.getElementById('apiKey')?.addEventListener('input', debounce((e) => bus.publish('settings:apiKeyChanged', e.target.value), 500));
    document.getElementById('ollamaBaseUrl')?.addEventListener('input', debounce((e) => bus.publish('settings:ollamaUrlChanged', e.target.value), 500));
    document.getElementById('load-models-btn')?.addEventListener('click', () => bus.publish('api:loadModels'));
    
    const systemSettingsFields = ['system-utility-prompt', 'system-utility-temperature', 'system-utility-topP'];
    systemSettingsFields.forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => bus.publish('settings:systemAgentChanged'));
    });

    // [REMOVED] ลบ Event Listener ของ Preset Selector ที่ไม่จำเป็นออก
    // const systemPresetSelector = document.getElementById('system-agent-preset-selector');
    // systemPresetSelector?.addEventListener('change', renderSettingsPanel);

    // Listener สำหรับปุ่มปิด Modal
    document.querySelector('#settings-panel .modal-close-btn')?.addEventListener('click', hideSettingsModal);
    
    // Subscribe เพื่อวาด Panel ใหม่เมื่อ Model โหลดเสร็จ (เผื่อกรณีที่เปิดค้างไว้)
    stateManager.bus.subscribe('models:loaded', () => {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal && settingsModal.style.display === 'flex') {
            renderSettingsPanel();
        }
    });
    // [ADD THIS] Subscribe to the central settings change event
    stateManager.bus.subscribe('app:settingsChanged', () => {
        const settingsModal = document.getElementById('settings-modal');
        // ถ้าหน้า Settings กำลังเปิดอยู่ ให้วาดข้อมูลใหม่ทันที
        if (settingsModal && settingsModal.style.display === 'flex') {
            renderSettingsPanel();
        }
    });

    console.log("✅ Settings UI Initialized.");
}