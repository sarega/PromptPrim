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

import { openDb, dbRequest, clearObjectStores, deleteDb } from '../../core/core.db.js';
import { loadAllProviderModels } from '../../core/core.api.js';
import { showCustomAlert, showUnsavedChangesModal, hideUnsavedChangesModal } from '../../core/core.ui.js';
import { scrollToLinkedEntity } from './project.ui.js';
import { createNewChatSession, loadChatSession, saveAllSessions, saveActiveSession } from '../session/session.handlers.js';
import * as UserService from '../user/user.service.js'; // <-- เพิ่ม Import นี้เข้ามา


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

async function initializeFirstProject() {
    try {
        // [DEFINITIVE FIX] ใช้ import.meta.env.BASE_URL เพื่อสร้าง Path ที่ถูกต้อง
        // บน localhost: จะเป็น '/default-project.prim'
        // บน GitHub: จะเป็น '/PromptPrimAi/default-project.prim'
        const response = await fetch(`${import.meta.env.BASE_URL}default-project.prim`);

        if (!response.ok) {
            throw new Error(`Could not fetch default project file. Status: ${response.status}`);
        }
        
        const defaultProjectData = await response.json();
        
        // กำหนด ID ใหม่ที่เป็น Unique ให้กับโปรเจกต์
        defaultProjectData.id = `proj_${Date.now()}`;

        return defaultProjectData;

    } catch (error) {
        console.error("Fatal error: Could not initialize default project.", error);
        showCustomAlert("Critical Error: Could not load the default project template. The app cannot start.", "Error");
        return null;
    }
}

