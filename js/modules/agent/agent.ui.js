// js/modules/agent/agent.ui.js

function renderAgentPresets() {
    const project = stateManager.getProject();
    if (!project || !project.agentPresets) return;
    const container = document.getElementById('agentPresetList');
    container.innerHTML = '';
    const presets = project.agentPresets;
    
    const activeEntity = project.activeEntity;

    for (const name in presets) {
        const preset = presets[name];
        const item = document.createElement('div');
        item.className = 'item';
        item.dataset.agentName = name;

        if (activeEntity && activeEntity.type === 'agent' && activeEntity.name === name) {
            item.classList.add('active');
        }

        item.innerHTML = `
        <div class="item-header">
            <span class="item-name"><span class="item-icon">${preset.icon || '🤖'}</span> ${name}</span>
            <div class="item-actions">
                 <button class="btn-icon" data-action="edit" title="Edit Agent">&#9998;</button>
                 <button class="btn-icon danger" data-action="delete" title="Delete Agent">&#128465;</button>
            </div>
        </div>`;
        
        item.addEventListener('click', (e) => {
            if (e.target.closest('.item-actions')) return;
            selectEntity('agent', name);
        });
        item.querySelector('[data-action="edit"]').addEventListener('click', () => showAgentEditor(true, name));
        item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteAgentPreset(name));
        
        container.appendChild(item);
    }
}

// [FIX 1] แก้ไขฟังก์ชันนี้ให้เลือก Model ที่บันทึกไว้ได้อย่างถูกต้อง
function populateModelSelectors() {
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
        const savedValue = selector.value; // บันทึกค่าที่อาจจะถูกเลือกไว้ชั่วคราว
        selector.innerHTML = '<option value="">-- Select a Model --</option>';
        if (openrouterGroup.childElementCount > 0) selector.appendChild(openrouterGroup.cloneNode(true));
        if (ollamaGroup.childElementCount > 0) selector.appendChild(ollamaGroup.cloneNode(true));
        
        // ตรวจสอบและตั้งค่าจาก State ของโปรเจกต์
        if (selector.id === 'system-utility-model-select') {
            selector.value = project.globalSettings.systemUtilityAgent?.model || '';
        } else if (selector.id === 'agent-model-select') {
             // ถ้ากำลังแก้ไข Agent อยู่ ให้ใช้ค่าจาก Agent นั้น
            const editingAgentName = stateManager.getState().editingAgentName;
            if (editingAgentName && project.agentPresets[editingAgentName]) {
                selector.value = project.agentPresets[editingAgentName].model;
            } else {
                selector.value = savedValue; // ใช้ค่าเดิมถ้าไม่ได้แก้ไข
            }
        }
    });
}


function showAgentEditor(isEditing = false, agentName = null) {
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
        
        Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
            const element = document.getElementById(elId);
            if(element) {
                 const value = agent[ALL_AGENT_SETTINGS_IDS[elId]];
                 element[element.type === 'checkbox' ? 'checked' : 'value'] = value !== undefined ? value : '';
            }
        });
        document.getElementById('agent-name-input').value = agentName;
    } else {
        Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
            const element = document.getElementById(elId);
            if(element) {
                const value = defaultAgentSettings[ALL_AGENT_SETTINGS_IDS[elId]];
                element[element.type === 'checkbox' ? 'checked' : 'value'] = value !== undefined ? value : '';
            }
        });
        document.getElementById('agent-name-input').value = '';
    }
    
    // ต้องเรียก populateModelSelectors อีกครั้งหลังจากตั้งค่าทุกอย่างเสร็จ
    // เพื่อให้มันเลือก model ที่ถูกต้องสำหรับ agent ที่กำลังแก้ไขอยู่
    populateModelSelectors();

    document.getElementById('agent-editor-modal').style.display = 'flex';
}

function hideAgentEditor() {
    document.getElementById('agent-editor-modal').style.display = 'none';
    stateManager.setState('editingAgentName', null);
}

function initAgentUI() {
    stateManager.bus.subscribe('entity:selected', renderAgentPresets);
    stateManager.bus.subscribe('project:loaded', renderAgentPresets);
    stateManager.bus.subscribe('agent:listChanged', renderAgentPresets);
    stateManager.bus.subscribe('session:loaded', renderAgentPresets);
    stateManager.bus.subscribe('models:loaded', populateModelSelectors);
    
    stateManager.bus.subscribe('agent:profileGenerated', (profileData) => {
        document.getElementById('agent-name-input').value = profileData.agent_name || '';
        document.getElementById('agent-icon-input').value = profileData.agent_icon || '🤖';
        document.getElementById('agent-system-prompt').value = profileData.system_prompt || '';
        document.getElementById('agent-temperature').value = profileData.temperature ?? 1.0;
        document.getElementById('agent-topP').value = profileData.top_p ?? 1.0;
    });
    stateManager.bus.subscribe('agent:enhancerStatus', ({ text, color }) => {
        const statusDiv = document.getElementById('enhancer-status');
        statusDiv.textContent = text;
        statusDiv.style.color = color || 'var(--text-dark)';
    });

    const createAgentButton = document.querySelector('a[data-action="createAgent"]');
    if (createAgentButton) {
        createAgentButton.addEventListener('click', (e) => {
            e.preventDefault(); showAgentEditor(false);
        });
    }

    document.getElementById('generate-agent-profile-btn').addEventListener('click', generateAgentProfile);
    document.querySelector('#agent-editor-modal .modal-actions .btn:not(.btn-secondary)').addEventListener('click', saveAgentPreset);
    document.querySelector('#agent-editor-modal .btn-secondary').addEventListener('click', hideAgentEditor);

    console.log("Agent UI Initialized.");
}
