// ===============================================
// FILE: src/js/modules/session/session.handlers.js
// DESCRIPTION: Handles all logic related to creating, loading,
//              and managing chat sessions.
// ===============================================

// --- Core Imports ---
import { showCustomAlert } from '../../core/core.ui.js';
import { stateManager, SESSIONS_STORE_NAME } from '../../core/core.state.js';
import { formatTimestamp } from '../../core/core.utils.js'; // <-- ตรวจสอบว่ามีบรรทัดนี้
import { getDb, dbRequest } from '../../core/core.db.js';
import {
    DEFAULT_SESSION_CONTEXT_MODE,
    DEFAULT_SESSION_RAG_SETTINGS,
    createFolderId,
    createFolderName,
    ensureProjectFolders,
    getFolderById,
    normalizeFolderContextPolicy,
    normalizeFolderRagSettings,
    normalizeSessionContextMode,
    normalizeSessionRagSettings
} from './session.folder-utils.js';


// --- UI Module Imports ---
// These modules are responsible for updating the user interface.
import * as SessionUI from './session.ui.js';
import * as ChatUI from '../chat/chat.ui.js';
import * as ComposerUI from '../composer/composer.ui.js';


// --- Helper Functions ---

/**
 * Generates a unique identifier string with a given prefix.
 * @param {string} [prefix='sid'] - The prefix for the ID.
 * @returns {string} A unique ID.
 */
const generateUniqueId = (prefix = 'sid') => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

/**
 * A helper function to get the currently active project from the state.
 * @returns {object|null} The active project object or null.
 */
const getActiveProject = () => stateManager.getProject();

function getSessionById(project, sessionId) {
    if (!project || !sessionId) return null;
    return project.chatSessions?.find(session => session.id === sessionId) || null;
}

function resolveDefaultFolderId(project, explicitFolderId = null) {
    if (!project) return null;
    if (explicitFolderId && getFolderById(project, explicitFolderId)) {
        return explicitFolderId;
    }

    const activeSession = getSessionById(project, project.activeSessionId);
    if (activeSession?.folderId && getFolderById(project, activeSession.folderId)) {
        return activeSession.folderId;
    }

    if (project.activeFolderId && getFolderById(project, project.activeFolderId)) {
        return project.activeFolderId;
    }

    return null;
}

function publishSessionStructureChanged() {
    stateManager.bus.publish('session:listChanged');
    stateManager.bus.publish('studio:contentShouldRender');
}

function isValidEntity(project, entity) {
    if (!project || !entity || !entity.type || !entity.name) return false;
    if (entity.type === 'agent') return Boolean(project.agentPresets?.[entity.name]);
    if (entity.type === 'group') return Boolean(project.agentGroups?.[entity.name]);
    return false;
}

function getFallbackEntity(project) {
    const firstAgent = Object.keys(project?.agentPresets || {})[0];
    if (firstAgent) return { type: 'agent', name: firstAgent };
    const firstGroup = Object.keys(project?.agentGroups || {})[0];
    if (firstGroup) return { type: 'group', name: firstGroup };
    return null;
}

function resolveEntityForSession(project, session) {
    const candidates = [session?.linkedEntity, project?.activeEntity, getFallbackEntity(project)];
    const resolved = candidates.find(entity => isValidEntity(project, entity));
    if (!resolved) return { entity: null, changed: false };

    const normalized = { type: resolved.type, name: resolved.name };
    let changed = false;

    if (session && (!session.linkedEntity || session.linkedEntity.type !== normalized.type || session.linkedEntity.name !== normalized.name)) {
        session.linkedEntity = { ...normalized };
        changed = true;
    }

    if (!project.activeEntity || project.activeEntity.type !== normalized.type || project.activeEntity.name !== normalized.name) {
        project.activeEntity = { ...normalized };
        changed = true;
    }

    return { entity: normalized, changed };
}

