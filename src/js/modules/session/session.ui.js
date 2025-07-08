// ===============================================
// FILE: src/js/modules/session/session.ui.js
// DESCRIPTION: อัปเดต Element ID ให้ตรงกับ Layout ใหม่ของ Workspace
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';

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
    // --- Subscribe to Events to re-render the list ---
    stateManager.bus.subscribe('project:loaded', renderSessionList);
    stateManager.bus.subscribe('session:listChanged', renderSessionList);
    stateManager.bus.subscribe('session:loaded', () => updateActiveSessionUI(stateManager.getProject()?.activeSessionId));

    // --- Dedicated Delegated Event Listener for the Sessions Panel ---
    const sessionsPanel = document.querySelector('.sessions-panel');
    if (sessionsPanel) {
        sessionsPanel.addEventListener('click', (e) => {
            const target = e.target;
            const actionTarget = target.closest('[data-action]');
            const sessionItem = target.closest('.session-item[data-session-id]');

            // Handle "New Chat" button
            if (target.closest('#new-chat-btn')) {
                stateManager.bus.publish('session:new');
                return;
            }
            
            // If a click is not on a session item, do nothing further.
            if (!sessionItem) return;

            const sessionId = sessionItem.dataset.sessionId;

            // Handle clicks on action buttons (like 'toggle-menu', 'rename', etc.)
            if (actionTarget) {
                e.preventDefault();
                e.stopPropagation();
                
                const action = actionTarget.dataset.action;
                
                if (action === 'toggle-menu') {
                    toggleDropdown(e);
                } else {
                    // Publish the action for a handler to process
                    stateManager.bus.publish(`session:${action}`, { sessionId, event: e });
                    // Close the dropdown after action
                    actionTarget.closest('.dropdown.open')?.classList.remove('open');
                }
            } else {
                // If the item itself was clicked (not a button), load the session.
                if (stateManager.getProject().activeSessionId !== sessionId) {
                    stateManager.bus.publish('session:load', { sessionId });
                }
            }
        });
    }
    console.log("✅ Session UI and its dedicated event listener initialized.");
}