// ===============================================
// FILE: src/js/modules/agent/agent.ui.js 
// DESCRIPTION: แก้ไขการจัดการ Event Listener 
// ===============================================

import { stateManager, ALL_AGENT_SETTINGS_IDS, defaultAgentSettings } from '../../core/core.state.js';
import { showCustomAlert, toggleDropdown } from '../../core/core.ui.js';

// --- Private Helper Functions (Not Exported) ---
function createAgentElement(name, preset) {
    const project = stateManager.getProject();
    const activeEntity = project.activeEntity;

    const item = document.createElement('div');
    item.className = 'item agent-item'; // [FIX] Add specific class for styling and targeting
    item.dataset.agentName = name;

    if (activeEntity && activeEntity.type === 'agent' && activeEntity.name === name) {
        item.classList.add('active');
    }

    item.innerHTML = `
    <div class="item-header">
        <span class="item-name"><span class="item-icon">${preset.icon || '🤖'}</span> ${name}</span>
        <div class="item-actions">
            <button class="btn-icon" data-action="edit" title="Edit Agent">
                <span class="material-symbols-outlined">edit</span>
            </button>             
            <button class="btn-icon danger" data-action="delete" title="Delete Agent">
                <span class="material-symbols-outlined">delete</span>
            </button>        </div>
    </div>`;
    
    // Event listeners are now handled by delegation in initAgentUI for robustness.
    
    return item;
}

/**
 * [REFACTORED] Renders agent presets into a specific container element.
 * @param {HTMLElement} assetsContainer - The parent element to render into.
 */
export function renderAgentPresets(assetsContainer) {
    // Guard Clause: ตรวจสอบว่า container ที่ส่งมาเป็น DOM Element จริง
    if (!assetsContainer || typeof assetsContainer.insertAdjacentHTML !== 'function') {
        console.error('Invalid container passed to renderAgentPresets:', assetsContainer);
        return;
    }

    const project = stateManager.getProject();
    if (!project || !project.agentPresets) return;

    // สร้างโครงสร้าง HTML ของ Section นี้
    const agentSectionHTML = `
        <details class="collapsible-section" open>
            <summary class="section-header">
                <h3>🤖 Agent Presets</h3>
                <button class="btn-icon" data-action="createAgent" title="Create New Agent">+</button>
            </summary>
            <div class="section-box">
                <div id="agentPresetList" class="item-list"></div>
            </div>
        </details>
    `;
    assetsContainer.insertAdjacentHTML('beforeend', agentSectionHTML);

    // หา list container ที่อยู่ "ข้างใน" section ที่เพิ่งสร้างขึ้น
    const listContainer = assetsContainer.querySelector('#agentPresetList');
    if (!listContainer) return;

    // วาด item ลงใน list container
    const presets = project.agentPresets;
    for (const name in presets) {
        listContainer.appendChild(createAgentElement(name, presets[name]));
    }
}
export function populateModelSelectors() {
    const allModels = stateManager.getState().allProviderModels || [];
    const project = stateManager.getProject();
    const selectors = [
        document.getElementById('agent-model-select'),
        document.getElementById('system-utility-model-select')
    ];
    
    if (selectors.some(s => !s) || !project.globalSettings) return;

    const openrouterGroup = document.createElement('optgroup');
    openrouterGroup.label = 'OpenRouter';
    const ollamaGroup = document.createElement('optgroup');
    ollamaGroup.label = 'Ollama';

    allModels.forEach(model => {
        const option = new Option(model.name, model.id);
        (model.provider === 'openrouter' ? openrouterGroup : ollamaGroup).appendChild(option);
    });

    selectors.forEach(selector => {
        const savedValue = selector.value;
        selector.innerHTML = '<option value="">-- Select a Model --</option>';
        if (openrouterGroup.childElementCount > 0) selector.appendChild(openrouterGroup.cloneNode(true));
        if (ollamaGroup.childElementCount > 0) selector.appendChild(ollamaGroup.cloneNode(true));
        
        if (selector.id === 'system-utility-model-select') {
            selector.value = project.globalSettings.systemUtilityAgent?.model || '';
        } else if (selector.id === 'agent-model-select') {
            const editingAgentName = stateManager.getState().editingAgentName;
            if (editingAgentName && project.agentPresets[editingAgentName]) {
                selector.value = project.agentPresets[editingAgentName].model;
            } else {
                selector.value = savedValue;
            }
        }
    });
}

