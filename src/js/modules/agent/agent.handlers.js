// ===============================================
// FILE: src/js/modules/agent/agent.handlers.js (Refactored)
// ===============================================

import { stateManager, ALL_AGENT_SETTINGS_IDS } from '../../core/core.state.js';
import { callLLM } from '../../core/core.api.js';
import { showCustomAlert } from '../../core/core.ui.js';

export async function generateAgentProfile() {
    const enhancerPrompt = document.getElementById('enhancer-prompt-input').value.trim();
    if (!enhancerPrompt) {
        showCustomAlert('Please describe the agent you want to create.', 'Error');
        return;
    }

    // [DEBUG 2] ตรวจสอบว่า Handler ได้รับ Event และมี Prompt ถูกต้อง
    console.log("🧠 generateAgentProfile handler received event. Enhancer Prompt:", enhancerPrompt);

    stateManager.bus.publish('agent:enhancerStatus', { text: 'Generating profile...', color: 'var(--text-dark)' });

    const utilityAgent = stateManager.getProject().globalSettings.systemUtilityAgent;
    if (!utilityAgent || !utilityAgent.model) {
        stateManager.bus.publish('agent:enhancerStatus', { text: 'Error: System Utility Model not configured.', color: 'var(--error-color)' });
        return;
    }

    const metaPrompt = `You are an expert in designing LLM agent profiles. Based on the user's request, create a complete agent profile. Your response MUST be a single, valid JSON object with the following keys: "agent_name" (a creative and fitting name for the agent), "agent_icon" (a single, relevant emoji for the agent), "system_prompt" (string), "temperature" (number), "top_p" (number), "top_k" (number), "presence_penalty" (number), "frequency_penalty" (number). For the parameters, choose values that are optimal for the requested task (e.g., creative tasks need higher temperature). User's Request: "${enhancerPrompt}"`;

    try {
        const responseText = await callLLM(utilityAgent, [{ role: 'user', content: metaPrompt }]);
        
        // [DEBUG 3] ดูผลลัพธ์ดิบๆ ที่ได้จาก LLM
        console.log("🤖 Raw response from LLM:", responseText);

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

export function saveAgentPreset() {
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
        if (element) newAgentSettings[key] = (element.type === 'checkbox') ? element.checked : (element.type === 'number' ? parseFloat(element.value) : element.value);
    });
    if (!newAgentSettings.icon) newAgentSettings.icon = '🤖';

    if (oldName && oldName !== newName) {
        const agentData = project.agentPresets[oldName];
        delete project.agentPresets[oldName];
        project.agentPresets[newName] = { ...agentData, ...newAgentSettings };
        
        // Update references in sessions and groups
        project.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === oldName) session.linkedEntity.name = newName;
        });
        Object.values(project.agentGroups).forEach(group => {
           const memberIndex = group.agents.indexOf(oldName);
           if (memberIndex > -1) group.agents[memberIndex] = newName;
           if(group.moderatorAgent === oldName) group.moderatorAgent = newName;
        });
        if (project.activeEntity.type === 'agent' && project.activeEntity.name === oldName) project.activeEntity.name = newName;

    } else if (oldName) { // Editing existing agent without renaming
        project.agentPresets[oldName] = { ...project.agentPresets[oldName], ...newAgentSettings };
    } else { // Creating a new agent
        newAgentSettings.activeMemories = [];
        project.agentPresets[newName] = newAgentSettings;
        project.activeEntity = { type: 'agent', name: newName };
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState(); // Save to DB
    stateManager.bus.publish('studio:contentShouldRender');
    stateManager.bus.publish('agent:editorShouldClose');
    // stateManager.bus.publish('agent:listChanged'); // Re-render agent list
    // stateManager.bus.publish('entity:selected', project.activeEntity); // Update active entity UI
    // stateManager.bus.publish('agent:editorShouldClose'); // Announce that editor should be hidden
}

export function deleteAgentPreset(agentNameToDelete) {
    const project = stateManager.getProject();
    if (!agentNameToDelete || Object.keys(project.agentPresets).length <= 1) {
        showCustomAlert("Cannot delete the last agent.", "Error"); return;
    }
    if (confirm(`Are you sure you want to delete the agent '${agentNameToDelete}'? This action cannot be undone.`)) {
        delete project.agentPresets[agentNameToDelete];
        
        // Clean up references
        Object.values(project.agentGroups).forEach(group => {
            group.agents = group.agents.filter(m => m !== agentNameToDelete);
            if (group.moderatorAgent === agentNameToDelete) group.moderatorAgent = group.agents[0] || '';
        });
        project.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === agentNameToDelete) {
                 // Fallback to the first available agent
                 session.linkedEntity = {type: 'agent', name: Object.keys(project.agentPresets)[0]};
            }
        });
        
        // If the deleted agent was active, switch to another one
        if (project.activeEntity.type === 'agent' && project.activeEntity.name === agentNameToDelete) {
            project.activeEntity = { type: 'agent', name: Object.keys(project.agentPresets)[0] };
        }
        
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        stateManager.bus.publish('agent:listChanged');
        stateManager.bus.publish('entity:selected', project.activeEntity);
    }
}
