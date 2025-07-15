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
import { showCustomAlert, showUnsavedChangesModal, hideUnsavedChangesModal } from '../../core/core.ui.js';
import { scrollToLinkedEntity } from './project.ui.js';
import { createNewChatSession, loadChatSession, saveAllSessions, saveActiveSession } from '../session/session.handlers.js';


/**
 * [REWRITTEN] ฟังก์ชัน Auto-save ที่มีประสิทธิภาพสูงขึ้น
 * จะบันทึกแค่ Metadata และ Active Session เท่านั้น
 */
async function performAutoSave() {
    const project = stateManager.getProject();
    if (!project || !project.id) {
        console.warn("[AutoSave] Aborted: Project not available for saving.");
        return false;
    }
    
    console.log('[AutoSave] Persisting essential data to IndexedDB...');
    try {
        // 1. บันทึก Metadata ของโปรเจกต์ (ซึ่งเร็วมาก)
        await persistProjectMetadata(); 
        
        // 2. บันทึกเฉพาะ Session ที่กำลังเปิดอยู่ (เร็วขึ้นมาก)
        await saveActiveSession();

        console.log('[AutoSave] Essential project state successfully persisted.');
        return true;
    } catch (error) {
        console.error('[AutoSave] Failed to persist project state:', error);
        return false;
    }
}


// [MODIFIED] แก้ไขฟังก์ชัน setupAutoSaveChanges ให้เรียกใช้ฟังก์ชันใหม่
export function setupAutoSaveChanges() {
    let saveTimeout;
    stateManager.bus.subscribe('autosave:required', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            if (stateManager.isAutoSaveDirty()) {
                // เรียกใช้ฟังก์ชัน Auto-save ตัวใหม่ที่เบากว่า
                const success = await performAutoSave();
                if (success) {
                    stateManager.setAutoSaveDirty(false);
                }
            }
        }, 2000); // หน่วงเวลา 2 วินาที
    });
}


// [NEW] เพิ่มฟังก์ชันนี้สำหรับอัปเดต Global Settings
export function updateGlobalSettings(settings) {
    const project = stateManager.getProject();
    if (!project.globalSettings) return;

    if (settings.fontFamily) {
        project.globalSettings.fontFamilySelect = settings.fontFamily;
        stateManager.bus.publish('ui:applyFontSettings');
    }
    if (settings.apiKey !== undefined) {
        project.globalSettings.apiKey = settings.apiKey;
        stateManager.bus.publish('api:loadModels');
    }
    if (settings.ollamaBaseUrl !== undefined) {
        project.globalSettings.ollamaBaseUrl = settings.ollamaBaseUrl;
    }
    
    stateManager.updateAndPersistState();
}

// [NEW] ฟังก์ชันเริ่มต้นสำหรับ "Open Project"
export function openProject() {
    // ตรวจสอบสถานะ dirty ก่อนเปิด dialog เลือกไฟล์
    if (stateManager.isUserDirty()) {
        // บันทึก action ที่จะทำหลังจาก user ตัดสินใจ (คือการเปิด dialog)
        stateManager.setState('pendingActionAfterSave', () => {
            document.getElementById('load-project-input').click();
        });
        showUnsavedChangesModal();
    } else {
        // ถ้าไม่มีอะไรค้างคา ก็เปิด dialog ได้เลย
        document.getElementById('load-project-input').click();
    }
}

