// js/modules/project/project.handlers.js

function initializeFirstProject() {
    const projectId = `proj_${Date.now()}`;
    const defaultAgentName = "Default Agent";
    return {
        id: projectId,
        name: "Untitled Project",
        activeEntity: { type: 'agent', name: defaultAgentName },
        agentPresets: { [defaultAgentName]: { ...defaultAgentSettings, model: '', activeMemories: [] } }, // Ensure model is empty initially
        agentGroups: {},
        memories: JSON.parse(JSON.stringify(defaultMemories)),
        chatSessions: [],
        summaryLogs: [],
        globalSettings: {
            fontFamilySelect: "'Sarabun', sans-serif",
            apiKey: "",
            ollamaBaseUrl: "http://localhost:11434",
            allModels: [],
            systemUtilityAgent: { ...defaultSystemUtilityAgent },
            summarizationPromptPresets: JSON.parse(JSON.stringify(defaultSummarizationPresets))
        }
    };
}

async function loadProjectData(projectData, overwriteDb = false) {
    const migratedProject = migrateProjectData(projectData);

    if (window.db && window.db.name !== `${DB_NAME_PREFIX}${migratedProject.id}`) {
        window.db.close();
        window.db = null;
    }
    await openDb(migratedProject.id);
    
    stateManager.setProject(migratedProject);
    
    if (overwriteDb) {
        await rewriteDatabaseWithProjectData(migratedProject);
    }
    
    await loadGlobalSettings(); 

    const project = stateManager.getProject();
    if (project.globalSettings.apiKey || project.globalSettings.ollamaBaseUrl) {
        await loadAllProviderModels();
    }
    
    const existingSessions = project.chatSessions.filter(s => !s.archived);

    if (existingSessions.length === 0) {
        await createNewChatSession(); 
    } else {
        await loadChatSession(existingSessions.sort((a,b) => b.updatedAt - a.updatedAt)[0].id);
    }

    stateManager.bus.publish('project:loaded', { projectData: stateManager.getProject() });
    
    if (project.activeEntity) {
        requestAnimationFrame(() => {
            scrollToLinkedEntity(project.activeEntity.type, project.activeEntity.name);
        });
    }
    
    stateManager.setDirty(false);
}

// [FIXED] แก้ไขฟังก์ชันนี้เพื่อเพิ่ม Logic การตั้งค่า Default Agent อัตโนมัติ
function saveSystemUtilityAgentSettings() {
    const project = stateManager.getProject();
    if (!project.globalSettings) return;

    const settings = project.globalSettings.systemUtilityAgent;
    const newUtilityModel = document.getElementById('system-utility-model-select').value;
    
    // --- START: Logic การตั้งค่าอัตโนมัติ ---
    // ตรวจสอบว่า "Default Agent" ยังใช้ค่า Model เริ่มต้น (ว่าง) อยู่หรือไม่
    const defaultAgent = project.agentPresets["Default Agent"];
    if (defaultAgent && defaultAgent.model === '' && newUtilityModel) {
        // ถ้าใช่ ให้ตั้งค่า Model ของ Default Agent ให้ตรงกัน
        defaultAgent.model = newUtilityModel;
    }
    // --- END: Logic การตั้งค่าอัตโนมัติ ---

    // บันทึกค่าของ System Utility Agent ตามปกติ
    settings.model = newUtilityModel;
    settings.systemPrompt = document.getElementById('system-utility-prompt').value;
    settings.summarizationPrompt = document.getElementById('system-utility-summary-prompt').value;
    settings.temperature = parseFloat(document.getElementById('system-utility-temperature').value);
    settings.topP = parseFloat(document.getElementById('system-utility-topP').value);
    
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    
    // ประกาศให้ Agent UI วาดตัวเองใหม่ เผื่อมีการเปลี่ยนแปลงของ Default Agent
    stateManager.bus.publish('agent:listChanged');
}


// ... a rest of the file remains the same ...
async function proceedWithCreatingNewProject() {
    const newProject = initializeFirstProject();
    await loadProjectData(newProject, true);
}


