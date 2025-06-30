// ===============================================
// FILE: src/js/modules/group/group.handlers.js (Refactored)
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';

export function saveAgentGroup() {
    const newName = document.getElementById('group-name-input').value.trim();
    const oldName = stateManager.getState().editingGroupName;
    if (!newName) {
        showCustomAlert("Please enter a name for the group.", "Error");
        return;
    }

    const project = stateManager.getProject();
    if (newName !== oldName && project.agentGroups[newName]) {
        showCustomAlert("A group with this name already exists.", "Error");
        return;
    }

<<<<<<< HEAD
    // [FIX] Get the ordered list of members directly from the DOM.
    // This is more robust than relying on sortableInstance.toArray().
    const memberItems = document.querySelectorAll('#group-member-list .agent-sortable-item');
    const members = Array.from(memberItems)
        .filter(item => item.querySelector('input[type="checkbox"]').checked)
        .map(item => item.dataset.agentName);
=======
    // Use Sortable's 'toArray' method to get the correct order of members
    const sortableInstance = window.groupSortable;
    const memberOrder = sortableInstance ? sortableInstance.toArray() : [];
    
    const checkedMembers = new Set(
        Array.from(document.querySelectorAll('#group-member-list input[type="checkbox"]:checked'))
             .map(cb => cb.closest('.agent-sortable-item').dataset.agentName)
    );

    // Filter the sorted list to include only checked members, preserving order.
    const members = memberOrder.filter(name => checkedMembers.has(name));
>>>>>>> 4fbef696f193b5cd9d648bccfe58d07aeb977a2e

    if (members.length === 0) {
        showCustomAlert("A group must have at least one member.", "Error");
        return;
    }
    const moderatorAgent = document.getElementById('group-moderator-select').value;
    if (!moderatorAgent || !members.includes(moderatorAgent)) {
        showCustomAlert("Please select a valid moderator from the group members.", "Error");
        return;
    }

    const newGroupData = {
        members: members,
        moderatorAgent: moderatorAgent,
        flowType: document.getElementById('group-flow-select').value,
        maxTurns: parseInt(document.getElementById('group-max-turns-input').value, 10) || 4,
        summarizationTokenThreshold: parseInt(document.getElementById('group-summarization-threshold-input').value, 10) ?? 3000
    };

    if (oldName && oldName !== newName) {
        delete project.agentGroups[oldName];
        project.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'group' && session.linkedEntity.name === oldName) {
                session.linkedEntity.name = newName;
            }
        });
        if(project.activeEntity.type === 'group' && project.activeEntity.name === oldName) {
            project.activeEntity.name = newName;
        }
    }
    
    project.agentGroups[newName] = newGroupData;

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('group:listChanged');
    if (project.activeEntity.type === 'group') {
        stateManager.bus.publish('entity:selected', project.activeEntity);
    }
    
    // Announce that the editor should close
    stateManager.bus.publish('group:editorShouldClose');
}

export function deleteAgentGroup(groupName) {
     if (!groupName) return;
     if (confirm(`Are you sure you want to delete the group '${groupName}'?`)) {
         const project = stateManager.getProject();
         delete project.agentGroups[groupName];
         
         project.chatSessions.forEach(session => {
             if (session.linkedEntity?.type === 'group' && session.linkedEntity.name === groupName) {
                 // Fallback to the first available agent
                 session.linkedEntity = {type: 'agent', name: Object.keys(project.agentPresets)[0]};
             }
         });
         
         if (project.activeEntity.type === 'group' && project.activeEntity.name === groupName) {
             project.activeEntity = {type: 'agent', name: Object.keys(project.agentPresets)[0]};
         }
         
         stateManager.setProject(project);
         stateManager.updateAndPersistState();
         
         stateManager.bus.publish('group:listChanged');
         stateManager.bus.publish('entity:selected', project.activeEntity);
     }
}
