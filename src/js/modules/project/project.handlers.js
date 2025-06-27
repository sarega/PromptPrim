// ===============================================
// FILE: src/js/modules/project/project.handlers.js (แก้ไขแล้ว)
// DESCRIPTION: แก้ไขฟังก์ชัน loadGlobalSettings ให้โหลดค่าเริ่มต้นของ System Utility Agent
// ===============================================

import {
    stateManager, defaultAgentSettings, defaultMemories, defaultSystemUtilityAgent,
    defaultSummarizationPresets, METADATA_KEY, SESSIONS_STORE_NAME, METADATA_STORE_NAME
} from '../../core/core.state.js';
import { markProjectDirty } from '../../core/core.state.js';
import { openDb, dbRequest, clearObjectStores, getDb } from '../../core/core.db.js';
import { loadAllProviderModels } from '../../core/core.api.js';
import { showCustomAlert, showSaveProjectModal, hideSaveProjectModal, showUnsavedChangesModal, hideUnsavedChangesModal } from '../../core/core.ui.js';
import { createNewChatSession, loadChatSession } from '../session/session.handlers.js';
import { scrollToLinkedEntity } from './project.ui.js';

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
            // This is where the default values are correctly assigned to a new project
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
    markProjectDirty();
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
    event.target.value = '';
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
        
        await persistProjectMetadata();
        hideSaveProjectModal();
        stateManager.setDirty(false);
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
            const saved = await saveProject(false); 
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
        const wrapperObject = await dbRequest(METADATA_STORE_NAME, 'readonly', 'get', METADATA_KEY);
        if (wrapperObject && wrapperObject.data && wrapperObject.data.id === lastProjectId) {
            const storedObject = wrapperObject.data;
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
    await loadGlobalSettings(); // This now correctly populates the UI
    const project = stateManager.getProject();
    if (project.globalSettings.apiKey || project.globalSettings.ollamaBaseUrl) {
        await loadAllProviderModels();
    }
    const existingSessions = project.chatSessions.filter(s => !s.archived);
    if (existingSessions.length === 0) {
        await createNewChatSession();
    } else {
        await loadChatSession(existingSessions.sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
    }
    stateManager.bus.publish('project:loaded', { projectData: stateManager.getProject() });
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
    const db = getDb();
    if (!db) {
        console.error("Database connection not available for rewrite.");
        return;
    }
    const tx = db.transaction([SESSIONS_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE_NAME);
    projectData.chatSessions.forEach(session => sessionStore.put(session));
    const metadata = { ...projectData };
    delete metadata.chatSessions;
    tx.objectStore(METADATA_STORE_NAME).put({ id: METADATA_KEY, data: metadata });
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function persistProjectMetadata() {
    try {
        const project = stateManager.getProject();
        if (!project || !project.id) {
            console.warn("Cannot persist metadata: project or project ID is missing.");
            return;
        }

        const metadata = { ...project };
        delete metadata.chatSessions;

        const wrapperObject = { id: METADATA_KEY, data: metadata };

        await dbRequest(METADATA_STORE_NAME, 'readwrite', 'put', wrapperObject);
        console.log("Project metadata persisted to DB.");

    } catch (error) {
        console.error("Failed to persist project metadata:", error);
    }
}

// [MODIFIED] แก้ไขฟังก์ชันนี้ให้สมบูรณ์
export async function loadGlobalSettings() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;
    
    const gs = project.globalSettings;
    
    // API and Font settings
    document.getElementById('apiKey').value = gs.apiKey || "";
    document.getElementById('ollamaBaseUrl').value = gs.ollamaBaseUrl || "";
    stateManager.bus.publish('ui:applyFontSettings');

    // System Utility Agent Settings
    const sysAgent = gs.systemUtilityAgent || defaultSystemUtilityAgent;
    document.getElementById('system-utility-model-select').value = sysAgent.model || '';
    document.getElementById('system-utility-prompt').value = sysAgent.systemPrompt || '';
    document.getElementById('system-utility-summary-prompt').value = sysAgent.summarizationPrompt || '';
    document.getElementById('system-utility-temperature').value = sysAgent.temperature ?? 1.0;
    document.getElementById('system-utility-topP').value = sysAgent.topP ?? 1.0;

    // Trigger UI update for the summarization preset selector to match the loaded prompt
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
    // After saving, re-render the preset selector to check if the current prompt matches a preset
    stateManager.bus.publish('ui:renderSummarizationSelector');
}

export function migrateProjectData(projectData) {
    // This is a placeholder for future migrations.
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
    stateManager.updateAndPersistState();

    stateManager.bus.publish('entity:selected', { type, name });

    requestAnimationFrame(() => {
        scrollToLinkedEntity(type, name);
    });
}
