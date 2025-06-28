// ===============================================
// FILE: src/js/modules/memory/memory.ui.js (แก้ไขแล้ว)
// DESCRIPTION: เพิ่ม class 'inactive' สำหรับ memory ที่ไม่ได้ใช้งาน
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';

let memorySortable = null;

// --- Private Helper Functions ---

function createMemoryElement(memory, isActive) {
    const project = stateManager.getProject();
    const itemDiv = document.createElement('div');
    itemDiv.className = `item memory-item`;
    if (!isActive) {
        itemDiv.classList.add('inactive'); // [FIX] Add class for inactive memories
    }
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

    itemDiv.querySelector('.memory-toggle').addEventListener('click', (e) => stateManager.bus.publish('memory:toggle', { name: memory.name, event: e }));
    itemDiv.querySelector('[data-action="toggle-menu"]').addEventListener('click', toggleDropdown);
    itemDiv.querySelector('[data-action="edit"]').addEventListener('click', (e) => stateManager.bus.publish('memory:edit', { index: memoryIndex, event: e }));
    itemDiv.querySelector('[data-action="delete"]').addEventListener('click', (e) => stateManager.bus.publish('memory:delete', { index: memoryIndex, event: e }));

    return itemDiv;
}

// --- Exported UI Functions ---

export function loadAndRenderMemories() {
    const project = stateManager.getProject();
    if (!project) return;
    const container = document.getElementById('memories-container');
    const activeList = document.getElementById('activeMemoriesList');
    const inactiveList = document.getElementById('inactiveMemoriesList');
    const inactiveSection = document.getElementById('inactiveMemoriesSection');
    
    activeList.innerHTML = '';
    inactiveList.innerHTML = '';
    
    let activeAgentPreset = null;
    if(project.activeEntity?.type === 'agent' && project.agentPresets && project.agentPresets[project.activeEntity.name]) {
        container.style.display = 'block';
        activeAgentPreset = project.agentPresets[project.activeEntity.name];
    } else {
        container.style.display = 'none';
        return;
    }
    
    if (!activeAgentPreset || !project.memories) {
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

    inactiveSection.classList.toggle('hidden', inactiveMemories.length === 0);
    
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

export function showMemoryEditor(index = null, event) {
    if(event) event.stopPropagation();
    const project = stateManager.getProject();
    const modal = document.getElementById('memory-editor-modal');
    
    if(index !== null && project.memories[index]){
        const memory = project.memories[index];
        document.getElementById('memory-modal-title').textContent = 'Edit Memory';
        document.getElementById('memory-name-input').value = memory.name;
        document.getElementById('memory-content-input').value = memory.content;
        document.getElementById('memory-edit-index').value = index;
    } else {
        document.getElementById('memory-modal-title').textContent = 'Create New Memory';
        document.getElementById('memory-name-input').value = '';
        document.getElementById('memory-content-input').value = '';
        document.getElementById('memory-edit-index').value = '';
    }
    modal.style.display='flex';
}

export function hideMemoryEditor() {
    document.getElementById('memory-editor-modal').style.display = 'none';
}

export function initMemoryUI() {
    // --- Subscribe to Events ---
    stateManager.bus.subscribe('project:loaded', loadAndRenderMemories);
    stateManager.bus.subscribe('memory:listChanged', loadAndRenderMemories);
    stateManager.bus.subscribe('entity:selected', loadAndRenderMemories);
    stateManager.bus.subscribe('memory:editorShouldClose', hideMemoryEditor);

    // --- Setup Event Listeners ---
    const memorySection = document.querySelector('#memories-container')?.closest('details.collapsible-section');
    if (memorySection) {
        const dropdownToggleButton = memorySection.querySelector('.section-header .dropdown button');
        if (dropdownToggleButton) {
            dropdownToggleButton.addEventListener('click', toggleDropdown);
        }

        const dropdownContent = memorySection.querySelector('.dropdown-content');
        if (dropdownContent) {
            dropdownContent.querySelector('a[data-action="createMemory"]').addEventListener('click', (e) => {
                e.preventDefault();
                stateManager.bus.publish('memory:create');
            });
            
            dropdownContent.querySelector('a[data-action="exportMemories"]').addEventListener('click', (e) => {
                e.preventDefault();
                stateManager.bus.publish('memory:exportPackage');
            });

            dropdownContent.querySelector('a[data-action="importMemories"]').addEventListener('click', (e) => {
                e.preventDefault();
                stateManager.bus.publish('memory:importPackage');
            });
        }
    }
    
    document.getElementById('load-memory-package-input').addEventListener('change', (e) => {
        stateManager.bus.publish('memory:fileSelectedForImport', e)
    });

    document.querySelector('#memory-editor-modal .btn-secondary').addEventListener('click', hideMemoryEditor);
    document.querySelector('#memory-editor-modal .btn:not(.btn-secondary)').addEventListener('click', () => {
        stateManager.bus.publish('memory:save');
    });
    
    console.log("Memory UI Initialized.");
}
