// ===============================================
// FILE: src/js/modules/agent/agent.ui.js 
// DESCRIPTION: แก้ไขการจัดการ Event Listener 
// ===============================================

import { stateManager, ALL_AGENT_SETTINGS_IDS, defaultAgentSettings } from '../../core/core.state.js';
import { showCustomAlert, toggleDropdown, createSearchableModelSelector } from '../../core/core.ui.js';

// --- Private Helper Functions (Not Exported) ---
function createAgentElement(name, preset) {
    const project = stateManager.getProject();
    const activeEntity = project.activeEntity;
    const stagedEntity = stateManager.getStagedEntity();

    const item = document.createElement('div');
    item.className = 'item agent-item';
    item.dataset.agentName = name;

    if (activeEntity?.type === 'agent' && activeEntity.name === name) {
        item.classList.add('active');
    } else if (stagedEntity?.type === 'agent' && stagedEntity.name === name) {
        item.classList.add('staged');
    }

    // [DEFINITIVE FIX] เพิ่ม 'agent:' เข้าไปใน data-action ให้ถูกต้อง
    item.innerHTML = `
    <div class="item-header">
        <span class="item-name"><span class="item-icon">${preset.icon || '🤖'}</span> ${name}</span>
        <div class="item-actions">
            <button class="btn-icon" data-action="agent:edit" title="Edit Agent">
                <span class="material-symbols-outlined">edit</span>
            </button>             
            <button class="btn-icon danger" data-action="agent:delete" title="Delete Agent">
                <span class="material-symbols-outlined">delete</span>
            </button>
        </div>
    </div>`;
    
    return item;
}

/**
 * [REFACTORED] Renders agent presets into a specific container element.
 * @param {HTMLElement} assetsContainer - The parent element to render into.
 */
export function renderAgentPresets(assetsContainer) {
    if (!assetsContainer) return;

    const project = stateManager.getProject();
    if (!project || !project.agentPresets) return;

    // [DEFINITIVE FIX] กลับมาใช้ Template Literal ที่อ่านง่ายและดีกว่า
    const agentSectionHTML = `
        <details class="collapsible-section" open>
            <summary class="section-header">
                <h3>🤖 Agent Presets</h3>
                <button class="btn-icon" data-action="agent:create" title="Create New Agent">+</button>
            </summary>
            <div class="section-box">
                <div id="agentPresetList" class="item-list"></div>
            </div>
        </details>
    `;
    // 1. สร้างโครงสร้างหลักด้วย innerHTML
    assetsContainer.insertAdjacentHTML('beforeend', agentSectionHTML);

    // 2. ค้นหา list container ที่เพิ่งสร้างขึ้น
    const listContainer = assetsContainer.querySelector('#agentPresetList:last-of-type');
    if (!listContainer) return;

    // 3. วาด item แต่ละอันลงไป
    const presets = project.agentPresets;
    for (const name in presets) {
        listContainer.appendChild(createAgentElement(name, presets[name]));
    }
}

function setAgentEditorInitialModel() {
    const project = stateManager.getProject();
    if (!project) return;

    const agentModelSearchInput = document.getElementById('agent-model-search-input');
    const agentModelValueInput = document.getElementById('agent-model-select');
    if (!agentModelSearchInput || !agentModelValueInput) return;

    const allModels = stateManager.getState().allProviderModels || [];
    const editingAgentName = stateManager.getState().editingAgentName;
    let selectedModelId = defaultAgentSettings.model; // ค่าเริ่มต้น

    // ถ้ากำลังแก้ไข Agent ที่มีอยู่ ให้ดึงค่า Model ของ Agent ตัวนั้นมา
    if (editingAgentName && project.agentPresets[editingAgentName]) {
        selectedModelId = project.agentPresets[editingAgentName].model;
    }

    // ค้นหาข้อมูล Model จาก ID ที่เลือกไว้
    const selectedModel = allModels.find(m => m.id === selectedModelId);

    // ตั้งค่าที่แสดงผลและค่าที่ซ่อนไว้ในฟอร์ม
    if (selectedModel) {
        agentModelSearchInput.value = selectedModel.name;
        agentModelValueInput.value = selectedModel.id;
    } else {
        // กรณีหาไม่เจอ (เช่น Model ถูกลบไปแล้ว) ให้เคลียร์ค่า
        agentModelSearchInput.value = '';
        agentModelValueInput.value = '';
    }
}

export function showAgentEditor(isEditing = false, agentName = null) {
    stateManager.setState('editingAgentName', isEditing ? agentName : null);
    const project = stateManager.getProject();
    
    document.getElementById('agent-modal-title').textContent = isEditing ? `Edit Agent: ${agentName}` : "Create New Agent";
    
    // ดึงข้อมูล Agent ที่จะใช้กรอกฟอร์ม
    const agentDataForForm = (isEditing && agentName && project.agentPresets[agentName])
        ? project.agentPresets[agentName]
        : defaultAgentSettings;

    // กรอกข้อมูลในฟอร์ม (ยกเว้น Model)
    document.getElementById('agent-name-input').value = isEditing ? agentName : '';
    Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
        const element = document.getElementById(elId);
        const key = ALL_AGENT_SETTINGS_IDS[elId];
        if (element && key !== 'name' && key !== 'model') {
             const value = agentDataForForm[key];
             element[element.type === 'checkbox' ? 'checked' : 'value'] = value !== undefined ? value : '';
        }
    });

    if (!isEditing) {
        document.getElementById('enhancer-prompt-input').value = '';
    }
    
    // [FIX] เรียกใช้ Component โดยตรง โดยส่งแค่ ID ของโมเดลเริ่มต้นไป
    createSearchableModelSelector(
        'agent-model-search-wrapper',
        agentDataForForm.model // ส่ง Model ID ของ Agent ตัวนั้นๆ ไปเป็นค่าเริ่มต้น
    );

    document.getElementById('agent-editor-modal').style.display = 'flex';
}

export function hideAgentEditor() {
    document.getElementById('agent-editor-modal').style.display = 'none';
    stateManager.setState('editingAgentName', null);
}

export function initAgentUI() {
    // --- Event Listener for the Agent Editor Modal ---
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

    // --- Event Bus Subscriptions ---
    stateManager.bus.subscribe('agent:profileGenerated', (profileData) => {
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

    stateManager.bus.subscribe('agent:editorShouldClose', hideAgentEditor);

    // --- [FIX] Subscribe to 'models:loaded' to refresh the editor if it's open ---
    stateManager.bus.subscribe('models:loaded', () => {
        const agentEditorModal = document.getElementById('agent-editor-modal');
        // ตรวจสอบว่า Modal กำลังแสดงผลอยู่หรือไม่
        if (agentEditorModal && agentEditorModal.style.display === 'flex') {
            console.log('[AgentUI] Models loaded. Refreshing agent editor content.');
            // เรียกฟังก์ชัน showAgentEditor ซ้ำอีกครั้งเพื่อวาด Dropdown ใหม่
            const editingAgentName = stateManager.getState().editingAgentName;
            showAgentEditor(!!editingAgentName, editingAgentName);
        }
    });

    console.log("✅ Agent UI Initialized (Conflicting studio listener removed).");
}