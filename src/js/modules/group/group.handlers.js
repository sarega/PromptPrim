// ===============================================
// FILE: src/js/modules/group/group.handlers.js (New & Complete)
// DESCRIPTION: Implements the logic for creating, saving, and deleting agent groups.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';

/**
 * Saves the agent group based on the data entered in the editor modal.
 * This function reads all inputs, validates them, and updates the project state.
 */
// ในไฟล์ /src/js/modules/group/group.handlers.js

export function saveAgentGroup() {
    const project = stateManager.getProject();
    const editingGroupName = stateManager.getState().editingGroupName;
    const newName = document.getElementById('group-name-input').value.trim();

    if (!newName) {
        showCustomAlert("Group name cannot be empty.", "Error");
        return;
    }
    if (newName !== editingGroupName && project.agentGroups[newName]) {
        showCustomAlert(`A group named "${newName}" already exists.`, "Error");
        return;
    }

    // [FIX] เพิ่มการตรวจสอบ Moderator
    const moderatorAgent = document.getElementById('group-moderator-select').value;
    if (!moderatorAgent) {
        showCustomAlert("Please select a Moderator for the group.", "Error");
        return;
    }

    const allSortedAgentNames = window.groupSortable ? window.groupSortable.toArray() : [];
    const memberItems = document.querySelectorAll('#group-member-list .agent-sortable-item');
    const selectedAgentNames = Array.from(memberItems)
        .filter(item => item.querySelector('input[type="checkbox"]').checked)
        .map(item => item.dataset.agentName);

    const finalAgentList = allSortedAgentNames.filter(name => selectedAgentNames.includes(name));

    if (finalAgentList.length === 0) {
        showCustomAlert("A group must have at least one member.", "Error");
        return;
    }

    const groupData = {
        agents: finalAgentList,
        moderatorAgent: moderatorAgent, // <-- ใช้ค่าที่ตรวจสอบแล้ว
        flowType: document.getElementById('group-flow-select').value,
        maxTurns: parseInt(document.getElementById('group-max-turns-input').value, 10),
        timerInSeconds: parseInt(document.getElementById('group-timer-input').value, 10),
        summarizationTokenThreshold: parseInt(document.getElementById('group-summarization-threshold-input').value, 10)
    };

    if (editingGroupName && editingGroupName !== newName) {
        delete project.agentGroups[editingGroupName];
        project.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'group' && session.linkedEntity.name === editingGroupName) {
                session.linkedEntity.name = newName;
            }
        });
    }

    project.agentGroups[newName] = groupData;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('group:editorShouldClose');
    showCustomAlert(`Group "${newName}" saved successfully.`, "Success");
    stateManager.bus.publish('studio:contentShouldRender');
}

/**
 * Deletes an agent group from the project.
 * @param {object} payload - The event payload.
 * @param {string} payload.groupName - The name of the group to delete.
 */
export function deleteAgentGroup({ groupName }) {
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This cannot be undone.`)) return;

    const project = stateManager.getProject();
    delete project.agentGroups[groupName];
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('group:listChanged');
    showCustomAlert(`Group "${groupName}" has been deleted.`, "Success");
}

