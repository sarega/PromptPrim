// ===============================================
// FILE: src/js/modules/agent/agent.ui.js 
// DESCRIPTION: แก้ไขการจัดการ Event Listener 
// ===============================================

import { stateManager, ALL_AGENT_SETTINGS_IDS, defaultAgentSettings } from '../../core/core.state.js';
import { showCustomAlert, toggleDropdown, createSearchableModelSelector } from '../../core/core.ui.js';
import { populatePresetSelector, getFilteredModelsForDisplay } from '../models/model-manager.ui.js';
import * as UserService from '../user/user.service.js';
import { createParameterEditor } from '../../components/parameter-editor.js';

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

// ฟังก์ชันนี้จะรับ Array ของ Agent ที่ผ่านการกรองและจัดเรียงมาแล้ว
export function renderAgentPresets(assetsContainer, agentsToRender) {
    if (!assetsContainer) return;

    const agentSection = assetsContainer.querySelector('.agent-presets-section');
    if (agentSection) agentSection.remove(); // ลบของเก่าทิ้งถ้ามี

    const agentSectionHTML = `
        <details class="collapsible-section agent-presets-section" open>
            <summary class="section-header">
                <h3>🤖 Agent Presets</h3>
                <button class="btn-icon" data-action="agent:create" title="Create New Agent">+</button>
            </summary>
            <div class="section-box">
                <div id="agentPresetList" class="item-list"></div>
            </div>
        </details>`;
    assetsContainer.insertAdjacentHTML('beforeend', agentSectionHTML);

    const listContainer = assetsContainer.querySelector('#agentPresetList');
    if (!listContainer) return;

    if (!agentsToRender || agentsToRender.length === 0) {
        listContainer.innerHTML = `<p class="no-items-message">No agents found.</p>`;
        return;
    }

    // วาด Agent จาก Array ที่รับเข้ามา
    agentsToRender.forEach(agent => {
        listContainer.appendChild(createAgentElement(agent.name, agent));
    });
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

// ฟังก์ชันสำหรับแสดง Tag Pills
function renderAgentTags(tags = []) {
    const container = document.getElementById('agent-tags-container');
    const input = document.getElementById('agent-tags-input');
    if (!container || !input) return;
    container.querySelectorAll('.tag-pill').forEach(pill => pill.remove());
    (tags || []).forEach(tag => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.textContent = tag;
        pill.dataset.tag = tag;
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => pill.remove();
        pill.appendChild(removeBtn);
        container.insertBefore(pill, input);
    });
}


// ฟังก์ชันสำหรับแสดงรายการ Memory พร้อม Toggle Switch
function renderAgentMemoryList(agentActiveMemories = []) {
    const project = stateManager.getProject();
    const allMemories = project.memories || [];
    const listContainer = document.getElementById('agent-memory-list');
    if(!listContainer) return;
    listContainer.innerHTML = '';
    if (allMemories.length === 0) {
        listContainer.innerHTML = `<p class="no-items-message">Create memories first.</p>`;
        return;
    }
    allMemories.forEach(memory => {
        const isActive = (agentActiveMemories || []).includes(memory.name);
        const item = document.createElement('div');
        item.className = 'item';
        item.dataset.memoryName = memory.name;
        item.innerHTML = `<span class="item-name">${memory.name}</span><label class="switch"><input type="checkbox" ${isActive ? 'checked' : ''}><span class="slider round"></span></label>`;
        listContainer.appendChild(item);
    });
}

// ฟังก์ชันสำหรับล็อก/ปลดล็อกฟอร์ม
function setEditorLockState(isLocked) {
    const systemTab = document.querySelector('#agent-editor-modal .tab-content[data-tab-content="system"]');
    if (systemTab) systemTab.classList.toggle('is-locked', isLocked);
}

