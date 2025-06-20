// --- UI Toggles, Rendering & Interaction ---

// This variable needs to be accessible globally for the sortable instance
var groupSortable = null;

function toggleSettingsPanel() { document.getElementById('settings-panel').classList.toggle('open'); }
function showImageUploadModal() { document.getElementById('image-upload-modal').style.display = 'flex'; }
function hideImageUploadModal() { document.getElementById('image-upload-modal').style.display = 'none'; }

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function toggleSidebarCollapse() {
    document.querySelector('.app-wrapper').classList.toggle('sidebar-collapsed');
}

function toggleFocusMode() {
    const body = document.body;
    body.classList.toggle('focus-mode');
    const btn = document.getElementById('focus-mode-btn');
    if (body.classList.contains('focus-mode')) {
        btn.innerHTML = '&#x2921;'; // Collapse icon
        btn.title = 'Exit Focus Mode';
    } else {
        btn.innerHTML = '&#x2922;'; // Expand icon
        btn.title = 'Focus Mode';
    }
}

function showContextInspector() {
    updateContextInspector(true);
    document.getElementById('context-inspector-modal').style.display = 'flex';
}

function hideContextInspector() {
    document.getElementById('context-inspector-modal').style.display = 'none';
}

function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = event.currentTarget.closest('.dropdown');
    const wasOpen = dropdown.classList.contains('open');
    
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));

    if (!wasOpen) {
        dropdown.classList.add('open');
    }
}

// NEW FUNCTION to show/hide max turns input
function toggleMaxTurnsInput() {
    const flowSelect = document.getElementById('group-flow-select');
    const maxTurnsGroup = document.getElementById('max-turns-group');
    if (flowSelect.value === 'auto-moderator') {
        maxTurnsGroup.style.display = 'block';
    } else {
        maxTurnsGroup.style.display = 'none';
    }
}


function showUnsavedChangesModal(nextAction) {
    pendingActionAfterSave = nextAction;
    document.getElementById('unsaved-changes-modal').style.display = 'flex';
}

function hideUnsavedChangesModal() {
    document.getElementById('unsaved-changes-modal').style.display = 'none';
    pendingActionAfterSave = null;
}

function showSaveProjectModal() {
    document.getElementById('project-name-input').value = (currentProject.name === "Untitled Project") ? "" : currentProject.name;
    document.getElementById('save-project-modal').style.display = 'flex';
}

function hideSaveProjectModal() {
    document.getElementById('save-project-modal').style.display = 'none';
}

function applyFontSettings() {
    document.documentElement.style.setProperty('--main-font-family', currentProject.globalSettings.fontFamilySelect);
}

function updateStatus(message, state = 'disconnected') {
    document.getElementById('statusText').textContent = message || 'Ready';
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot';
    if (state === 'connected') dot.classList.add('connected');
    else if (state === 'error') dot.classList.add('error');
}

// --- Agent & Group Rendering ---

// [UPDATED] ฟังก์ชันนี้ถูกอัปเดตให้เพิ่ม highlight
function renderAgentPresets() {
    const container = document.getElementById('agentPresetList');
    container.innerHTML = '';
    const presets = currentProject.agentPresets || {};

    // หา entity ที่ผูกกับ active session
    const activeSession = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    const linkedEntity = activeSession ? activeSession.linkedEntity : null;

    for (const name in presets) {
        const item = document.createElement('div');
        item.className = 'item';
        item.dataset.agentName = name; // <-- เพิ่มบรรทัดนี้

        // เพิ่มคลาส active ถ้าตรงกัน
        if (linkedEntity && linkedEntity.type === 'agent' && linkedEntity.name === name) {
            item.classList.add('active');
        }

        item.innerHTML = `
        <div class="item-header">
            <span class="item-name" onclick="selectEntity('agent', '${name}')"><span class="item-icon">🤖</span> ${name}</span>
            <div class="item-actions">
                 <button class="btn-icon" onclick="showAgentEditor(true, '${name}')" title="Edit Agent">&#9998;</button>
                 <button class="btn-icon danger" onclick="deleteAgentPreset('${name}')" title="Delete Agent">&#128465;</button>
            </div>
        </div>`;
        container.appendChild(item);
    }
}

