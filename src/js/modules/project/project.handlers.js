// ===============================================
// FILE: src/js/modules/project/project.handlers.js (Refactored)
// DESCRIPTION: Handlers for project-level actions (new, open, save).
// ===============================================

// --- Imports ---
import { stateManager, defaultAgentSettings, defaultMemories, defaultSystemUtilityAgent, defaultSummarizationPresets, METADATA_KEY, DB_NAME_PREFIX } from '../../core/core.state.js';
import { openDb, dbRequest, clearObjectStores } from '../../core/core.db.js';
import { loadAllProviderModels } from '../../core/core.api.js';
import { showCustomAlert, showSaveProjectModal, hideSaveProjectModal, showUnsavedChangesModal, hideUnsavedChangesModal } from '../../core/core.ui.js';
import { createNewChatSession, loadChatSession } from '../session/session.handlers.js';
import { scrollToLinkedEntity } from './project.ui.js';

// --- Exported Functions ---

export function initializeFirstProject() {
    const projectId = `proj_${Date.now()}`;
    const defaultAgentName = "Default Agent";
    return {
        id: projectId,
        name: "Untitled Project",
        activeEntity: { type: 'agent', name: defaultAgentName },
        agentPresets: { [defaultAgentName]: { ...defaultAgentSettings, model: '', activeMemories: [] } },
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

export async function proceedWithCreatingNewProject() {
    const newProject = initializeFirstProject();
    await loadProjectData(newProject, true);
}

export function createNewProject() {
    if (stateManager.isDirty()) {
        stateManager.setState('pendingActionAfterSave', 'new');
        showUnsavedChangesModal();
    } else {
        proceedWithCreatingNewProject();
    }
}

export function handleFileSelectedForOpen(event) {
    const file = event.target.files[0];
    if (!file) return;

    stateManager.setState('pendingFileToOpen', file);
    event.target.value = ''; // Reset input to allow opening the same file again

    if (stateManager.isDirty()) {
        stateManager.setState('pendingActionAfterSave', 'open');
        showUnsavedChangesModal();
    } else {
        proceedWithOpeningProject();
    }
}

export function proceedWithOpeningProject() {
    const fileToOpen = stateManager.getState().pendingFileToOpen;
    if (!fileToOpen) return;

    _loadProjectFromFile(fileToOpen);
    stateManager.setState('pendingFileToOpen', null);
}

export async function saveProject(saveAs = false) {
    const project = stateManager.getProject();
    if (saveAs || project.name === "Untitled Project") {
        showSaveProjectModal();
    } else {
        await handleProjectSaveConfirm(project.name);
    }
}

export async function handleProjectSaveConfirm(projectNameFromModal) {
    const newName = projectNameFromModal?.trim();
    if (!newName) {
        showCustomAlert('Please enter a project name.');
        return false;
    }

    const project = stateManager.getProject();
    project.name = newName;
    
    // Publish events instead of direct DOM manipulation
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

        await stateManager.updateAndPersistState(); // This now marks as dirty and saves
        hideSaveProjectModal();
        stateManager.setDirty(false); // Mark as clean after a successful save
        return true;
    } catch (error) {
        console.error("Failed to save project:", error);
        showCustomAlert('Failed to save project file.', 'Error');
        return false;
    }
}

export async function handleUnsavedChanges(choice) {
    hideUnsavedChangesModal();
    switch (choice) {
        case 'save':
            const saved = await saveProject(true); // Force "Save As" dialog
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

export function performPendingAction() {
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
            showCustomAlert(`Error loading project: ${error.message}`, 'Error');
            console.error(error);
        }
    };
    reader.readAsText(file);
}

export async function loadLastProject(lastProjectId) {
    try {
        await openDb(lastProjectId);
        const storedObject = await dbRequest(METADATA_STORE_NAME, 'readonly', 'get', METADATA_KEY);
        
        if (storedObject && storedObject.id === lastProjectId) {
            const sessions = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'getAll');
            const lastProject = { ...storedObject, chatSessions: sessions };
            await loadProjectData(lastProject, false);
            console.log("Successfully loaded the last active project.");
        } else {
            throw new Error("Project data in DB is invalid or mismatched.");
        }
    } catch (error) {
        console.error("Failed to load last project, creating a new one.", error);
        localStorage.removeItem('lastActiveProjectId');
        await proceedWithCreatingNewProject();
    }
}