// [NEW HELPER] ฟังก์ชันสำหรับอัปเดตชื่อโมเดลของ Enhancer โดยเฉพาะ
function updateEnhancerModelName() {
    const enhancerModelSpan = document.getElementById('enhancer-model-name');
    const project = stateManager.getProject();
    if (!enhancerModelSpan || !project) return;

    const utilityModel = project.globalSettings.systemUtilityAgent;
    if (utilityModel && utilityModel.model) {
        const allModels = [
            ...(stateManager.getState().systemProviderModels || []), 
            ...(stateManager.getState().userProviderModels || [])
        ];
        // ถ้า allModels ยังว่างอยู่ ให้แสดง ID ไปก่อน
        if (allModels.length === 0) {
            enhancerModelSpan.textContent = utilityModel.model;
            return;
        }
        const modelData = allModels.find(m => m.id === utilityModel.model);
        enhancerModelSpan.textContent = modelData ? modelData.name : utilityModel.model;
    } else {
        enhancerModelSpan.textContent = 'N/A';
    }
}
// --- Main Exported Functions ---

export function hideAgentEditor() {
    const editor = stateManager.getState().activeParameterEditor;
    if (editor && typeof editor.destroy === 'function') {
        editor.destroy();
        stateManager.setState('activeParameterEditor', null);
    }
    document.getElementById('agent-editor-modal').style.display = 'none';
    stateManager.setState('editingAgentName', null);
}


export function showAgentEditor(isEditing = false, agentName = null) {
    const agentEditorModal = document.getElementById('agent-editor-modal');
    if (!agentEditorModal) return;

    stateManager.setState('editingAgentName', isEditing ? agentName : null);
    
    // 1. รีเซ็ต Tab กลับไปหน้าแรกเสมอ
    agentEditorModal.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
    agentEditorModal.querySelector('.tab-btn[data-tab="config"]')?.classList.add('active');
    agentEditorModal.querySelector('.tab-content[data-tab-content="config"]')?.classList.add('active');

    // 2. วาด UI ทั้งหมดในครั้งเดียว
    const project = stateManager.getProject();
    const agentData = (isEditing && project.agentPresets[agentName]) 
        ? project.agentPresets[agentName] 
        : defaultAgentSettings; // <-- กลับมาใช้ defaultAgentSettings ที่เรียบง่าย
        // [ADD THIS] แสดงรูปโปรไฟล์
    const profilePicturePreview = document.getElementById('agent-profile-picture-preview');
    if (profilePicturePreview) {
        // ถ้ามีรูปที่บันทึกไว้ให้ใช้รูปนั้น, ถ้าไม่มีให้ใช้รูป Default
        profilePicturePreview.src = agentData.profilePicture || '/icon.png';
    }
    
    // --- Populate Tab 1: Configuration ---
    document.getElementById('agent-name-input').value = isEditing ? agentName : "New Agent";
    document.getElementById('agent-icon-button').textContent = agentData.icon || '🤖';
    document.getElementById('agent-id-display').value = agentData.id;
    document.getElementById('agent-description').value = agentData.description || '';
    renderAgentTags(agentData.tags);
    
    // --- Populate System & Model section (now in Tab 1) ---
    createSearchableModelSelector('agent-model-search-wrapper', agentData.model, UserService.getAllowedModelsForCurrentUser());
    document.getElementById('agent-system-prompt').value = agentData.systemPrompt;
    document.getElementById('agent-use-markdown').checked = agentData.useMarkdown;
    document.getElementById('agent-enable-web-search').checked = agentData.enableWebSearch;

    const paramsContainer = document.getElementById('agent-params-container');
    if (paramsContainer) {
        const models = UserService.getAllowedModelsForCurrentUser();
        const modelData = models.find(m => m.id === agentData.model);
        const provider = modelData ? modelData.provider : 'openrouter';
        const parameterEditor = createParameterEditor(paramsContainer, agentData, provider);
        stateManager.setState('activeParameterEditor', parameterEditor);
    }
        // [ADD THIS] แสดงผล Metadata
    const createdInput = document.getElementById('agent-created-by-input');
    if (createdInput) {
        createdInput.value = isEditing ? (agentData.createdBy || 'Unknown') : UserService.getCurrentUserProfile().userName;
    }
    
    const createdSpan = document.getElementById('agent-created-date');
    if (createdSpan) createdSpan.textContent = agentData.createdAt ? new Date(agentData.createdAt).toLocaleString() : 'Not saved yet';

    const modifiedSpan = document.getElementById('agent-modified-date');
    if (modifiedSpan) modifiedSpan.textContent = agentData.modifiedAt ? new Date(agentData.modifiedAt).toLocaleString() : 'Not saved yet';


    // --- Populate Tab 2: Memories ---
    renderAgentMemoryList(agentData.activeMemories);

    // --- Other UI updates ---
    setEditorLockState(agentData.type === 'third-party');
    updateEnhancerModelName();
    
    // 3. แสดง Modal
    agentEditorModal.style.display = 'flex';
}