// [UPDATED] ฟังก์ชันนี้ถูกอัปเดตให้เพิ่ม highlight
function renderAgentGroups() {
    const container = document.getElementById('agentGroupList');
    container.innerHTML = '';
    const groups = currentProject.agentGroups || {};

    // หา entity ที่ผูกกับ active session
    const activeSession = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    const linkedEntity = activeSession ? activeSession.linkedEntity : null;

    for (const name in groups) {
        const item = document.createElement('div');
        item.className = 'item';
        item.dataset.groupName = name; // <-- เพิ่มบรรทัดนี้

        // เพิ่มคลาส active ถ้าตรงกัน
        if (linkedEntity && linkedEntity.type === 'group' && linkedEntity.name === name) {
            item.classList.add('active');
        }

        item.innerHTML = `
        <div class="item-header">
            <span class="item-name" onclick="selectEntity('group', '${name}')"><span class="item-icon">🤝</span> ${name}</span>
            <div class="item-actions">
                 <button class="btn-icon" onclick="showAgentGroupEditor(true, '${name}')" title="Edit Group">&#9998;</button>
                 <button class="btn-icon danger" onclick="deleteAgentGroup('${name}')" title="Delete Group">&#128465;</button>
            </div>
        </div>`;
        container.appendChild(item);
    }
}

function renderEntitySelector() {
    const selector = document.getElementById('entitySelector');
    selector.innerHTML = '';

    const agentGroup = document.createElement('optgroup');
    agentGroup.label = 'Agent Presets';
    Object.keys(currentProject.agentPresets || {}).forEach(name => {
        agentGroup.appendChild(new Option(name, `agent_${name}`));
    });
    selector.appendChild(agentGroup);

    const groupGroup = document.createElement('optgroup');
    groupGroup.label = 'Agent Groups';
    Object.keys(currentProject.agentGroups || {}).forEach(name => {
        groupGroup.appendChild(new Option(name, `group_${name}`));
    });
    selector.appendChild(groupGroup);
    
    const {type, name} = currentProject.activeEntity;
    selector.value = `${type}_${name}`;
}

// --- Editor Modals ---
function showAgentEditor(isEditing = false, agentName = null) {
    const modal = document.getElementById('agent-editor-modal');
    const title = document.getElementById('agent-modal-title');
    const nameInput = document.getElementById('agent-name-input');
    const modelSelect = document.getElementById('agent-model-select');
    
    modelSelect.innerHTML = '<option value="">-- Select a Model --</option>';
    const openrouterGroup = document.createElement('optgroup');
    openrouterGroup.label = 'OpenRouter';
    const ollamaGroup = document.createElement('optgroup');
    ollamaGroup.label = 'Ollama';
    
    allProviderModels.forEach(model => {
        const option = new Option(model.name, model.id);
        if (model.provider === 'openrouter') openrouterGroup.appendChild(option);
        else ollamaGroup.appendChild(option);
    });
    if (openrouterGroup.childElementCount > 0) modelSelect.appendChild(openrouterGroup);
    if (ollamaGroup.childElementCount > 0) modelSelect.appendChild(ollamaGroup);

    if (isEditing && agentName) {
        editingAgentName = agentName;
        const agent = currentProject.agentPresets[editingAgentName];
        if (!agent) { alert("Agent not found."); return; }
        
        title.textContent = `Edit Agent: ${editingAgentName}`;
        nameInput.value = editingAgentName;
        nameInput.disabled = false;
        
        Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
            const key = ALL_AGENT_SETTINGS_IDS[elId];
            const element = document.getElementById(elId);
            const value = agent[key];
            if(element && key !== 'name') {
                if (element.type === 'checkbox') element.checked = value;
                else element.value = value;
            }
        });
    } else {
        editingAgentName = null;
        title.textContent = "Create New Agent";
        nameInput.value = "";
        nameInput.disabled = false;
        
         Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
            const key = ALL_AGENT_SETTINGS_IDS[elId];
            const element = document.getElementById(elId);
            const value = defaultAgentSettings[key];
             if(key === 'name' || !element) return;
            if (element.type === 'checkbox') element.checked = value;
            else element.value = value;
        });
    }
    modal.style.display = 'flex';
}

