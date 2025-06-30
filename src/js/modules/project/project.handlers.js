// ===============================================
// FILE: src/js/modules/project/project.handlers.js (แก้ไขสมบูรณ์)
// DESCRIPTION: แก้ไขการจัดการ Dirty State ให้ถูกบันทึกและโหลดอย่างถูกต้อง
// ===============================================

import {
    stateManager,
    defaultAgentSettings,
    defaultMemories,
    defaultSystemUtilityAgent,
    defaultSummarizationPresets,
    METADATA_KEY,
    SESSIONS_STORE_NAME,
    METADATA_STORE_NAME
} from '../../core/core.state.js';
import { openDb, dbRequest, clearObjectStores } from '../../core/core.db.js';
import { loadAllProviderModels } from '../../core/core.api.js';
import { showCustomAlert, showSaveProjectModal, hideSaveProjectModal, showUnsavedChangesModal, hideUnsavedChangesModal } from '../../core/core.ui.js';
import { createNewChatSession, loadChatSession, saveAllSessions } from '../session/session.handlers.js';
import { scrollToLinkedEntity } from './project.ui.js';

export function initializeFirstProject() {
    const projectId = `proj_${Date.now()}`;
    const defaultAgentName = "Default Agent";
    return {
        id: projectId,
        name: "Untitled Project",
        isDirtyForUser: false, // [FIX] Initialize the dirty flag within the project object
        activeEntity: { type: 'agent', name: defaultAgentName },
        agentPresets: { [defaultAgentName]: { ...defaultAgentSettings, model: '', activeMemories: [] } },
        agentGroups: {},
        memories: JSON.parse(JSON.stringify(defaultMemories)),
        chatSessions: [],
        activeSessionId: null,
        summaryLogs: [],
        globalSettings: {
            fontFamilySelect: "'Sarabun', sans-serif",
            apiKey: "",
            ollamaBaseUrl: "http://localhost:11434",
            systemUtilityAgent: { ...defaultSystemUtilityAgent },
            summarizationPromptPresets: JSON.parse(JSON.stringify(defaultSummarizationPresets))
        }
    };
}

export async function proceedWithCreatingNewProject() {
  try {
    const newProject = initializeFirstProject();
    await openDb(newProject.id);
    await clearObjectStores([SESSIONS_STORE_NAME, METADATA_STORE_NAME]);
    // [FIX] Pass `isFromFile` as true to indicate this is a clean state
    await loadProjectData(newProject, true);
  } catch (error) {
    console.error("Failed to proceed with creating new project:", error);
    showCustomAlert("Could not create a new project. Please check console for errors.", "Error");
  }
}

export function createNewProject() {
    if (stateManager.isUserDirty()) {
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
    event.target.value = '';
    if (stateManager.isUserDirty()) {
        stateManager.setState('pendingActionAfterSave', 'open');
        showUnsavedChangesModal();
    } else {
        proceedWithOpeningProject();
    }
}

export function proceedWithOpeningProject() {
    try {
        const fileToOpen = stateManager.getState().pendingFileToOpen;
        if (!fileToOpen) return;
        _loadProjectFromFile(fileToOpen);
        stateManager.setState('pendingFileToOpen', null);
    } catch(error) {
        console.error("Failed to proceed with opening project:", error);
        showCustomAlert("Could not open the project file.", "Error");
    }
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
    stateManager.bus.publish('project:nameChanged', newName);
    
    // We will set the dirty flag to false *before* saving the file,
    // so the file itself contains `isDirtyForUser: false`.
    stateManager.setUserDirty(false);
    
    let projectToSave = JSON.parse(JSON.stringify(stateManager.getProject()));
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
        
        hideSaveProjectModal();
        
        // Now that the project is successfully saved to a file,
        // the auto-save state can also be considered clean.
        stateManager.setAutoSaveDirty(false);

        // [FIX] Persist the now-clean project state back to the database
        await persistCurrentProject();

        // [FIX] Check for and perform any pending action (like 'new' or 'open')
        if (stateManager.getState().pendingActionAfterSave) {
            await performPendingAction();
        }

        return true;
    } catch (error) {
        console.error("Failed to save project:", error);
        showCustomAlert('Failed to save project file.', 'Error');
        // If saving fails, revert the dirty flag back to true
        stateManager.setUserDirty(true);
        return false;
    }
}

export async function handleUnsavedChanges(choice) {
    hideUnsavedChangesModal();
    try {
        switch (choice) {
            case 'save':
                // `saveProject` will pop a modal if needed, or save directly.
                // The new logic in `handleProjectSaveConfirm` will then trigger the pending action.
                await saveProject(false);
                break;
            case 'discard':
                stateManager.setUserDirty(false);
                // [FIX] Persist the clean state to DB *before* performing the next action
                await persistCurrentProject();
                await performPendingAction();
                break;
            case 'cancel':
            default:
                stateManager.setState('pendingFileToOpen', null);
                stateManager.setState('pendingActionAfterSave', null);
                break;
        }
    } catch (error) {
        console.error("Error handling unsaved changes choice:", error);
        showCustomAlert(`An error occurred while performing the action: ${error.message}`, "Error");
        stateManager.setState('pendingFileToOpen', null);
        stateManager.setState('pendingActionAfterSave', null);
    }
}

export async function performPendingAction() {
    const action = stateManager.getState().pendingActionAfterSave;
    stateManager.setState('pendingActionAfterSave', null); // Clear action first
    if (action === 'open') {
        await proceedWithOpeningProject();
    } else if (action === 'new') {
        await proceedWithCreatingNewProject();
    }
}