function getSessionSortIndex(session, fallback = 0) {
    const parsed = Number(session?.sortIndex);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function sortSessionsByManualOrder(a, b) {
    const orderDiff = getSessionSortIndex(a) - getSessionSortIndex(b);
    if (orderDiff !== 0) return orderDiff;
    return (b?.updatedAt || 0) - (a?.updatedAt || 0);
}

function getActiveGroupSessions(project, folderId, excludeSessionId = null) {
    return (project?.chatSessions || [])
        .filter(session => {
            if (!session || session.archived) return false;
            if (excludeSessionId && session.id === excludeSessionId) return false;
            return (session.folderId || null) === (folderId || null);
        })
        .sort(sortSessionsByManualOrder);
}

function normalizeGroupOrdering(project, folderId) {
    const grouped = getActiveGroupSessions(project, folderId);
    grouped.forEach((session, index) => {
        session.sortIndex = index;
    });
}

function getTopSortIndexForGroup(project, folderId) {
    const grouped = getActiveGroupSessions(project, folderId);
    if (grouped.length === 0) return 0;
    const minSort = Math.min(...grouped.map((session, index) => getSessionSortIndex(session, index)));
    return minSort - 1;
}

function placeSessionInGroupOrder(project, movingSession, folderId, targetSessionId = null, position = 'after') {
    const grouped = getActiveGroupSessions(project, folderId, movingSession.id);
    let insertIndex = grouped.length;

    if (targetSessionId) {
        const targetIndex = grouped.findIndex(item => item.id === targetSessionId);
        if (targetIndex >= 0) {
            insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
        }
    }

    grouped.splice(insertIndex, 0, movingSession);
    grouped.forEach((session, index) => {
        session.sortIndex = index;
    });
}

// --- Primary Session Handlers ---

/**
 * Creates a new, empty chat session, adds it to the project,
 * persists the state, and loads it into the UI.
 */
export function createNewChatSession(payload = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);
    const activeEntity = resolveEntityForSession(project, { linkedEntity: project.activeEntity }).entity;
    if (!activeEntity) {
        showCustomAlert("Cannot create chat session: no valid Agent/Group is available.", "Error");
        return;
    }

    const resolvedFolderId = resolveDefaultFolderId(project, payload?.folderId || null);
    const contextMode = normalizeSessionContextMode(payload?.contextMode || DEFAULT_SESSION_CONTEXT_MODE);
    const ragSettings = normalizeSessionRagSettings({
        ...DEFAULT_SESSION_RAG_SETTINGS,
        scopeSource: resolvedFolderId ? 'folder' : 'session',
        ...(payload?.ragSettings || {})
    });

    const newSession = {
        id: `sid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: 'New Chat',
        history: [], // Explicit initialization
        composerContent: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        archived: false,
        folderId: resolvedFolderId,
        sortIndex: getTopSortIndexForGroup(project, resolvedFolderId),
        contextMode,
        linkedEntity: { ...activeEntity },
        summaryState: {
            activeSummaryId: null,
            summarizedUntilIndex: -1
        }, // Comma required between object properties
        ragSettings,
        groupChatState: {
            isRunning: false,
            awaitsUserInput: false,
            turnQueue: [],
            currentJob: null,
            jobQueue: [],
            error: null
        }
    };

    project.chatSessions.unshift(newSession);
    project.activeSessionId = newSession.id;
    project.activeFolderId = resolvedFolderId || null;

    // [FIX] เปลี่ยนจากการสั่ง save มาเป็นการ set state ใน memory เท่านั้น
    stateManager.setProject(project);
    
    // โหลด session ใหม่เข้า UI (ฟังก์ชันนี้ปลอดภัย)
    loadChatSession(newSession.id);
}

export function loadChatSession(sessionId) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    // --- กรณีไม่มี sessionId, ทำการเคลียร์หน้าจอ ---
    if (!sessionId) {
        project.activeSessionId = null;
        project.activeFolderId = null;
        stateManager.setProject(project); // อัปเดต state
        stateManager.bus.publish('session:cleared'); // ส่ง event สำหรับเคลียร์หน้าจอ
        return;
    }
    
    const session = project.chatSessions.find(s => s.id === sessionId);

    // --- กรณีหา session ไม่เจอ, โหลดอันล่าสุดแทน ---
    if (!session) {
        console.warn(`Session with ID ${sessionId} not found. Loading most recent as fallback.`);
        const fallbackSession = [...project.chatSessions]
            .filter(s => !s.archived)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        // เรียกตัวเองซ้ำด้วย ID ที่ถูกต้อง (ถ้ามี)
        loadChatSession(fallbackSession ? fallbackSession.id : null);
        return;
    }

    // --- ขั้นตอนหลัก: อัปเดต State และประกาศ Event ---
    const { entity: resolvedEntity } = resolveEntityForSession(project, session);
    if (!resolvedEntity) {
        showCustomAlert("Cannot load this session because it has no valid linked Agent/Group.", "Error");
        return;
    }

    session.contextMode = normalizeSessionContextMode(session.contextMode);
    session.ragSettings = normalizeSessionRagSettings(session.ragSettings, {
        scopeSource: session.folderId ? 'folder' : 'session'
    });
    if (!session.folderId && session.ragSettings.scopeSource === 'folder') {
        session.ragSettings.scopeSource = 'session';
    }

    project.activeSessionId = sessionId;
    project.activeFolderId = session.folderId || null;

    stateManager.setProject(project); // อัปเดต state ทั้งหมดในครั้งเดียว
    stateManager.updateAndPersistState(); // สั่งบันทึก state ที่เปลี่ยนไป
    
    // [สำคัญที่สุด] ส่ง Event กลางออกไปเพียง Event เดียว
    // เพื่อให้ UI module ต่างๆ ไปดักฟังและทำงานของตัวเองตามลำดับ
    stateManager.bus.publish('session:loaded', { session });
}

/**
 * Renames a chat session after prompting the user for a new name.
 * @param {string} sessionId - The ID of the session to rename.
 * @param {Event} [event] - The click event, to stop propagation.
 * @param {string} [newNameFromPrompt=null] - An optional new name passed directly.
 */
export function renameChatSession({ sessionId }) {
    const project = stateManager.getProject();
    const session = project?.chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    const newName = prompt("Enter new name:", session.name);
    
    if (newName && newName.trim() && newName.trim() !== session.name) {
        session.name = newName.trim();
        session.updatedAt = Date.now();
        stateManager.updateAndPersistState();
        
        stateManager.bus.publish('session:listChanged');
        if (sessionId === project.activeSessionId) {
            stateManager.bus.publish('ui:updateChatTitle', { title: session.name });
        }
    }
}

export function createSessionFolder(payload = {}) {
    const project = stateManager.getProject();
    if (!project) return null;
    ensureProjectFolders(project);

    const suggestedName = payload?.name || createFolderName(project.chatFolders, 'New Folder');
    const shouldPrompt = payload?.askName !== false;
    const rawName = shouldPrompt
        ? prompt('Folder name:', suggestedName)
        : suggestedName;

    if (!rawName || !rawName.trim()) return null;

    const nameCandidate = rawName.trim();
    const existingName = project.chatFolders.find(folder => folder.name.toLowerCase() === nameCandidate.toLowerCase());
    const folderName = existingName
        ? createFolderName(project.chatFolders, nameCandidate)
        : nameCandidate;
    const now = Date.now();

    const folder = {
        id: createFolderId(),
        name: folderName,
        color: '',
        createdAt: now,
        updatedAt: now,
        collapsed: false,
        ragSettings: normalizeFolderRagSettings(payload?.ragSettings),
        contextPolicy: normalizeFolderContextPolicy(payload?.contextPolicy)
    };

    project.chatFolders.unshift(folder);
    project.activeFolderId = folder.id;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    publishSessionStructureChanged();
    return folder;
}

export function renameSessionFolder({ folderId, name } = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const folder = getFolderById(project, folderId);
    if (!folder) return;

    const rawName = typeof name === 'string'
        ? name
        : prompt('Rename folder:', folder.name);
    if (!rawName || !rawName.trim()) return;

    const trimmedName = rawName.trim();
    const duplicate = project.chatFolders.find(item =>
        item.id !== folder.id &&
        item.name.toLowerCase() === trimmedName.toLowerCase()
    );

    folder.name = duplicate ? createFolderName(project.chatFolders, trimmedName) : trimmedName;
    folder.updatedAt = Date.now();
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    publishSessionStructureChanged();
}

export function deleteSessionFolder({ folderId }) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const folder = getFolderById(project, folderId);
    if (!folder) return;

    const confirmed = confirm(`Delete folder "${folder.name}"? Sessions will be moved to the main list.`);
    if (!confirmed) return;

    project.chatFolders = project.chatFolders.filter(item => item.id !== folderId);
    project.chatSessions = project.chatSessions.map(session => {
        if (session.folderId !== folderId) return session;
        const ragSettings = normalizeSessionRagSettings(session.ragSettings, {
            scopeSource: 'session'
        });
        ragSettings.scopeSource = 'session';
        return {
            ...session,
            folderId: null,
            ragSettings
        };
    });

    if (project.activeFolderId === folderId) {
        project.activeFolderId = null;
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    publishSessionStructureChanged();
}

export function updateSessionFolderSettings({ folderId, name, contextPolicy, ragSettings } = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const folder = getFolderById(project, folderId);
    if (!folder) return;

    if (typeof name === 'string' && name.trim()) {
        const trimmedName = name.trim();
        const duplicate = project.chatFolders.find(item =>
            item.id !== folder.id &&
            item.name.toLowerCase() === trimmedName.toLowerCase()
        );
        folder.name = duplicate ? createFolderName(project.chatFolders, trimmedName) : trimmedName;
    }

    if (contextPolicy && typeof contextPolicy === 'object') {
        folder.contextPolicy = normalizeFolderContextPolicy({
            ...folder.contextPolicy,
            ...contextPolicy
        });
    }

    if (ragSettings && typeof ragSettings === 'object') {
        folder.ragSettings = normalizeFolderRagSettings({
            ...folder.ragSettings,
            ...ragSettings
        });
    }

    folder.updatedAt = Date.now();
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    publishSessionStructureChanged();
}

export function openFolderSettingsPrompt({ folderId }) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const folder = getFolderById(project, folderId);
    if (!folder) return;

    const currentBudget = folder.contextPolicy?.sharedContextBudgetTokens || 900;
    const currentMaxSessions = folder.contextPolicy?.maxSharedSessions || 4;

    const budgetInput = prompt(
        `Shared context token budget for "${folder.name}" (200-6000):`,
        String(currentBudget)
    );
    if (budgetInput === null) return;

    const maxSessionsInput = prompt(
        `Maximum related sessions used for shared context (1-12):`,
        String(currentMaxSessions)
    );
    if (maxSessionsInput === null) return;

    updateSessionFolderSettings({
        folderId,
        contextPolicy: {
            sharedContextBudgetTokens: Number(budgetInput),
            maxSharedSessions: Number(maxSessionsInput)
        }
    });
}

export function activateSessionFolder({ folderId }) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);
    const folder = getFolderById(project, folderId);
    if (!folder) return;
    project.activeFolderId = folder.id;
    stateManager.setProject(project);
}

export function setFolderCollapsedState({ folderId, collapsed }) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);
    const folder = getFolderById(project, folderId);
    if (!folder) return;
    folder.collapsed = Boolean(collapsed);
    folder.updatedAt = Date.now();
    stateManager.setProject(project);
}

export function createChatInFolder({ folderId }) {
    createNewChatSession({ folderId });
}

export function moveSessionToFolder({ sessionId, folderId = null, targetSessionId = null, position = 'after' } = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = getSessionById(project, sessionId);
    if (!session) return;

    const previousFolderId = session.folderId || null;
    const resolvedFolderId = folderId && getFolderById(project, folderId) ? folderId : null;
    session.folderId = resolvedFolderId;
    session.updatedAt = Date.now();
    if (resolvedFolderId) {
        session.pinned = false;
    }
    session.ragSettings = normalizeSessionRagSettings(session.ragSettings, {
        scopeSource: resolvedFolderId ? session.ragSettings?.scopeSource : 'session'
    });
    if (!resolvedFolderId && session.ragSettings.scopeSource === 'folder') {
        session.ragSettings.scopeSource = 'session';
    }

    if (project.activeSessionId === sessionId) {
        project.activeFolderId = resolvedFolderId;
    }

    const requestedPosition = position === 'before' ? 'before' : 'after';
    placeSessionInGroupOrder(project, session, resolvedFolderId, targetSessionId, requestedPosition);
    if (previousFolderId !== resolvedFolderId) {
        normalizeGroupOrdering(project, previousFolderId);
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    publishSessionStructureChanged();
}

export function moveSessionToFolderPrompt({ sessionId }) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = getSessionById(project, sessionId);
    if (!session) return;

    const folderLines = project.chatFolders.map((folder, index) => `${index + 1}. ${folder.name}`).join('\n');
    const input = prompt(
        [
            `Move "${session.name}" to:`,
            '0 = Main list (no folder)',
            'n = Create new folder',
            folderLines || '(No folders yet)'
        ].join('\n'),
        session.folderId
            ? String(project.chatFolders.findIndex(folder => folder.id === session.folderId) + 1)
            : '0'
    );
    if (input === null) return;

    const normalized = input.trim().toLowerCase();
    if (normalized === 'n') {
        const folder = createSessionFolder({ askName: true });
        if (folder) {
            moveSessionToFolder({ sessionId, folderId: folder.id });
        }
        return;
    }

    const selectedIndex = Number.parseInt(normalized, 10);
    if (!Number.isFinite(selectedIndex)) {
        showCustomAlert('Invalid folder selection.', 'Session Folder');
        return;
    }

    if (selectedIndex <= 0) {
        moveSessionToFolder({ sessionId, folderId: null });
        return;
    }

    const folder = project.chatFolders[selectedIndex - 1];
    if (!folder) {
        showCustomAlert('Folder number not found.', 'Session Folder');
        return;
    }

    moveSessionToFolder({ sessionId, folderId: folder.id });
}

export function setSessionContextMode({ sessionId, mode }) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = getSessionById(project, sessionId);
    if (!session) return;

    const nextMode = normalizeSessionContextMode(mode);
    if (nextMode === 'folder_aware' && !session.folderId) {
        showCustomAlert('This session is not inside a folder yet. Move it into a folder first.', 'Context Mode');
        return;
    }
    session.contextMode = nextMode;
    session.updatedAt = Date.now();

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('session:listChanged');
}

export function setSessionContextModePrompt({ sessionId }) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = getSessionById(project, sessionId);
    if (!session) return;

    const currentMode = normalizeSessionContextMode(session.contextMode);
    const defaultChoice = currentMode === 'session_only' ? '2' : '1';
    const input = prompt(
        [
            `Context mode for "${session.name}"`,
            '1 = Folder aware (recommended for sessions inside folder)',
            '2 = Session only'
        ].join('\n'),
        defaultChoice
    );
    if (input === null) return;

    const normalized = input.trim();
    if (normalized === '1') {
        if (!session.folderId) {
            showCustomAlert('This session is not inside a folder yet. Move it into a folder first.', 'Context Mode');
            return;
        }
        setSessionContextMode({ sessionId, mode: 'folder_aware' });
    } else if (normalized === '2') {
        setSessionContextMode({ sessionId, mode: 'session_only' });
    } else {
        showCustomAlert('Invalid mode selection.', 'Context Mode');
    }
}
/**
 * Deletes a chat session after user confirmation.
 * If the deleted session was active, it loads the next most recent session.
 * @param {string} sessionId - The ID of the session to delete.
 * @param {Event} [event] - The click event, to stop propagation.
 */
export async function deleteChatSession({ sessionId }) {
    if (!confirm("Are you sure you want to delete this chat session? This cannot be undone.")) return;

    const project = stateManager.getProject();
    ensureProjectFolders(project);
    const sessionIndex = project.chatSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return;
    const deletedSession = project.chatSessions[sessionIndex];

    // 1. ลบออกจาก State ใน Memory
    project.chatSessions.splice(sessionIndex, 1);
    normalizeGroupOrdering(project, deletedSession?.folderId || null);

    // 2. [CRITICAL FIX] สั่งลบออกจาก IndexedDB โดยตรง
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'delete', sessionId);

    // 3. จัดการ Session ที่กำลัง Active อยู่ (ถ้าถูกลบ)
    if (project.activeSessionId === sessionId) {
        const nextSession = [...project.chatSessions].filter(s => !s.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0];
        project.activeSessionId = nextSession ? nextSession.id : null;
        project.activeFolderId = nextSession?.folderId || null;
        // โหลด session ใหม่ (ซึ่งจะไปเรียก renderUI เอง)
        loadChatSession(project.activeSessionId);
    } else {
        // ถ้าลบอันอื่น ก็แค่สั่งวาด UI ใหม่
        stateManager.bus.publish('session:listChanged');
    }
    stateManager.updateAndPersistState(); // บันทึกการเปลี่ยนแปลงของ project metadata
}

/**
 * Toggles the pinned status of a session.
 * @param {string} sessionId - The ID of the session to pin/unpin.
 * @param {Event} [event] - The click event, to stop propagation.
 */
export function togglePinSession(sessionId, event) {
    event?.stopPropagation();
    const project = getActiveProject();
    ensureProjectFolders(project);
    const session = project?.chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    session.pinned = !session.pinned;
    session.updatedAt = Date.now();
    stateManager.updateAndPersistState(project);
    SessionUI.renderSessionList();
}

/**
 * Creates a duplicate of an existing session.
 * @param {string} sessionId - The ID of the session to clone.
 * @param {Event} [event] - The click event, to stop propagation.
 */
export function cloneSession(sessionId, event) {
    event?.stopPropagation();
    const project = getActiveProject();
    ensureProjectFolders(project);
    const sessionToClone = project?.chatSessions.find(s => s.id === sessionId);
    if (!sessionToClone) {
        showCustomAlert("Error: Could not find session to clone.", "Error");
        return;
    }

    // Deep copy to avoid reference issues
    const newSession = JSON.parse(JSON.stringify(sessionToClone));
    
    // Set new properties for the cloned session
    newSession.id = generateUniqueId();
    newSession.name = `${sessionToClone.name} (Copy)`;
    newSession.createdAt = Date.now();
    newSession.updatedAt = Date.now();
    newSession.pinned = false;
    newSession.archived = false;
    newSession.sortIndex = getTopSortIndexForGroup(project, newSession.folderId || null);
    newSession.contextMode = normalizeSessionContextMode(newSession.contextMode);
    newSession.ragSettings = normalizeSessionRagSettings(newSession.ragSettings, {
        scopeSource: newSession.folderId ? newSession.ragSettings?.scopeSource : 'session'
    });
    if (!newSession.folderId && newSession.ragSettings.scopeSource === 'folder') {
        newSession.ragSettings.scopeSource = 'session';
    }

    // 1. Add to state and make active
    project.chatSessions.unshift(newSession);
    project.activeSessionId = newSession.id;
    project.activeFolderId = newSession.folderId || null;

    // 2. Persist
    stateManager.updateAndPersistState(project);

    // 3. Load into UI
    loadChatSession(newSession.id);
}

/**
 * Toggles the archived status of a session.
 * @param {string} sessionId - The ID of the session to archive/unarchive.
 * @param {Event} [event] - The click event, to stop propagation.
 */
export function archiveSession(sessionId, event) {
    event?.stopPropagation();
    const project = getActiveProject();
    ensureProjectFolders(project);
    const session = project?.chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    session.archived = !session.archived;
    if (session.archived) session.pinned = false; // Archived items cannot be pinned
    session.updatedAt = Date.now();
    
    // If the active session was just archived, load the next available one
    if (project.activeSessionId === sessionId && session.archived) {
        const nextSession = project.chatSessions.find(s => !s.archived);
        project.activeSessionId = nextSession ? nextSession.id : null;
        project.activeFolderId = nextSession?.folderId || null;
        stateManager.updateAndPersistState(project);
        loadChatSession(project.activeSessionId);
    } else {
        stateManager.updateAndPersistState(project);
        SessionUI.renderSessionList();
    }
}

/**
 * Exports the content of a chat session to a text file.
 * @param {string} [sessionId] - The ID of the session to export. Defaults to the active session.
 */

/**
 * [DEPRECATED but restored for compatibility]
 * Saves all sessions to IndexedDB. This function is kept for compatibility
 * with older parts of the code that might still call it directly.
 * The modern approach is to use `stateManager.updateAndPersistState()`.
 * @param {Array} [sessionsToSave] - Optional array of sessions to save.
 * @returns {Promise<void>}
 */
export async function saveAllSessions(sessionsToSave) {
    const sessions = sessionsToSave || getActiveProject()?.chatSessions;
    if (!sessions) return;

    const db = getDb();
    if (!db) {
        console.error("[SaveAllSessions] Cannot save, DB not available.");
        return;
    }

    const tx = db.transaction(SESSIONS_STORE_NAME, "readwrite");
    const store = tx.objectStore(SESSIONS_STORE_NAME);

    for (const session of sessions) {
        store.put(session);
    }

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * [DEFINITIVE VERSION] Exports a chat session to a formatted text file.
 * This version includes robust error checking and logging for easier debugging.
 * @param {object} [payload={}] - The event data, which can contain `sessionId`.
 */
export function downloadChatSession(payload) {
    try {
        const project = stateManager.getProject();
        if (!project) throw new Error("Project not found.");

        // 1. Determine the correct session ID to export
        const idToExport = payload?.sessionId || project.activeSessionId;
        if (!idToExport) throw new Error("No session is active or selected for download.");
        
        console.log(`Attempting to download session with ID: ${idToExport}`);

        const session = project.chatSessions.find(s => s.id === idToExport);
        if (!session) throw new Error(`Session with ID ${idToExport} could not be found.`);

        // 2. Build the text content for the file
        let chatContent = `Chat Session: ${session.name || 'Untitled Session'}\n`;
        chatContent += `Exported on: ${new Date().toLocaleString()}\n`;
        if(session.linkedEntity) {
            chatContent += `Associated Entity: ${session.linkedEntity.name} (${session.linkedEntity.type})\n`;
        }
        chatContent += "============================================\n\n";

        const history = session.history || [];
        if (history.length === 0) {
            chatContent += "[This session has no messages.]";
        } else {
            history.forEach(msg => {
                const timestamp = msg.timestamp ? formatTimestamp(msg.timestamp) : 'No Timestamp';
                const role = (msg.speaker || msg.role || 'unknown').toUpperCase();
                const content = Array.isArray(msg.content)
                    ? msg.content.find(p => p.type === 'text')?.text || '[multimodal content]'
                    : msg.content;
                
                chatContent += `[${timestamp}] ${role}:\n${content}\n\n--------------------------------\n\n`;
            });
        }
        
        console.log(`Final text content length: ${chatContent.length}`);

        // 3. Create a Blob and trigger the download
        const blob = new Blob([chatContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const safeName = (session.name || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `session-export-${safeName}.txt`;
        a.href = url;
        
        // This part is crucial for ensuring the download works
        document.body.appendChild(a);
        a.click();
        
        // Clean up after the download has been initiated
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log("Download initiated and cleanup complete.");
        }, 100);

    } catch (error) {
        console.error("Download Chat Session failed:", error);
        showCustomAlert(`Failed to download chat: ${error.message}`, "Error");
    }
}

// [NEW] เพิ่มฟังก์ชันนี้เข้าไปเพื่อบันทึกความสูงของ Composer
export function saveComposerHeight({ height }) {
    const project = stateManager.getProject();
    const session = project?.chatSessions.find(s => s.id === project.activeSessionId);

    if (session && height) {
        session.composerHeight = height;
      
    }
}

export async function saveActiveSession() {
    const project = stateManager.getProject();
    const activeSession = project?.chatSessions.find(s => s.id === project.activeSessionId);

    if (!activeSession) {
        console.warn("[AutoSave] Could not find active session to save.");
        return;
    }

    try {
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', activeSession);
    } catch (error) {
        console.error(`[AutoSave] Failed to save active session (${activeSession.id}):`, error);
    }
}

/**
 * [NEW] จัดการการเปลี่ยนชื่อ session ที่ได้รับมาจาก Event
 * @param {object} payload - ข้อมูลที่ส่งมากับ Event { sessionId, newName }
 */
export function handleAutoRename({ sessionId, newName }) {
    const project = stateManager.getProject();
    if (!project) return;

    const session = project.chatSessions.find(s => s.id === sessionId);
    // ตรวจสอบเพิ่มเติมว่าชื่อยังเป็น Default อยู่หรือไม่ ก่อนจะเปลี่ยน
    if (!session || session.name !== 'New Chat') return;

    session.name = newName;
    session.updatedAt = Date.now();
    stateManager.updateAndPersistState();

    // ส่งสัญญาณบอก UI ให้วาดตัวเองใหม่
    stateManager.bus.publish('session:listChanged');

    if (project.activeSessionId === sessionId) {
        stateManager.bus.publish('ui:updateChatTitle', { title: newName });
    }
}