function hideAgentEditor() {
    document.getElementById('agent-editor-modal').style.display = 'none';
    editingAgentName = null;
}

function showAgentGroupEditor(isEditing = false, groupName = null) {
    const modal = document.getElementById('agent-group-editor-modal');
    const title = document.getElementById('agent-group-modal-title');
    const nameInput = document.getElementById('group-name-input');
    
    editingGroupName = isEditing ? groupName : null;
    const group = isEditing ? currentProject.agentGroups[groupName] : null;

    title.textContent = isEditing ? `Edit Group: ${groupName}` : "Create New Agent Group";
    nameInput.value = isEditing ? groupName : "";
    
    const memberList = document.getElementById('group-member-list');
    memberList.innerHTML = '';

    const currentMembers = group ? group.members : [];
    const allAgents = Object.keys(currentProject.agentPresets);
    const sortedAgents = [...currentMembers];
    allAgents.forEach(agentName => {
        if (!sortedAgents.includes(agentName)) {
            sortedAgents.push(agentName);
        }
    });

    sortedAgents.forEach(agentName => {
        const isChecked = currentMembers.includes(agentName);
        const item = document.createElement('div');
        item.className = 'agent-sortable-item';
        item.dataset.agentName = agentName;
        const checkboxId = `agent-cb-${agentName.replace(/\s+/g, '-')}`;
        item.innerHTML = `
            <input type="checkbox" id="${checkboxId}" ${isChecked ? 'checked' : ''} onchange="updateModeratorDropdown()">
            <label for="${checkboxId}">${agentName}</label>
            <span class="drag-handle">&#x2630;</span>
        `;
        memberList.appendChild(item);
    });
    
    if (window.groupSortable) {
        window.groupSortable.destroy();
    }
    window.groupSortable = new Sortable(memberList, {
        animation: 150,
        handle: '.drag-handle',
    });

    updateModeratorDropdown(group?.moderatorAgent);

    document.getElementById('group-flow-select').value = group?.flowType || 'moderator-choice';
    document.getElementById('group-max-turns-input').value = group?.maxTurns || 4;
    // [EDITED] Set the value for the summarization TOKEN threshold input
    document.getElementById('group-summarization-threshold-input').value = group?.summarizationTokenThreshold ?? 3000;
    
    toggleMaxTurnsInput();
    
    modal.style.display = 'flex';
}


function hideAgentGroupEditor() {
    if (window.groupSortable) {
        window.groupSortable.destroy();
        window.groupSortable = null;
    }
    document.getElementById('agent-group-editor-modal').style.display = 'none';
    editingGroupName = null;
}

function updateModeratorDropdown(selectedModerator = null) {
    const moderatorSelect = document.getElementById('group-moderator-select');
    const memberItems = document.querySelectorAll('#group-member-list .agent-sortable-item');
    
    const selectedMembers = Array.from(memberItems)
        .filter(item => item.querySelector('input[type="checkbox"]').checked)
        .map(item => item.dataset.agentName);
    
    const currentModerator = moderatorSelect.value;
    moderatorSelect.innerHTML = '';
    
    selectedMembers.forEach(name => {
        moderatorSelect.add(new Option(name, name));
    });

    if (selectedModerator && selectedMembers.includes(selectedModerator)) {
        moderatorSelect.value = selectedModerator;
    } else if (selectedMembers.includes(currentModerator)) {
        moderatorSelect.value = currentModerator;
    }
}

