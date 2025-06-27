// ===============================================
// FILE: src/js/modules/session/session.handlers.js (Corrected)
// ===============================================

// [FIX] Importing all necessary variables and functions
import { stateManager, SESSIONS_STORE_NAME } from '../../core/core.state.js';
import { dbRequest } from '../../core/core.db.js';
import { showCustomAlert } from '../../core/core.ui.js';

// --- Exported Functions ---

export async function createNewChatSession() {
    const project = stateManager.getProject();
    const newSession = {
        id: `sid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: 'New Chat',
        history: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        archived: false,
        linkedEntity: { ...project.activeEntity },
        groupChatState: { isRunning: false },
        summaryState: { activeSummaryId: null, summarizedUntilIndex: 0 }
    };

    try {
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'add', newSession);
        project.chatSessions.unshift(newSession);
        stateManager.setProject(project);
        await loadChatSession(newSession.id);
    } catch (error) {
        console.error("Failed to create new session in DB:", error);
        showCustomAlert("Error creating new chat.", "Error");
    }
}

export async function loadChatSession(id) {
    if (stateManager.isLoading()) return;
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === id);

    if (session) {
        project.activeSessionId = id;
        
        if (session.linkedEntity?.type === 'agent' && project.agentPresets[session.linkedEntity.name]) {
            project.activeEntity = { ...session.linkedEntity };
        } else if (session.linkedEntity?.type === 'group' && project.agentGroups[session.linkedEntity.name]) {
            project.activeEntity = { ...session.linkedEntity };
        } else {
            const firstAgentName = Object.keys(project.agentPresets)[0] || 'Default Agent';
            project.activeEntity = { type: 'agent', name: firstAgentName };
            session.linkedEntity = { ...project.activeEntity };
        }
        
        stateManager.setProject(project);
        stateManager.bus.publish('session:loaded', session);
    }
}

export async function renameChatSession(id, e, newNameFromPrompt = null) {
    if (e) e.stopPropagation();
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === id);
    if (!session) return;

    const newName = newNameFromPrompt || prompt("Enter new name:", session.name);
    if (newName && newName.trim()) {
        session.name = newName.trim();
        session.updatedAt = Date.now();
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        
        stateManager.setProject(project);
        stateManager.bus.publish('session:changed');
        if (id === project.activeSessionId) {
            stateManager.bus.publish('session:titleChanged', newName);
        }
    }
}

export async function deleteChatSession(id, e) {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chat session?")) return;

    const project = stateManager.getProject();
    const sessionIndex = project.chatSessions.findIndex(s => s.id === id);
    if (sessionIndex === -1) return;

    project.chatSessions.splice(sessionIndex, 1);
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'delete', id);

    if (project.activeSessionId === id) {
        project.activeSessionId = null;
        const nextSession = [...project.chatSessions].filter(s => !s.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0];
        
        stateManager.setProject(project);
        
        if (nextSession) {
            await loadChatSession(nextSession.id);
        } else {
            await createNewChatSession();
        }
    } else {
        stateManager.setProject(project);
        stateManager.bus.publish('session:changed');
    }
}

export async function togglePinSession(id, event) {
    if (event) event.stopPropagation();
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === id);
    if (!session) return;

    session.pinned = !session.pinned;
    session.updatedAt = Date.now();
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    
    stateManager.setProject(project);
    stateManager.bus.publish('session:changed');
}

export async function cloneSession(id, event) {
    if (event) event.stopPropagation();
    const project = stateManager.getProject();
    const sessionToClone = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'get', id);
    if (!sessionToClone) {
        showCustomAlert("Error: Could not find session to clone.", "Error");
        return;
    }

    const newSession = JSON.parse(JSON.stringify(sessionToClone));
    newSession.id = `sid_${Date.now()}`;
    newSession.name = `${sessionToClone.name} (Copy)`;
    newSession.createdAt = Date.now();
    newSession.updatedAt = Date.now();
    newSession.pinned = false;
    newSession.archived = false;

    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'add', newSession);
    project.chatSessions.unshift(newSession);
    stateManager.setProject(project);
    await loadChatSession(newSession.id);
}

export async function archiveSession(id, event) {
    if (event) event.stopPropagation();
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === id);
    if (!session) return;

    session.archived = !session.archived;
    if (session.archived) session.pinned = false; // Unpin if archiving
    session.updatedAt = Date.now();
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    
    if (project.activeSessionId === id && session.archived) {
        project.activeSessionId = null;
        const nextSession = project.chatSessions.find(s => !s.archived);
        stateManager.setProject(project);

        if (nextSession) {
            await loadChatSession(nextSession.id);
        } else {
            await createNewChatSession();
        }
    } else {
        stateManager.setProject(project);
        stateManager.bus.publish('session:changed');
    }
}

export function exportChat(sessionId) {
    const project = stateManager.getProject();
    const idToExport = sessionId || project.activeSessionId;
    if (!idToExport) {
        showCustomAlert('No active chat session to export.');
        return;
    }

    const session = project.chatSessions.find(s => s.id === idToExport);
    if (!session) {
        showCustomAlert('Could not find session data to export.');
        return;
    }

    const sessionName = session.name || 'Untitled_Chat';
    let exportText = `Chat Export - Session: ${sessionName}\n================\n\n`;
    session.history.forEach(msg => {
        const sender = msg.speaker || (msg.role.charAt(0).toUpperCase() + msg.role.slice(1));
        let contentText = '';
        if(typeof msg.content === 'string') contentText = msg.content;
        else if (Array.isArray(msg.content)) contentText = msg.content.find(p => p.type === 'text')?.text || '[Image]';
        exportText += `${sender}: ${contentText}\n\n`;
    });
    
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${sessionName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}
