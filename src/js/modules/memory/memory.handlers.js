// ===============================================
// FILE: src/js/modules/memory/memory.handlers.js (Definitive Final Version)
// ===============================================

import { stateManager } from '../../core/core.state.js';
// [CRITICAL FIX] Import 'showCustomAlert' เข้ามาใช้งาน
import { showCustomAlert } from '../../core/core.ui.js';

export function toggleMemory({ name }) {
    const project = stateManager.getProject();
    const agentName = project.activeEntity?.name;
    if (!agentName) return;
    
    const agent = project.agentPresets[agentName];
    if (!agent) return;

    if (!agent.activeMemories) {
        agent.activeMemories = [];
    }

    const isActive = agent.activeMemories.includes(name);

    if (isActive) {
        agent.activeMemories = agent.activeMemories.filter(memName => memName !== name);
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
        const originalName = project.memories[editingIndex].name;
        project.memories[editingIndex] = { name, content };
        
        Object.values(project.agentPresets).forEach(agent => {
            if (agent.activeMemories) {
                const memoryIndex = agent.activeMemories.indexOf(originalName);
                if (memoryIndex > -1) agent.activeMemories[memoryIndex] = name;
            }
        });
    } else {
        if (project.memories.some(mem => mem.name === name)) {
            showCustomAlert(`A memory named "${name}" already exists.`, 'Error');
            return;
        }
        project.memories.push({ name, content });
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('memory:editorShouldClose');
    stateManager.bus.publish('studio:contentShouldRender');
    showCustomAlert(`Memory "${name}" saved successfully.`, 'Success');
}

export function deleteMemory({ index }) {
    if (!confirm("Are you sure you want to permanently delete this memory? This cannot be undone.")) return;
    
    const project = stateManager.getProject();
    if (!project.memories[index]) return;

    const nameToDelete = project.memories[index].name;
    project.memories.splice(index, 1);
    
    Object.values(project.agentPresets).forEach(agent => {
        if (agent.activeMemories) {
            agent.activeMemories = agent.activeMemories.filter(memName => memName !== nameToDelete);
        }
    });
    
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
}

export function saveMemoryPackage() {
    // This function is for a different feature but is kept for completeness
    const project = stateManager.getProject();
    const packageData = { memories: project.memories };
    const dataStr = JSON.stringify(packageData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promptprim_memories_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function loadMemoryPackage(event) {
    // This function is for a different feature but is kept for completeness
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && Array.isArray(data.memories)) {
                const project = stateManager.getProject();
                const existingMemoryNames = new Set(project.memories.map(m => m.name));
                const newMemories = data.memories.filter(newMem => !existingMemoryNames.has(newMem.name));
                project.memories.push(...newMemories);
                
                stateManager.setProject(project);
                stateManager.updateAndPersistState();
                stateManager.bus.publish('studio:contentShouldRender');
                showCustomAlert('Memory package imported successfully!', 'Success');
            } else { throw new Error('Invalid memory package file.'); }
        } catch (error) { 
            showCustomAlert(`Error loading memory package: ${error.message}`, "Error"); 
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}