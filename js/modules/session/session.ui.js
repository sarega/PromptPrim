// js/modules/session/session.ui.js

export function renderSessionList() {
    const project = stateManager.getProject();
    const allSessions = project.chatSessions || [];
    const pinnedContainer = document.getElementById('pinnedSessionList');
    const recentContainer = document.getElementById('sessionListContainer');
    const archivedList = document.getElementById('archivedSessionList');
    const archivedSection = document.getElementById('archivedSessionsSection');
    
    pinnedContainer.innerHTML = ''; recentContainer.innerHTML = ''; archivedList.innerHTML = '';

    const pinnedSessions = allSessions.filter(s => s.pinned && !s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
    const archivedSessions = allSessions.filter(s => s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
    const recentSessions = allSessions.filter(s => !s.pinned && !s.archived).sort((a,b) => b.updatedAt - a.updatedAt);

    pinnedSessions.forEach(session => pinnedContainer.appendChild(createSessionElement(session)));
    recentSessions.forEach(session => recentContainer.appendChild(createSessionElement(session)));
    archivedSessions.forEach(session => archivedList.appendChild(createSessionElement(session)));

    archivedSection.style.display = archivedSessions.length > 0 ? 'block' : 'none';
}

export function createSessionElement(session) {
    const project = stateManager.getProject();
    const item = document.createElement('div');
    item.className = `item session-item ${session.id === project.activeSessionId ? 'active' : ''} ${session.pinned ? 'pinned' : ''}`;
    item.dataset.sessionId = session.id;

    item.addEventListener('click', () => {
        if (project.activeSessionId !== session.id) loadChatSession(session.id);
        if (window.innerWidth <= 1024) toggleMobileSidebar();
    });
    
    const agentPresets = project.agentPresets || {};
    let icon = '❔';
    if (session.linkedEntity) {
        const agentPreset = agentPresets[session.linkedEntity.name];
        icon = session.linkedEntity?.type === 'group' ? '🤝' : (agentPreset?.icon || '🤖');
    }
    
    // START: โค้ดส่วนที่ต้องแก้ไขและเพิ่มเติม
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

    // ผูก event listener กับปุ่มที่สร้างขึ้นใหม่
    item.querySelector('[data-action="toggle-menu"]').addEventListener('click', toggleDropdown);
    item.querySelector('[data-action="pin"]').addEventListener('click', (e) => togglePinSession(session.id, e));
    item.querySelector('[data-action="rename"]').addEventListener('click', (e) => renameChatSession(session.id, e));
    item.querySelector('[data-action="clone"]').addEventListener('click', (e) => cloneSession(session.id, e));
    item.querySelector('[data-action="archive"]').addEventListener('click', (e) => archiveSession(session.id, e));
    item.querySelector('[data-action="export"]').addEventListener('click', (e) => exportChat(session.id, e));
    item.querySelector('[data-action="delete"]').addEventListener('click', (e) => deleteChatSession(session.id, e));
    // END: โค้ดส่วนที่ต้องแก้ไขและเพิ่มเติม
    
    return item;
}

export function initSessionUI() {
    stateManager.bus.subscribe('project:loaded', renderSessionList);
    stateManager.bus.subscribe('session:loaded', renderSessionList);
    stateManager.bus.subscribe('session:changed', renderSessionList); 

    document.getElementById('new-chat-btn').addEventListener('click', createNewChatSession);
    
    console.log("Session UI Initialized.");
}