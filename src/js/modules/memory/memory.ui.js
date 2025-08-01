// ===============================================
// FILE: src/js/modules/memory/memory.ui.js (Definitive Final Version)
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { createDropdown } from '../../core/core.ui.js';

let memorySortable = null;

function createMemoryElement(memory, isActive, originalIndex) {
    const itemDiv = document.createElement('div');
    itemDiv.className = `item memory-item ${isActive ? '' : 'inactive'}`;
    itemDiv.dataset.name = memory.name;
    itemDiv.dataset.memoryIndex = originalIndex;

    const dropdownOptions = [
        { label: 'Edit...', action: 'memory:edit', data: { index: originalIndex } },
        { label: 'Delete', action: 'memory:delete', data: { index: originalIndex }, isDestructive: true }
    ];
    const itemDropdown = createDropdown(dropdownOptions);

    const toggle = document.createElement('div');
    toggle.className = `memory-toggle ${isActive ? 'active' : ''}`;
    toggle.title = `Click to ${isActive ? 'deactivate' : 'activate'}`;
    
    toggle.onclick = (e) => {
        e.stopPropagation();
        stateManager.bus.publish('memory:toggle', { name: memory.name });
    };

    const itemName = document.createElement('span');
    itemName.className = 'item-name';
    itemName.textContent = memory.name;
    
    const itemHeader = document.createElement('div');
    itemHeader.className = 'item-header';
    itemHeader.appendChild(toggle);
    itemHeader.appendChild(itemName);
    itemHeader.appendChild(itemDropdown);
    itemDiv.appendChild(itemHeader);
    return itemDiv;
}

export function loadAndRenderMemories(assetsContainer) {
    if (!assetsContainer) return;
    const project = stateManager.getProject();
    if (!project) return;
    
    const memorySection = document.createElement('details');
    memorySection.className = 'collapsible-section memory-section';
    memorySection.open = true;

    const summary = document.createElement('summary');
    summary.className = 'section-header';
    summary.innerHTML = '<h3>🧠 Command Memories</h3>';
    const dropdownOptions = [
        { label: 'New Memory...', action: 'memory:create' },
        { label: 'Export Package...', action: 'memory:exportPackage' },
        { label: 'Import Package...', action: 'memory:importPackage' },
    ];
    summary.appendChild(createDropdown(dropdownOptions));
    memorySection.appendChild(summary);
    
    const container = document.createElement('div');
    container.className = 'section-box';
    memorySection.appendChild(container);
    
    const activeAgentPreset = project.agentPresets?.[project.activeEntity?.name];
    if (!activeAgentPreset) {
        container.innerHTML = `<p class="no-items-message">Select an Agent to see memories.</p>`;
    } else {
        container.innerHTML = `
            <details id="active-memories-details" open><summary>Active Memories</summary><div id="activeMemoriesList" class="item-list"></div></details>
            <details id="inactiveMemoriesSection" open><summary>Inactive Memories</summary><div id="inactiveMemoriesList" class="item-list"></div></details>
        `;
        const activeList = container.querySelector('#activeMemoriesList');
        const inactiveList = container.querySelector('#inactiveMemoriesList');
        const activeMemoryNames = activeAgentPreset.activeMemories || [];
        const allMemories = project.memories || [];
        
        allMemories.forEach((memory, index) => {
            const isActive = activeMemoryNames.includes(memory.name);
            const listToUse = isActive ? activeList : inactiveList;
            listToUse.appendChild(createMemoryElement(memory, isActive, index));
        });

        if (memorySortable) memorySortable.destroy();
        memorySortable = new Sortable(activeList, {
            animation: 150,
            onEnd: (evt) => {
                const agent = stateManager.getProject().agentPresets[stateManager.getProject().activeEntity.name];
                if (!agent) return;
                const movedMemoryName = evt.item.dataset.name;
                agent.activeMemories.splice(evt.oldDraggableIndex, 1);
                agent.activeMemories.splice(evt.newDraggableIndex, 0, movedMemoryName);
                stateManager.bus.publish('studio:contentShouldRender');
            }
        });
    }
    
    assetsContainer.appendChild(memorySection);
}

// export function showMemoryEditor(index = null) {
//     const project = stateManager.getProject();
//     const modal = document.getElementById('memory-editor-modal');
//     if (!modal) return;
    
//     const memories = project.memories || [];
    
//     if(index !== null && memories[index]){
//         const memory = memories[index];
//         modal.querySelector('#memory-modal-title').textContent = 'Edit Memory';
//         modal.querySelector('#memory-name-input').value = memory.name;
//         modal.querySelector('#memory-content-input').value = memory.content;
//         modal.querySelector('#memory-edit-index').value = index;
//     } else {
//         modal.querySelector('#memory-modal-title').textContent = 'Create New Memory';
//         modal.querySelector('#memory-name-input').value = '';
//         modal.querySelector('#memory-content-input').value = '';
//         modal.querySelector('#memory-edit-index').value = '';
//     }
//     modal.style.display='flex';
// }

export function showMemoryEditor(index = null) {
    const project = stateManager.getProject();
    const modal = document.getElementById('memory-editor-modal');
    if (!modal) return;
    
    // [CRITICAL FIX] ตรวจสอบให้แน่ใจว่าเราเข้าถึง memories array ที่ถูกต้อง
    const memories = project.memories || [];
    
    if(index !== null && memories[index]){
        const memory = memories[index];
        console.log("Editing memory at", index, memory);
        modal.querySelector('#memory-modal-title').textContent = 'Edit Memory';
        modal.querySelector('#memory-name-input').value = memory.name;
        modal.querySelector('#memory-content-input').value = memory.content;
        modal.querySelector('#memory-edit-index').value = index;
    } else {
        console.log("Create new memory", index, memories);
        modal.querySelector('#memory-modal-title').textContent = 'Create New Memory';
        modal.querySelector('#memory-name-input').value = '';
        modal.querySelector('#memory-content-input').value = '';
        modal.querySelector('#memory-edit-index').value = '';
    }
    modal.style.display='flex';
}


export function hideMemoryEditor() {
    document.getElementById('memory-editor-modal').style.display = 'none';
}

export function initMemoryUI() {
    stateManager.bus.subscribe('memory:editorShouldClose', hideMemoryEditor);

    const memoryModal = document.getElementById('memory-editor-modal');
    if (memoryModal) {
        memoryModal.addEventListener('click', (e) => {
            const target = e.target;
            if (target.matches('.modal-actions .btn:not(.btn-secondary)')) {
                stateManager.bus.publish('memory:save');
            }
            if (target.matches('.btn-secondary') || target.closest('.modal-close-btn') || target === memoryModal) {
                hideMemoryEditor();
            }
        });
    }
}