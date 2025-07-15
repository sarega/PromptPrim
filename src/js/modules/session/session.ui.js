// ===============================================
// FILE: src/js/modules/session/session.ui.js
// DESCRIPTION: อัปเดต Element ID ให้ตรงกับ Layout ใหม่ของ Workspace
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';
import * as SessionHandlers from './session.handlers.js';

let isSessionUIInitialized = false;

// --- Private Helper Functions ---

/**
 * Creates the HTML element for a single chat session.
 * Note: Event listeners are now handled by delegation in initSessionUI.
 * @param {object} session - The session data object.
 * @returns {HTMLElement} The created session item element.
 */
function createSessionElement(session) {
    const project = stateManager.getProject();
    
    // --- [FIX 1] Look up the linked agent's icon from the project state ---
    let sessionIcon = '💬'; // Default icon
    if (session.linkedEntity?.type === 'agent' && project.agentPresets[session.linkedEntity.name]) {
        sessionIcon = project.agentPresets[session.linkedEntity.name].icon || '🤖';
    } else if (session.linkedEntity?.type === 'group') {
        sessionIcon = '🤝';
    }

    // --- [FIX 2] Use the correct base class "item" to inherit styles ---
    const item = document.createElement('div');
    item.className = 'item session-item'; // Add 'item' base class
    item.dataset.sessionId = session.id;

    if (session.pinned) {
        item.classList.add('pinned');
    }

    const sessionName = session.name || 'New Chat';
    
    // --- [FIX 3] Use the same inner HTML structure as Agent Items ---
    item.innerHTML = `
        <div class="item-header">
            <span class="item-name"><span class="item-icon">${sessionIcon}</span> ${sessionName}</span>
            <div class="item-actions">
                <div class="dropdown align-right">
                    <button class="btn-icon" data-action="toggle-menu" title="More options">&#8942;</button>
                    <div class="dropdown-content">
                        <a href="#" data-action="pin">${session.pinned ? 'Unpin' : 'Pin'} Session</a>
                        <a href="#" data-action="rename">Rename</a>
                        <a href="#" data-action="clone">Clone Session</a>
                        <a href="#" data-action="archive">${session.archived ? 'Unarchive' : 'Archive'} Session</a>                        <a href="#" data-action="download">Download Chat</a>
                        <div class="dropdown-divider"></div>
                        <a href="#" data-action="delete" class="is-destructive">
                            <span class="material-symbols-outlined">delete</span> Delete Session
                        </a>                    
                    </div>
                </div>
            </div>
        </div>
    `;
    return item;
}

/**
 * Updates the UI to highlight the currently active session.
 * @param {string} activeSessionId - The ID of the session to mark as active.
 */
function updateActiveSessionUI(activeSessionId) {
    const allItems = document.querySelectorAll('.session-item');
    allItems.forEach(item => {
        item.classList.toggle('active', item.dataset.sessionId === activeSessionId);
    });
}

// --- Exported UI Functions ---

/**
 * Renders the entire list of chat sessions (pinned, regular, and archived).
 */
export function renderSessionList() {
    const project = stateManager.getProject();
    if (!project) return;

    // [FIX] Use the correct element IDs from the new index.html layout
    const pinnedList = document.getElementById('pinnedSessionList');
    const regularList = document.getElementById('sessionListContainer');
    const archivedList = document.getElementById('archivedSessionList');
    const archivedSection = document.getElementById('archivedSessionsSection');

    // This guard clause is important. If we are in the "Studio" workspace,
    // these elements don't exist, so we should exit gracefully.
    if (!pinnedList || !regularList || !archivedList || !archivedSection) {
        return;
    }

    pinnedList.innerHTML = '';
    regularList.innerHTML = '';
    archivedList.innerHTML = '';

    const sessions = project.chatSessions || [];
    const pinnedSessions = sessions.filter(s => s.isPinned && !s.archived);
    const regularSessions = sessions.filter(s => !s.isPinned && !s.archived);
    const archivedSessions = sessions.filter(s => s.archived);

    // Sort and render each category
    pinnedSessions.sort((a, b) => b.updatedAt - a.updatedAt).forEach(session => {
        pinnedList.appendChild(createSessionElement(session));
    });

    regularSessions.sort((a, b) => b.updatedAt - a.updatedAt).forEach(session => {
        regularList.appendChild(createSessionElement(session));
    });

    archivedSessions.sort((a, b) => b.updatedAt - a.updatedAt).forEach(session => {
        archivedList.appendChild(createSessionElement(session));
    });

    // Show/hide the archived section based on content
    archivedSection.classList.toggle('hidden', archivedSessions.length === 0);

    updateActiveSessionUI(project.activeSessionId);
}

/**
 * Initializes all UI-related functionalities for the session panel.
 */
export function initSessionUI() {
    if (isSessionUIInitialized) {
        return; // ถ้าเคยทำงานไปแล้ว ให้ออกจากฟังก์ชันทันที
    }
    isSessionUIInitialized = true; // ตั้งค่าสถานะว่าทำงานไปแล้ว
    // --- Subscribe to Events to re-render the list ---
    stateManager.bus.subscribe('project:loaded', renderSessionList);
    stateManager.bus.subscribe('session:listChanged', renderSessionList);
    stateManager.bus.subscribe('session:loaded', () => updateActiveSessionUI(stateManager.getProject()?.activeSessionId));

    // --- Dedicated Delegated Event Listener for the Sessions Panel ---
    const sessionsPanel = document.querySelector('.sessions-panel');
    if (sessionsPanel) {
        sessionsPanel.addEventListener('click', (e) => {
            const target = e.target;

            // Case 1: Clicked on a dropdown menu item (e.g., "Rename", "Delete")
            const actionLink = target.closest('.dropdown-content a[data-action]');
            if (actionLink) {
                e.preventDefault();
                e.stopPropagation();
                const sessionItem = target.closest('.session-item[data-session-id]');
                if (!sessionItem) return;
                const sessionId = sessionItem.dataset.sessionId;
                const action = actionLink.dataset.action;
                stateManager.bus.publish(`session:${action}`, { sessionId, event: e });
                actionLink.closest('.dropdown.open')?.classList.remove('open');
                return;
            }

            // Case 2: Clicked on a dropdown toggle button ("...")
            const toggleButton = target.closest('button[data-action="toggle-menu"]');
            if (toggleButton) {
                e.preventDefault();
                e.stopPropagation();
                toggleDropdown(e);
                return;
            }

            // Case 3: Clicked on the "New Chat" button
            if (target.closest('#new-chat-btn')) {
                stateManager.bus.publish('session:new');
                return;
            }

            // Case 4: Clicked on the session item itself to load it
            const sessionItemToLoad = target.closest('.session-item[data-session-id]');
            if (sessionItemToLoad) {
                const sessionId = sessionItemToLoad.dataset.sessionId;
                if (stateManager.getProject().activeSessionId !== sessionId) {
                    SessionHandlers.loadChatSession(sessionId);
                }
            }
        });
    }
    console.log("✅ Session UI and its dedicated event listener initialized ONCE.");
}