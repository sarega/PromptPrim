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
const getActiveProject = () => stateManager.getProject(stateManager.activeProjectId);

// --- Primary Session Handlers ---

/**
 * Creates a new, empty chat session, adds it to the project,
 * persists the state, and loads it into the UI.
 */
export function createNewChatSession() {
    const project = getActiveProject();
    // [FIX] The active entity is a property of the project object, not a method on stateManager.
    const activeEntity = project?.activeEntity;

    if (!project || !activeEntity) {
        showCustomAlert("Please create or select an agent/group first.", "Error");
        return;
    }

    const newSession = {
        id: generateUniqueId(),
        name: 'New Chat',
        history: [], // <--- แก้ไขตรงนี้
        composerContent: "", // [FIX] เพิ่ม property นี้เข้าไปใน session ที่สร้างใหม่
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        archived: false,
        linkedEntity: { ...activeEntity },
        summaryState: { activeSummaryId: null, summarizedUntilIndex: -1 }
    };

    // 1. Modify state in memory
    project.chatSessions.unshift(newSession);
    project.activeSessionId = newSession.id;

    // 2. Persist the entire project state
    stateManager.updateAndPersistState(project);

    // 3. Update the UI by loading the new session
    loadChatSession(newSession.id);
}

// export function loadChatSession(sessionId) {
//     const project = stateManager.getProject();
//     if (!project) return;

//     // ส่วนจัดการกรณีไม่มี sessionId (เคลียร์หน้าจอ)
//     if (!sessionId) {
//         project.activeSessionId = null;
//         stateManager.updateAndPersistState(project);
//         // ใช้ setTimeout กับส่วนนี้ด้วยเพื่อความปลอดภัย
//         setTimeout(() => {
//             ChatUI.clearChat();
//             ComposerUI.setContent('');
//             SessionUI.renderSessionList();
//         }, 0);
//         return;
//     }
    
//     const session = project.chatSessions.find(s => s.id === sessionId);

//     // ส่วนจัดการกรณีหา session ไม่เจอ
//     if (!session) {
//         console.warn(`Session with ID ${sessionId} not found. Loading most recent session as fallback.`);
//         const fallbackSession = [...project.chatSessions]
//             .filter(s => !s.archived)
//             .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        
//         loadChatSession(fallbackSession ? fallbackSession.id : null);
//         return;
//     }

//     // 1. ตั้งค่า active session ใน state
//     if (project.activeSessionId !== sessionId) {
//         project.activeSessionId = sessionId;
//         stateManager.updateAndPersistState(project);
//     }
    
//     // [CRITICAL FIX] หน่วงเวลาการเรียก UI ทั้งหมด
//     // เพื่อให้แน่ใจว่าทุกโมดูล (ChatUI, ComposerUI, SessionUI) ถูกโหลดพร้อมใช้งานแล้ว
//     setTimeout(() => {
//         const composerPanel = document.getElementById('composer-panel');
//         if (composerPanel) {
//             // ถ้า session นี้เคยมีการบันทึกความสูงไว้ ให้นำมาใช้
//             if (session.composerHeight) {
//                 composerPanel.style.flexBasis = session.composerHeight;
//             } else {
//                 // ถ้าไม่เคย ให้ใช้ค่าเริ่มต้น
//                 composerPanel.style.flexBasis = '35vh';
//             }
//         }
//         // 2. อัปเดต UI ทั้งหมดที่เกี่ยวข้องกับ session
//         ChatUI.renderMessages(session.history || []);
//         ComposerUI.setContent(session.composerContent || '');
//         ChatUI.updateChatTitle(session.name);
//         SessionUI.renderSessionList(); // วาด Session List ใหม่เพื่อไฮไลท์อันที่เลือก
//         ChatUI.scrollToBottom();

//         // 3. ตรวจสอบและเลือก agent/group ที่ผูกกับ session นี้
//         const entity = session.linkedEntity || project.activeEntity;
//         if (entity) {
//             project.activeEntity = entity;
//             stateManager.bus.publish('entity:selected', entity);
//         }
//     }, 0); // การใส่ 0 คือการสั่งให้ทำงานทันทีที่ Call Stack ปัจจุบันว่างลง

// }

export function loadChatSession(sessionId) {
    const project = stateManager.getProject();
    if (!project) return;

    // --- กรณีไม่มี sessionId, ทำการเคลียร์หน้าจอ ---
    if (!sessionId) {
        project.activeSessionId = null;
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
    project.activeSessionId = sessionId;
    // เลือก entity ที่ผูกกับ session นี้ให้เป็น active โดยอัตโนมัติ
    if (session.linkedEntity) {
        project.activeEntity = { ...session.linkedEntity };
    }

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
export function renameChatSession(sessionId, event) {
    event?.stopPropagation();
    const project = stateManager.getProject();
    const session = project?.chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    const newName = prompt("Enter new name:", session.name);
    
    if (newName && newName.trim() && newName.trim() !== session.name) {
        session.name = newName.trim();
        session.updatedAt = Date.now();
        stateManager.updateAndPersistState();
        
        // ส่งสัญญาณบอก UI ให้วาดใหม่
        stateManager.bus.publish('session:listChanged');
        if (sessionId === project.activeSessionId) {
            stateManager.bus.publish('ui:updateChatTitle', { title: session.name });
        }
    }
}
/**
 * Deletes a chat session after user confirmation.
 * If the deleted session was active, it loads the next most recent session.
 * @param {string} sessionId - The ID of the session to delete.
 * @param {Event} [event] - The click event, to stop propagation.
 */
export function deleteChatSession(sessionId, event) {
    event?.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat session?")) return;

    const project = getActiveProject();
    if (!project) return;

    const sessionIndex = project.chatSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return;

    // 1. Modify state by removing the session
    project.chatSessions.splice(sessionIndex, 1);

    // 2. Determine the next active session if the current one was deleted
    if (project.activeSessionId === sessionId) {
        const nextSession = [...project.chatSessions]
            .filter(s => !s.archived)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        
        project.activeSessionId = nextSession ? nextSession.id : null;
        
        // 3. Persist state changes
        stateManager.updateAndPersistState(project);
        
        // 4. Update UI by loading the new active session (or clearing the view)
        loadChatSession(project.activeSessionId);
    } else {
        // If a non-active session was deleted, just persist and re-render the list
        stateManager.updateAndPersistState(project);
        SessionUI.renderSessionList();
    }
}

/**
 * Toggles the pinned status of a session.
 * @param {string} sessionId - The ID of the session to pin/unpin.
 * @param {Event} [event] - The click event, to stop propagation.
 */
export function togglePinSession(sessionId, event) {
    event?.stopPropagation();
    const project = getActiveProject();
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

    // 1. Add to state and make active
    project.chatSessions.unshift(newSession);
    project.activeSessionId = newSession.id;

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
    const session = project?.chatSessions.find(s => s.id === sessionId);
    if (!session) return;

    session.archived = !session.archived;
    if (session.archived) session.pinned = false; // Archived items cannot be pinned
    session.updatedAt = Date.now();
    
    // If the active session was just archived, load the next available one
    if (project.activeSessionId === sessionId && session.archived) {
        const nextSession = project.chatSessions.find(s => !s.archived);
        project.activeSessionId = nextSession ? nextSession.id : null;
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