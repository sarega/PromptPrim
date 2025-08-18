// ===============================================
// FILE: src/js/modules/group/group.ui.js (ฉบับแก้ไขสมบูรณ์)
// DESCRIPTION: แก้ไขการจัดการ Event Listener และ Bug ที่เกี่ยวข้องกับรายชื่อสมาชิก
// ===============================================
import { mountReactComponent } from '../../react-entry.jsx';
import GroupEditorModal from '../../react-components/GroupEditorModal.jsx';
import * as GroupHandlers from './group.handlers.js';
import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';


// --- Private Helper Functions ---
function createGroupElement(name) {
    const project = stateManager.getProject();
    const activeEntity = project.activeEntity;
    // [FIX] ดึง Staged Entity มาตรวจสอบ
    const stagedEntity = stateManager.getStagedEntity();

    const item = document.createElement('div');
    item.className = 'item group-item';
    item.dataset.groupName = name;

    // [FIX] เพิ่ม Logic การไฮไลท์สีเหลืองสำหรับ Staging
    if (activeEntity?.type === 'group' && activeEntity.name === name) {
        item.classList.add('active'); // สีเขียว
    } else if (stagedEntity?.type === 'group' && stagedEntity.name === name) {
        item.classList.add('staged'); // สีเหลืองกระพริบ
    }

    item.innerHTML = `
     <div class="item-header">
        <span class="item-name"><span class="item-icon">🤝</span> ${name}</span>
        <div class="item-actions">
            <button class="btn-icon" data-action="group:edit" title="Edit Group">
                <span class="material-symbols-outlined">edit</span>
            </button>
            <button class="btn-icon danger" data-action="group:delete" title="Delete Group">
                <span class="material-symbols-outlined">delete</span>
            </button>
        </div>
    </div>`;
    
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

    // [FIX] กลับมาใช้ Template Literal ที่อ่านง่ายและดีกว่า
    const groupSectionHTML = `
        <details class="collapsible-section" open>
            <summary class="section-header">
                <h3>🤝 Agent Groups</h3>
                <button class="btn-icon" data-action="group:create" title="Create New Group">+</button>
            </summary>
            <div class="section-box">
                <div id="agentGroupList" class="item-list"></div>
            </div>
        </details>
    `;
    assetsContainer.insertAdjacentHTML('beforeend', groupSectionHTML);

    // ค้นหา list container ที่เพิ่งสร้างขึ้น
    const listContainer = assetsContainer.querySelector('#agentGroupList:last-of-type');
    if (!listContainer) return;

    // วาด item แต่ละอันลงไป
    const groups = project.agentGroups;
    for (const name in groups) {
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

// แก้ไขในไฟล์: src/js/modules/group/group.ui.js

// export function showAgentGroupEditor(isEditing = false, groupName = null) {
//     stateManager.setState('editingGroupName', isEditing ? groupName : null);
//     const project = stateManager.getProject();
//     const group = isEditing ? project.agentGroups[groupName] : null;

//     document.getElementById('agent-group-modal-title').textContent = isEditing ? `Edit Group: ${groupName}` : "Create New Agent Group";
//     document.getElementById('group-name-input').value = isEditing ? groupName : "";
    
//     const memberList = document.getElementById('group-member-list');
//     memberList.innerHTML = '';

//     // ===== [THE FIX] START: แก้ไข Logic การดึงและเรียงรายชื่อ Agent =====

//     // 1. ดึงรายชื่อ Agent ทั้งหมดที่มีอยู่จริงในโปรเจกต์เป็น "Source of Truth"
//     const allExistingAgents = Object.keys(project.agentPresets);

//     // 2. ดึงรายชื่อสมาชิกที่บันทึกไว้ใน Group (อาจมีชื่อเก่าหรือชื่อที่ถูกลบไปแล้ว)
//     const savedMembers = group ? (group.agents || []) : [];

//     // 3. กรองสมาชิกที่บันทึกไว้ ให้เหลือเฉพาะ Agent ที่ยังมีตัวตนอยู่จริง
//     const validSavedMembers = savedMembers.filter(name => allExistingAgents.includes(name));

//     // 4. หา Agent ที่ยังไม่ได้เป็นสมาชิกของกลุ่มนี้
//     const unselectedAgents = allExistingAgents.filter(name => !validSavedMembers.includes(name));

//     // 5. สร้างรายการสุดท้ายที่จะนำไปแสดงผล โดยเรียงจาก สมาชิกเก่า -> สมาชิกใหม่ (ตามลำดับตัวอักษร)
//     const finalAgentList = [
//         ...validSavedMembers,
//         ...unselectedAgents.sort((a, b) => a.localeCompare(b))
//     ];

//     // ===== [THE FIX] END =====

//     finalAgentList.forEach(agentName => {
//         // ใช้ validSavedMembers ในการเช็คสถานะ checked เพื่อความถูกต้อง
//         const isChecked = validSavedMembers.includes(agentName);
//         const item = document.createElement('div');
//         item.className = 'agent-sortable-item';
//         item.dataset.agentName = agentName;
//         item.dataset.id = agentName;
//         const checkboxId = `agent-cb-${agentName.replace(/\s+/g, '-')}`;
//         item.innerHTML = `
//             <input type="checkbox" id="${checkboxId}" ${isChecked ? 'checked' : ''}>
//             <label for="${checkboxId}">${agentName}</label>
//             <span class="drag-handle">&#x2630;</span>
//         `;
//         item.querySelector('input[type="checkbox"]').addEventListener('change', () => updateModeratorDropdown(null));
//         memberList.appendChild(item);
//     });

//     if (window.groupSortable) window.groupSortable.destroy();
//     window.groupSortable = new Sortable(memberList, { 
//         animation: 150, 
//         handle: '.drag-handle',
//         // เมื่อมีการลากสลับตำแหน่ง ให้ update moderator dropdown ใหม่
//         onEnd: () => updateModeratorDropdown(null)
//     });
    
//     const flowSelect = document.getElementById('group-flow-select');
//     if (flowSelect) {
//         flowSelect.innerHTML = `
//             <option value="auto-moderator">Automated Moderator</option>
//             <option value="round-robin">Round Robin</option>
//             <option value="manual">Manual Selection</option> 
//         `;
//         flowSelect.value = group?.flowType || 'auto-moderator';
//     }
    
//     updateModeratorDropdown(group?.moderatorAgent);
//     document.getElementById('group-max-turns-input').value = group?.maxTurns || 1;
//     document.getElementById('group-timer-input').value = group?.timerInSeconds || 0;
//     // document.getElementById('group-summarization-threshold-input').value = group?.summarizationTokenThreshold ?? 3000;
    
//     updateGroupFlowControls(); 
    
//     document.getElementById('agent-group-editor-modal').style.display = 'flex';
// }


export function showAgentGroupEditor(isEditing = false, groupName = null) {
    const project = stateManager.getProject();
    
    const groupData = isEditing ? { name: groupName, ...project.agentGroups[groupName] } : null;
    const allAgents = project.agentPresets || {};
    const targetElement = document.getElementById('react-modal-root');
    
    // สร้างฟังก์ชัน onSave ที่จะถูกส่งเข้าไปใน React
    const onSave = (newData) => {
        // เรียกใช้ handler ที่เรา import เข้ามา
        GroupHandlers.saveGroupFromReact(newData, groupName);
        // เมื่อบันทึกเสร็จ ให้ปิด Modal
        hideAgentGroupEditor();
    };

    if (targetElement) {
        // ส่งฟังก์ชัน onSave เข้าไปเป็น prop
        mountReactComponent(GroupEditorModal, { groupData, allAgents, onSave }, targetElement);
    }
}


export function hideAgentGroupEditor() {
    const targetElement = document.getElementById('react-modal-root');
    if (targetElement) {
        targetElement.innerHTML = '';
    }
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

export function initGroupUI() {
    stateManager.bus.subscribe('group:editorShouldClose', hideAgentGroupEditor);

    const groupEditorModal = document.getElementById('agent-group-editor-modal');
    if (groupEditorModal) {
        // Listener for Save/Cancel buttons
        groupEditorModal.addEventListener('click', (e) => {
            if (e.target.matches('.modal-actions .btn:not(.btn-secondary)')) {
                stateManager.bus.publish('group:save');
            } else if (e.target.matches('.btn-secondary') || e.target.closest('.modal-close-btn')) {
                hideAgentGroupEditor();
            }
        });

        // Listener for stepper buttons (+/-)
        groupEditorModal.addEventListener('click', (e) => {
            if (e.target.matches('.stepper-btn')) {
                const input = e.target.parentElement.querySelector('input[type="number"]');
                if (!input) return;
                let newValue = parseInt(input.value, 10) + parseInt(e.target.dataset.step, 10);
                newValue = Math.max(input.min, Math.min(input.max, newValue));
                input.value = newValue;
            }
        });
    }

    document.getElementById('group-flow-select')?.addEventListener('change', updateGroupFlowControls);
    console.log("✅ Group UI Initialized (Studio listener removed).");
}