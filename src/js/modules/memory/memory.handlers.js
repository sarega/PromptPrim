// ===============================================
// FILE: src/js/modules/memory/memory.handlers.js (Refactored)
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';

export function toggleMemory({ name }) {
    const project = stateManager.getProject();
    if (project.activeEntity?.type !== 'agent') return;
    const agent = project.agentPresets[project.activeEntity.name];
    if (!agent) return;
    
    agent.activeMemories = agent.activeMemories || [];
    const index = agent.activeMemories.indexOf(name);
    if (index > -1) {
        agent.activeMemories.splice(index, 1);
    } else {
        agent.activeMemories.push(name);
    }
    
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
}

export function saveMemory() {
    const project = stateManager.getProject();
    const name = document.getElementById('memory-name-input').value.trim();
    const content = document.getElementById('memory-content-input').value;
    const editingIndex = document.getElementById('memory-edit-index').value;

    if (!name) {
        showCustomAlert('Memory name cannot be empty.', 'Error');
        return;
    }

    if (editingIndex !== '') {
        // Editing existing memory
        const originalName = project.memories[editingIndex].name;
        project.memories[editingIndex] = { name, content };
        // Update any agent that was using the old name
        Object.values(project.agentPresets).forEach(agent => {
            const memoryIndex = agent.activeMemories.indexOf(originalName);
            if (memoryIndex > -1) {
                agent.activeMemories[memoryIndex] = name;
            }
        });
    } else {
        // Creating new memory
        if (project.memories.some(mem => mem.name === name)) {
            showCustomAlert(`A memory named "${name}" already exists.`, 'Error');
            return;
        }
        project.memories.push({ name, content });
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();

    // [FIX] สั่งให้ Modal ปิด และสั่งให้วาดหน้าจอใหม่แค่ครั้งเดียว
    stateManager.bus.publish('memory:editorShouldClose');
    stateManager.bus.publish('studio:contentShouldRender');
    
    showCustomAlert(`Memory "${name}" saved successfully.`, 'Success');
}

export function deleteMemory({ index }) {
    const project = stateManager.getProject();
    if (!project.memories[index]) return;

    const nameToDelete = project.memories[index].name;
    project.memories.splice(index, 1);
    
    Object.values(project.agentPresets).forEach(agent => {
        if (agent.activeMemories) {
            const memIndex = agent.activeMemories.indexOf(nameToDelete);
            if (memIndex > -1) agent.activeMemories.splice(memIndex, 1);
        }
    });
    
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
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