export function initializeFirstProject() {
    const projectId = `proj_${Date.now()}`;
    const defaultAgentName = "Default Agent";
    
    // ดึงชื่อของ default memories มาสร้างเป็น array
    const defaultMemoryNames = defaultMemories.map(mem => mem.name);

    return {
        id: projectId,
        name: "Untitled Project",
        isDirtyForUser: false,
        activeEntity: { type: 'agent', name: defaultAgentName },
        agentPresets: { 
            [defaultAgentName]: { 
                ...defaultAgentSettings, 
                model: '', 
                // กำหนดให้ Default Agent มีความจำเหล่านี้เป็น Active โดยอัตโนมัติ
                activeMemories: defaultMemoryNames 
            } 
        },
        agentGroups: {},
        memories: JSON.parse(JSON.stringify(defaultMemories)), // คลัง Memory กลาง
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
    console.log("Proceeding with creating a new project...");
    try {
        // 1. สร้าง Object ของโปรเจกต์ใหม่
        const newProject = initializeFirstProject();

        // 2. เปิด/สร้าง DB ใหม่
        await openDb(newProject.id);

        // 3. ล้างข้อมูลเก่าใน DB
        await clearObjectStores([SESSIONS_STORE_NAME, METADATA_STORE_NAME]);

        // 4. [FIX] ใช้ Logic การโหลดข้อมูลที่สมบูรณ์เพื่อให้แน่ใจว่า UI ทั้งหมดถูกรีเซ็ต
        await loadProjectData(newProject, true); // true = โหลดจากไฟล์/สถานะใหม่

    } catch (error) {
        console.error("Failed to proceed with creating a new project:", error);
        showCustomAlert("Could not create a new project.", "Error");
    }
}

export function createNewProject() {
    if (stateManager.isUserDirty()) {
        stateManager.setState('pendingActionAfterSave', proceedWithCreatingNewProject);
        showUnsavedChangesModal();
    } else {
        proceedWithCreatingNewProject();
    }
}


export function handleFileSelectedForOpen(event) {
    const file = event.target.files[0];
    if (!file) {
        return; // ไม่ทำอะไรถ้าผู้ใช้กดยกเลิก
    }
    
    console.log(`[OpenProject] File selected: ${file.name}. Reading file...`);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const fileContent = e.target.result;
            console.log("[OpenProject] File read complete. Parsing JSON...");
            const data = JSON.parse(fileContent);
            
            if (!data.id || !data.name) {
                throw new Error("Invalid project file format.");
            }
            
            console.log(`[OpenProject] JSON parsed successfully for project: ${data.name}. Loading data...`);
            await loadProjectData(data, true); // true = โหลดจากไฟล์, จะมีการเขียนทับ DB

        } catch (error) {
            console.error("[OpenProject] Failed to load project:", error);
            showCustomAlert(`Error loading project: ${error.message}`, 'Error');
        }
    };
    reader.onerror = () => {
        console.error("[OpenProject] FileReader error.");
        showCustomAlert("Failed to read the selected file.", "Error");
    };
    reader.readAsText(file);
    
    // เคลียร์ค่า input เพื่อให้เลือกไฟล์เดิมซ้ำได้
    event.target.value = '';
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
        // Instead of directly showing, we publish an event for the UI module to handle.
        stateManager.bus.publish('ui:showSaveAsModal');
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
        
        stateManager.bus.publish('ui:hideSaveAsModal'); // This event might not be needed if save always closes it, but good for consistency.
        
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

// [REVISED] แก้ไข handleUnsavedChanges ให้รองรับ pendingAction ที่เป็นฟังก์ชัน
export async function handleUnsavedChanges(choice) {
    hideUnsavedChangesModal();
    const pendingAction = stateManager.getState().pendingActionAfterSave;
    stateManager.setState('pendingActionAfterSave', null);

    switch (choice) {
        case 'save':
            await saveProject(false); // saveProject จะจัดการเรียก pendingAction ที่ค้างไว้เอง
            break;
        case 'discard':
            if (typeof pendingAction === 'function') {
                await pendingAction();
            }
            break;
        case 'cancel':
        default:
            // ไม่ทำอะไร
            break;
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
    stateManager.bus.publish('api:loadModels');

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
    if (projectData.isDirtyForUser === undefined) {
        projectData.isDirtyForUser = true; // Assume dirty if flag is missing
    }

    // [FIX] Ensure all agent groups have a valid `agents` array.
    // This handles projects saved before the `agents` property was added to groups.
    if (projectData.agentGroups) {
        for (const groupName in projectData.agentGroups) {
            const group = projectData.agentGroups[groupName];
            if (group && !Array.isArray(group.agents)) {
                group.agents = [];
            }
        }
    }

    return projectData;
}


export async function selectEntity(type, name) {
    stateManager.setStagedEntity(null, false);

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
    
    // [FIX] เพิ่มการส่งสัญญาณให้ Session List วาดใหม่
    stateManager.bus.publish('session:listChanged');
}

export function handleStudioItemClick({ type, name }) {
    const clickedEntity = { type, name };
    const stagedEntity = stateManager.getStagedEntity();
    const activeEntity = stateManager.getProject().activeEntity;

    // --- CASE 1: คลิกที่ Item ที่ Staged อยู่แล้ว (สีเหลือง) ---
    // นี่คือการ "ยืนยัน" การเลือก
    if (stagedEntity && stagedEntity.name === name && stagedEntity.type === type) {
        // ส่ง Event ไปบอกระบบให้เลือก Entity นี้อย่างเป็นทางการ
        stateManager.bus.publish('entity:select', clickedEntity);
        return; // จบการทำงานทันที
    }

    // --- CASE 2: คลิกที่ Item ที่ Active อยู่แล้ว (สีเขียว) ---
    // การทำแบบนี้ควรจะยกเลิกการ Staging ของ Item อื่น (ถ้ามี)
    if (activeEntity && activeEntity.name === name && activeEntity.type === type) {
        stateManager.setStagedEntity(null); // ล้างตัวที่ Staged (สีเหลือง) ทิ้งไป
        return; // จบการทำงานทันที
    }

    // --- CASE 3: คลิกที่ Item อื่นๆ ที่ไม่ใช่ทั้งตัวที่ Staged หรือ Active ---
    // นี่คือการ "เริ่มต้น" Staging ใหม่
    stateManager.setStagedEntity(clickedEntity);
}
