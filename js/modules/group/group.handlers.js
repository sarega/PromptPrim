// js/modules/group/group.handlers.js

function saveAgentGroup() {
    const newName = document.getElementById('group-name-input').value.trim();
    const oldName = stateManager.getState().editingGroupName;
    if (!newName) {
        showCustomAlert("Please enter a name for the group.", "Error"); return;
    }

    const project = stateManager.getProject();
    if (newName !== oldName && project.agentGroups[newName]) {
        showCustomAlert("A group with this name already exists.", "Error"); return;
    }

    const members = Array.from(document.querySelectorAll('#group-member-list .agent-sortable-item'))
        .filter(item => item.querySelector('input[type="checkbox"]').checked)
        .map(item => item.dataset.agentName);

    if (members.length === 0) {
        showCustomAlert("A group must have at least one member.", "Error"); return;
    }
    const moderatorAgent = document.getElementById('group-moderator-select').value;
    if (!moderatorAgent || !members.includes(moderatorAgent)) {
        showCustomAlert("Please select a valid moderator from the group members.", "Error"); return;
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
    
    hideAgentGroupEditor();
}

function deleteAgentGroup(groupName) {
     if (!groupName) return;
     if (confirm(`Are you sure you want to delete the group '${groupName}'?`)) {
         const project = stateManager.getProject();
         delete project.agentGroups[groupName];
         
         project.chatSessions.forEach(session => {
             if (session.linkedEntity?.type === 'group' && session.linkedEntity.name === groupName) {
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