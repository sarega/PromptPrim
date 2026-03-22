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
import { createNewChatSession, loadChatSession, saveAllSessions, saveActiveSession } from '../session/session.handlers.js';
import {
    ensureProjectFolders,
    normalizeSessionRagSettings,
    normalizeSessionContextMode
} from '../session/session.folder-utils.js';
import {
    ensureProjectWorlds,
    ensureProjectWorldChanges,
    ensureProjectBooks,
    normalizeChapterSessionMetadata
} from '../world/world.schema-utils.js';
import * as AuthService from '../auth/auth.service.js';
import * as ModelAccessService from '../models/model-access.service.js';
import * as UserService from '../user/user.service.js'; // <-- เพิ่ม Import นี้เข้ามา
import bundledDefaultProjectTemplate from './default-project.template.json';

const STAGED_ENTITY_TIMEOUT_MS = 10000;
let stagedEntityTimeoutHandle = null;
let stagedEntityDeadlineAt = null;
const DEFAULT_LEGACY_SESSION_SUMMARY_STATE = Object.freeze({
    activeSummaryId: null,
    summarizedUntilIndex: -1
});
const DEFAULT_LEGACY_GROUP_CHAT_STATE = Object.freeze({
    isRunning: false,
    awaitsUserInput: false,
    turnQueue: [],
    currentJob: null,
    jobQueue: [],
    error: null
});

function clearStagedEntityTimeout() {
    if (stagedEntityTimeoutHandle) {
        clearTimeout(stagedEntityTimeoutHandle);
        stagedEntityTimeoutHandle = null;
    }
    stagedEntityDeadlineAt = null;
}

function sameEntity(left, right) {
    return Boolean(
        left &&
        right &&
        left.type === right.type &&
        left.name === right.name
    );
}

function stageEntitySelection(entity) {
    clearStagedEntityTimeout();
    stagedEntityDeadlineAt = Date.now() + STAGED_ENTITY_TIMEOUT_MS;
    stateManager.setStagedEntity(entity);
    stagedEntityTimeoutHandle = setTimeout(() => {
        stagedEntityTimeoutHandle = null;
        stagedEntityDeadlineAt = null;
        stateManager.setStagedEntity(null);
    }, STAGED_ENTITY_TIMEOUT_MS);
}

export function getStagedEntityRemainingSeconds() {
    if (!stagedEntityDeadlineAt) return 0;
    return Math.max(0, Math.ceil((stagedEntityDeadlineAt - Date.now()) / 1000));
}

