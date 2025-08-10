// ===============================================
// FILE: src/js/modules/settings/settings.ui.js (สร้างใหม่)
// DESCRIPTION: ผูก Event Listener ทั้งหมดสำหรับ Settings Panel
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { createSearchableModelSelector, showSettingsModal, hideSettingsModal, showCustomAlert } from '../../core/core.ui.js';
import { debounce } from '../../core/core.utils.js'; // <-- 1. Import debounce เข้ามา
import * as UserService from '../user/user.service.js';
import { getFilteredModelsForDisplay } from '../models/model-manager.ui.js';
import { renderModelManager } from '../models/model-manager.ui.js';
import { createParameterEditor } from '../../components/parameter-editor.js';

// function initTabs() {
//     const settingsModal = document.getElementById('settings-modal'); 
//     if (!settingsModal) return;

//     const tabButtons = settingsModal.querySelector('.tab-buttons');
//     const tabContents = settingsModal.querySelectorAll('.tab-content');

//     if (!tabButtons) return; 

//     tabButtons.addEventListener('click', (e) => {
//         if (e.target.matches('.tab-btn')) {
//             const tabName = e.target.dataset.tab;
//             if (tabButtons && tabContents) {
//                 tabButtons.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
//                 e.target.classList.add('active');
//                 tabContents.forEach(content => {
//                     content.classList.toggle('active', content.dataset.tabContent === tabName);
//                 });
//             }
//         }
//     });
// }