function showMemoryEditor(index = null, event) {
    if(event)event.stopPropagation();
    const modal=document.getElementById('memory-editor-modal');
    const t=document.getElementById('memory-modal-title');
    const n=document.getElementById('memory-name-input');
    const c=document.getElementById('memory-content-input');
    const i=document.getElementById('memory-edit-index');
    if(index!==null){
        const m=currentProject.memories[index];
        t.textContent='แก้ไข Memory';
        n.value=m.name;
        c.value=m.content;
        i.value=index;
    } else {
        t.textContent='เพิ่ม Memory ใหม่';
        n.value='';
        c.value='';
        i.value='';
    }
    modal.style.display='flex';
}

function hideMemoryEditor() { document.getElementById('memory-editor-modal').style.display = 'none'; }

// --- Memory & Session & Chat Rendering ---
function loadAndRenderMemories() {
    const container = document.getElementById('memories-container');
    const activeList = document.getElementById('activeMemoriesList');
    const inactiveList = document.getElementById('inactiveMemoriesList');
    const inactiveSection = document.getElementById('inactiveMemoriesSection');

    activeList.innerHTML = '';
    inactiveList.innerHTML = '';
    
    let activeAgentPreset = null;
    if(currentProject.activeEntity?.type === 'agent') {
        container.style.display = 'block';
        activeAgentPreset = currentProject.agentPresets[currentProject.activeEntity.name];
    } else {
        container.style.display = 'none';
        return;
    }
    
    if (!activeAgentPreset) {
        container.style.display = 'none';
        return;
    }

    const activeMemoryNames = activeAgentPreset.activeMemories || [];
    const allMemoryNames = currentProject.memories.map(m => m.name);
    const activeMemories = activeMemoryNames.filter(name => allMemoryNames.includes(name));
    const inactiveMemories = allMemoryNames.filter(name => !activeMemoryNames.includes(name));

    activeMemories.forEach(name => {
        const memory = currentProject.memories.find(m => m.name === name);
        if (memory) activeList.appendChild(createMemoryElement(memory, true));
    });
    
    inactiveMemories.forEach(name => {
        const memory = currentProject.memories.find(m => m.name === name);
        if(memory) inactiveList.appendChild(createMemoryElement(memory, false));
    });
    
    inactiveSection.style.display = inactiveMemories.length > 0 ? 'block' : 'none';
    
    if (memorySortable) memorySortable.destroy();
    memorySortable = new Sortable(activeList, {
        animation: 150,
        onEnd: (evt) => {
            const agent = currentProject.agentPresets[currentProject.activeEntity.name];
            if (!agent) return;
            const names = agent.activeMemories;
            const movedMemoryName = evt.item.dataset.name;
            names.splice(evt.oldDraggableIndex, 1);
            names.splice(evt.newDraggableIndex, 0, movedMemoryName);
            loadAndRenderMemories();
            updateAndPersistState();
        }
    });
}

function createMemoryElement(memory, isActive) {
    const itemDiv = document.createElement('div');
    itemDiv.className = `item memory-item ${isActive ? 'active' : ''}`;
    itemDiv.dataset.name = memory.name;
    const memoryIndex = currentProject.memories.findIndex(m => m.name === memory.name);

    itemDiv.innerHTML = `
        <div class="item-header">
            <span class="item-name">${memory.name}</span>
            <div class="item-actions">
                <div class="memory-toggle ${isActive ? 'active' : ''}" onclick="toggleMemory('${memory.name}', event)"></div>
                <div class="dropdown align-right">
                    <button class="btn-icon" onclick="toggleDropdown(event)"> &#8942; </button>
                    <div class="dropdown-content">
                        <a href="#" onclick="event.stopPropagation(); showMemoryEditor(${memoryIndex}, event)">&#9998; Edit</a>
                        <a href="#" onclick="event.stopPropagation(); deleteMemory(${memoryIndex}, event)">&#128465; Delete</a>
                    </div>
                </div>
            </div>
        </div>`;
    return itemDiv;
}

