// ===============================================
// FILE: src/js/modules/memory/memory.handlers.js (Refactored)
// ===============================================

import { stateManager, defaultSummarizationPresets } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';

export function toggleMemory({ name }) {
    const project = stateManager.getProject();
    const agent = project.agentPresets[project.activeEntity.name];
    if (!agent) return;

    const currentActiveMemories = agent.activeMemories || [];
    const isActive = currentActiveMemories.includes(name);

    if (isActive) {
        agent.activeMemories = currentActiveMemories.filter(memName => memName !== name);
    } else {
        agent.activeMemories = [...currentActiveMemories, name];
    }
    
    stateManager.setProject(project); // <-- แจ้ง State ว่ามีการเปลี่ยนแปลง
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
            const memoryIndex = agent.activeMemories.indexOf(originalName);
            if (memoryIndex > -1) agent.activeMemories[memoryIndex] = name;
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
            const memIndex = agent.activeMemories.indexOf(nameToDelete);
            if (memIndex > -1) agent.activeMemories.splice(memIndex, 1);
        }
    });
    
    stateManager.setProject(project);
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
        // ถ้าผู้ใช้เลือก "Custom" ไม่ต้องทำอะไร ปล่อยให้ textarea เป็นค่าที่แก้ไขอยู่
        return;
    }

    const project = stateManager.getProject();
    // รวม preset จากโรงงานและของผู้ใช้เข้าด้วยกัน
    const presets = { ...defaultSummarizationPresets, ...project.globalSettings.summarizationPromptPresets };
    
    if (presets[selectedName]) {
        // เมื่อเลือก preset, ให้เปลี่ยนเนื้อหาใน textarea
        document.getElementById('system-utility-summary-prompt').value = presets[selectedName];
        
        // [FIX] เปลี่ยนจากการเรียก UI โดยตรง มาเป็นการส่งสัญญาณแทน
        // สั่งให้ UI วาด dropdown ใหม่ (เพื่อลบสถานะ "Custom")
        stateManager.bus.publish('ui:renderSummarizationSelector');
        // และสั่งให้ UI อัปเดตเมนู Actions ไปพร้อมกัน
        stateManager.bus.publish('ui:updateSummaryActionButtons');
    }
}
export async function handleSaveSummarizationPreset({ saveAs }) {
    const selector = document.getElementById('system-utility-summary-preset-select');
    const currentText = document.getElementById('system-utility-summary-prompt').value.trim();
    if (!currentText) return;

    let presetName = selector.value;
    // [FIX] ประกาศ isFactory ที่นี่เพื่อให้ใช้งานได้ถูกต้อง
    const isFactory = defaultSummarizationPresets.hasOwnProperty(presetName);

    if (saveAs || isFactory || presetName === 'custom') {
        presetName = prompt('Enter a name for this preset:', isFactory ? `${presetName} (Copy)` : 'My Custom Prompt');
        if (!presetName || !presetName.trim()) return;
    }

    const project = stateManager.getProject();
    const trimmedName = presetName.trim();

    if (project.globalSettings.summarizationPromptPresets[trimmedName] && trimmedName !== selector.value) {
        if (!confirm(`A preset named '${trimmedName}' already exists. Overwrite?`)) return;
    }

    project.globalSettings.summarizationPromptPresets[trimmedName] = currentText;
    stateManager.setProject(project);

    await stateManager.updateAndPersistState(); // [FIX] ใช้ await แทน .then()
    
    stateManager.bus.publish('ui:renderSummarizationSelector');
    setTimeout(() => {
        const newSelector = document.getElementById('system-utility-summary-preset-select');
        if (newSelector) newSelector.value = trimmedName;
        stateManager.bus.publish('ui:updateSummaryActionButtons');
    }, 50);
    showCustomAlert(`Preset '${trimmedName}' saved!`, 'Success');
}

// [REWRITTEN] ฟังก์ชัน Delete ที่สมบูรณ์
export async function deleteSummarizationPreset() {
    const selector = document.getElementById('system-utility-summary-preset-select');
    const presetNameToDelete = selector.value;
    
    if (defaultSummarizationPresets.hasOwnProperty(presetNameToDelete)) return;

    if (confirm(`Delete user preset "${presetNameToDelete}"?`)) {
        const project = stateManager.getProject();
        delete project.globalSettings.summarizationPromptPresets[presetNameToDelete];
        
        document.getElementById('system-utility-summary-prompt').value = defaultSummarizationPresets['Standard'];
        stateManager.setProject(project);
        await stateManager.updateAndPersistState();
        
        stateManager.bus.publish('ui:renderSummarizationSelector');
        showCustomAlert(`Preset '${presetNameToDelete}' deleted.`, 'Success');
    }
}

// [REWRITTEN] ฟังก์ชัน Rename ที่สมบูรณ์
export async function renameSummarizationPreset() {
    const selector = document.getElementById('system-utility-summary-preset-select');
    const oldName = selector.value;
    if (defaultSummarizationPresets.hasOwnProperty(oldName) || oldName === 'custom') return;

    const newName = prompt(`Enter new name for "${oldName}":`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    const project = stateManager.getProject();
    const trimmedNewName = newName.trim();
    if (project.globalSettings.summarizationPromptPresets[trimmedNewName]) {
        showCustomAlert(`A preset named '${trimmedNewName}' already exists.`, "Error");
        return;
    }
    
    project.globalSettings.summarizationPromptPresets[trimmedNewName] = project.globalSettings.summarizationPromptPresets[oldName];
    delete project.globalSettings.summarizationPromptPresets[oldName];
    
    stateManager.setProject(project);
    await stateManager.updateAndPersistState();
    
    stateManager.bus.publish('ui:renderSummarizationSelector');
    setTimeout(() => {
        document.getElementById('system-utility-summary-preset-select').value = trimmedNewName;
        stateManager.bus.publish('ui:updateSummaryActionButtons');
    }, 50);
    showCustomAlert(`Preset renamed to '${trimmedNewName}'!`, 'Success');
}