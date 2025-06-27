// ===============================================
// FILE: src/js/modules/memory/memory.handlers.js (Refactored)
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';

export function toggleMemory(name, event) {
    if (event) event.stopPropagation();
    const project = stateManager.getProject();
    if (project.activeEntity.type !== 'agent') return;
    
    const agent = project.agentPresets[project.activeEntity.name];
    if (!agent) return;
    
    agent.activeMemories = agent.activeMemories || [];
    const index = agent.activeMemories.indexOf(name);
    if (index > -1) {
        agent.activeMemories.splice(index, 1);
    } else {
        agent.activeMemories.push(name);
    }
    
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('memory:listChanged');
}

export function saveMemory() {
    const name = document.getElementById('memory-name-input').value.trim();
    const content = document.getElementById('memory-content-input').value.trim();
    const indexStr = document.getElementById('memory-edit-index').value;

    if(!name || !content){
        showCustomAlert('Please fill in all fields.');
        return;
    }
    
    const project = stateManager.getProject();
    const index = indexStr !== '' ? parseInt(indexStr, 10) : -1;

    // Check for duplicate names
    const isDuplicate = project.memories.some((m, i) => m.name === name && i !== index);
    if (isDuplicate) {
        showCustomAlert('A memory with this name already exists.');
        return;
    }

    if(index !== -1){ // Editing existing memory
        project.memories[index] = {...project.memories[index], name: name, content: content};
    } else { // Creating new memory
        project.memories.push({name: name, content: content});
    }
    
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('memory:listChanged');
    stateManager.bus.publish('memory:editorShouldClose');
}

export function deleteMemory(index, e) {
    if (e) e.stopPropagation();
    const project = stateManager.getProject();
    if (!project.memories[index]) return;

    if(confirm(`Are you sure you want to delete the memory '${project.memories[index].name}'?`)){
        const nameToDelete = project.memories[index].name;
        project.memories.splice(index, 1);
        
        // Remove this memory from any agent that was using it
        Object.values(project.agentPresets).forEach(agent => {
            if (agent.activeMemories) {
                const memIndex = agent.activeMemories.indexOf(nameToDelete);
                if (memIndex > -1) agent.activeMemories.splice(memIndex, 1);
            }
        });
        
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        stateManager.bus.publish('memory:listChanged');
    }
}

export function saveMemoryPackage() {
    try {
        const project = stateManager.getProject();
        // Package only memories and agent presets, not the whole project
        const packageData = { 
            memories: project.memories, 
            agentPresets: project.agentPresets 
        };
        const dataStr = JSON.stringify(packageData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `promptprim_agent_package_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) { 
        showCustomAlert('Error saving agent package.');
        console.error(e); 
    }
}

export function loadMemoryPackage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && Array.isArray(data.memories) && typeof data.agentPresets === 'object') {
                const project = stateManager.getProject();
                
                // Merge memories, avoiding duplicates by name
                const existingMemoryNames = new Set(project.memories.map(m => m.name));
                const newMemories = data.memories.filter(newMem => !existingMemoryNames.has(newMem.name));
                project.memories.push(...newMemories);

                // Merge agent presets, overwriting existing ones with the same name
                Object.assign(project.agentPresets, data.agentPresets);
                
                stateManager.setProject(project);
                stateManager.updateAndPersistState();
                
                stateManager.bus.publish('memory:listChanged');
                stateManager.bus.publish('agent:listChanged');
                
                showCustomAlert('Agent package loaded successfully!');
            } else { 
                throw new Error('Invalid JSON format for agent package.'); 
            }
        } catch (error) { 
            showCustomAlert(`Error loading agent package: ${error.message}`); 
            console.error(error);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Clear the input so the same file can be loaded again
}

export function handleSummarizationPresetChange() {
    const selector = document.getElementById('system-utility-summary-preset-select');
    const selectedName = selector.value;
    
    if (selectedName === 'custom') {
        return;
    }

    const project = stateManager.getProject();
    const presets = project.globalSettings.summarizationPromptPresets;
    if (presets && presets[selectedName]) {
        const presetContent = presets[selectedName];
        document.getElementById('system-utility-summary-prompt').value = presetContent;
        // Announce change to save settings
        stateManager.bus.publish('settings:systemAgentChanged');
    }
}

export function handleSaveSummarizationPreset() {
    const currentText = document.getElementById('system-utility-summary-prompt').value.trim();
    if (!currentText) {
        showCustomAlert('Prompt template cannot be empty.', 'Error');
        return;
    }

    const newName = prompt('Enter a name for this new preset:', '');
    if (!newName || !newName.trim()) {
        return;
    }

    const project = stateManager.getProject();
    const trimmedName = newName.trim();
    if (project.globalSettings.summarizationPromptPresets[trimmedName]) {
        if (!confirm(`A preset named '${trimmedName}' already exists. Do you want to overwrite it?`)) {
            return;
        }
    }

    project.globalSettings.summarizationPromptPresets[trimmedName] = currentText;
    stateManager.setProject(project);
    stateManager.updateAndPersistState().then(() => {
        stateManager.bus.publish('ui:renderSummarizationSelector');
        document.getElementById('system-utility-summary-preset-select').value = trimmedName;
        showCustomAlert(`Preset '${trimmedName}' saved successfully!`, 'Success');
    });
}
