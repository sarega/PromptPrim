// ===============================================
// FILE: src/js/modules/group/group.ui.js (ฉบับแก้ไขสมบูรณ์)
// DESCRIPTION: แก้ไขการจัดการ Event Listener และ Bug ที่เกี่ยวข้องกับรายชื่อสมาชิก
// ===============================================
import { ReactBridge } from '../../react-entry.jsx';
import GroupEditorModal from '../../react-components/GroupEditorModal.jsx';
import * as GroupHandlers from './group.handlers.js';
import { stateManager } from '../../core/core.state.js';
import { createDropdown } from '../../core/core.ui.js';

const CONTAINER_ID = 'group-editor-container';

// --- Private Helper Functions ---
function createGroupElement(name) {
    const project = stateManager.getProject();
    const activeEntity = project.activeEntity;
    // [FIX] ดึง Staged Entity มาตรวจสอบ
    const stagedEntity = stateManager.getStagedEntity();

    const item = document.createElement('div');
    item.className = 'item group-item';
    item.dataset.groupName = name;

    // [FIX] เพิ่ม Logic การไฮไลท์สำหรับสถานะรอยืนยัน
    if (activeEntity?.type === 'group' && activeEntity.name === name) {
        item.classList.add('active'); // สีเขียว
    } else if (stagedEntity?.type === 'group' && stagedEntity.name === name) {
        item.classList.add('staged'); // สีเหลืองรอยืนยัน
    }

    const header = document.createElement('div');
    header.className = 'item-header';

    const itemName = document.createElement('span');
    itemName.className = 'item-name';

    const icon = document.createElement('span');
    icon.className = 'item-icon';
    icon.textContent = '🤝';

    itemName.appendChild(icon);
    itemName.appendChild(document.createTextNode(` ${name}`));

    const dropdownOptions = [
        { label: 'Edit...', action: 'group:edit' },
        { label: 'Delete', action: 'group:delete', isDestructive: true },
    ];
    const itemDropdown = createDropdown(dropdownOptions);
    itemDropdown.querySelector('button')?.setAttribute('title', 'Group actions');

    header.append(itemName, itemDropdown);
    item.appendChild(header);
    
    return item;
}

// --- Exported UI Functions ---

/**
 * [REFACTORED] Renders agent groups into a specific container element.
 * @param {HTMLElement} assetsContainer - The parent element to render into.
 */
export function renderAgentGroups(assetsContainer) {
     if (!assetsContainer) return;

    const project = stateManager.getProject();
    if (!project || !project.agentGroups) return;

    const section = document.createElement('details');
    section.className = 'collapsible-section agent-groups-section';
    section.open = true;

    const summary = document.createElement('summary');
    summary.className = 'section-header';

    const title = document.createElement('h3');
    title.textContent = '🤝 Agent Groups';

    const actions = document.createElement('div');
    actions.className = 'section-header-actions';

    const createButton = document.createElement('button');
    createButton.className = 'btn-icon';
    createButton.dataset.action = 'group:create';
    createButton.title = 'Create New Group';
    createButton.textContent = '+';

    const summaryDropdown = createDropdown([
        { label: 'New Group...', action: 'group:create' }
    ]);
    summaryDropdown.classList.add('section-mini-menu');
    summaryDropdown.querySelector('button')?.setAttribute('title', 'Group section menu');

    actions.append(createButton, summaryDropdown);
    summary.append(title, actions);

    const box = document.createElement('div');
    box.className = 'section-box';

    const listContainer = document.createElement('div');
    listContainer.id = 'agentGroupList';
    listContainer.className = 'item-list';
    box.appendChild(listContainer);

    section.append(summary, box);
    assetsContainer.appendChild(section);

    if (!listContainer) return;

    // วาด item แต่ละอันลงไป
    const groups = project.agentGroups;
    const groupNames = Object.keys(groups || {});
    if (groupNames.length === 0) {
        listContainer.innerHTML = '<p class="no-items-message">No groups yet.</p>';
        return;
    }
    for (const name of groupNames) {
        listContainer.appendChild(createGroupElement(name));
    }
}