function createNewProject() {
    if (stateManager.isDirty()) {
        stateManager.setState('pendingActionAfterSave', 'new');
        showUnsavedChangesModal();
    } else {
        proceedWithCreatingNewProject();
    }
}

function handleFileSelectedForOpen(event) {
    const file = event.target.files[0];
    if (!file) return;

    stateManager.setState('pendingFileToOpen', file);
    event.target.value = '';

    if (stateManager.isDirty()) {
        stateManager.setState('pendingActionAfterSave', 'open');
        showUnsavedChangesModal();
    } else {
        proceedWithOpeningProject();
    }
}

function proceedWithOpeningProject() {
    const fileToOpen = stateManager.getState().pendingFileToOpen;
    if (!fileToOpen) return;

    _loadProjectFromFile(fileToOpen);
    stateManager.setState('pendingFileToOpen', null);
}

async function saveProject(saveAs = false) {
    const project = stateManager.getProject();
    if (saveAs || project.name === "Untitled Project") {
        showSaveProjectModal();
    } else {
        await handleProjectSaveConfirm(project.name);
    }
}

async function handleProjectSaveConfirm(projectNameFromDirectSave = null) {
    const newName = projectNameFromDirectSave || document.getElementById('project-name-input').value.trim();
    if (!newName) {
        showCustomAlert('กรุณาใส่ชื่อโปรเจกต์');
        return false;
    }

    const project = stateManager.getProject();
    project.name = newName;
    
    stateManager.setProject(project);
    stateManager.bus.publish('project:nameChanged', newName);

    let projectToSave = JSON.parse(JSON.stringify(project));
    projectToSave = migrateProjectData(projectToSave);

    try {
        const dataStr = JSON.stringify(projectToSave, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${newName.replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);

        await stateManager.updateAndPersistState();
        hideSaveProjectModal();
        stateManager.setDirty(false);
        return true;
    } catch (error) {
        console.error("Failed to save project:", error);
        return false;
    }
}

async function handleUnsavedChanges(choice) {
    hideUnsavedChangesModal();
    switch (choice) {
        case 'save':
            const saved = await handleProjectSaveConfirm();
            if (saved) performPendingAction();
            break;
        case 'discard':
            stateManager.setDirty(false);
            performPendingAction();
            break;
        case 'cancel':
        default:
            stateManager.setState('pendingFileToOpen', null);
            stateManager.setState('pendingActionAfterSave', null);
            break;
    }
}

function performPendingAction() {
    const action = stateManager.getState().pendingActionAfterSave;
    if (action === 'open') {
        proceedWithOpeningProject();
    } else if (action === 'new') {
        proceedWithCreatingNewProject();
    }
    stateManager.setState('pendingActionAfterSave', null);
}

async function _loadProjectFromFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && data.id && data.name && data.agentPresets) {
                await loadProjectData(data, true);
                showCustomAlert(`Project '${data.name}' loaded successfully!`, 'Project Loaded');
            } else {
                throw new Error('Invalid project file format.');
            }
        } catch (error) {
            alert(`Error loading project: ${error.message}`);
            console.error(error);
        }
    };
    reader.readAsText(file);
}

