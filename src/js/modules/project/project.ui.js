// ===============================================
// FILE: src/js/modules/project/project.ui.js
// DESCRIPTION: ทำให้ฟังก์ชัน updateProjectTitle เป็นศูนย์กลางการแสดงผลชื่อและสถานะ Dirty
// ===============================================

import { stateManager, defaultSummarizationPresets } from '../../core/core.state.js';
import { toggleDropdown, showCustomAlert } from '../../core/core.ui.js';

/**
 * [MODIFIED] This function is now the single source of truth for the project title display.
 * It checks the dirty state and appends a '*' if necessary.
 * @param {string} [projectName] - Optional. The base name of the project. If not provided, it will be retrieved from the state.
 */
export function updateProjectTitle(projectName) {
    const projectTitleEl = document.getElementById('project-title');
    if (projectTitleEl) {
        const isDirty = stateManager.isUserDirty();
        // Use the passed projectName or get it from the state as a fallback
        const nameToShow = projectName || stateManager.getProject()?.name || "Untitled";
        projectTitleEl.textContent = isDirty ? `${nameToShow} *` : nameToShow;
    }
}

function showSaveAsModal() {
    const modal = document.getElementById('save-project-modal');
    const projectNameInput = document.getElementById('project-name-input');
    const currentProject = stateManager.getProject();

    // Pre-fill the input with a suggestion
    projectNameInput.value = currentProject ? `${currentProject.name} - Copy` : 'Untitled Project';
    modal.style.display = 'flex';
    projectNameInput.focus();
    projectNameInput.select();
}

function hideSaveAsModal() {
    const modal = document.getElementById('save-project-modal');
    modal.style.display = 'none';
}


export function toggleCustomEntitySelector(event) {
    if (event) event.stopPropagation();
    document.getElementById('custom-entity-selector-wrapper').classList.toggle('open');
}

export function scrollToLinkedEntity(type, name) {
    let element;
    if (type === 'agent') {
        element = document.querySelector(`.item[data-agent-name="${name}"]`);
    } else if (type === 'group') {
        element = document.querySelector(`.item[data-group-name="${name}"]`);
    }
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

export function selectCustomEntity(value) {
    const separatorIndex = value.indexOf('_');
    const type = value.substring(0, separatorIndex);
    const name = value.substring(separatorIndex + 1);

    stateManager.bus.publish('entity:select', { type, name });

    document.getElementById('custom-entity-selector-wrapper').classList.remove('open');
}

export function renderEntitySelector() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;

    const selector = document.getElementById('entitySelector');
    const optionsContainer = document.getElementById('custom-entity-selector-options');
    const triggerIcon = document.getElementById('custom-entity-selector-icon');
    const triggerText = document.getElementById('custom-entity-selector-text');

    selector.innerHTML = '';
    optionsContainer.innerHTML = '';

    const createOption = (type, name, icon, container) => {
        const optionValue = `${type}_${name}`;
        const optionDiv = document.createElement('div');
        optionDiv.className = 'custom-select-option';
        optionDiv.innerHTML = `<span class="item-icon">${icon}</span> <span>${name}</span>`;
        optionDiv.addEventListener('click', () => selectCustomEntity(optionValue));

        container.appendChild(new Option(`${icon} ${name}`, optionValue));
        optionsContainer.appendChild(optionDiv);
    };

    const agentPresets = project.agentPresets || {};
    if (Object.keys(agentPresets).length > 0) {
        const agentOptgroup = document.createElement('optgroup');
        agentOptgroup.label = 'Agent Presets';
        selector.appendChild(agentOptgroup);
        const agentGroupDiv = document.createElement('div');
        agentGroupDiv.className = 'custom-select-group';
        agentGroupDiv.textContent = 'Agent Presets';
        optionsContainer.appendChild(agentGroupDiv);
        Object.keys(agentPresets).forEach(name => {
            createOption('agent', name, agentPresets[name].icon || '🤖', agentOptgroup);
        });
    }

    const agentGroups = project.agentGroups || {};
    if (Object.keys(agentGroups).length > 0) {
        const groupOptgroup = document.createElement('optgroup');
        groupOptgroup.label = 'Agent Groups';
        selector.appendChild(groupOptgroup);
        const groupGroupDiv = document.createElement('div');
        groupGroupDiv.className = 'custom-select-group';
        groupGroupDiv.textContent = 'Agent Groups';
        optionsContainer.appendChild(groupGroupDiv);
        Object.keys(agentGroups).forEach(name => {
            createOption('group', name, '🤝', groupOptgroup);
        });
    }

    if (project.activeEntity) {
        const { type, name } = project.activeEntity;
        selector.value = `${type}_${name}`;
        if (type === 'agent' && agentPresets[name]) {
            triggerIcon.textContent = agentPresets[name].icon || '🤖';
            triggerText.textContent = name;
        } else if (type === 'group') {
            triggerIcon.textContent = '🤝';
            triggerText.textContent = name;
        } else {
             triggerIcon.textContent = '❔';
             triggerText.textContent = 'Select...';
        }
    }
}

