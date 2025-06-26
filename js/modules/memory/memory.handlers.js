// js/modules/memory/memory.handlers.js

function toggleMemory(name, event) {
    event.stopPropagation();
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

function saveMemory() {
    const name = document.getElementById('memory-name-input').value.trim();
    const content = document.getElementById('memory-content-input').value.trim();
    const indexStr = document.getElementById('memory-edit-index').value;

    if(!name || !content){
        showCustomAlert('กรุณากรอกข้อมูลให้ครบ');
        return;
    }
    
    const project = stateManager.getProject();
    if(indexStr !== ''){
        const index = parseInt(indexStr, 10);
        // Prevent renaming to an existing memory name
        if (project.memories.some((m, i) => m.name === name && i !== index)) {
            showCustomAlert('A memory with this name already exists.');
            return;
        }
        project.memories[index] = {...project.memories[index], name: name, content: content};
    } else {
        if (project.memories.some(m => m.name === name)) {
            showCustomAlert('A memory with this name already exists.');
            return;
        }
        project.memories.push({name: name, content: content});
    }
    
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('memory:listChanged');
    hideMemoryEditor();
}

function deleteMemory(index, e) {
    e.stopPropagation();
    const project = stateManager.getProject();
    if(confirm(`ลบ '${project.memories[index].name}'?`)){
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
        stateManager.bus.publish('memory:listChanged');
    }
}


// [FIXED] เพิ่มฟังก์ชันที่ขาดหายไป
function saveMemoryPackage() {
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

// [FIXED] เพิ่มฟังก์ชันที่ขาดหายไป
function loadMemoryPackage(event) {
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