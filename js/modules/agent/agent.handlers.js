// js/modules/agent/agent.handlers.js

async function generateAgentProfile() {
    const enhancerPrompt = document.getElementById('enhancer-prompt-input').value.trim();
    if (!enhancerPrompt) {
        showCustomAlert('Please describe the agent you want to create.', 'Error');
        return;
    }

    stateManager.bus.publish('agent:enhancerStatus', { text: 'Generating profile...', color: 'var(--text-dark)' });

    const utilityAgent = stateManager.getProject().globalSettings.systemUtilityAgent;
    if (!utilityAgent || !utilityAgent.model) {
        stateManager.bus.publish('agent:enhancerStatus', { text: 'Error: System Utility Model not configured.', color: 'var(--error-color)' });
        return;
    }

    const metaPrompt = `You are an expert in designing LLM agent profiles... User's Request: "${enhancerPrompt}"`;

    try {
        const responseText = await callLLM(utilityAgent, [{ role: 'user', content: metaPrompt }]);
        const jsonMatch = responseText.match(/{.*}/s);
        if (!jsonMatch) throw new Error("LLM did not return a valid JSON object.");
        
        const parsedResponse = JSON.parse(jsonMatch[0]);
        stateManager.bus.publish('agent:profileGenerated', parsedResponse);
        stateManager.bus.publish('agent:enhancerStatus', { text: 'Profile generated successfully!', color: 'var(--success-color)' });

    } catch (error) {
        console.error("Agent Profile Generation Error:", error);
        stateManager.bus.publish('agent:enhancerStatus', { text: `Error: ${error.message}`, color: 'var(--error-color)' });
    } finally {
        setTimeout(() => stateManager.bus.publish('agent:enhancerStatus', { text: '' }), 5000);
    }
}

function saveAgentPreset() {
    const nameInput = document.getElementById('agent-name-input');
    const newName = nameInput.value.trim();
    if (!newName) {
        showCustomAlert("Please enter a name for the agent.", "Error"); return;
    }

    const project = stateManager.getProject();
    const oldName = stateManager.getState().editingAgentName;

    if (oldName !== newName && project.agentPresets[newName]) {
        showCustomAlert(`An agent named '${newName}' already exists.`, "Error"); return;
    }

    const newAgentSettings = {};
    Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
        const key = ALL_AGENT_SETTINGS_IDS[elId];
        if (key === 'name') return;
        const element = document.getElementById(elId);
        if (element) newAgentSettings[key] = (element.type === 'checkbox') ? element.checked : element.value;
    });
    if (!newAgentSettings.icon) newAgentSettings.icon = '🤖';

    if (oldName && oldName !== newName) {
        const agentData = project.agentPresets[oldName];
        delete project.agentPresets[oldName];
        project.agentPresets[newName] = { ...agentData, ...newAgentSettings };
        
        project.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === oldName) session.linkedEntity.name = newName;
        });
        Object.values(project.agentGroups).forEach(group => {
           const memberIndex = group.members.indexOf(oldName);
           if (memberIndex > -1) group.members[memberIndex] = newName;
           if(group.moderatorAgent === oldName) group.moderatorAgent = newName;
        });
        if (project.activeEntity.type === 'agent' && project.activeEntity.name === oldName) project.activeEntity.name = newName;

    } else if (oldName) {
        project.agentPresets[oldName] = { ...project.agentPresets[oldName], ...newAgentSettings };
    } else {
        newAgentSettings.activeMemories = [];
        project.agentPresets[newName] = newAgentSettings;
        project.activeEntity = { type: 'agent', name: newName };
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('agent:listChanged');
    stateManager.bus.publish('entity:selected', project.activeEntity);
    hideAgentEditor();
}

function deleteAgentPreset(agentNameToDelete) {
    const project = stateManager.getProject();
    if (!agentNameToDelete || Object.keys(project.agentPresets).length <= 1) {
        showCustomAlert("Cannot delete the last agent.", "Error"); return;
    }
    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ Agent '${agentNameToDelete}'?`)) {
        delete project.agentPresets[agentNameToDelete];
        
        Object.values(project.agentGroups).forEach(group => {
            group.members = group.members.filter(m => m !== agentNameToDelete);
            if (group.moderatorAgent === agentNameToDelete) group.moderatorAgent = group.members[0] || '';
        });
        project.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === agentNameToDelete) {
                 session.linkedEntity = {type: 'agent', name: Object.keys(project.agentPresets)[0]};
            }
        });
        
        if (project.activeEntity.type === 'agent' && project.activeEntity.name === agentNameToDelete) {
            project.activeEntity = { type: 'agent', name: Object.keys(project.agentPresets)[0] };
        }
        
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        stateManager.bus.publish('agent:listChanged');
        stateManager.bus.publish('entity:selected', project.activeEntity);
    }
}