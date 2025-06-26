// js/modules/memory/memory.ui.js

var memorySortable = null;

function loadAndRenderMemories() {
    const project = stateManager.getProject();
    const container = document.getElementById('memories-container');
    const activeList = document.getElementById('activeMemoriesList');
    const inactiveList = document.getElementById('inactiveMemoriesList');
    const inactiveSection = document.getElementById('inactiveMemoriesSection');
    
    activeList.innerHTML = '';
    inactiveList.innerHTML = '';
    
    let activeAgentPreset = null;
    if(project.activeEntity?.type === 'agent') {
        container.style.display = 'block';
        activeAgentPreset = project.agentPresets[project.activeEntity.name];
    } else {
        container.style.display = 'none';
        return;
    }
    
    if (!activeAgentPreset) {
        container.style.display = 'none';
        return;
    }

    const activeMemoryNames = activeAgentPreset.activeMemories || [];
    const allMemoryNames = project.memories.map(m => m.name);
    
    const validActiveMemories = activeMemoryNames.filter(name => allMemoryNames.includes(name));
    if(validActiveMemories.length !== activeMemoryNames.length) {
        activeAgentPreset.activeMemories = validActiveMemories;
    }

    const inactiveMemories = allMemoryNames.filter(name => !validActiveMemories.includes(name));

    validActiveMemories.forEach(name => {
        const memory = project.memories.find(m => m.name === name);
        if (memory) activeList.appendChild(createMemoryElement(memory, true));
    });
    inactiveMemories.forEach(name => {
        const memory = project.memories.find(m => m.name === name);
        if(memory) inactiveList.appendChild(createMemoryElement(memory, false));
    });

    inactiveSection.style.display = inactiveMemories.length > 0 ? 'block' : 'none';
    
    if (memorySortable) memorySortable.destroy();
    memorySortable = new Sortable(activeList, {
        animation: 150,
        onEnd: (evt) => {
            const agent = stateManager.getProject().agentPresets[stateManager.getProject().activeEntity.name];
            if (!agent) return;
            const movedMemoryName = evt.item.dataset.name;
            agent.activeMemories.splice(evt.oldDraggableIndex, 1);
            agent.activeMemories.splice(evt.newDraggableIndex, 0, movedMemoryName);
            stateManager.updateAndPersistState();
            loadAndRenderMemories();
        }
    });
}

function createMemoryElement(memory, isActive) {
    const project = stateManager.getProject();
    const itemDiv = document.createElement('div');
    itemDiv.className = `item memory-item`;
    itemDiv.dataset.name = memory.name;
    const memoryIndex = project.memories.findIndex(m => m.name === memory.name);

    itemDiv.innerHTML = `
        <div class="item-header">
            <div class="memory-toggle ${isActive ? 'active' : ''}"></div>
            <span class="item-name">${memory.name}</span>
            <div class="item-actions">
                <div class="dropdown align-right">
                    <button class="btn-icon" data-action="toggle-menu">&#8942;</button>
                    <div class="dropdown-content">
                        <a href="#" data-action="edit">&#9998; Edit</a>
                        <a href="#" data-action="delete">&#128465; Delete</a>
                    </div>
                </div>
            </div>
        </div>`;

    itemDiv.querySelector('.memory-toggle').addEventListener('click', (e) => toggleMemory(memory.name, e));
    itemDiv.querySelector('[data-action="toggle-menu"]').addEventListener('click', toggleDropdown);
    itemDiv.querySelector('[data-action="edit"]').addEventListener('click', (e) => showMemoryEditor(memoryIndex, e));
    itemDiv.querySelector('[data-action="delete"]').addEventListener('click', (e) => deleteMemory(memoryIndex, e));

    return itemDiv;
}

function showMemoryEditor(index = null, event) {
    if(event) event.stopPropagation();
    const project = stateManager.getProject();
    const modal = document.getElementById('memory-editor-modal');
    
    if(index !== null){
        const memory = project.memories[index];
        document.getElementById('memory-modal-title').textContent = 'แก้ไข Memory';
        document.getElementById('memory-name-input').value = memory.name;
        document.getElementById('memory-content-input').value = memory.content;
        document.getElementById('memory-edit-index').value = index;
    } else {
        document.getElementById('memory-modal-title').textContent = 'เพิ่ม Memory ใหม่';
        document.getElementById('memory-name-input').value = '';
        document.getElementById('memory-content-input').value = '';
        document.getElementById('memory-edit-index').value = '';
    }
    modal.style.display='flex';
}

function hideMemoryEditor() {
    document.getElementById('memory-editor-modal').style.display = 'none';
}

// [FIXED] อัปเดตทั้งฟังก์ชันนี้ในไฟล์ js/modules/memory/memory.ui.js
function initMemoryUI() {
    // --- Subscribe to Events ---
    stateManager.bus.subscribe('project:loaded', loadAndRenderMemories);
    stateManager.bus.subscribe('memory:listChanged', loadAndRenderMemories);
    stateManager.bus.subscribe('entity:selected', loadAndRenderMemories);

    // --- Setup Event Listeners ---
    const dropdown = document.querySelector('#memories-container').closest('details').querySelector('.dropdown-content');

    // Listener for 'Create New Memory'
    dropdown.querySelector('a[data-action="createMemory"]').addEventListener('click', (e) => {
        e.preventDefault();
        showMemoryEditor(null);
    });
    
    // Listener for 'Export Package'
    dropdown.querySelector('a[data-action="exportMemories"]').addEventListener('click', (e) => {
        e.preventDefault();
        // ฟังก์ชัน saveMemoryPackage() อยู่ใน memory.handlers.js และควรจะทำงานได้
        saveMemoryPackage(); 
    });

    // Listener for 'Import Package'
    dropdown.querySelector('a[data-action="importMemories"]').addEventListener('click', (e) => {
        e.preventDefault();
        // สั่งให้ input ที่ซ่อนอยู่ทำงาน
        document.getElementById('load-memory-package-input').click();
    });
    
    // Listener for when a file is chosen for import
    document.getElementById('load-memory-package-input').addEventListener('change', loadMemoryPackage);

    // Modal Buttons Listeners
    document.querySelector('#memory-editor-modal .btn-secondary').addEventListener('click', hideMemoryEditor);
    document.querySelector('#memory-editor-modal .btn:not(.btn-secondary)').addEventListener('click', saveMemory);
    
    console.log("Memory UI Initialized.");
}