export async function proceedWithCreatingNewProject() {
    console.log("Proceeding with creating a new project...");
    try {
        const lastProjectId = localStorage.getItem('lastActiveProjectId');
        if (lastProjectId) {
            await deleteDb(lastProjectId);
            localStorage.removeItem('lastActiveProjectId');
        }

        const response = await fetch(`${import.meta.env.BASE_URL}default-project.prim`);
        if (!response.ok) {
            throw new Error(`Could not fetch default project file. Status: ${response.status}`);
        }
        
        const projectTemplate = await response.json();
        
        // --- [DEFINITIVE FIX] ---
        // 1. ดึง User Settings ที่สมบูรณ์ออกมา
        const userSettings = UserService.getUserSettings();

        // 2. นำค่าเริ่มต้นของ System Agent จาก User Settings ไปใส่ในโปรเจกต์ใหม่
        if (userSettings && userSettings.systemAgentDefaults) {
            projectTemplate.globalSettings.systemUtilityAgent = userSettings.systemAgentDefaults.utilityAgent;
            projectTemplate.globalSettings.summarizationPromptPresets = userSettings.systemAgentDefaults.summarizationPresets;
        }
        // -------------------------
        projectTemplate.globalSettings.summarizationPromptPresets = { ...defaultSummarizationPresets };
        projectTemplate.id = `proj_${Date.now()}`;
        
        await openDb(projectTemplate.id);
        await loadProjectData(projectTemplate, true);

    } catch (error) {
        console.error("Failed to proceed with creating a new project:", error);
        showCustomAlert("Could not create a new project. Please check the browser console for more details.", "Error");
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
    
    stateManager.setUserDirty(false);
    
    // [SECURITY FIX] สร้าง Deep Copy และลบข้อมูลที่ไม่ควรบันทึก
    const projectToSave = JSON.parse(JSON.stringify(stateManager.getProject()));
    /* [DEV-MODE] Temporarily disabled key deletion for easier development.
    if (projectToSave.globalSettings) {
        delete projectToSave.globalSettings.apiKey;
        delete projectToSave.globalSettings.ollamaBaseUrl;
    }
    */
    
    const migratedProjectToSave = migrateProjectData(projectToSave);
    
    try {
        const dataStr = JSON.stringify(migratedProjectToSave, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        // [CUSTOM EXTENSION] เปลี่ยนนามสกุลเป็น .prim
        a.download = `${newName.replace(/[^a-z0-9\u0E00-\u0E7F]/gi, '_').toLowerCase()}.prim`;
        
        a.href = url;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        stateManager.bus.publish('ui:hideSaveAsModal');
        stateManager.setAutoSaveDirty(false);
        await persistCurrentProject();

        if (stateManager.getState().pendingActionAfterSave) {
            await performPendingAction();
        }
        return true;
    } catch (error) {
        console.error("Failed to save project:", error);
        showCustomAlert('Failed to save project file.', 'Error');
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
    let projectToLoad = migrateProjectData(projectData);
    await openDb(projectToLoad.id);

    if (isFromFile) {
        projectToLoad.isDirtyForUser = false;
    }

    // [THE FIX] This block ensures that EVERY project, old or new, has the factory presets.
    if (projectToLoad.globalSettings) {
        // We merge the factory defaults with any existing user presets.
        // The user's presets will overwrite the factory ones if they have the same name, which is desired.
        projectToLoad.globalSettings.summarizationPromptPresets = {
            ...defaultSummarizationPresets,
            ...(projectToLoad.globalSettings.summarizationPromptPresets || {})
        };
    }
    // --- [REWRITTEN LOGIC] ---
    // 1. ตั้งค่า State เริ่มต้นใน Memory
    stateManager.setProject(projectToLoad);

    // 2. โหลด Settings ต่างๆ เข้า UI
    await loadGlobalSettings();

    // 3. โหลดรายชื่อ Model (ซึ่งอาจจะไปแก้ไข project state ใน memory)
    if (projectToLoad.globalSettings.apiKey || (import.meta.env.DEV && projectToLoad.globalSettings.ollamaBaseUrl)) {
        await loadAllProviderModels({ apiKey: projectToLoad.globalSettings.apiKey });
    }

    // 4. สร้าง Chat Session แรก (ถ้ายังไม่มี)
    projectToLoad = stateManager.getProject(); // ดึง state ล่าสุดที่อาจถูกแก้ไขโดย loadAllProviderModels
    const existingSessions = (projectToLoad.chatSessions || []).filter(s => !s.archived);
    if (existingSessions.length === 0) {
        createNewChatSession(); // ฟังก์ชันนี้จะไม่อัปเดต dirty flag แล้ว
    }

    // 5. [CRITICAL FIX] บันทึกทุกอย่างลง DB และตั้งค่าสถานะให้ "สะอาด"
    const finalInitializedProject = stateManager.getProject();
    finalInitializedProject.isDirtyForUser = false; // บังคับให้เป็นสถานะสะอาด
    await rewriteDatabaseWithProjectData(finalInitializedProject);

    // 6. โหลด Session ที่ถูกต้องเข้า UI
    const sessionToLoad = finalInitializedProject.chatSessions.find(s => s.id === finalInitializedProject.activeSessionId) ||
                          [...finalInitializedProject.chatSessions].filter(s => !s.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (sessionToLoad) {
        loadChatSession(sessionToLoad.id);
    }

    // 7. ประกาศว่าโหลดโปรเจกต์เสร็จสมบูรณ์แล้ว
    stateManager.bus.publish('project:loaded', { projectData: finalInitializedProject });
    stateManager.bus.publish('userDirty:changed', false); // ส่งสัญญาณบอก UI ว่าไม่ dirty
    stateManager.setAutoSaveDirty(false); // รีเซ็ตสถานะ auto-save
    localStorage.setItem('lastActiveProjectId', finalInitializedProject.id);
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

    // หน้าที่เดียวของฟังก์ชันนี้คือการสั่งให้ UI ที่เกี่ยวข้องไปอัปเดตตัวเอง
    // โดยเฉพาะฟอนต์ ซึ่งเป็นสิ่งเดียวที่ต้องมีผลทันทีทั่วทั้งแอป
    stateManager.bus.publish('ui:applyFontSettings');
    
    // เราจะไม่ยุ่งกับ Element ของ Settings Panel จากที่นี่อีกต่อไป
    // ปล่อยให้เป็นหน้าที่ของ settings.ui.js จัดการตัวเอง
    console.log("Global settings loaded into state.");
}

export function handleFontChange(font) {
    const project = stateManager.getProject();
    project.globalSettings.fontFamilySelect = font;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:applyFontSettings');
}


export function saveSystemUtilityAgentSettings() {
    const project = stateManager.getProject();
    if (!project.globalSettings) return;

    const agentSettings = project.globalSettings.systemUtilityAgent;

    // ดึงค่าจาก input ทั่วไป
    agentSettings.model = document.getElementById('system-utility-model-select').value;
    agentSettings.systemPrompt = document.getElementById('system-utility-prompt').value;
    
    // ดึงค่าจาก Component
    const editor = stateManager.getState().systemParameterEditor;
    const advancedParams = editor ? editor.getValues() : {};
    
    // รวมค่า Parameters เข้าไปใน object หลัก
    Object.assign(agentSettings, advancedParams);

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    
    showCustomAlert("System Agent settings saved!", "Success");
}

export function migrateProjectData(projectData) {
    const currentUser = UserService.getCurrentUserProfile();

    // 1. ซ่อม System Utility Agent (เหมือนเดิม)
    projectData.globalSettings.systemUtilityAgent = Object.assign(
        {},
        defaultSystemUtilityAgent,
        projectData.globalSettings.systemUtilityAgent
    );

    // 2. [CRITICAL FIX] ซ่อม Agent แต่ละตัวใน agentPresets
    if (projectData.agentPresets) {
        for (const agentName in projectData.agentPresets) {
            const agent = projectData.agentPresets[agentName];
            
            // ใช้ Object.assign เพื่อนำค่า default ทั้งหมดมาเป็นพื้น
            const migratedAgent = Object.assign({}, defaultAgentSettings, agent);

            // ถ้ายังไม่มีข้อมูลผู้สร้าง ให้เติมชื่อผู้ใช้ปัจจุบันเข้าไป
            if (!migratedAgent.createdBy || migratedAgent.createdBy === 'Unknown User') {
                migratedAgent.createdBy = currentUser.userName;
            }
            // ถ้ายังไม่มีข้อมูลวันที่สร้าง ให้ใช้วันที่ปัจจุบัน
            if (!migratedAgent.createdAt) {
                migratedAgent.createdAt = Date.now();
            }
            if (!migratedAgent.modifiedAt) {
                migratedAgent.modifiedAt = migratedAgent.createdAt;
            }

            projectData.agentPresets[agentName] = migratedAgent;
        }
    }

    // 3. ตรวจสอบ properties อื่นๆ ที่อาจจะเพิ่มมาในอนาคต (เหมือนเดิม)
    if (projectData.isDirtyForUser === undefined) {
        projectData.isDirtyForUser = true;
    }
    if (projectData.agentGroups) {
        for (const groupName in projectData.agentGroups) {
            const group = projectData.agentGroups[groupName];
            if (group && !Array.isArray(group.agents)) {
                group.agents = [];
            }
        }
    }
    
    // [FIX END]
    return projectData;
}


export async function selectEntity(type, name) {
    stateManager.setStagedEntity(null, false);

    const project = stateManager.getProject();
    // Expanded detection of Kie.ai / Visual Studio agents.  Treat any agent
    // name that contains KieAI, Veo, Flux, Visual, Wan or Seedance as a
    // photo-studio-capable agent.  This allows the renamed "Visual Studio"
    // agent to be handled like the original KieAI Visual Studio.
    const isKieAIAgent = type === 'agent' && (
        name.includes('KieAI') ||
        name.includes('Veo') ||
        name.includes('Flux') ||
        name.includes('Visual') ||
        name.includes('Wan') ||
        name.includes('Seedance')
    );

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
    // [✅ NEW: ส่ง isKieAI Flag]
    stateManager.bus.publish('entity:selected', { type, name, isKieAI: isKieAIAgent });
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