function renderSessionList() {
    const pinnedContainer = document.getElementById('pinnedSessionList');
    const recentContainer = document.getElementById('sessionListContainer');
    const archivedList = document.getElementById('archivedSessionList');
    const archivedSection = document.getElementById('archivedSessionsSection');
    
    pinnedContainer.innerHTML = '';
    recentContainer.innerHTML = '';
    archivedList.innerHTML = '';

    const allSessions = currentProject.chatSessions || [];
    const pinnedSessions = allSessions.filter(s => s.pinned && !s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
    const archivedSessions = allSessions.filter(s => s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
    const recentSessions = allSessions.filter(s => !s.pinned && !s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
    
    pinnedSessions.forEach(session => pinnedContainer.appendChild(createSessionElement(session)));
    recentSessions.forEach(session => recentContainer.appendChild(createSessionElement(session)));
    archivedSessions.forEach(session => archivedList.appendChild(createSessionElement(session)));
    
    archivedSection.style.display = archivedSessions.length > 0 ? 'block' : 'none';
}

function createSessionElement(session) {
    const item = document.createElement('div');
    item.className = `item session-item ${session.id === currentProject.activeSessionId ? 'active' : ''} ${session.pinned ? 'pinned' : ''}`;
    item.dataset.sessionId = session.id;
    item.onclick = () => {
        if (currentProject.activeSessionId !== session.id) {
            loadChatSession(session.id);
        }
        if (window.innerWidth <= 1024) {
            toggleMobileSidebar();
        }
    };

    const icon = session.linkedEntity?.type === 'group' ? '🤝' : '🤖';

    item.innerHTML = `
        <div class="item-header">
            <span class="item-name"><span class="item-icon">${icon}</span>${session.pinned ? '📌 ' : ''}${session.name}</span>
             <div class="item-actions dropdown align-right">
                <button class="btn-icon" onclick="toggleDropdown(event)"> &#8942; </button>
                <div class="dropdown-content">
                    <a href="#" onclick="togglePinSession(${session.id}, event)">${session.pinned ? 'Unpin' : 'Pin'}</a>
                    <a href="#" onclick="renameChatSession(${session.id}, event)">Rename</a>
                    <a href="#" onclick="cloneSession(${session.id}, event)">Clone</a>
                    <a href="#" onclick="archiveSession(${session.id}, event)">${session.archived ? 'Unarchive' : 'Archive'}</a>
                    <a href="#" onclick="downloadSession(${session.id}, event)">Download</a>
                    <hr>
                    <a href="#" onclick="deleteChatSession(${session.id}, event)">Delete</a>
                </div>
            </div>
        </div>`;
    return item;
}

function renderChatMessages(){const c=document.getElementById('chatMessages');c.innerHTML=''; const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId); if(session) session.history.forEach((m,i)=>addMessageToUI(m.role,m.content,i, m.speaker));c.scrollTop=c.scrollHeight; updateContextInspector();}

function addMessageToUI(role, content, index, speakerName = null) {
    const container = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.dataset.index = index;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (role === 'assistant' && speakerName) {
        const speakerLabel = document.createElement('span');
        speakerLabel.className = 'speaker-label';
        speakerLabel.textContent = `${speakerName}:`;
        contentDiv.appendChild(speakerLabel);
    }
    
    let agentForMarkdown = currentProject.agentPresets[currentProject.activeEntity.name];
    if (currentProject.activeEntity.type === 'group') {
        agentForMarkdown = currentProject.agentPresets[speakerName] || {};
    }
    const useMarkdown = agentForMarkdown?.useMarkdown !== false;
    
    const contentArray = Array.isArray(content) ? content : [{ type: 'text', text: content }];
    
    contentArray.forEach(part => {
        if (part.type === 'text') {
            if (role === 'assistant' && useMarkdown) {
                 const textSpan = document.createElement('span');
                 textSpan.innerHTML = marked.parse(part.text);
                 contentDiv.appendChild(textSpan);
            } else {
                 const textNode = document.createTextNode(part.text);
                 contentDiv.appendChild(textNode);
            }
        } else if (part.type === 'image_url') {
            const img = document.createElement('img');
            img.src = part.url;
            img.className = 'multimodal-image';
            contentDiv.appendChild(img);
        }
    });
    
    contentDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });

    msgDiv.appendChild(contentDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    
    const editBtn = document.createElement('button');
    editBtn.innerHTML = '&#9998;';
    editBtn.title = 'Edit';
    editBtn.onclick = () => editMessage(index);
    actionsDiv.appendChild(editBtn);
    
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '&#128203;';
    copyBtn.title = 'Copy';
    copyBtn.onclick = (e) => copyMessageToClipboard(e, index);
    actionsDiv.appendChild(copyBtn);

    if (role === 'assistant') {
        const regenBtn = document.createElement('button');
        regenBtn.innerHTML = '&#x21bb;';
        regenBtn.title = 'Regenerate';
        regenBtn.onclick = () => regenerateMessage(index);
        actionsDiv.appendChild(regenBtn);
    } else if (role === 'user') {
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '&#128465;';
        deleteBtn.title = 'Delete';
        deleteBtn.onclick = () => deleteMessage(index);
        actionsDiv.appendChild(deleteBtn);
    }

    if (role !== 'system') {
        msgDiv.appendChild(actionsDiv);
    }
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    return msgDiv;
}

function showFilePreview() {
    if (!attachedFile) return;
    const container = document.getElementById('file-preview-container');
    container.innerHTML = '';
    if (attachedFile.type.startsWith('image/')) {
         const img = document.createElement('img');
         img.src = attachedFile.data;
         img.id = 'image-preview';
         container.appendChild(img);
    } else {
         container.innerHTML = `<div id="file-info"><span>📄</span><span>${attachedFile.name}</span></div>`;
    }
    const removeBtn = document.createElement('button');
    removeBtn.id = 'remove-file-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = removeAttachedFile;
    container.appendChild(removeBtn);
    container.style.display = 'block';
}

function removeAttachedFile() {
    attachedFile = null;
    document.getElementById('file-preview-container').style.display = 'none';
}

function updateContextInspector(isModal = false) {
    const { type, name } = currentProject.activeEntity || {};
    if(!type || !name) return;

    let agent, agentNameForDisplay;

    if (type === 'agent') {
        agentNameForDisplay = name;
        agent = currentProject.agentPresets[name];
    } else if (type === 'group') {
        agentNameForDisplay = name + ' (Group)';
        const group = currentProject.agentGroups[name];
        // For groups, show the moderator's model as representative
        agent = currentProject.agentPresets[group?.moderatorAgent] || {};
    }
     if (!agent) return;

    const finalSystemPrompt = getFullSystemPrompt(type === 'agent' ? name : currentProject.agentGroups[name]?.moderatorAgent);
    const systemTokens = estimateTokens(finalSystemPrompt);
    
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    let historyTokens = 0;
    if (session) {
        historyTokens = estimateTokens(JSON.stringify(session.history));
    }
    const inputTokens = estimateTokens(document.getElementById('chatInput').value);

    const totalTokens = systemTokens + historyTokens + inputTokens;
    
    document.getElementById('active-agent-status').textContent = `Active: ${agentNameForDisplay}`;
    document.getElementById('token-count-status').textContent = `~${totalTokens.toLocaleString()} Tokens`;

    if (isModal) {
        document.getElementById('inspector-agent-name').textContent = agentNameForDisplay;
        document.getElementById('inspector-agent-model').textContent = agent.model || 'N/A';
        document.getElementById('inspector-token-count').textContent = `~${totalTokens.toLocaleString()}`;
        document.getElementById('inspector-system-prompt').textContent = finalSystemPrompt || '(No system prompt or memories active)';
    }
}

function makeSidebarResizable() {
    const verticalResizer = document.querySelector('.sidebar-resizer');
    const horizontalResizer = document.querySelector('.sidebar-horizontal-resizer');
    const sidebar = document.querySelector('.sidebar');
    const mainChatArea = document.querySelector('.main-chat-area');
    const sessionsFrame = document.querySelector('.sessions-frame');
    const memoriesFrame = document.querySelector('.memories-frame');

    let isVerticalResizing = false;
    let isHorizontalResizing = false;

    const verticalMoveHandler = (e) => {
        if (!isVerticalResizing) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const sidebarContent = document.querySelector('.sidebar-content');
        const sidebarRect = sidebarContent.getBoundingClientRect();
        let newHeight = clientY - sidebarRect.top;
        const totalHeight = sidebarContent.offsetHeight;

        if (newHeight < 100) newHeight = 100;
        if (newHeight > totalHeight - 100) newHeight = totalHeight - 100;
        
        const resizerHeight = verticalResizer.offsetHeight;
        sessionsFrame.style.flex = `0 1 ${newHeight}px`;
        memoriesFrame.style.flex = `1 1 ${totalHeight - newHeight - resizerHeight}px`;
    };

    const startVerticalResizing = (e) => {
        e.preventDefault();
        isVerticalResizing = true;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', verticalMoveHandler);
        window.addEventListener('touchmove', verticalMoveHandler, { passive: false });
        window.addEventListener('mouseup', stopVerticalResizing);
        window.addEventListener('touchend', stopVerticalResizing);
    };

    const stopVerticalResizing = () => {
        if (!isVerticalResizing) return;
        isVerticalResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', verticalMoveHandler);
        window.removeEventListener('touchmove', verticalMoveHandler);
        window.removeEventListener('mouseup', stopVerticalResizing);
        window.removeEventListener('touchend', stopVerticalResizing);
        localStorage.setItem('sidebarSplitHeight', sessionsFrame.style.flex);
    };

    verticalResizer.addEventListener('mousedown', startVerticalResizing);
    verticalResizer.addEventListener('touchstart', startVerticalResizing, { passive: false });
    
    const horizontalMoveHandler = (e) => {
        if (!isHorizontalResizing) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let newWidth = clientX;

        if (newWidth < 200) newWidth = 200; // Min width
        if (newWidth > 600) newWidth = 600; // Max width
        
        sidebar.style.width = `${newWidth}px`;
        mainChatArea.style.width = `calc(100% - ${newWidth}px)`;
    };

     const startHorizontalResizing = (e) => {
        e.preventDefault();
        isHorizontalResizing = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', horizontalMoveHandler);
        window.addEventListener('touchmove', horizontalMoveHandler, { passive: false });
        window.addEventListener('mouseup', stopHorizontalResizing);
        window.addEventListener('touchend', stopHorizontalResizing);
    };
    
    const stopHorizontalResizing = () => {
        if (!isHorizontalResizing) return;
        isHorizontalResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', horizontalMoveHandler);
        window.removeEventListener('touchmove', horizontalMoveHandler);
        window.removeEventListener('mouseup', stopHorizontalResizing);
        window.removeEventListener('touchend', stopHorizontalResizing);
        localStorage.setItem('sidebarWidth', sidebar.style.width);
    };

    horizontalResizer.addEventListener('mousedown', startHorizontalResizing);
    horizontalResizer.addEventListener('touchstart', startHorizontalResizing, { passive: false });

    // Restore saved sizes
    const savedHeight = localStorage.getItem('sidebarSplitHeight');
    if (savedHeight) {
        sessionsFrame.style.flex = savedHeight;
    }
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        sidebar.style.width = savedWidth;
        mainChatArea.style.width = `calc(100% - ${savedWidth})`;
    }
}

// เพิ่มฟังก์ชันนี้ที่ท้ายไฟล์ ui.js
function scrollToLinkedEntity(type, name) {
    let element;
    if (type === 'agent') {
        element = document.querySelector(`.item[data-agent-name="${name}"]`);
    } else if (type === 'group') {
        element = document.querySelector(`.item[data-group-name="${name}"]`);
    }

    if (element) {
        // สั่งให้เลื่อนไปที่ element นั้นๆ แบบนุ่มนวลและจัดให้อยู่กลางจอ
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}