// --- Helper Functions for the New Agent Editor ---

// ฟังก์ชันสำหรับจัดการการสลับ Tab
function initTabLogic(modal) {
    const tabButtons = modal.querySelector('.tab-buttons');
    const tabContents = modal.querySelectorAll('.tab-content');
    if (tabButtons && !tabButtons._listenerAttached) {
        tabButtons.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.tab-btn');
            if (!tabButton) return;
            const tabName = tabButton.dataset.tab;
            tabButtons.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            tabButton.classList.add('active');
            tabContents.forEach(content => {
                content.classList.toggle('active', content.dataset.tabContent === tabName);
            });
        });
        tabButtons._listenerAttached = true;
    }
}

export function initAgentUI() {
    const agentEditorModal = document.getElementById('agent-editor-modal');
    if (!agentEditorModal) return;

   // --- Simple Tab Click Logic ---
    const tabButtons = agentEditorModal.querySelector('.tab-buttons');
    tabButtons?.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.tab-btn');
        if (!tabButton) return;
        const tabName = tabButton.dataset.tab;
        agentEditorModal.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        tabButton.classList.add('active');
        agentEditorModal.querySelector(`.tab-content[data-tab-content="${tabName}"]`)?.classList.add('active');
    });

    // --- Main Delegated Event Listener for All Actions ---
    agentEditorModal.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches('.modal-actions .btn:not(.btn-secondary)')) { stateManager.bus.publish('agent:save'); } 
        else if (target.closest('#generate-agent-profile-btn')) { stateManager.bus.publish('agent:generateProfile'); } 
        else if (target.matches('.btn-secondary') || target.closest('.modal-close-btn')) { hideAgentEditor(); } 
        else if (target.closest('#agent-id-copy-btn')) {
            const idInput = document.getElementById('agent-id-display');
            navigator.clipboard.writeText(idInput.value);
        }
    });

    // --- Tags Input Logic ---
    const tagsInput = document.getElementById('agent-tags-input');
    tagsInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation(); // <-- [CRITICAL FIX] เพิ่มบรรทัดนี้

            const newTag = tagsInput.value.trim();
            if (newTag) {
                const existingTags = Array.from(document.querySelectorAll('#agent-tags-container .tag-pill')).map(p => p.dataset.tag);
                if (!existingTags.includes(newTag)) {
                    renderAgentTags([...existingTags, newTag]);
                }
                tagsInput.value = '';
            }
        }
    });

    // --- Emoji Picker Logic ---
    const iconButton = document.getElementById('agent-icon-button');
    const emojiPicker = document.getElementById('agent-emoji-picker');

    if (iconButton && emojiPicker) {
        // เมื่อคลิกปุ่ม ให้แสดง/ซ่อน Picker
        iconButton.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // [CRITICAL FIX] ตรวจสอบ Theme ทุกครั้งที่เปิด Picker
            if (document.body.classList.contains('dark-mode')) {
                emojiPicker.classList.add('dark');
                emojiPicker.classList.remove('light');
            } else {
                emojiPicker.classList.add('light');
                emojiPicker.classList.remove('dark');
            }

            emojiPicker.classList.toggle('hidden');
        });

        // เมื่อเลือก Emoji
        emojiPicker.addEventListener('emoji-click', event => {
            if (event.detail.emoji) {
                iconButton.textContent = event.detail.emoji.unicode;
                emojiPicker.classList.add('hidden');
            }
        });

        // Logic การปิดเมื่อคลิกที่อื่น (เหมือนเดิม)
        document.addEventListener('click', (e) => {
            if (!emojiPicker.classList.contains('hidden') && !emojiPicker.contains(e.target) && e.target !== iconButton) {
                emojiPicker.classList.add('hidden');
            }
        });
    }
    // --- [ADD THIS] Profile Picture Upload Logic ---
    const profilePictureUpload = document.getElementById('agent-profile-picture-upload');
    const profilePicturePreview = document.getElementById('agent-profile-picture-preview');

    if (profilePictureUpload && profilePicturePreview) {
        profilePictureUpload.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            // 1. ตรวจสอบประเภทไฟล์ (File Type Validation)
            if (!file.type.startsWith('image/')) {
                showCustomAlert('Please select an image file (e.g., PNG, JPG, WEBP).', 'Unsupported File');
                return;
            }

            // 2. ตรวจสอบขนาดไฟล์ (File Size Validation) - 2MB limit
            const maxSizeInBytes = 2 * 1024 * 1024; 
            if (file.size > maxSizeInBytes) {
                showCustomAlert('The selected image is too large. Please select a file smaller than 2MB.', 'File Too Large');
                return;
            }

            // 3. อ่านและแสดงผลรูปภาพ
            const reader = new FileReader();
            reader.onload = (e) => {
                profilePicturePreview.src = e.target?.result || '';
            };
            reader.readAsDataURL(file);
        });
    }

    // --- Event Bus Subscriptions ---
    stateManager.bus.subscribe('agent:editorShouldClose', hideAgentEditor);
    
    const refreshEnhancerNameIfOpen = () => {
        if (agentEditorModal && agentEditorModal.style.display === 'flex') {
            updateEnhancerModelName();
        }
    };
    stateManager.bus.subscribe('models:loaded', refreshEnhancerNameIfOpen);
    stateManager.bus.subscribe('user:modelsLoaded', refreshEnhancerNameIfOpen);

    stateManager.bus.subscribe('agent:profileGenerated', (profileData) => {
        if (!profileData) return;
        
        // 1. อัปเดต UI ที่มองเห็นได้ทันที
        document.getElementById('agent-name-input').value = profileData.agent_name || '';
        document.getElementById('agent-icon-input').value = profileData.agent_icon || '';
        document.getElementById('agent-system-prompt').value = profileData.system_prompt || '';

        // 2. [CRITICAL FIX] สร้าง agentData ที่สมบูรณ์ โดยใช้ "ค่า Default" เป็น fallback
        const agentName = stateManager.getState().editingAgentName;
        const project = stateManager.getProject();
        const existingAgentData = agentName ? project.agentPresets[agentName] : defaultAgentSettings;

        const completeAgentData = {
            ...existingAgentData, // เอาค่าเก่า/default มาเป็นพื้น
            temperature: profileData.temperature ?? existingAgentData.temperature,
            topP: profileData.top_p ?? existingAgentData.topP,
            topK: profileData.top_k ?? existingAgentData.topK,
            max_tokens: profileData.max_tokens ?? existingAgentData.max_tokens,
            frequency_penalty: profileData.frequency_penalty ?? existingAgentData.frequency_penalty,
            presence_penalty: profileData.presence_penalty ?? existingAgentData.presence_penalty,
            seed: profileData.seed ?? existingAgentData.seed,
        };

        // 3. สั่งให้ Parameter Editor วาดตัวเองใหม่ด้วยข้อมูลที่สมบูรณ์
        const paramsContainer = document.getElementById('agent-params-container');
        if (paramsContainer) {
            const editor = stateManager.getState().activeParameterEditor;
            if (editor) editor.destroy();
            
            const provider = 'openrouter';
            const newEditor = createParameterEditor(paramsContainer, completeAgentData, provider);
            stateManager.setState('activeParameterEditor', newEditor);
        }
    });
    stateManager.bus.subscribe('agent:promptEnhanced', ({ newPrompt }) => {
        const promptTextarea = document.getElementById('agent-system-prompt');
        if (promptTextarea) {
            promptTextarea.value = newPrompt;
        }
    });
}