function initTabs() {
    const settingsModal = document.getElementById('settings-modal'); 
    if (!settingsModal) return;

    const tabButtonsContainer = settingsModal.querySelector('.tab-buttons');
    const tabContents = settingsModal.querySelectorAll('.tab-content');
    const mobileTrigger = document.getElementById('settings-mobile-menu-trigger');
    const mobilePopup = settingsModal.querySelector('.mobile-menu-popup');
    // [DEBUG 1] ตรวจสอบว่าหา Element เจอหรือไม่
    console.log("--- 1. initTabs: Finding elements ---");
    console.log("Mobile Trigger Button:", mobileTrigger);
    console.log("Mobile Popup Container:", mobilePopup);
    console.log("Tab Buttons inside Popup:", mobilePopup?.querySelector('.tab-buttons'));

    mobileTrigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        // ค้นหา popup ทุกครั้งที่คลิก เพื่อความแน่นอน
        const popup = settingsModal.querySelector('.mobile-menu-popup');
        if (popup) {
            popup.classList.toggle('is-open');
        } else {
            console.error("Could not find '.mobile-menu-popup' inside the settings modal on click.");
        }
    });
    tabButtonsContainer?.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.tab-btn');
        if (!tabButton) return;

        const tabName = tabButton.dataset.tab;
        
        tabButtonsContainer.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        tabButton.classList.add('active');
        tabContents.forEach(content => {
            content.classList.toggle('active', content.dataset.tabContent === tabName);
        });

        const currentTabNameSpan = document.getElementById('settings-current-tab-name');
        const currentTabIconSpan = mobileTrigger.querySelector('.material-symbols-outlined');
        if (currentTabNameSpan && currentTabIconSpan) {
            const buttonIcon = tabButton.querySelector('.material-symbols-outlined').textContent;
            const buttonTextSpan = tabButton.querySelector('.tab-btn-text');
            if (buttonTextSpan) {
                currentTabNameSpan.textContent = buttonTextSpan.textContent.trim();
            }
            if (buttonIcon) currentTabIconSpan.textContent = buttonIcon;
        }

        mobilePopup?.classList.remove('is-open');
    });
    
    document.addEventListener('click', (e) => {
        if (mobilePopup?.classList.contains('is-open') && !mobilePopup.contains(e.target) && !mobileTrigger.contains(e.target)) {
            mobilePopup.classList.remove('is-open');
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
    const user = UserService.getCurrentUserProfile(); 
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;

    // ... (Logic for API keys and System Agents is correct)
    const apiKeyGroup = document.getElementById('api-key-group');
    const ollamaGroup = document.getElementById('ollama-url-group');
    const loadModelsBtn = document.getElementById('load-models-btn');

    if (user.plan === 'master') {
        apiKeyGroup.style.display = 'block';
        ollamaGroup.style.display = 'block';
        if (loadModelsBtn) loadModelsBtn.style.display = 'inline-block';
        document.getElementById('apiKey').value = user.apiSettings?.openrouterKey || '';
        document.getElementById('ollamaBaseUrl').value = user.apiSettings?.ollamaBaseUrl || '';
    } else {
        apiKeyGroup.style.display = 'none';
        ollamaGroup.style.display = 'none';
        if (loadModelsBtn) loadModelsBtn.style.display = 'none';
    }

    const sysAgent = project.globalSettings.systemUtilityAgent || {};
    document.getElementById('system-utility-prompt').value = sysAgent.systemPrompt || '';
    
    const modelsToShow = UserService.getAllowedModelsForCurrentUser();
    createSearchableModelSelector('settings-system-model-wrapper', sysAgent.model, UserService.getAllowedModelsForCurrentUser());
    
    // [THIS IS THE KEY CHANGE]
    document.getElementById('system-utility-prompt').value = sysAgent.systemPrompt || '';
    // [CRITICAL FIX] นำค่า Parameters มาแสดงใน input แบบธรรมดา
    const tempInput = document.getElementById('system-utility-temperature');
    const topPInput = document.getElementById('system-utility-topP');

    if (tempInput) tempInput.value = sysAgent.temperature ?? 1.0;
    if (topPInput) topPInput.value = sysAgent.topP ?? 1.0;
    
    // Render Model Manager (เหมือนเดิม)
    renderModelManager();
}

export function renderAndShowSettings() {
    renderSettingsPanel();
    showSettingsModal();
}

export function initSettingsUI() {
    initTabs();
    
    const bus = stateManager.bus;
    document.getElementById('load-models-btn')?.addEventListener('click', () => {
        const user = UserService.getCurrentUserProfile();
        if (user.plan === 'master') {
            // [FIX] ดึงทั้ง API Key และ Ollama URL จากฟอร์ม
            const userApiKey = document.getElementById('apiKey').value;
            const userOllamaUrl = document.getElementById('ollamaBaseUrl').value;

            // ส่งข้อมูลทั้งสองอย่างไปพร้อมกัน
            bus.publish('api:loadUserModels', { 
                apiKey: userApiKey, 
                ollamaBaseUrl: userOllamaUrl, 
                isUserKey: true 
            });
        }
    });
    
    document.getElementById('apiKey')?.addEventListener('input', debounce((e) => {
        const user = UserService.getCurrentUserProfile();
        if (user && user.plan === 'master') {
            user.apiSettings.openrouterKey = e.target.value;
            UserService.saveFullUserProfile(user);
        }
    }, 500));
    
    bus.subscribe('user:modelsLoaded', () => {
         if (document.getElementById('settings-modal')?.style.display === 'flex') {
            renderSettingsPanel();
        }
    });
    
    document.getElementById('ollamaBaseUrl')?.addEventListener('input', debounce((e) => bus.publish('settings:ollamaUrlChanged', e.target.value), 500));
    
    const systemSettingsFields = [
        'system-utility-model-select', 
        'system-utility-prompt', 
        'system-utility-temperature', 
        'system-utility-topP'
    ];
    systemSettingsFields.forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => bus.publish('settings:systemAgentChanged'));
    });

    document.querySelector('#settings-panel .modal-close-btn')?.addEventListener('click', hideSettingsModal);
    
    stateManager.bus.subscribe('project:loaded', () => {
        console.log("Project loaded. Re-rendering settings panel data.");
        renderSettingsPanel();
    });
    
    stateManager.bus.subscribe('models:loaded', () => {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal && settingsModal.style.display === 'flex') {
            renderSettingsPanel();
        }
    });
    
    stateManager.bus.subscribe('app:settingsChanged', () => {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal && settingsModal.style.display === 'flex') {
            renderSettingsPanel();
        }
    });

    console.log("✅ Settings UI Initialized.");
}