async function _loadProjectFromFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && data.id && data.name && data.agentPresets) {
                // [FIX] Pass `isFromFile` as true to indicate a clean state
                await loadProjectData(data, true); 
                showCustomAlert(`Project '${data.name}' loaded successfully!`, 'Project Loaded');
            } else { throw new Error('Invalid project file format.'); }
        } catch (error) {
            showCustomAlert(`Error loading project: ${error.message}`, 'Error');
            console.error(error);
        }
    };
    reader.readAsText(file);
}

export async function loadLastProject(lastProjectId) {
    if (!lastProjectId) {
        throw new Error("Cannot load last project: Project ID is missing.");
    }
    await openDb(lastProjectId);
    const wrapperObject = await dbRequest(METADATA_STORE_NAME, 'readonly', 'get', METADATA_KEY);
    
    if (wrapperObject && wrapperObject.data && wrapperObject.data.id === lastProjectId) {
        const storedObject = wrapperObject.data;
        const sessions = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'getAll');
        const lastProject = { ...storedObject, chatSessions: sessions || [] };
        // [FIX] Pass `isFromFile` as false to preserve dirty state from DB
        await loadProjectData(lastProject, false);
        console.log("Successfully loaded the last active project from IndexedDB.");
    } else {
        throw new Error("Project data in DB is invalid or mismatched with last known ID.");
    }
}

export async function loadProjectData(projectData, isFromFile = false) {
    const migratedProject = migrateProjectData(projectData);
    await openDb(migratedProject.id);

    // If loading from a file, it's a clean save point.
    if (isFromFile) {
        migratedProject.isDirtyForUser = false;
        await rewriteDatabaseWithProjectData(migratedProject);
    }

    stateManager.setProject(migratedProject);
    await loadGlobalSettings();
    
    // [FIX] Publish the dirty status that was just loaded from the project object
    stateManager.bus.publish('userDirty:changed', stateManager.isUserDirty());
    // Auto-save state is clean because the DB and app state are now synced.
    stateManager.setAutoSaveDirty(false); 
    
    if (migratedProject.globalSettings.apiKey || migratedProject.globalSettings.ollamaBaseUrl) {
        await loadAllProviderModels();
    }

    const existingSessions = (migratedProject.chatSessions || []).filter(s => !s.archived);
    if (existingSessions.length === 0) {
        await createNewChatSession();
    } else {
        const lastActiveSessionId = migratedProject.activeSessionId;
        const sessionToLoad = existingSessions.find(s => s.id === lastActiveSessionId) || existingSessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        await loadChatSession(sessionToLoad.id);
    }

    stateManager.bus.publish('project:loaded', { projectData: migratedProject });
    localStorage.setItem('lastActiveProjectId', migratedProject.id);
}

export async function rewriteDatabaseWithProjectData(projectData) {
    await clearObjectStores([SESSIONS_STORE_NAME, METADATA_STORE_NAME]);
    await persistProjectMetadata(projectData);
    await saveAllSessions(projectData.chatSessions);
    console.log("Database has been rewritten with new project data.");
}

export async function persistProjectMetadata(project) {
    const projectToPersist = project || stateManager.getProject();
    if (!projectToPersist || !projectToPersist.id) {
        console.warn("Cannot persist metadata: project or project ID is missing.");
        return;
    }
    const metadata = { ...projectToPersist };
    delete metadata.chatSessions;
    const wrapperObject = { id: METADATA_KEY, data: metadata };
    await dbRequest(METADATA_STORE_NAME, 'readwrite', 'put', wrapperObject);
}

export async function persistCurrentProject() {
    const project = stateManager.getProject();
    if (!project || !project.id) {
        return false;
    }
    console.log('[AutoSave] Persisting project to IndexedDB...');
    try {
        await persistProjectMetadata();
        await saveAllSessions();
        console.log('[AutoSave] Project state successfully persisted.');
        return true;
    } catch (error) {
        console.error('[AutoSave] Failed to persist project state:', error);
        return false;
    }
}

export async function loadGlobalSettings() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;
    const gs = project.globalSettings;
    document.getElementById('apiKey').value = gs.apiKey || "";
    document.getElementById('ollamaBaseUrl').value = gs.ollamaBaseUrl || "";
    stateManager.bus.publish('ui:applyFontSettings');
    const sysAgent = gs.systemUtilityAgent || defaultSystemUtilityAgent;
    document.getElementById('system-utility-model-select').value = sysAgent.model || '';
    document.getElementById('system-utility-prompt').value = sysAgent.systemPrompt || '';
    document.getElementById('system-utility-summary-prompt').value = sysAgent.summarizationPrompt || '';
    document.getElementById('system-utility-temperature').value = sysAgent.temperature ?? 1.0;
    document.getElementById('system-utility-topP').value = sysAgent.topP ?? 1.0;
    stateManager.bus.publish('ui:renderSummarizationSelector');
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
    const agentSettings = project.globalSettings.systemUtilityAgent;
    agentSettings.model = document.getElementById('system-utility-model-select').value;
    agentSettings.systemPrompt = document.getElementById('system-utility-prompt').value;
    agentSettings.summarizationPrompt = document.getElementById('system-utility-summary-prompt').value;
    agentSettings.temperature = parseFloat(document.getElementById('system-utility-temperature').value);
    agentSettings.topP = parseFloat(document.getElementById('system-utility-topP').value);
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:renderSummarizationSelector');
}

export function migrateProjectData(projectData) {
    // Ensure the isDirtyForUser flag exists
    if (typeof projectData.isDirtyForUser === 'undefined') {
        projectData.isDirtyForUser = true; // Assume dirty if flag is missing
    }
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
    }
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('entity:selected', { type, name });
    requestAnimationFrame(() => {
        scrollToLinkedEntity(type, name);
    });
}