export function showAgentEditor(isEditing = false, agentName = null) {
    stateManager.setState('editingAgentName', isEditing ? agentName : null);
    const project = stateManager.getProject();
    const allModels = stateManager.getState().allProviderModels;
    const utilityAgent = project.globalSettings.systemUtilityAgent;
    const modelInfo = allModels.find(m => m.id === utilityAgent.model);

    document.getElementById('agent-modal-title').textContent = isEditing ? `Edit Agent: ${agentName}` : "Create New Agent";
    document.getElementById('enhancer-model-name').textContent = modelInfo?.name || utilityAgent.model || 'Not Configured';

    if (isEditing && agentName) {
        const agent = project.agentPresets[agentName];
        if (!agent) { showCustomAlert("Agent not found."); return; }
        
        document.getElementById('agent-name-input').value = agentName;
        Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
            const element = document.getElementById(elId);
            if(element && elId !== 'agent-name-input') {
                 const value = agent[ALL_AGENT_SETTINGS_IDS[elId]];
                 element[element.type === 'checkbox' ? 'checked' : 'value'] = value !== undefined ? value : '';
            }
        });
    } else {
        document.getElementById('agent-name-input').value = '';
        Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
            const element = document.getElementById(elId);
            if(element && elId !== 'agent-name-input') {
                const value = defaultAgentSettings[ALL_AGENT_SETTINGS_IDS[elId]];
                element[element.type === 'checkbox' ? 'checked' : 'value'] = value !== undefined ? value : '';
            }
        });
        document.getElementById('enhancer-prompt-input').value = '';
    }
    
    populateModelSelectors();
    document.getElementById('agent-editor-modal').style.display = 'flex';
}
export function hideAgentEditor() {
    document.getElementById('agent-editor-modal').style.display = 'none';
    stateManager.setState('editingAgentName', null);
}

export function initAgentUI() {
    // --- ส่วนของ Subscribers ที่จัดการ Modal ยังคงเหมือนเดิมทุกประการ ---
     stateManager.bus.subscribe('agent:profileGenerated', (profileData) => {
        console.log("🎉 'agent:profileGenerated' event received. Populating form...", profileData);
        
        // ใช้ชื่อ field จาก JSON ที่ได้รับมาโดยตรง
        document.getElementById('agent-name-input').value = profileData.agent_name || '';
        document.getElementById('agent-icon-input').value = profileData.agent_icon || '🤖';
        document.getElementById('agent-system-prompt').value = profileData.system_prompt || '';
        document.getElementById('agent-temperature').value = profileData.temperature ?? 1.0;
        document.getElementById('agent-topP').value = profileData.top_p ?? 1.0;
        document.getElementById('agent-topK').value = profileData.top_k ?? 0;
        document.getElementById('agent-presence-penalty').value = profileData.presence_penalty ?? 0.0;
        document.getElementById('agent-frequency-penalty').value = profileData.frequency_penalty ?? 0.0;
    });

    stateManager.bus.subscribe('agent:enhancerStatus', ({ text, color }) => {
        const statusDiv = document.getElementById('enhancer-status');
        if (statusDiv) {
            statusDiv.textContent = text;
            statusDiv.style.color = color || 'var(--text-dark)';
        }
    });

    // --- [CRITICAL FIX] แก้ไข Event Listener ให้ดักฟังบน Sidebar ขวาอันใหม่ ---
    // เปลี่ยนจาก '#studio-modal .studio-assets-container' มาเป็น '#studio-panel'
    const studioPanel = document.getElementById('studio-panel');
    if (studioPanel) {
        // ใช้ Event Delegation กับ Panel แม่ เพื่อให้ดักจับทุกคลิกที่เกิดขึ้นข้างในได้
        studioPanel.addEventListener('click', (e) => {
            // Listener for the "Add Agent" button (+) in the section header
            const addAgentButton = e.target.closest('button[data-action="createAgent"]');
            if (addAgentButton) {
                e.preventDefault();
                stateManager.bus.publish('agent:create');
                return;
            }

            // Listeners for items in the agent list (Edit/Delete buttons)
            const agentItem = e.target.closest('.item[data-agent-name]');
            if (!agentItem) return;

            const agentName = agentItem.dataset.agentName;
            const actionButton = e.target.closest('button[data-action]');

            if (actionButton) {
                const action = actionButton.dataset.action;
                if (action === 'edit') {
                    stateManager.bus.publish('agent:edit', { agentName });
                } else if (action === 'delete') {
                    stateManager.bus.publish('agent:delete', { agentName });
                }
            } else {
                // ถ้าคลิกที่ตัว Item เอง (ไม่ใช่ปุ่ม) ก็สามารถเลือกเป็น Active Agent ได้
                const entity = { type: 'agent', name: agentName };
                stateManager.bus.publish('entity:select', entity);
            }
        });
    }

    // --- ส่วนของ Listener สำหรับ Agent Editor Modal ยังคงเหมือนเดิม ---
    const agentEditorModal = document.getElementById('agent-editor-modal');
    if (agentEditorModal) {
        agentEditorModal.addEventListener('click', (e) => {
            const target = e.target;
            if (target.matches('.modal-actions .btn:not(.btn-secondary)')) {
                stateManager.bus.publish('agent:save');
            } else if (target.closest('#generate-agent-profile-btn')) {
                stateManager.bus.publish('agent:generateProfile');
            } else if (target.matches('.btn-secondary') || target.closest('.modal-close-btn')) {
                hideAgentEditor();
            }
        });
    }

    // --- Subscriptions อื่นๆ ---
    stateManager.bus.subscribe('models:loaded', populateModelSelectors);
    stateManager.bus.subscribe('agent:editorShouldClose', hideAgentEditor);

    console.log("✅ Agent UI and its listeners initialized correctly.");
}