// ===============================================
// FILE: src/js/modules/group/group.ui.js (ฉบับแก้ไขสมบูรณ์)
// DESCRIPTION: แก้ไขการจัดการ Event Listener และ Bug ที่เกี่ยวข้องกับรายชื่อสมาชิก
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';

// --- Private Helper Functions ---
function createGroupElement(name) {
    const project = stateManager.getProject();
    const activeEntity = project.activeEntity;
    const item = document.createElement('div');
    item.className = 'item group-item'; // Add specific class for styling
    item.dataset.groupName = name;

    if (activeEntity && activeEntity.type === 'group' && activeEntity.name === name) {
        item.classList.add('active');
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
    
    // All event listeners are now handled by delegation in initGroupUI for robustness.
    return item;
}

// --- Exported UI Functions ---

/**
 * [REFACTORED] Renders agent groups into a specific container element.
 * @param {HTMLElement} assetsContainer - The parent element to render into.
 */
export function renderAgentGroups(assetsContainer) {
    // Guard Clause: ตรวจสอบ container
    if (!assetsContainer || typeof assetsContainer.insertAdjacentHTML !== 'function') {
        console.error('Invalid container passed to renderAgentGroups:', assetsContainer);
        return;
    }
    
    const project = stateManager.getProject();
    if (!project || !project.agentGroups) return;
    
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


    const listContainer = assetsContainer.querySelector('#agentGroupList');
    if (!listContainer) return;

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

export function showAgentGroupEditor(isEditing = false, groupName = null) {
    stateManager.setState('editingGroupName', isEditing ? groupName : null);
    const project = stateManager.getProject();
    const group = isEditing ? project.agentGroups[groupName] : null;

    document.getElementById('agent-group-modal-title').textContent = isEditing ? `Edit Group: ${groupName}` : "Create New Agent Group";
    document.getElementById('group-name-input').value = isEditing ? groupName : "";
    
    const memberList = document.getElementById('group-member-list');
    memberList.innerHTML = '';
    const currentMembers = group ? (group.agents || []) : [];
    const allAgents = Object.keys(project.agentPresets);
    
    const sortedAgents = group ? [...currentMembers] : [];
    allAgents.forEach(agentName => {
        if (!sortedAgents.includes(agentName)) {
            sortedAgents.push(agentName);
        }
    });

    sortedAgents.forEach(agentName => {
        const isChecked = currentMembers.includes(agentName);
        const item = document.createElement('div');
        item.className = 'agent-sortable-item';
        item.dataset.agentName = agentName;
        item.dataset.id = agentName;
        const checkboxId = `agent-cb-${agentName.replace(/\s+/g, '-')}`;
        item.innerHTML = `
            <input type="checkbox" id="${checkboxId}" ${isChecked ? 'checked' : ''}>
            <label for="${checkboxId}">${agentName}</label>
            <span class="drag-handle">&#x2630;</span>
        `;
        item.querySelector('input[type="checkbox"]').addEventListener('change', () => updateModeratorDropdown(null));
        memberList.appendChild(item);
    });

    if (window.groupSortable) window.groupSortable.destroy();
    window.groupSortable = new Sortable(memberList, { 
        animation: 150, 
        handle: '.drag-handle',
    });

    updateModeratorDropdown(group?.moderatorAgent);
    document.getElementById('group-flow-select').value = group?.flowType || 'auto-moderator';
    document.getElementById('group-max-turns-input').value = group?.maxTurns || 1;
    document.getElementById('group-timer-input').value = group?.timerInSeconds || 0;
    document.getElementById('group-summarization-threshold-input').value = group?.summarizationTokenThreshold ?? 3000;
    
    // [FIX] เรียกใช้ฟังก์ชันใหม่ที่ถูกต้อง
    updateGroupFlowControls(); 
    
    document.getElementById('agent-group-editor-modal').style.display = 'flex';
}

export function hideAgentGroupEditor() {
    if (window.groupSortable) {
        window.groupSortable.destroy();
        window.groupSortable = null;
    }
    document.getElementById('agent-group-editor-modal').style.display = 'none';
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
        // Listener สำหรับปุ่ม Save/Cancel
        groupEditorModal.addEventListener('click', (e) => {
            if (e.target.matches('.modal-actions .btn:not(.btn-secondary)')) {
                stateManager.bus.publish('group:save');
            } else if (e.target.matches('.btn-secondary') || e.target.closest('.modal-close-btn')) {
                hideAgentGroupEditor();
            }
        });

        // Listener สำหรับปุ่ม +/-
        groupEditorModal.addEventListener('click', (e) => {
            if (e.target.matches('.stepper-btn')) {
                const input = e.target.parentElement.querySelector('input[type="number"]');
                if (!input) return;
                const step = parseInt(e.target.dataset.step, 10);
                const min = parseInt(input.min, 10);
                const max = parseInt(input.max, 10);
                let currentValue = parseInt(input.value, 10);
                let newValue = currentValue + step;
                if (newValue < min) newValue = min;
                if (newValue > max) newValue = max;
                input.value = newValue;
            }
        });
    }

    // [FIX] Listener สำหรับ Select Flow ให้เรียกใช้ฟังก์ชันที่ถูกต้อง
    document.getElementById('group-flow-select')?.addEventListener('change', updateGroupFlowControls);
}

