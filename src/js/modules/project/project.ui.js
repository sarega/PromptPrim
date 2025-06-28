// ===============================================
// FILE: src/js/modules/project/project.ui.js (แก้ไขสมบูรณ์)
// DESCRIPTION: ทำให้ฟังก์ชัน updateProjectTitle เป็นศูนย์กลางการแสดงผลชื่อและสถานะ Dirty
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';

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

export function renderSummarizationPresetSelector() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;

    const selector = document.getElementById('system-utility-summary-preset-select');
    const presets = project.globalSettings.summarizationPromptPresets || {};
    const currentPromptText = document.getElementById('system-utility-summary-prompt').value;
    let matchingPresetName = null;
    selector.innerHTML = '';
    
    for (const presetName in presets) {
        selector.add(new Option(presetName, presetName));
        if (presets[presetName].trim() === currentPromptText.trim()) {
            matchingPresetName = presetName;
        }
    }
    
    if (!matchingPresetName) {
        const customOption = new Option('--- Custom ---', 'custom', true, true);
        customOption.disabled = true;
        selector.add(customOption);
        selector.value = 'custom';
    } else {
        selector.value = matchingPresetName;
    }
}

export function initProjectUI() {
    // --- Subscribe to Events ---

    stateManager.bus.subscribe('project:loaded', (eventData) => {
        updateProjectTitle(eventData.projectData.name);
        renderEntitySelector();
    });
    stateManager.bus.subscribe('project:nameChanged', (newName) => updateProjectTitle(newName));
    
    // [FIX] This listener ensures the asterisk ('*') appears/disappears correctly.
    stateManager.bus.subscribe('userDirty:changed', () => {
        updateProjectTitle();
    });
    
    stateManager.bus.subscribe('entity:selected', renderEntitySelector);
    stateManager.bus.subscribe('agent:listChanged', renderEntitySelector);
    stateManager.bus.subscribe('group:listChanged', renderEntitySelector);
    stateManager.bus.subscribe('ui:renderSummarizationSelector', renderSummarizationPresetSelector);

    // --- Setup Event Listeners ---
    const projectDropdownWrapper = document.querySelector('.sidebar-bottom-row .dropdown');
    if (projectDropdownWrapper) {
        const toggleButton = projectDropdownWrapper.querySelector('button');
        if (toggleButton) {
            toggleButton.addEventListener('click', toggleDropdown);
        }

        const dropdownContent = projectDropdownWrapper.querySelector('.dropdown-content');
        if (dropdownContent) {
            const handleMenuAction = (selector, eventName, eventData = {}) => {
                const link = dropdownContent.querySelector(selector);
                if (link) {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        stateManager.bus.publish(eventName, eventData);
                        projectDropdownWrapper.classList.remove('open');
                    });
                }
            };
            handleMenuAction('a[data-action="newProject"]', 'project:new');
            handleMenuAction('a[data-action="openProject"]', 'project:open');
            handleMenuAction('a[data-action="saveProject"]', 'project:save', false);
            handleMenuAction('a[data-action="saveProjectAs"]', 'project:save', true);
            handleMenuAction('a[data-action="exportChat"]', 'project:exportChat');
        }
    }
    
    document.getElementById('load-project-input').addEventListener('change', (e) => stateManager.bus.publish('project:fileSelectedForOpen', e));
    document.getElementById('custom-entity-selector-trigger').addEventListener('click', toggleCustomEntitySelector);

    console.log("Project UI Initialized.");
}