function migrateProjectData(projectData) {
    if (!projectData.globalSettings) projectData.globalSettings = {};
    if (!projectData.globalSettings.systemUtilityAgent) {
        projectData.globalSettings.systemUtilityAgent = { ...defaultSystemUtilityAgent };
    }
    if (!projectData.globalSettings.summarizationPromptPresets) {
        projectData.globalSettings.summarizationPromptPresets = JSON.parse(JSON.stringify(defaultSummarizationPresets));
    }
    if (projectData.activeAgent && !projectData.activeEntity) {
        projectData.activeEntity = { type: 'agent', name: projectData.activeAgent };
        delete projectData.activeAgent;
    } else if (!projectData.activeEntity) {
        const firstAgentName = projectData.agentPresets ? Object.keys(projectData.agentPresets)[0] : "Default Agent";
        projectData.activeEntity = { type: 'agent', name: firstAgentName };
    }
    if (projectData.agentPresets && projectData.agentPresets['undefined']) {
        delete projectData.agentPresets['undefined'];
    }
    if (!projectData.summaryLogs) projectData.summaryLogs = [];
    if (projectData.agentPresets) {
        for (const agentName in projectData.agentPresets) {
            if (!projectData.agentPresets[agentName].icon) projectData.agentPresets[agentName].icon = '🤖';
            if (!projectData.agentPresets[agentName].activeMemories) projectData.agentPresets[agentName].activeMemories = [];
        }
    }
    if (Array.isArray(projectData.chatSessions)) {
        projectData.chatSessions.forEach(session => {
            if (typeof session.id === 'number') {
                session.id = `sid_${session.id}`;
            }
            session.pinned = session.pinned ?? false;
            session.archived = session.archived ?? false;
            session.linkedEntity = session.linkedEntity ?? { ...projectData.activeEntity };
            if (!session.groupChatState) session.groupChatState = { isRunning: false };
            if (session.summaryState && session.summaryState.hasOwnProperty('lastSummary')) {
                session.summaryState = { activeSummaryId: null, summarizedUntilIndex: session.summaryState.summarizedUntilIndex || 0 };
            } else if (!session.summaryState) {
                 session.summaryState = { activeSummaryId: null, summarizedUntilIndex: 0 };
            }
            if (session.linkedAgentName) delete session.linkedAgentName;
            if (session.roundRobinState) delete session.roundRobinState;
        });
    }
    return projectData;
}

async function rewriteDatabaseWithProjectData(projectData) {
    await clearObjectStores([SESSIONS_STORE_NAME, METADATA_STORE_NAME]);
    
    const transaction = db.transaction([SESSIONS_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
    const sessionStore = transaction.objectStore(SESSIONS_STORE_NAME);
    const metadataStore = transaction.objectStore(METADATA_STORE_NAME);

    projectData.chatSessions.forEach(session => sessionStore.put(session));
    
    const metadata = { ...projectData };
    delete metadata.chatSessions;
    metadataStore.put({ id: METADATA_KEY, ...metadata });

    await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
    });
}

async function selectEntity(type, name) {
    const project = stateManager.getProject();
    project.activeEntity = { type, name };

    const activeSession = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (activeSession) {
        if (activeSession.groupChatState) activeSession.groupChatState.isRunning = false;
        activeSession.linkedEntity = { ...project.activeEntity };
        activeSession.updatedAt = Date.now();
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', activeSession);
    }

    stateManager.setProject(project);
    await stateManager.updateAndPersistState();
    
    stateManager.bus.publish('entity:selected', { type, name });
    
    requestAnimationFrame(() => {
        scrollToLinkedEntity(type, name);
    });
}

async function loadSelectedEntity() {
    const selector = document.getElementById('entitySelector');
    if (!selector || !selector.value) return;
    
    const separatorIndex = selector.value.indexOf('_');
    const type = selector.value.substring(0, separatorIndex);
    const name = selector.value.substring(separatorIndex + 1);

    await selectEntity(type, name);
}

async function loadGlobalSettings() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;

    const gs = project.globalSettings;

    document.getElementById('fontFamilySelect').value = gs.fontFamilySelect || "'Sarabun', sans-serif";
    document.getElementById('apiKey').value = gs.apiKey || '';
    document.getElementById('ollamaBaseUrl').value = gs.ollamaBaseUrl || 'http://localhost:11434';
    
    const sysAgent = gs.systemUtilityAgent || defaultSystemUtilityAgent;
    document.getElementById('system-utility-model-select').value = sysAgent.model;
    document.getElementById('system-utility-prompt').value = sysAgent.systemPrompt;
    document.getElementById('system-utility-summary-prompt').value = sysAgent.summarizationPrompt;
    document.getElementById('system-utility-temperature').value = sysAgent.temperature;
    document.getElementById('system-utility-topP').value = sysAgent.topP;
    
    stateManager.bus.publish('ui:renderSummarizationSelector');
    stateManager.bus.publish('ui:applyFontSettings');
}

function handleSummarizationPresetChange() {
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
        saveSystemUtilityAgentSettings();
    }
}

function handleSaveSummarizationPreset() {
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