function normalizeProjectTimestamp(value, fallback = Date.now()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function createLegacyFallbackId(prefix = 'legacy', index = 0) {
    return `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLegacyMessageContent(rawContent, role = 'system') {
    if (Array.isArray(rawContent)) {
        const normalizedParts = rawContent.flatMap((part) => {
            if (!part || typeof part !== 'object' || Array.isArray(part)) return [];

            if (part.type === 'text') {
                return [{
                    type: 'text',
                    text: typeof part.text === 'string' ? part.text : ''
                }];
            }

            if (part.type === 'image_url') {
                const imageUrl = typeof part.url === 'string'
                    ? part.url
                    : (typeof part.image_url === 'string'
                        ? part.image_url
                        : (typeof part.image_url?.url === 'string' ? part.image_url.url : ''));
                if (!imageUrl.trim()) return [];
                return [{
                    type: 'image_url',
                    url: imageUrl
                }];
            }

            return [];
        });

        if (normalizedParts.length > 0) {
            return normalizedParts;
        }

        return role === 'user' ? '' : '[Legacy multimodal content unavailable]';
    }

    if (typeof rawContent === 'string') {
        return rawContent;
    }

    if (typeof rawContent === 'number' || typeof rawContent === 'boolean') {
        return String(rawContent);
    }

    if (rawContent && typeof rawContent === 'object') {
        if (typeof rawContent.text === 'string') {
            return rawContent.text;
        }
        if (Array.isArray(rawContent.parts)) {
            return normalizeLegacyMessageContent(rawContent.parts, role);
        }
        return '';
    }

    return '';
}

function normalizeLegacyChatMessage(message, index = 0, sessionId = '') {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
        return null;
    }

    const normalizedRole = ['user', 'assistant', 'system', 'tool'].includes(String(message.role || '').trim().toLowerCase())
        ? String(message.role).trim().toLowerCase()
        : 'system';
    const fallbackTimestamp = normalizeProjectTimestamp(message?.createdAt, Date.now());

    return {
        ...message,
        id: String(message.id || '').trim() || createLegacyFallbackId(`msg_${sessionId || 'session'}`, index),
        role: normalizedRole,
        content: normalizeLegacyMessageContent(message.content, normalizedRole),
        speaker: typeof message.speaker === 'string' ? message.speaker : '',
        timestamp: normalizeProjectTimestamp(message.timestamp, fallbackTimestamp),
        isLoading: message.isLoading === true,
        isError: message.isError === true,
        isSummary: message.isSummary === true,
        isSummaryMarker: message.isSummaryMarker === true,
        summaryLogId: typeof message.summaryLogId === 'string' && message.summaryLogId.trim()
            ? message.summaryLogId
            : null,
        rag: message.rag && typeof message.rag === 'object' && !Array.isArray(message.rag)
            ? message.rag
            : null,
        folderContext: message.folderContext && typeof message.folderContext === 'object' && !Array.isArray(message.folderContext)
            ? message.folderContext
            : null
    };
}

function normalizeLegacySummaryState(rawSummaryState, historyLength = 0) {
    const source = rawSummaryState && typeof rawSummaryState === 'object' && !Array.isArray(rawSummaryState)
        ? rawSummaryState
        : {};
    const parsedIndex = Number(source.summarizedUntilIndex);

    return {
        activeSummaryId: typeof source.activeSummaryId === 'string' && source.activeSummaryId.trim()
            ? source.activeSummaryId
            : null,
        summarizedUntilIndex: Number.isFinite(parsedIndex)
            ? Math.max(-1, Math.min(Math.round(parsedIndex), historyLength))
            : DEFAULT_LEGACY_SESSION_SUMMARY_STATE.summarizedUntilIndex
    };
}

function normalizeLegacyGroupChatState(rawGroupChatState) {
    const source = rawGroupChatState && typeof rawGroupChatState === 'object' && !Array.isArray(rawGroupChatState)
        ? rawGroupChatState
        : {};

    return {
        isRunning: source.isRunning === true,
        awaitsUserInput: source.awaitsUserInput === true,
        turnQueue: Array.isArray(source.turnQueue) ? source.turnQueue.filter(Boolean) : [],
        currentJob: source.currentJob && typeof source.currentJob === 'object' && !Array.isArray(source.currentJob)
            ? source.currentJob
            : null,
        jobQueue: Array.isArray(source.jobQueue) ? source.jobQueue.filter(Boolean) : [],
        error: typeof source.error === 'string' ? source.error : null
    };
}

function normalizeLegacyChatSession(session, index = 0) {
    const source = session && typeof session === 'object' && !Array.isArray(session) ? session : {};
    const createdAt = normalizeProjectTimestamp(source.createdAt, Date.now());
    const sessionId = String(source.id || '').trim() || createLegacyFallbackId('sid', index);
    const historySource = Array.isArray(source.history)
        ? source.history
        : (Array.isArray(source.messages) ? source.messages : []);
    const history = historySource
        .map((message, messageIndex) => normalizeLegacyChatMessage(message, messageIndex, sessionId))
        .filter(Boolean);

    return {
        ...source,
        id: sessionId,
        name: String(source.name || source.title || '').trim() || `Chat ${index + 1}`,
        history,
        composerContent: typeof source.composerContent === 'string' ? source.composerContent : '',
        createdAt,
        updatedAt: normalizeProjectTimestamp(source.updatedAt, createdAt),
        pinned: source.pinned !== undefined ? Boolean(source.pinned) : Boolean(source.isPinned),
        archived: Boolean(source.archived),
        summaryState: normalizeLegacySummaryState(source.summaryState, history.length),
        groupChatState: normalizeLegacyGroupChatState(source.groupChatState)
    };
}

function getPublicAssetUrlCandidates(assetName = '') {
    const safeAssetName = String(assetName || '').replace(/^\/+/, '');
    if (!safeAssetName) return [];

    const rawBase = typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
    const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
    const currentPageUrl = window.location.href;
    const candidates = [
        new URL(safeAssetName, `${window.location.origin}${normalizedBase}`).toString(),
        new URL(safeAssetName, currentPageUrl).toString(),
        new URL(safeAssetName, `${window.location.origin}/`).toString()
    ];

    return [...new Set(candidates)];
}

async function fetchPublicJsonAsset(assetName) {
    let lastError = null;

    for (const candidateUrl of getPublicAssetUrlCandidates(assetName)) {
        try {
            const response = await fetch(candidateUrl, { cache: 'no-store' });
            if (!response.ok) {
                lastError = new Error(`Could not fetch ${assetName}. Status: ${response.status}`);
                continue;
            }
            return await response.json();
        } catch (error) {
            lastError = error;
        }
    }

    if (assetName === 'default-project.prim') {
        return JSON.parse(JSON.stringify(bundledDefaultProjectTemplate));
    }

    throw lastError || new Error(`Could not fetch ${assetName}.`);
}


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
        const defaultProjectData = await fetchPublicJsonAsset('default-project.prim');
        
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

        const projectTemplate = await fetchPublicJsonAsset('default-project.prim');
        
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
    const currentUser = UserService.getCurrentUserProfile();
    const isSupabaseMode = AuthService.isSupabaseEnabled() && UserService.isBackendManagedProfile(currentUser);
    const usesPersonalKeys = UserService.usesPersonalApiKeys(currentUser);

    if (isSupabaseMode && !usesPersonalKeys) {
        try {
            await ModelAccessService.loadManagedPlanPresets();
            await ModelAccessService.loadBackendModelCatalog({ hydrateState: true });
        } catch (error) {
            console.error('Could not reload backend model access while opening the project.', error);
        }
    } else if (projectToLoad.globalSettings.apiKey || (import.meta.env.DEV && projectToLoad.globalSettings.ollamaBaseUrl)) {
        await loadAllProviderModels({ apiKey: projectToLoad.globalSettings.apiKey });
    }

    // 4. สร้าง Chat Session แรก (ถ้ายังไม่มี)
    projectToLoad = stateManager.getProject(); // ดึง state ล่าสุดที่อาจถูกแก้ไขโดย loadAllProviderModels
    const existingSessions = (projectToLoad.chatSessions || []).filter(s => s && !s.archived);
    if (existingSessions.length === 0) {
        createNewChatSession(); // ฟังก์ชันนี้จะไม่อัปเดต dirty flag แล้ว
    }

    // 5. [CRITICAL FIX] บันทึกทุกอย่างลง DB และตั้งค่าสถานะให้ "สะอาด"
    const finalInitializedProject = stateManager.getProject();
    finalInitializedProject.isDirtyForUser = false; // บังคับให้เป็นสถานะสะอาด
    await rewriteDatabaseWithProjectData(finalInitializedProject);

    // 6. โหลด Session ที่ถูกต้องเข้า UI
    const sessionToLoad = finalInitializedProject.chatSessions.find(s => s?.id === finalInitializedProject.activeSessionId) ||
                          [...finalInitializedProject.chatSessions].filter(s => s && !s.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (sessionToLoad) {
        try {
            loadChatSession(sessionToLoad.id);
        } catch (error) {
            console.error('Failed to load migrated session. Falling back to a new chat session.', error);
            createNewChatSession();
        }
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
    const currentUserName = currentUser?.userName || 'Unknown User';
    const safeProjectData = (projectData && typeof projectData === 'object') ? projectData : {};

    if (!safeProjectData.globalSettings || typeof safeProjectData.globalSettings !== 'object') {
        safeProjectData.globalSettings = {};
    }
    if (!safeProjectData.agentPresets || typeof safeProjectData.agentPresets !== 'object' || Array.isArray(safeProjectData.agentPresets)) {
        safeProjectData.agentPresets = {};
    }
    if (!safeProjectData.agentGroups || typeof safeProjectData.agentGroups !== 'object' || Array.isArray(safeProjectData.agentGroups)) {
        safeProjectData.agentGroups = {};
    }
    if (!Array.isArray(safeProjectData.chatSessions)) {
        safeProjectData.chatSessions = [];
    }
    if (!Array.isArray(safeProjectData.memories)) {
        safeProjectData.memories = defaultMemories.map((memory) => ({ ...memory }));
    } else {
        safeProjectData.memories = safeProjectData.memories
            .map((memory, index) => {
                if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return null;
                return {
                    name: String(memory.name || '').trim() || `Memory ${index + 1}`,
                    content: typeof memory.content === 'string' ? memory.content : ''
                };
            })
            .filter(Boolean);
    }
    if (!Array.isArray(safeProjectData.summaryLogs)) {
        safeProjectData.summaryLogs = [];
    } else {
        safeProjectData.summaryLogs = safeProjectData.summaryLogs
            .map((log, index) => {
                if (!log || typeof log !== 'object' || Array.isArray(log)) return null;
                return {
                    ...log,
                    id: String(log.id || '').trim() || createLegacyFallbackId('sum', index),
                    summary: String(log.summary || log.title || '').trim() || `Summary ${index + 1}`,
                    content: typeof log.content === 'string' ? log.content : '',
                    timestamp: normalizeProjectTimestamp(log.timestamp, Date.now()),
                    sourceSessionId: typeof log.sourceSessionId === 'string' ? log.sourceSessionId : null
                };
            })
            .filter(Boolean);
    }

    // 1. ซ่อม System Utility Agent (เหมือนเดิม)
    safeProjectData.globalSettings.systemUtilityAgent = Object.assign(
        {},
        defaultSystemUtilityAgent,
        safeProjectData.globalSettings.systemUtilityAgent
    );

    // 2. [CRITICAL FIX] ซ่อม Agent แต่ละตัวใน agentPresets
    if (safeProjectData.agentPresets) {
        for (const agentName in safeProjectData.agentPresets) {
            const agent = safeProjectData.agentPresets[agentName];
            
            // ใช้ Object.assign เพื่อนำค่า default ทั้งหมดมาเป็นพื้น
            const migratedAgent = Object.assign({}, defaultAgentSettings, agent);

            // ถ้ายังไม่มีข้อมูลผู้สร้าง ให้เติมชื่อผู้ใช้ปัจจุบันเข้าไป
            if (!migratedAgent.createdBy || migratedAgent.createdBy === 'Unknown User') {
                migratedAgent.createdBy = currentUserName;
            }
            // ถ้ายังไม่มีข้อมูลวันที่สร้าง ให้ใช้วันที่ปัจจุบัน
            if (!migratedAgent.createdAt) {
                migratedAgent.createdAt = Date.now();
            }
            if (!migratedAgent.modifiedAt) {
                migratedAgent.modifiedAt = migratedAgent.createdAt;
            }

            safeProjectData.agentPresets[agentName] = migratedAgent;
        }
    }

    // 3. ตรวจสอบ properties อื่นๆ ที่อาจจะเพิ่มมาในอนาคต (เหมือนเดิม)
    if (safeProjectData.isDirtyForUser === undefined) {
        safeProjectData.isDirtyForUser = true;
    }
    if (safeProjectData.agentGroups) {
        for (const groupName in safeProjectData.agentGroups) {
            const group = safeProjectData.agentGroups[groupName];
            if (group && !Array.isArray(group.agents)) {
                group.agents = [];
            }
        }
    }

    ensureProjectWorlds(safeProjectData);
    ensureProjectWorldChanges(safeProjectData);
    ensureProjectBooks(safeProjectData);

    if (Array.isArray(safeProjectData.chatSessions)) {
        const firstAgentName = Object.keys(safeProjectData.agentPresets || {})[0] || null;
        const firstGroupName = Object.keys(safeProjectData.agentGroups || {})[0] || null;
        const validBookIds = new Set((safeProjectData.books || []).map(book => book.id));

        const normalizeLinkedEntity = (entity) => {
            if (entity?.type === 'agent' && entity?.name && safeProjectData.agentPresets?.[entity.name]) {
                return { type: 'agent', name: entity.name };
            }
            if (entity?.type === 'group' && entity?.name && safeProjectData.agentGroups?.[entity.name]) {
                return { type: 'group', name: entity.name };
            }
            if (firstAgentName) return { type: 'agent', name: firstAgentName };
            if (firstGroupName) return { type: 'group', name: firstGroupName };
            return null;
        };
        const normalizeWorkspaceView = (workspaceView) => (
            workspaceView === 'composer' ? 'composer' : 'chat'
        );
        const normalizeComposerViewMode = (composerViewMode) => (
            composerViewMode === 'normal' ? 'normal' : 'maximized'
        );
        const normalizeComposerHeight = (composerHeight) => {
            const parsed = Number(composerHeight);
            return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
        };

        safeProjectData.chatSessions = safeProjectData.chatSessions
            .map((session, sessionIndex) => {
                const normalizedSession = normalizeLegacyChatSession(session, sessionIndex);
                const rawSettings = normalizedSession?.ragSettings || {};
                const normalizedLinkedEntity = normalizeLinkedEntity(normalizedSession?.linkedEntity);
                const normalizedChapterMetadata = normalizeChapterSessionMetadata(normalizedSession, { validBookIds });
                return {
                    ...normalizedSession,
                    workspaceView: normalizeWorkspaceView(normalizedSession?.workspaceView),
                    composerViewMode: normalizeComposerViewMode(normalizedSession?.composerViewMode),
                    composerHeight: normalizeComposerHeight(normalizedSession?.composerHeight),
                    linkedEntity: normalizedLinkedEntity,
                    folderId: typeof normalizedSession?.folderId === 'string' && normalizedSession.folderId.trim()
                        ? normalizedSession.folderId
                        : null,
                    contextMode: normalizeSessionContextMode(normalizedSession?.contextMode),
                    ragSettings: normalizeSessionRagSettings(rawSettings),
                    summaryState: normalizeLegacySummaryState(
                        normalizedSession.summaryState,
                        Array.isArray(normalizedSession.history) ? normalizedSession.history.length : 0
                    ),
                    groupChatState: normalizeLegacyGroupChatState(normalizedSession.groupChatState),
                    ...normalizedChapterMetadata
                };
            })
            .filter(Boolean);

        if (safeProjectData.chatSessions.length > 0) {
            const activeSession = safeProjectData.chatSessions.find(session => session.id === safeProjectData.activeSessionId)
                || safeProjectData.chatSessions[0];
            safeProjectData.activeSessionId = activeSession?.id || null;
            safeProjectData.activeEntity = activeSession?.linkedEntity
                ? { ...activeSession.linkedEntity }
                : normalizeLinkedEntity(safeProjectData.activeEntity);
        } else {
            safeProjectData.activeSessionId = null;
            safeProjectData.activeEntity = normalizeLinkedEntity(safeProjectData.activeEntity);
        }
    }

    ensureProjectFolders(safeProjectData);

    if (!safeProjectData.activeEntity || typeof safeProjectData.activeEntity !== 'object') {
        const fallbackAgentName = Object.keys(safeProjectData.agentPresets || {})[0] || null;
        const fallbackGroupName = Object.keys(safeProjectData.agentGroups || {})[0] || null;
        safeProjectData.activeEntity = fallbackAgentName
            ? { type: 'agent', name: fallbackAgentName }
            : (fallbackGroupName ? { type: 'group', name: fallbackGroupName } : null);
    }

    if (!Array.isArray(safeProjectData.knowledgeFiles)) {
        safeProjectData.knowledgeFiles = [];
    } else {
        safeProjectData.knowledgeFiles = safeProjectData.knowledgeFiles.map(file => ({
            id: file.id || `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            name: file.name || 'Untitled',
            type: file.type || 'application/octet-stream',
            size: Number.isFinite(file.size) ? file.size : 0,
            uploadedAt: file.uploadedAt || Date.now(),
            source: file.source || 'upload',
            status: file.status || 'uploaded',
            textContent: typeof file.textContent === 'string' ? file.textContent : '',
            excerpt: typeof file.excerpt === 'string' ? file.excerpt : '',
            note: typeof file.note === 'string' ? file.note : '',
            lastModified: Number.isFinite(file.lastModified) ? file.lastModified : 0,
            chunkCount: Number.isFinite(file.chunkCount) ? file.chunkCount : 0,
            indexedAt: Number.isFinite(file.indexedAt) ? file.indexedAt : null,
            embeddingModel: typeof file.embeddingModel === 'string' ? file.embeddingModel : ''
        }));
    }

    const knowledgeFileIdSet = new Set(safeProjectData.knowledgeFiles.map(file => file.id));
    if (Array.isArray(safeProjectData.chatSessions)) {
        safeProjectData.chatSessions = safeProjectData.chatSessions.map(session => ({
            ...session,
            ragSettings: {
                ...session.ragSettings,
                selectedFileIds: (session.ragSettings?.selectedFileIds || []).filter(id => knowledgeFileIdSet.has(id))
            }
        }));
    }
    if (Array.isArray(safeProjectData.chatFolders)) {
        safeProjectData.chatFolders = safeProjectData.chatFolders.map(folder => ({
            ...folder,
            ragSettings: {
                ...folder.ragSettings,
                selectedFileIds: (folder.ragSettings?.selectedFileIds || []).filter(id => knowledgeFileIdSet.has(id))
            }
        }));
    }

    const defaultKnowledgeIndex = {
        version: 1,
        embeddingModel: 'local-hash-v1',
        dimensions: 128,
        updatedAt: Date.now(),
        chunks: []
    };

    if (!projectData.knowledgeIndex || typeof projectData.knowledgeIndex !== 'object') {
        projectData.knowledgeIndex = { ...defaultKnowledgeIndex };
    } else {
        const source = projectData.knowledgeIndex;
        projectData.knowledgeIndex = {
            version: Number.isFinite(source.version) ? source.version : defaultKnowledgeIndex.version,
            embeddingModel: source.embeddingModel || defaultKnowledgeIndex.embeddingModel,
            dimensions: Number.isFinite(source.dimensions) ? source.dimensions : defaultKnowledgeIndex.dimensions,
            updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : defaultKnowledgeIndex.updatedAt,
            chunks: Array.isArray(source.chunks)
                ? source.chunks.map((chunk, index) => ({
                    id: chunk.id || `kc_${Date.now()}_${index}`,
                    fileId: chunk.fileId || '',
                    fileName: chunk.fileName || 'Unknown',
                    chunkIndex: Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex : index,
                    text: typeof chunk.text === 'string' ? chunk.text : '',
                    charCount: Number.isFinite(chunk.charCount) ? chunk.charCount : 0,
                    tokenEstimate: Number.isFinite(chunk.tokenEstimate) ? chunk.tokenEstimate : 0,
                    vector: Array.isArray(chunk.vector) ? chunk.vector : [],
                    embeddingModel: chunk.embeddingModel || source.embeddingModel || defaultKnowledgeIndex.embeddingModel,
                    createdAt: Number.isFinite(chunk.createdAt) ? chunk.createdAt : Date.now()
                }))
                : []
        };
    }

    const chunkCountByFileId = new Map();
    for (const chunk of projectData.knowledgeIndex.chunks) {
        if (!chunk.fileId) continue;
        chunkCountByFileId.set(chunk.fileId, (chunkCountByFileId.get(chunk.fileId) || 0) + 1);
    }

    projectData.knowledgeFiles = projectData.knowledgeFiles.map(file => {
        const indexedChunkCount = chunkCountByFileId.get(file.id) || 0;
        const normalizedStatus = file.status || 'uploaded';
        const status = normalizedStatus === 'ready'
            ? 'indexed'
            : (normalizedStatus === 'error' ? 'failed' : normalizedStatus);
        return {
            ...file,
            chunkCount: Number.isFinite(file.chunkCount) && file.chunkCount > 0 ? file.chunkCount : indexedChunkCount,
            status: indexedChunkCount > 0 && !['failed', 'binary'].includes(status) ? 'indexed' : status
        };
    });
    
    // [FIX END]
    return safeProjectData;
}


