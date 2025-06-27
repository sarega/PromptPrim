// ===============================================
// FILE: src/js/modules/session/session.ui.js (Refactored)
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown, toggleMobileSidebar } from '../../core/core.ui.js';

// --- Private Helper Functions (Not Exported) ---

function createSessionElement(session) {
    const project = stateManager.getProject();
    const item = document.createElement('div');
    item.className = `item session-item ${session.id === project.activeSessionId ? 'active' : ''} ${session.pinned ? 'pinned' : ''}`;
    item.dataset.sessionId = session.id;

    // Main item click handler
    item.addEventListener('click', () => {
        if (project.activeSessionId !== session.id) {
            // Publish event to load session
            stateManager.bus.publish('session:load', { sessionId: session.id });
        }
        if (window.innerWidth <= 1024) {
            toggleMobileSidebar();
        }
    });
    
    const agentPresets = project.agentPresets || {};
    let icon = '❔';
    if (session.linkedEntity) {
        const agentPreset = agentPresets[session.linkedEntity.name];
        icon = session.linkedEntity?.type === 'group' ? '🤝' : (agentPreset?.icon || '🤖');
    }
    
    item.innerHTML = `
        <div class="item-header">
            <span class="item-name"><span class="item-icon">${icon}</span>${session.pinned ? '📌 ' : ''}${session.name}</span>
            <div class="item-actions dropdown align-right">
                <button class="btn-icon" data-action="toggle-menu">&#8942;</button>
                <div class="dropdown-content">
                    <a href="#" data-action="pin">${session.pinned ? 'Unpin' : 'Pin'}</a>
                    <a href="#" data-action="rename">Rename</a>
                    <a href="#" data-action="clone">Clone</a>
                    <a href="#" data-action="archive">${session.archived ? 'Unarchive' : 'Archive'}</a>
                    <a href="#" data-action="export">Download</a>
                    <hr>
                    <a href="#" data-action="delete">Delete</a>
                </div>
            </div>
        </div>
    `;

    // Attach event listeners that publish events
    const actions = item.querySelector('.dropdown-content');
    item.querySelector('[data-action="toggle-menu"]').addEventListener('click', toggleDropdown);
    actions.querySelector('[data-action="pin"]').addEventListener('click', (e) => stateManager.bus.publish('session:pin', { sessionId: session.id, event: e }));
    actions.querySelector('[data-action="rename"]').addEventListener('click', (e) => stateManager.bus.publish('session:rename', { sessionId: session.id, event: e }));
    actions.querySelector('[data-action="clone"]').addEventListener('click', (e) => stateManager.bus.publish('session:clone', { sessionId: session.id, event: e }));
    actions.querySelector('[data-action="archive"]').addEventListener('click', (e) => stateManager.bus.publish('session:archive', { sessionId: session.id, event: e }));
    actions.querySelector('[data-action="export"]').addEventListener('click', (e) => { e.preventDefault(); stateManager.bus.publish('project:exportChat', { sessionId: session.id }); });
    actions.querySelector('[data-action="delete"]').addEventListener('click', (e) => stateManager.bus.publish('session:delete', { sessionId: session.id, event: e }));
    
    return item;
}


// --- Exported UI Functions ---

export function renderSessionList() {
    const project = stateManager.getProject();
    if (!project) return;

    const allSessions = project.chatSessions || [];
    const pinnedContainer = document.getElementById('pinnedSessionList');
    const recentContainer = document.getElementById('sessionListContainer');
    const archivedList = document.getElementById('archivedSessionList');
    const archivedSection = document.getElementById('archivedSessionsSection');
    
    // Clear previous content
    pinnedContainer.innerHTML = ''; 
    recentContainer.innerHTML = ''; 
    archivedList.innerHTML = '';

    const pinnedSessions = allSessions.filter(s => s.pinned && !s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
    const archivedSessions = allSessions.filter(s => s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
    const recentSessions = allSessions.filter(s => !s.pinned && !s.archived).sort((a,b) => b.updatedAt - a.updatedAt);

    pinnedSessions.forEach(session => pinnedContainer.appendChild(createSessionElement(session)));
    recentSessions.forEach(session => recentContainer.appendChild(createSessionElement(session)));
    archivedSessions.forEach(session => archivedList.appendChild(createSessionElement(session)));

    archivedSection.style.display = archivedSessions.length > 0 ? 'block' : 'none';
}

export function initSessionUI() {
    // --- Subscribe to Events ---
    // Re-render the list whenever the project data changes, or a session is loaded/changed.
    stateManager.bus.subscribe('project:loaded', renderSessionList);
    stateManager.bus.subscribe('session:loaded', renderSessionList);
    stateManager.bus.subscribe('session:changed', renderSessionList); 

    // --- Setup Event Listeners ---
    document.getElementById('new-chat-btn').addEventListener('click', () => {
        stateManager.bus.publish('session:new');
    });
    
    console.log("Session UI Initialized.");
}