function updateGroupFlowControls() {
    const flowType = document.getElementById('group-flow-select').value;
    const roundsControl = document.getElementById('group-rounds-control'); 
    const timerControl = document.getElementById('group-timer-control');

    if (!roundsControl || !timerControl) return;

    if (flowType === 'round-robin') {
        roundsControl.classList.remove('hidden');
        timerControl.classList.add('hidden');
    } else { // auto-moderator
        roundsControl.classList.add('hidden');
        timerControl.classList.remove('hidden');
    }
}


// Helper: สร้าง Container ของตัวเอง
function ensureContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = CONTAINER_ID;
        document.body.appendChild(container);
    }
    return container;
}

// Helper: ทำลาย Container ของตัวเอง
function removeContainer() {
    const container = document.getElementById(CONTAINER_ID);
    if (container) {
        ReactBridge.unmount(container); // สั่ง React ให้ทำความสะอาดก่อน
        container.remove();
    }
}

export function showAgentGroupEditor(isEditing = false, groupName = null) {
    const project = stateManager.getProject();
    const groupData = isEditing ? { name: groupName, ...project.agentGroups[groupName] } : null;
    const allAgents = project.agentPresets || {};
    const targetElement = ensureContainer();
    
    const onSave = (newData) => {
        GroupHandlers.saveGroupFromReact(newData, groupName);
        hideAgentGroupEditor();
    };

    const props = {
        groupData,
        allAgents,
        onSave,
        unmount: hideAgentGroupEditor // ส่งฟังก์ชันปิดให้ React
    };

    ReactBridge.mount(GroupEditorModal, props, targetElement);
}

export function hideAgentGroupEditor() {
    console.log("📍 hideAgentGroupEditor called");
    removeContainer(); // สั่งทำลาย Container ทิ้งทั้งหมด
    stateManager.setState('editingGroupName', null);
}

export function updateModeratorDropdown(selectedModerator = null) {
    const moderatorSelect = document.getElementById('group-moderator-select');
    const memberItems = document.querySelectorAll('#group-member-list .agent-sortable-item');
    const selectedMembers = Array.from(memberItems)
        .filter(item => item.querySelector('input[type="checkbox"]').checked)
        .map(item => item.dataset.agentName);
    
    const currentModerator = moderatorSelect.value;
    moderatorSelect.innerHTML = '<option value="">-- Select Moderator --</option>';
    selectedMembers.forEach(name => {
        moderatorSelect.add(new Option(name, name));
    });

    if (selectedModerator && selectedMembers.includes(selectedModerator)) {
        moderatorSelect.value = selectedModerator;
    } else if (selectedMembers.includes(currentModerator)) {
        moderatorSelect.value = currentModerator;
    }
}

// export function initGroupUI() {
//     stateManager.bus.subscribe('group:editorShouldClose', hideAgentGroupEditor);

//     const groupEditorModal = document.getElementById('agent-group-editor-modal');
//     if (groupEditorModal) {
//         // Listener for Save/Cancel buttons
//         groupEditorModal.addEventListener('click', (e) => {
//             if (e.target.matches('.modal-actions .btn:not(.btn-secondary)')) {
//                 stateManager.bus.publish('group:save');
//             } else if (e.target.matches('.btn-secondary') || e.target.closest('.modal-close-btn')) {
//                 hideAgentGroupEditor();
//             }
//         });

//         // Listener for stepper buttons (+/-)
//         groupEditorModal.addEventListener('click', (e) => {
//             if (e.target.matches('.stepper-btn')) {
//                 const input = e.target.parentElement.querySelector('input[type="number"]');
//                 if (!input) return;
//                 let newValue = parseInt(input.value, 10) + parseInt(e.target.dataset.step, 10);
//                 newValue = Math.max(input.min, Math.min(input.max, newValue));
//                 input.value = newValue;
//             }
//         });
//     }

//     document.getElementById('group-flow-select')?.addEventListener('change', updateGroupFlowControls);
//     console.log("✅ Group UI Initialized (Studio listener removed).");
// }

export function initGroupUI() {
    // ฟังก์ชันนี้ยังคงต้องมีอยู่
    console.log("✅ Group UI Initialized");
}