export async function selectEntity(type, name) {
    clearStagedEntityTimeout();
    stateManager.setStagedEntity(null, false);

    const project = stateManager.getProject();
    // [FIX] Be more specific about which agents trigger Photo Studio
    // Only exact match for "Visual Studio" or agents with KieAI/Wan/Seedance in their names
    // This prevents false positives from agents that happen to contain "Visual" in their name
    const isKieAIAgent = type === 'agent' && (
        name === 'Media Studio' ||
        name === 'Visual Studio' ||
        name.includes('KieAI') ||
        name.includes('Veo') ||
        name.includes('Flux') ||
        name.includes('Wan') ||
        name.includes('Seedance')
    );

    if (isKieAIAgent && !UserService.canUseMediaStudio()) {
        showCustomAlert(
            'Media Studio is available only in Studio Plan / BYOK mode. Pro is for hosted text workflow, and Free is trial-only.',
            'Studio Plan Required'
        );
        return;
    }

    const entityExists = (
        (type === 'agent' && Boolean(project.agentPresets?.[name])) ||
        (type === 'group' && Boolean(project.agentGroups?.[name]))
    );

    project.activeEntity = { type, name };
    const activeSession = project.chatSessions.find(s => s.id === project.activeSessionId);

    // Only persist as session linked entity when this is a real chat entity.
    // Special workspace-only entities (e.g. Visual Studio) should not overwrite
    // the session's chat routing target.
    if (activeSession && entityExists) {
        if (activeSession.groupChatState) activeSession.groupChatState.isRunning = false;
        activeSession.linkedEntity = { ...project.activeEntity };
        activeSession.updatedAt = Date.now();
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    
    // [FIX] Only publish entity:selected once with all the information
    stateManager.bus.publish('entity:selected', { type, name, isKieAI: isKieAIAgent });
    
    // [FIX] เพิ่มการส่งสัญญาณให้ Session List วาดใหม่
    stateManager.bus.publish('session:listChanged');
}

export function applyStagedEntitySelection() {
    const stagedEntity = stateManager.getStagedEntity();
    if (!stagedEntity) return;

    clearStagedEntityTimeout();
    stateManager.setStagedEntity(null, false);
    stateManager.bus.publish('entity:select', stagedEntity);
}

export function cancelStagedEntitySelection() {
    clearStagedEntityTimeout();
    stateManager.setStagedEntity(null);
}

export function handleStudioItemClick({ type, name }) {
    const clickedEntity = { type, name };
    const stagedEntity = stateManager.getStagedEntity();
    const activeEntity = stateManager.getProject().activeEntity;

    // CASE 1: click current active = keep current active and clear pending.
    if (sameEntity(activeEntity, clickedEntity)) {
        cancelStagedEntitySelection();
        return;
    }

    // CASE 2: click the same pending entity again = confirm switch.
    if (sameEntity(stagedEntity, clickedEntity)) {
        applyStagedEntitySelection();
        return;
    }

    // CASE 3: first click on a non-active entity = stage for confirmation.
    stageEntitySelection(clickedEntity);
}