export async function loadProjectData(projectData, overwriteDb = false) {
    const migratedProject = migrateProjectData(projectData);
    await openDb(migratedProject.id);
    
    if (overwriteDb) {
        await rewriteDatabaseWithProjectData(migratedProject);
    }
    
    stateManager.setProject(migratedProject);
    
    // Load settings into UI
    await loadGlobalSettings(); 

    // Fetch models if API keys are present
    const project = stateManager.getProject();
    if (project.globalSettings.apiKey || project.globalSettings.ollamaBaseUrl) {
        await loadAllProviderModels();
    }
    
    // Load the most recent session or create a new one
    const existingSessions = project.chatSessions.filter(s => !s.archived);
    if (existingSessions.length === 0) {
        await createNewChatSession(); 
    } else {
        await loadChatSession(existingSessions.sort((a,b) => b.updatedAt - a.updatedAt)[0].id);
    }

    // Publish event to notify all UI modules that the project is loaded
    stateManager.bus.publish('project:loaded', { projectData: stateManager.getProject() });
    
    // Final UI updates
    if (project.activeEntity) {
        requestAnimationFrame(() => {
            scrollToLinkedEntity(project.activeEntity.type, project.activeEntity.name);
        });
    }
    
    stateManager.setDirty(false);
    localStorage.setItem('lastActiveProjectId', projectData.id);
}

export async function rewriteDatabaseWithProjectData(projectData) {
    await clearObjectStores([SESSIONS_STORE_NAME, METADATA_STORE_NAME]);
    
    const sessionStore = db.transaction(SESSIONS_STORE_NAME, 'readwrite').objectStore(SESSIONS_STORE_NAME);
    projectData.chatSessions.forEach(session => sessionStore.put(session));
    
    const metadata = { ...projectData };
    delete metadata.chatSessions;
    await dbRequest(METADATA_STORE_NAME, 'readwrite', 'put', { id: METADATA_KEY, ...metadata });
}

// --- Settings Handlers ---

export async function loadGlobalSettings() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;
    const gs = project.globalSettings;
    // ... code to set UI element values from gs ...
    stateManager.bus.publish('ui:renderSummarizationSelector');
    stateManager.bus.publish('ui:applyFontSettings');
}

export function handleFontChange(font) {
    const project = stateManager.getProject();
    project.globalSettings.fontFamilySelect = font;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:applyFontSettings');
}
export function handleApiKeyChange(key) {
    const project = stateManager.getProject();
    project.globalSettings.apiKey = key;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
}
export function handleOllamaUrlChange(url) {
    const project = stateManager.getProject();
    project.globalSettings.ollamaBaseUrl = url;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
}

export function saveSystemUtilityAgentSettings() {
    const project = stateManager.getProject();
    if (!project.globalSettings) return;
    // ... code to save system utility agent settings ...
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
}

// Dummy migrate function for now
export function migrateProjectData(projectData) {
    // In a real scenario, this would check versions and update the data structure
    return projectData;
}

export async function selectEntity(type, name) {
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

export async function loadSelectedEntity() {
    const selector = document.getElementById('entitySelector');
    if (!selector || !selector.value) return;
    
    const separatorIndex = selector.value.indexOf('_');
    const type = selector.value.substring(0, separatorIndex);
    const name = selector.value.substring(separatorIndex + 1);

    await selectEntity(type, name);
}

export function handleSummarizationPresetChange() {
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

export function handleSaveSummarizationPreset() {
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