// export function renderSummarizationPresetSelector() {
//     const project = stateManager.getProject();
//     if (!project || !project.globalSettings) return;
//     const selector = document.getElementById('summary-modal-preset-select');
//     const userPresets = project.globalSettings.summarizationPromptPresets || {};
//     const currentPromptText = document.getElementById('summary-modal-prompt-textarea').value;
//     const previouslySelectedValue = selector.value;
//     selector.innerHTML = '';
//     let matchingPresetName = null;
//     const factoryGroup = document.createElement('optgroup');
//     factoryGroup.label = 'Factory Presets';
//     for (const presetName in defaultSummarizationPresets) {
//         factoryGroup.appendChild(new Option(presetName, presetName));
//         if (defaultSummarizationPresets[presetName].trim() === currentPromptText.trim()) {
//             matchingPresetName = presetName;
//         }
//     }
//     selector.appendChild(factoryGroup);
//     const userPresetNames = Object.keys(userPresets).filter(p => !defaultSummarizationPresets.hasOwnProperty(p));
//     if (userPresetNames.length > 0) {
//         const userGroup = document.createElement('optgroup');
//         userGroup.label = 'User Presets';
//         userPresetNames.forEach(presetName => {
//             userGroup.appendChild(new Option(presetName, presetName));
//             if (userPresets[presetName].trim() === currentPromptText.trim()) {
//                 matchingPresetName = presetName;
//             }
//         });
//         selector.appendChild(userGroup);
//     }
//     if (matchingPresetName) {
//         selector.value = matchingPresetName;
//     } else if (previouslySelectedValue && selector.querySelector(`option[value="${previouslySelectedValue}"]`)) {
//         selector.value = previouslySelectedValue;
//     } else if (currentPromptText.trim() !== '') {
//         const customOption = new Option('--- Custom (Unsaved) ---', 'custom', true, true);
//         customOption.disabled = true;
//         selector.add(customOption);
//         selector.value = 'custom';
//     }
//     updateSummarizationActionMenu();
// }


export function initProjectUI() {
    // --- Subscribe to Events (ส่วนนี้ของคุณถูกต้องแล้ว) ---
    stateManager.bus.subscribe('project:loaded', (eventData) => {
        updateProjectTitle(eventData.projectData.name);
        renderEntitySelector();
    });
    stateManager.bus.subscribe('project:nameChanged', (newName) => updateProjectTitle(newName));
    stateManager.bus.subscribe('userDirty:changed', () => updateProjectTitle());
    stateManager.bus.subscribe('entity:selected', renderEntitySelector);
    stateManager.bus.subscribe('agent:listChanged', renderEntitySelector);
    stateManager.bus.subscribe('group:listChanged', renderEntitySelector);
    // stateManager.bus.subscribe('ui:renderSummarizationSelector', renderSummarizationPresetSelector);
    // stateManager.bus.subscribe('ui:updateSummaryActionButtons', updateSummarizationActionButtons);
    stateManager.bus.subscribe('ui:showSaveAsModal', showSaveAsModal);

    // --- Setup Event Listeners ---
    const projectDropdownWrapper = document.querySelector('.sidebar-bottom-row .dropdown');
    if (projectDropdownWrapper) {
        const toggleButton = projectDropdownWrapper.querySelector('button');
        if (toggleButton) {
            toggleButton.addEventListener('click', toggleDropdown);
        }

        // Use event delegation for the dropdown menu itself
        projectDropdownWrapper.addEventListener('click', (e) => {
            const target = e.target.closest('a');
            if (!target) return;

            const action = target.dataset.action;
            if (action) {
                e.preventDefault();
                const eventMap = {
                    'newProject': { name: 'project:new' },
                    'openProject': { name: 'project:open' },
                    'saveProject': { name: 'project:save', data: false },
                    'saveProjectAs': { name: 'project:save', data: true }, // This will trigger the modal via the handler
                    'exportChat': { name: 'project:exportChat' }
                };
                if (eventMap[action]) {
                    stateManager.bus.publish(eventMap[action].name, eventMap[action].data);
                }
                projectDropdownWrapper.classList.remove('open');
            }
        });
    }

    // --- Setup Modal Listeners using Event Delegation ---
    const saveProjectModal = document.getElementById('save-project-modal');
    if (saveProjectModal) {
        saveProjectModal.addEventListener('click', (e) => {
            if (e.target.matches('.btn:not(.btn-secondary)')) { // Save button
                const newName = document.getElementById('project-name-input').value.trim();
                if (newName) {
                    stateManager.bus.publish('project:saveConfirm', { projectName: newName });
                    hideSaveAsModal(); // Hide modal on successful action
                } else {
                    showCustomAlert('Please enter a project name.');
                }
            } else if (e.target.matches('.btn-secondary') || e.target === saveProjectModal) { // Cancel or overlay click
                hideSaveAsModal();
            }
        });
    }
    
    document.getElementById('load-project-input')?.addEventListener('change', (e) => stateManager.bus.publish('project:fileSelectedForOpen', e));
    document.getElementById('custom-entity-selector-trigger')?.addEventListener('click', toggleCustomEntitySelector);

    // const summaryActionsWrapper = document.getElementById('summary-modal-preset-actions');
    // if (summaryActionsWrapper) {
    //     summaryActionsWrapper.querySelector('button[data-action="toggle-menu"]')?.addEventListener('click', toggleDropdown);
    //     summaryActionsWrapper.querySelector('.dropdown-content')?.addEventListener('click', (e) => {
    //         const actionTarget = e.target.closest('a[data-action]');
    //         if (!actionTarget) return;
    //         e.preventDefault();
    //         e.stopPropagation();
    //         const action = actionTarget.dataset.action;
    //         const saveAs = actionTarget.dataset.saveAs === 'true';
    //         stateManager.bus.publish(action, { saveAs });
    //         summaryActionsWrapper.classList.remove('open');
    //     });
    // }
    console.log("Project UI Initialized with definitive listeners.");
}
