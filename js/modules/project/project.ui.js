// js/modules/project/project.ui.js

function updateProjectTitle(projectName) {
    const projectTitleEl = document.getElementById('project-title');
    if (projectTitleEl) projectTitleEl.textContent = projectName;
}

function scrollToLinkedEntity(type, name) {
    let element;
    if (type === 'agent') {
        element = document.querySelector(`.item[data-agent-name="${name}"]`);
    } else if (type === 'group') {
        element = document.querySelector(`.item[data-group-name="${name}"]`);
    }
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    console.log(`Scrolled to linked entity: ${type} - ${name}`);    
}

function selectCustomEntity(value) {
    const separatorIndex = value.indexOf('_');
    const type = value.substring(0, separatorIndex);
    const name = value.substring(separatorIndex + 1);
    selectEntity(type, name);
    document.getElementById('custom-entity-selector-wrapper').classList.remove('open');
}

function renderEntitySelector() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;

    const selector = document.getElementById('entitySelector');
    const optionsContainer = document.getElementById('custom-entity-selector-options');
    const triggerIcon = document.getElementById('custom-entity-selector-icon');
    const triggerText = document.getElementById('custom-entity-selector-text');

    selector.innerHTML = '';
    optionsContainer.innerHTML = '';
    
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
            const preset = agentPresets[name];
            const optionValue = `agent_${name}`;
            agentOptgroup.appendChild(new Option(`${preset.icon || '🤖'} ${name}`, optionValue));
            const optionDiv = document.createElement('div');
            optionDiv.className = 'custom-select-option';
            optionDiv.innerHTML = `<span class="item-icon">${preset.icon || '🤖'}</span> <span>${name}</span>`;
            optionDiv.onclick = () => selectCustomEntity(optionValue);
            optionsContainer.appendChild(optionDiv);
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
            const optionValue = `group_${name}`;
            groupOptgroup.appendChild(new Option(`🤝 ${name}`, optionValue));
            const optionDiv = document.createElement('div');
            optionDiv.className = 'custom-select-option';
            optionDiv.innerHTML = `<span class="item-icon">🤝</span> <span>${name}</span>`;
            optionDiv.onclick = () => selectCustomEntity(optionValue);
            optionsContainer.appendChild(optionDiv);
        });
    }

    if (project.activeEntity) {
        const { type, name } = project.activeEntity;
        const selectedValue = `${type}_${name}`;
        selector.value = selectedValue;
        if (type === 'agent') {
            const preset = agentPresets[name];
            if (preset) {
                triggerIcon.textContent = preset.icon || '🤖';
                triggerText.textContent = name;
            }
        } else {
            triggerIcon.textContent = '🤝';
            triggerText.textContent = name;
        }
    }
}

function renderSummarizationPresetSelector() {
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

function initProjectUI() {
    stateManager.bus.subscribe('project:loaded', (eventData) => {
        updateProjectTitle(eventData.projectData.name);
        renderEntitySelector();
        stateManager.setDirty(false);
    });
    stateManager.bus.subscribe('project:nameChanged', (newName) => updateProjectTitle(newName));
    stateManager.bus.subscribe('dirty:changed', (isDirty) => {
        const projectTitleEl = document.getElementById('project-title');
        if (projectTitleEl) {
            const baseName = projectTitleEl.textContent.replace(' *', '');
            projectTitleEl.textContent = isDirty ? `${baseName} *` : baseName;
        }
    });

    // --- นี่คือส่วนที่สำคัญ ---
    stateManager.bus.subscribe('entity:selected', renderEntitySelector);
    // [FIX] เพิ่มบรรทัดนี้เพื่อทำให้ Scroll ทำงาน
    stateManager.bus.subscribe('entity:selected', (data) => scrollToLinkedEntity(data.type, data.name));

    stateManager.bus.subscribe('ui:renderSummarizationSelector', renderSummarizationPresetSelector);

    const projectDropdown = document.querySelector('.sidebar-bottom-row .dropdown-content');
    projectDropdown.querySelector('a[data-action="newProject"]').addEventListener('click', (e) => { e.preventDefault(); createNewProject(); });
    projectDropdown.querySelector('a[data-action="openProject"]').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('load-project-input').click(); });
    projectDropdown.querySelector('a[data-action="saveProject"]').addEventListener('click', (e) => { e.preventDefault(); saveProject(false); });
    projectDropdown.querySelector('a[data-action="saveProjectAs"]').addEventListener('click', (e) => { e.preventDefault(); saveProject(true); });
    projectDropdown.querySelector('a[data-action="exportChat"]').addEventListener('click', (e) => { e.preventDefault(); exportChat(); });
    document.getElementById('load-project-input').addEventListener('change', handleFileSelectedForOpen);
    
    console.log("Project UI Initialized.");
}
