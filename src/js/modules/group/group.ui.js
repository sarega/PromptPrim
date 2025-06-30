// ===============================================
// FILE: src/js/modules/group/group.ui.js (แก้ไขแล้ว)
// DESCRIPTION: เพิ่ม class 'group-item' เพื่อการแยกสไตล์
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';

// --- Private Helper Functions ---
function createGroupElement(name) {
    const project = stateManager.getProject();
    const activeEntity = project.activeEntity;
    const item = document.createElement('div');
    item.className = 'item group-item'; // [FIX] Add specific class for styling
    item.dataset.groupName = name;

    if (activeEntity && activeEntity.type === 'group' && activeEntity.name === name) {
        item.classList.add('active');
    }

    item.innerHTML = `
    <div class="item-header">
        <span class="item-name"><span class="item-icon">🤝</span> ${name}</span>
        <div class="item-actions">
             <button class="btn-icon" data-action="edit" title="Edit Group">&#9998;</button>
             <button class="btn-icon danger" data-action="delete" title="Delete Group">&#128465;</button>
        </div>
    </div>`;
    
    item.addEventListener('click', (e) => {
        if (e.target.closest('.item-actions')) return;
        stateManager.bus.publish('entity:select', { type: 'group', name });
    });
    item.querySelector('[data-action="edit"]').addEventListener('click', () => stateManager.bus.publish('group:edit', { groupName: name }));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => stateManager.bus.publish('group:delete', { groupName: name }));
    
    return item;
}


// --- Exported UI Functions ---

export function renderAgentGroups() {
    const project = stateManager.getProject();
    if (!project || !project.agentGroups) return;
    const container = document.getElementById('agentGroupList');
    container.innerHTML = '';
    const groups = project.agentGroups;

    for (const name in groups) {
        container.appendChild(createGroupElement(name));
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
    const currentMembers = group ? group.members : [];
    const allAgents = Object.keys(project.agentPresets);
    
    const sortedAgents = group ? [...group.members] : [];
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
        item.dataset.id = agentName; // [FIX] Add data-id for Sortable.toArray()
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
    document.getElementById('group-max-turns-input').value = group?.maxTurns || 4;
    document.getElementById('group-summarization-threshold-input').value = group?.summarizationTokenThreshold ?? 3000;
    
    toggleMaxTurnsInput();
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

export function toggleMaxTurnsInput() {
    const flowSelect = document.getElementById('group-flow-select');
    const maxTurnsGroup = document.getElementById('max-turns-group');
    maxTurnsGroup.style.display = (flowSelect.value === 'auto-moderator') ? 'none' : 'block';
}

export function initGroupUI() {
    // --- Subscribe to Events ---
    stateManager.bus.subscribe('project:loaded', renderAgentGroups);
    stateManager.bus.subscribe('group:listChanged', renderAgentGroups);
    stateManager.bus.subscribe('agent:listChanged', renderAgentGroups);
    stateManager.bus.subscribe('entity:selected', renderAgentGroups);
    stateManager.bus.subscribe('group:editorShouldClose', hideAgentGroupEditor);

    // --- Setup Event Listeners ---
    const groupSection = document.querySelector('#agentGroupList')?.closest('details.collapsible-section');
    if (groupSection) {
        const dropdownToggleButton = groupSection.querySelector('.section-header .dropdown button');
        if (dropdownToggleButton) {
            dropdownToggleButton.addEventListener('click', toggleDropdown);
        }

        const createGroupButton = groupSection.querySelector('a[data-action="createGroup"]');
        if (createGroupButton) {
            createGroupButton.addEventListener('click', (e) => {
                e.preventDefault();
                stateManager.bus.publish('group:create');
            });
        }
    }
    document.querySelector('#agent-group-editor-modal .btn-secondary').addEventListener('click', hideAgentGroupEditor);
    document.querySelector('#agent-group-editor-modal .btn:not(.btn-secondary)').addEventListener('click', () => stateManager.bus.publish('group:save'));
    document.getElementById('group-flow-select').addEventListener('change', toggleMaxTurnsInput);

    console.log("Group UI Initialized.");
}
