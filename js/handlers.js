// --- Event Handlers & Business Logic ---

// --- Project Management Handlers ---
async function handleUnsavedChanges(choice) {
    hideUnsavedChangesModal();
    switch (choice) {
        case 'save':
            const saved = await handleProjectSaveConfirm();
            if (saved) performPendingAction();
            break;
        case 'discard':
            markAsClean();
            performPendingAction();
            break;
        case 'cancel':
        default:
            pendingFileToOpen = null;
            break;
    }
}

function performPendingAction() {
    if (pendingActionAfterSave === 'open') proceedWithOpeningProject();
    else if (pendingActionAfterSave === 'new') proceedWithCreatingNewProject();
}

function createNewProject() {
    if (isDirty) showUnsavedChangesModal('new');
    else proceedWithCreatingNewProject();
}

async function proceedWithCreatingNewProject() {
    const newProject = initializeFirstProject();
    await loadProjectData(newProject, true);
}

function handleFileSelectedForOpen(event) {
    const file = event.target.files[0];
    if (!file) return;
    pendingFileToOpen = file;
    event.target.value = '';
    if (isDirty) showUnsavedChangesModal('open');
    else proceedWithOpeningProject();
}

function proceedWithOpeningProject() {
    if (!pendingFileToOpen) return;
    _loadProjectFromFile(pendingFileToOpen);
    pendingFileToOpen = null;
}

function initializeFirstProject() {
    const projectId = `proj_${Date.now()}`;
    const defaultAgentName = "Default Agent";
    return {
        id: projectId,
        name: "Untitled Project",
        activeEntity: { type: 'agent', name: defaultAgentName },
        agentPresets: {
            [defaultAgentName]: {
                ...defaultAgentSettings,
                activeMemories: []
            }
        },
        agentGroups: {},
        memories: JSON.parse(JSON.stringify(defaultMemories)),
        chatSessions: [],
        summaryLogs: [],
        globalSettings: {
            fontFamilySelect: "'Sarabun', sans-serif",
            apiKey: "",
            ollamaBaseUrl: "http://localhost:11434",
            allModels: []
        }
    };
}

async function loadProjectData(projectData, overwriteDb = false) {
    if (db && db.name !== `${DB_NAME_PREFIX}${projectData.id}`) {
        db.close();
        db = null;
        await openDb(projectData.id);
    } else if (!db) {
        await openDb(projectData.id);
    }
    currentProject = projectData;
    if (!currentProject.summaryLogs) currentProject.summaryLogs = [];
    localStorage.setItem('lastActiveProjectId', currentProject.id);
    if (Array.isArray(currentProject.chatSessions)) {
        currentProject.chatSessions.forEach(session => {
            if (!session.groupChatState) session.groupChatState = { isRunning: false };
            if (!session.summaryState) session.summaryState = {};
        });
    }
    if (overwriteDb) {
        await clearObjectStores([SESSIONS_STORE_NAME, METADATA_STORE_NAME]);
        const transaction = db.transaction([SESSIONS_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
        const sessionStore = transaction.objectStore(SESSIONS_STORE_NAME);
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
        for (const session of projectData.chatSessions) {
            sessionStore.put(session);
        }
        const metadata = { ...projectData };
        delete metadata.chatSessions;
        metadataStore.put({ id: METADATA_KEY, ...metadata });
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = reject;
        });
    }
    document.getElementById('project-title').textContent = currentProject.name;
    await loadGlobalSettings();
    await loadAllProviderModels();
    renderAllSidebarLists();
    if (currentProject.chatSessions.length > 0) {
         const sortedSessions = [...currentProject.chatSessions].filter(s => !s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
         if (sortedSessions.length > 0) {
            await loadChatSession(sortedSessions[0].id);
         } else {
            await createNewChatSession();
         }
    } else {
         await createNewChatSession();
    }
    markAsClean();
}

async function saveProject(saveAs = false) {
    if (saveAs || currentProject.name === "Untitled Project") showSaveProjectModal();
    else await handleProjectSaveConfirm(currentProject.name);
}

async function handleProjectSaveConfirm(projectNameFromDirectSave = null) {
    const newName = projectNameFromDirectSave || document.getElementById('project-name-input').value.trim();
    if (!newName) {
        alert('กรุณาใส่ชื่อโปรเจกต์');
        return false;
    }
    currentProject.name = newName;
    await updateAndPersistState();
    try {
        const dataStr = JSON.stringify(currentProject, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${newName.replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.getElementById('project-title').textContent = newName;
        hideSaveProjectModal();
        markAsClean();
        return true;
    } catch (error) {
        console.error("Failed to save project:", error);
        return false;
    }
}

async function _loadProjectFromFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && data.id && data.name && data.agentPresets) {
                await loadProjectData(data, true);
                alert(`Project '${currentProject.name}' loaded successfully!`);
            } else {
                throw new Error('Invalid project file format.');
            }
        } catch (error) {
            alert(`Error loading project: ${error.message}`);
        }
    };
    reader.readAsText(file);
}

// --- Settings & Entity Management ---
async function loadGlobalSettings() {
    const gs = currentProject.globalSettings || {};
    document.getElementById('fontFamilySelect').value = gs.fontFamilySelect || "'Sarabun', sans-serif";
    document.getElementById('apiKey').value = gs.apiKey || '';
    document.getElementById('ollamaBaseUrl').value = gs.ollamaBaseUrl || 'http://localhost:11434';
    allProviderModels = gs.allModels || [];
    applyFontSettings();
}

async function loadSelectedEntity() {
    const selector = document.getElementById('entitySelector');
    const [type, ...nameParts] = selector.value.split(/_(.*)/s);
    const name = nameParts.join('_');
    await selectEntity(type, name);
}

async function selectEntity(type, name) {
    currentProject.activeEntity = { type, name };
    const activeSession = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (activeSession) {
        if (activeSession.groupChatState) {
            activeSession.groupChatState.isRunning = false;
        }
        activeSession.linkedEntity = { ...currentProject.activeEntity };
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', activeSession);
    }
    renderEntitySelector();
    updateAndPersistState();
    renderAllSidebarLists();
    if (currentProject.activeEntity.type === 'agent') {
        scrollToLinkedEntity('agent', name);
    } else if (currentProject.activeEntity.type === 'group') {
        scrollToLinkedEntity('group', name);
    }
}

function saveAgentPreset() {
    const nameInput = document.getElementById('agent-name-input');
    const newName = nameInput.value.trim();
    const oldName = editingAgentName;
    if (!newName) { alert("Please enter a name for the agent."); return; }
    
    const newAgentSettings = {};
    Object.keys(ALL_AGENT_SETTINGS_IDS).forEach(elId => {
        const key = ALL_AGENT_SETTINGS_IDS[elId];
        if (key === 'name') return;
        const element = document.getElementById(elId);
        if (!element) return;

        let value;
        if (element.type === 'checkbox') value = element.checked;
        else if (element.type === 'number') value = parseFloat(element.value) || 0;
        else value = element.value.trim();
        newAgentSettings[key] = value;
    });

    if (!newAgentSettings.icon) {
        newAgentSettings.icon = '🤖';
    }

    if (oldName && oldName !== newName) {
        if (currentProject.agentPresets[newName]) { alert(`An agent named '${newName}' already exists.`); return; }
        const agentData = currentProject.agentPresets[oldName];
        delete currentProject.agentPresets[oldName];
        currentProject.agentPresets[newName] = { ...agentData, ...newAgentSettings };
        currentProject.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === oldName) {
                session.linkedEntity.name = newName;
            }
        });
        Object.values(currentProject.agentGroups).forEach(group => {
           const memberIndex = group.members.indexOf(oldName);
           if (memberIndex > -1) { group.members[memberIndex] = newName; }
           if(group.moderatorAgent === oldName) { group.moderatorAgent = newName; }
        });
        if (currentProject.activeEntity.type === 'agent' && currentProject.activeEntity.name === oldName) {
            currentProject.activeEntity.name = newName;
        }
    } else if (oldName && oldName === newName) {
        const existingAgent = currentProject.agentPresets[oldName];
        currentProject.agentPresets[oldName] = { ...existingAgent, ...newAgentSettings };
    } else {
        if (currentProject.agentPresets[newName]) { alert("An agent with this name already exists."); return; }
        newAgentSettings.activeMemories = [];
        newAgentSettings.icon = newAgentSettings.icon || RANDOMLY_ASSIGNED_ICONS[Math.floor(Math.random() * RANDOMLY_ASSIGNED_ICONS.length)];
        currentProject.agentPresets[newName] = newAgentSettings;
        currentProject.activeEntity = { type: 'agent', name: newName };
    }
    
    renderAllSidebarLists();
    renderEntitySelector();
    updateAndPersistState();
    hideAgentEditor();
}

function deleteAgentPreset(agentNameToDelete) {
    if (!agentNameToDelete || Object.keys(currentProject.agentPresets).length <= 1) { alert("Cannot delete the last agent."); return; }
    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ Agent '${agentNameToDelete}'? จะถูกลบออกจาก Group ทั้งหมดด้วย`)) {
        delete currentProject.agentPresets[agentNameToDelete];
        Object.values(currentProject.agentGroups).forEach(group => {
            group.members = group.members.filter(m => m !== agentNameToDelete);
            if (group.moderatorAgent === agentNameToDelete) {
                group.moderatorAgent = group.members[0] || '';
            }
        });
        currentProject.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === agentNameToDelete) {
                session.linkedEntity = null;
            }
        });
        if (currentProject.activeEntity.type === 'agent' && currentProject.activeEntity.name === agentNameToDelete) {
            currentProject.activeEntity = {type: 'agent', name: Object.keys(currentProject.agentPresets)[0]};
        }
        renderAllSidebarLists();
        renderEntitySelector();
        updateAndPersistState();
    }
}

function saveAgentGroup() {
    const newName = document.getElementById('group-name-input').value.trim();
    const oldName = editingGroupName;
    if (!newName) { alert("Please enter a name for the group."); return; }
    if (!oldName && currentProject.agentGroups[newName]) { alert("A group with this name already exists."); return; }
    if(oldName && newName !== oldName && currentProject.agentGroups[newName]) { alert("A group with this name already exists."); return; }
    const memberItems = document.querySelectorAll('#group-member-list .agent-sortable-item');
    const members = Array.from(memberItems)
        .filter(item => item.querySelector('input[type="checkbox"]').checked)
        .map(item => item.dataset.agentName);
    if (members.length === 0) { alert("A group must have at least one member."); return; }
    const moderatorAgent = document.getElementById('group-moderator-select').value;
    if (!moderatorAgent || !members.includes(moderatorAgent)) {
        alert("Please select a valid moderator from the group members.");
        return;
    }
    const newGroupData = {
        members: members,
        moderatorAgent: moderatorAgent,
        flowType: document.getElementById('group-flow-select').value,
        maxTurns: parseInt(document.getElementById('group-max-turns-input').value, 10) || 4,
        summarizationTokenThreshold: parseInt(document.getElementById('group-summarization-threshold-input').value, 10) ?? 3000
    };
    if (oldName && oldName !== newName) {
        delete currentProject.agentGroups[oldName];
        currentProject.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'group' && session.linkedEntity.name === oldName) {
                session.linkedEntity.name = newName;
            }
        });
        if(currentProject.activeEntity.type === 'group' && currentProject.activeEntity.name === oldName) {
            currentProject.activeEntity.name = newName;
        }
    }
    currentProject.agentGroups[newName] = newGroupData;
    renderAllSidebarLists();
    renderEntitySelector();
    updateAndPersistState();
    hideAgentGroupEditor();
}

function deleteAgentGroup(groupName) {
     if (!groupName) return;
     if (confirm(`Are you sure you want to delete the group '${groupName}'?`)) {
         delete currentProject.agentGroups[groupName];
         currentProject.chatSessions.forEach(session => {
             if (session.linkedEntity?.type === 'group' && session.linkedEntity.name === groupName) {
                 session.linkedEntity = null;
             }
         });
         if (currentProject.activeEntity.type === 'group' && currentProject.activeEntity.name === groupName) {
             currentProject.activeEntity = {type: 'agent', name: Object.keys(currentProject.agentPresets)[0]};
         }
         renderAllSidebarLists();
         renderEntitySelector();
         updateAndPersistState();
     }
}

// --- Memory Handlers ---
function toggleMemory(name, event) {
    event.stopPropagation();
    if (currentProject.activeEntity.type !== 'agent') return;
    const agent = currentProject.agentPresets[currentProject.activeEntity.name];
    if (!agent) return;
    const activeNames = agent.activeMemories;
    const index = activeNames.indexOf(name);
    if (index > -1) { activeNames.splice(index, 1); } else { activeNames.push(name); }
    loadAndRenderMemories();
    updateAndPersistState();
}
function saveMemory() {
    const n=document.getElementById('memory-name-input').value.trim();
    const c=document.getElementById('memory-content-input').value.trim();
    const i=document.getElementById('memory-edit-index').value;
    if(!n||!c){alert('กรุณากรอกข้อมูลให้ครบ');return;}
    if(i!==''){ currentProject.memories[parseInt(i)]={...currentProject.memories[parseInt(i)],name:n,content:c}; }
    else{ currentProject.memories.push({name:n,content:c}); }
    loadAndRenderMemories();
    hideMemoryEditor();
    updateAndPersistState();
}
function deleteMemory(index, e) {
    e.stopPropagation();
    if(confirm(`ลบ '${currentProject.memories[index].name}'?`)){
        const nameToDelete = currentProject.memories[index].name;
        currentProject.memories.splice(index,1);
        Object.values(currentProject.agentPresets).forEach(agent => {
            const memIndex = agent.activeMemories.indexOf(nameToDelete);
            if (memIndex > -1) agent.activeMemories.splice(memIndex, 1);
        });
        loadAndRenderMemories();
        updateAndPersistState();
    }
}

// --- Chat Session Handlers ---
async function createNewChatSession() {
    const newSession = {
        id: `sid_${Date.now()}`,
        name: 'New Chat',
        history: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        archived: false,
        linkedEntity: { ...currentProject.activeEntity },
        groupChatState: { isRunning: false },
        summaryState: { activeSummaryId: null, summarizedUntilIndex: 0 }
    };
    try {
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'add', newSession);
        currentProject.chatSessions.unshift(newSession);
        await loadChatSession(newSession.id);
        updateAndPersistState();
    } catch (error) {
        console.error("Failed to create new session in DB:", error);
        alert("เกิดข้อผิดพลาดในการสร้าง Chat ใหม่");
    }
}
async function loadChatSession(id) {
    if (isLoading) return;
    const session = currentProject.chatSessions.find(s => s.id === id);
    if (session) {
        if (!session.groupChatState) session.groupChatState = { isRunning: false };
        if (!session.summaryState) session.summaryState = { activeSummaryId: null, summarizedUntilIndex: 0 };
        currentProject.activeSessionId = id;
        if (session.linkedEntity?.type === 'agent' && currentProject.agentPresets[session.linkedEntity.name]) {
            currentProject.activeEntity = { ...session.linkedEntity };
        } else if (session.linkedEntity?.type === 'group' && currentProject.agentGroups[session.linkedEntity.name]) {
             currentProject.activeEntity = { ...session.linkedEntity };
        } else {
            currentProject.activeEntity = { type: 'agent', name: Object.keys(currentProject.agentPresets)[0] };
            session.linkedEntity = { ...currentProject.activeEntity };
        }
        if (currentProject.activeEntity) {
            scrollToLinkedEntity(currentProject.activeEntity.type, currentProject.activeEntity.name);
        }
        document.getElementById('chat-title').textContent = session.name;
        renderEntitySelector();
        renderChatMessages();
        renderAllSidebarLists();
    }
}
async function renameChatSession(id, e, newNamePrompt = null) {
    if (e) e.stopPropagation();
    const session = currentProject.chatSessions.find(s => s.id === id);
    if (!session) return;
    const newName = newNamePrompt || prompt("ชื่อใหม่:", session.name);
    if (newName && newName.trim()) {
        session.name = newName.trim();
        session.updatedAt = Date.now();
        renderAllSidebarLists();
        if (id === currentProject.activeSessionId) document.getElementById('chat-title').textContent = newName;
        updateAndPersistState();
        dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    }
}
async function deleteChatSession(id, e) {
    if (e) e.stopPropagation();
    if (!confirm("ลบ Chat?")) return;
    const sessionIndex = currentProject.chatSessions.findIndex(s => s.id === id);
    if (sessionIndex === -1) return;
    currentProject.chatSessions.splice(sessionIndex, 1);
    
    dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'delete', id).then(async () => {
        if (currentProject.activeSessionId === id) {
            currentProject.activeSessionId = null;
            const nextSession = currentProject.chatSessions.find(s => !s.archived) || currentProject.chatSessions[0];
            if (nextSession) { await loadChatSession(nextSession.id); }
            else { await createNewChatSession(); }
        }
        await updateAndPersistState();
        renderAllSidebarLists();
    });
}
async function togglePinSession(id, event) {
    event.preventDefault(); event.stopPropagation();
    const session = currentProject.chatSessions.find(s => s.id === id);
    if (!session) return;
    session.pinned = !session.pinned;
    session.updatedAt = Date.now();
    dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session).then(() => { renderAllSidebarLists(); updateAndPersistState(); });
}

async function cloneSession(id, event) {
    event.preventDefault();
    event.stopPropagation();

    const sessionToClone = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'get', id);
    if (!sessionToClone) {
        alert("Error: Could not find session to clone.");
        return;
    }

    const newSession = JSON.parse(JSON.stringify(sessionToClone));
    newSession.id = `sid_${Date.now()}`;
    newSession.name = `${sessionToClone.name} (Copy)`;
    newSession.createdAt = Date.now();
    newSession.updatedAt = Date.now();
    newSession.pinned = false;
    newSession.archived = false;

    try {
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'add', newSession);
        currentProject.chatSessions.unshift(newSession);
        await loadChatSession(newSession.id);
        await updateAndPersistState();
    } catch (error) {
        console.error("Failed to save cloned session:", error);
        alert("An error occurred while cloning the session.");
    }
}

async function archiveSession(id, event) {
    event.preventDefault(); event.stopPropagation();
    const session = currentProject.chatSessions.find(s => s.id === id);
    if (!session) return;
    session.archived = !session.archived;
    if (session.archived) { session.pinned = false; }
    session.updatedAt = Date.now();
    dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session).then(() => {
        renderAllSidebarLists();
        updateAndPersistState();
         if (currentProject.activeSessionId === id && session.archived) {
            currentProject.activeSessionId = null;
            const nextSession = currentProject.chatSessions.find(s => !s.archived);
            if (nextSession) { loadChatSession(nextSession.id); }
            else { createNewChatSession(); }
        }
    });
}
function downloadSession(id, event) { event.preventDefault(); event.stopPropagation(); exportChat(id); }
async function saveCurrentChatHistory(history) {
    if (!currentProject.activeSessionId) return;
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session) return;
    session.history = history;
    session.updatedAt = Date.now();
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    updateAndPersistState();
}

// --- Message Handlers ---
function copyMessageToClipboard(event, index) {
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if(!session) return;
    let textToCopy = '';
    const content = session.history[index].content;
    if (typeof content === 'string') { textToCopy = content; }
    else if (Array.isArray(content)) { const textPart = content.find(part => part.type === 'text'); if (textPart) textToCopy = textPart.text; }
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const btn = event.currentTarget;
        btn.innerHTML = '&#10003;';
        setTimeout(() => { btn.innerHTML = '&#128203;'; }, 1500);
    }).catch(err => console.error('Async clipboard write failed:', err));
}
function editMessage(index){ const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId); if(!session) return; const msg=session.history[index]; if(msg.role==='user'){const newContent=prompt('แก้ไข:',msg.content);if(newContent&&newContent.trim()!==msg.content){session.history=session.history.slice(0,index);renderChatMessages();document.getElementById('chatInput').value=newContent;sendMessage();}}else if(msg.role==='assistant'){const div=document.querySelector(`.message[data-index='${index}'] .message-content`);const isEditing=div.isContentEditable;if(isEditing){div.contentEditable=false;session.history[index].content=div.textContent;saveCurrentChatHistory(session.history);div.style.border='none';}else{div.contentEditable=true;div.style.border='1px solid var(--primary-color)';div.focus();}}}
function regenerateMessage(index) {
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session || index >= session.history.length) return;
    stopGeneration();
    const targetMessage = session.history[index];
    const group = currentProject.agentGroups[currentProject.activeEntity.name];
    if (currentProject.activeEntity.type === 'group' && group && targetMessage.speaker) {
        const lastUserIndex = session.history.slice(0, index).findLastIndex(m => m.role === 'user');
        if (lastUserIndex === -1) return;
        session.history.splice(lastUserIndex + 1);
        renderChatMessages();
        sendMessage(false);
    } else { 
        let lastUserIndex = -1;
        for (let i = index; i >= 0; i--) {
            if (session.history[i].role === 'user') {
                lastUserIndex = i;
                break;
            }
        }
        if (lastUserIndex === -1) return;
        session.history.splice(lastUserIndex + 1);
        renderChatMessages();
        sendMessage(true);
    }
}
function deleteMessage(index) {
    if (!confirm("Are you sure? This will delete this message and all subsequent messages in this chat.")) return;
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session) return;
    session.history = session.history.slice(0, index);
    renderChatMessages();
    saveCurrentChatHistory(session.history);
}

// --- Context & Payload Building ---
function getFullSystemPrompt(agentName) {
    if (!currentProject.agentPresets || !agentName) return "";
    const agent = currentProject.agentPresets[agentName];
    if (!agent) return "";
    const systemPrompt = agent.systemPrompt || '';
    const activeMemoryNames = agent.activeMemories || [];
    const activeMemoriesContent = currentProject.memories.filter(m => activeMemoryNames.includes(m.name)).map(m => m.content).join('\n');
    let finalSystemContent = systemPrompt;
    if (activeMemoriesContent) {
        finalSystemContent += `\n\n--- Active Memories ---\n` + activeMemoriesContent;
    }
    return finalSystemContent.trim();
}
function estimateTokens(text) { return Math.ceil((text || "").length / 3); }
function calculateHistoryTokens(historyArray) {
    let totalTokens = 0;
    for (const msg of historyArray) {
        let textContent = '';
        if (typeof msg.content === 'string') {
            textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
            const textPart = msg.content.find(p => p.type === 'text');
            if (textPart) textContent = textPart.text;
        }
        if (msg.role !== 'system' || !textContent.startsWith('[ ระบบได้ทำการสรุป')) {
             totalTokens += estimateTokens(textContent);
        }
    }
    return totalTokens;
}
function buildPayloadMessages(history, targetAgentName, session) { 
    const messages = [];
    const finalSystemPrompt = getFullSystemPrompt(targetAgentName);
    if (finalSystemPrompt) { messages.push({ role: 'system', content: finalSystemPrompt }); }
    const agent = currentProject.agentPresets[targetAgentName];
    if (!agent) return messages;
    let historyToSend = [...history];
    if (session && session.summaryState && session.summaryState.activeSummaryId) {
        const activeLog = currentProject.summaryLogs.find(log => log.id === session.summaryState.activeSummaryId);
        if (activeLog) {
            historyToSend = [];
            const { metadata, content } = activeLog;
            const summaryContext = `[This is a summary of a preceding conversation. METADATA - Origin: ${metadata.originType} ('${metadata.originName}'), Title: "${metadata.title}". SUMMARY CONTENT: ${content}]`;
            const summaryMessage = { role: "system", content: summaryContext };
            historyToSend.push(summaryMessage);
            const remainingHistory = history.slice(session.summaryState.summarizedUntilIndex);
            historyToSend.push(...remainingHistory);
        }
    }
    const modelData = allProviderModels.find(m => m.id === agent.model);
    const provider = modelData ? modelData.provider : null;
    historyToSend.forEach(msg => {
        if(msg.role === 'system') return; 
        let apiMessage = { role: msg.role };
        if(msg.speaker && msg.role === 'assistant') { apiMessage.name = msg.speaker.replace(/\s+/g, '_'); }
        if (typeof msg.content === 'string') { apiMessage.content = msg.content; }
        else if (Array.isArray(msg.content)) {
            if (provider === 'ollama') {
                const textPart = msg.content.find(p => p.type === 'text');
                const imagePart = msg.content.find(p => p.type === 'image_url');
                if (textPart) apiMessage.content = textPart.text;
                if (imagePart) apiMessage.images = [imagePart.url.split(',')[1]];
            } else {
                apiMessage.content = msg.content.map(part => {
                    if(part.type === 'image_url') return { type: 'image_url', image_url: { url: part.url } };
                    return part;
                });
            }
        }
        messages.push(apiMessage);
    });
    return messages;
}

// --- Core Message Sending Logic ---
async function sendMessage(isRegeneration = false) {
    const { type } = currentProject.activeEntity;
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (session && session.groupChatState && session.groupChatState.isRunning) {
        stopGeneration();
    }
    if (type === 'group') {
        await runConversationTurn();
    } else {
        await sendSingleAgentMessage(isRegeneration);
    }
}
async function sendSingleAgentMessage(isRegeneration = false) {
    const input = document.getElementById('chatInput');
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session) { alert("Active chat session not found."); return; }
    if (!isRegeneration) {
        const message = input.value.trim();
        if (!message && !attachedFile) return;
        let userMessageContent = [];
        if (message) userMessageContent.push({ type: 'text', text: message });
        if (attachedFile) {
            if (attachedFile.type.startsWith('image/')) userMessageContent.push({ type: 'image_url', url: attachedFile.data });
            else userMessageContent.push({type: 'text', text: `[File Attached: ${attachedFile.name}]`});
        }
        if (userMessageContent.length === 1 && userMessageContent[0].type === 'text') {
            userMessageContent = userMessageContent[0].text;
        }
        session.history.push({ role: 'user', content: userMessageContent });
        input.value = ''; input.style.height = 'auto';
        removeAttachedFile();
        renderChatMessages();
    }
    const agentName = currentProject.activeEntity.name;
    const agent = currentProject.agentPresets[agentName];
    if (!agent || !agent.model) { alert('Please select an agent with a configured model.'); return; }
    const shouldRenameSession = session.name === 'New Chat' && session.history.length === 1 && !isRegeneration;
    isLoading = true;
    document.getElementById('sendBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'flex';
    updateStatus('กำลังรอการตอบกลับ...', 'loading');
    const assistantMsgIndex = session.history.length;
    const assistantMsgDiv = addMessageToUI('assistant', '', assistantMsgIndex);
    const contentDiv = assistantMsgDiv.querySelector('.message-content');
    contentDiv.innerHTML = '<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
    abortController = new AbortController();
    try {
        const messages = buildPayloadMessages(session.history, agentName, session);
        const finalResponseText = await streamLLMResponse(contentDiv, agent, messages);
        session.history.push({ role: 'assistant', content: finalResponseText });
        if (shouldRenameSession) await generateAndRenameSession(session.history);
    } catch (error) {
        if (error.name !== 'AbortError') {
            session.history.push({ role: 'assistant', content: `เกิดข้อผิดพลาด: ${error.message}` });
        } else {
             session.history.push({ role: 'assistant', content: `<i>การสร้างข้อความถูกยกเลิก</i>` });
        }
    } finally {
        isLoading = false;
        document.getElementById('sendBtn').style.display = 'flex';
        document.getElementById('stopBtn').style.display = 'none';
        abortController = null;
        updateContextInspector();
        updateStatus('Ready', 'connected');
        renderChatMessages();
        await saveCurrentChatHistory(session.history);
    }
}

// --- Summary Log Handlers ---
async function handleManualSummarize() {
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session) { alert("No active session found."); return; }
    let summarizerAgentName = null;
    const activeEntity = currentProject.activeEntity;
    if (activeEntity.type === 'group') {
        const group = currentProject.agentGroups[activeEntity.name];
        if (group) summarizerAgentName = group.moderatorAgent;
    } else {
        summarizerAgentName = activeEntity.name;
    }
    if (!summarizerAgentName) {
        alert("Could not determine an agent to perform the summarization.");
        return;
    }
    if (confirm(`คุณต้องการให้ '${summarizerAgentName}' สรุปบทสนทนาส่วนที่ยังไม่ได้สรุปหรือไม่?`)) {
        await summarizeHistoryAndCreateLog(session, summarizerAgentName);
    }
}
async function summarizeHistoryAndCreateLog(session, summarizerAgentName) {
    console.log(`Attempting to summarize history with agent: ${summarizerAgentName}...`);
    updateStatus("Summarizing conversation...", 'loading');
    const summarizerAgent = currentProject.agentPresets[summarizerAgentName];
    if (!summarizerAgent) {
        updateStatus(`Agent '${summarizerAgentName}' not found.`, 'error');
        return;
    }
    const historyToSummarize = session.history.slice((session.summaryState?.summarizedUntilIndex || 0));
    if (historyToSummarize.length === 0) {
        updateStatus('No new messages to summarize.', 'connected');
        return;
    }
    try {
        updateStatus("Generating title...", 'loading');
        const titlePrompt = `Based on the following conversation, create a very short, descriptive title (about 5-7 words). Respond with ONLY the title text itself, without any quotation marks. Conversation:\n\n${historyToSummarize.map(m => typeof m.content === 'string' ? m.content : m.content.find(p => p.type==='text')?.text || '').join('\n').substring(0, 1500)}`;
        const generatedTitle = await callLLM(summarizerAgent, [{ role: 'user', content: titlePrompt }]);
        
        updateStatus("Generating summary content...", 'loading');
        const activeLogId = session.summaryState?.activeSummaryId;
        const previousSummary = activeLogId ? (currentProject.summaryLogs.find(l => l.id === activeLogId)?.content || "") : "This is the beginning of the conversation.";
        const summaryPrompt = `You are a summarization expert. Your task is to update and refine a running summary.\n\nHere is the summary of the conversation so far:\n--- PREVIOUS SUMMARY ---\n${previousSummary}\n--- END PREVIOUS SUMMARY ---\n\nNow, here are the new messages that have occurred since the last summary:\n--- NEW MESSAGES ---\n${historyToSummarize.map(m => `${m.speaker || m.role}: ${typeof m.content === 'string' ? m.content : '[multimodal content]'}`).join('\n')}\n--- END NEW MESSAGES ---\n\nPlease provide a new, single, cohesive summary that integrates the key points from the new messages into the previous summary. Refine the entire summary into a single, updated narrative. Respond with ONLY the new, complete summary.`;
        const summaryContent = await callLLM(summarizerAgent, [{ role: 'user', content: summaryPrompt }]);
        
        const newLog = {
            id: `sum_${Date.now()}`,
            content: summaryContent,
            metadata: {
                title: generatedTitle.trim(),
                originType: currentProject.activeEntity.type,
                originName: currentProject.activeEntity.name,
                originSession: { id: session.id, name: session.name },
                createdAt: Date.now()
            }
        };
        currentProject.summaryLogs.push(newLog);
        session.summaryState = {
            activeSummaryId: newLog.id,
            summarizedUntilIndex: session.history.length
        };
        
        const systemMessage = {
            role: 'system',
            content: `[ ระบบได้ทำการสรุปบทสนทนาในหัวข้อ: "${newLog.metadata.title}" และบันทึกลงในคลังแล้ว ]`
        };
        session.history.push(systemMessage);
        
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        await updateAndPersistState();
        renderChatMessages();
        renderSummaryLogList();
        updateStatus("Summarization complete.", 'connected');
    } catch (error) {
        console.error("Failed to summarize history:", error);
        updateStatus("Failed to summarize.", 'error');
    }
}
async function loadSummaryToActiveSession(summaryId, event) {
    event.preventDefault();
    event.stopPropagation();
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    const summaryLog = currentProject.summaryLogs.find(l => l.id === summaryId);
    if (!session || !summaryLog) return;
    
    session.summaryState = {
        activeSummaryId: summaryId,
        summarizedUntilIndex: session.history.length
    };
    
    const systemMessage = {
        role: 'system',
        content: `[ ระบบได้โหลดบริบทจากบทสรุป: "${summaryLog.metadata.title}" ]`
    };
    session.history.push(systemMessage);
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    await updateAndPersistState();
    renderChatMessages();
    renderSummaryLogList();
}
async function unloadSummaryFromActiveSession(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('chat-actions-menu').classList.remove('active');
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session || !session.summaryState?.activeSummaryId) return;
    session.summaryState = {
        activeSummaryId: null,
        summarizedUntilIndex: session.history.length
    };
    const systemMessage = {
        role: 'system',
        content: `[ ระบบได้ล้างบริบทจากบทสรุปแล้ว การสนทนาจะใช้ประวัติล่าสุดตามปกติ ]`
    };
    session.history.push(systemMessage);
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    await updateAndPersistState();
    renderChatMessages();
    renderSummaryLogList();
}
function viewSummary(summaryId, event) {
    event.preventDefault();
    event.stopPropagation();
    const summaryLog = currentProject.summaryLogs.find(l => l.id === summaryId);
    if (!summaryLog) return;
    document.getElementById('view-summary-title').textContent = summaryLog.metadata.title;
    document.getElementById('view-summary-content').textContent = summaryLog.content;
    showViewSummaryModal();
}
async function deleteSummary(summaryId, event) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this summary log?")) return;
    const logIndex = currentProject.summaryLogs.findIndex(l => l.id === summaryId);
    if (logIndex > -1) {
        currentProject.summaryLogs.splice(logIndex, 1);
        currentProject.chatSessions.forEach(session => {
            if (session.summaryState?.activeSummaryId === summaryId) {
                session.summaryState.activeSummaryId = null;
            }
        });
        await updateAndPersistState();
        renderAllSidebarLists();
    }
}

// --- Group Chat Logic ---
async function runConversationTurn() {
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session) { alert("Active chat session not found."); return; }
    if (isLoading) { console.log("A turn is already in progress."); return; }
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message && !attachedFile) return;
    let userMessageContent = [];
    if (message) userMessageContent.push({ type: 'text', text: message });
    if (attachedFile) {
        const type = attachedFile.type.startsWith('image/') ? 'image_url' : 'text';
        const content = type === 'image_url' ? attachedFile.data : `[File Attached: ${attachedFile.name}]`;
        if (type === 'image_url') {
            userMessageContent.push({ type: 'image_url', url: content });
        } else {
             userMessageContent.push({ type: 'text', text: content });
        }
    }
    if (userMessageContent.length === 1 && userMessageContent[0].type === 'text') {
        userMessageContent = userMessageContent[0].text;
    }
    session.history.push({ role: 'user', content: userMessageContent });
    input.value = ''; input.style.height = 'auto';
    removeAttachedFile();
    renderChatMessages();
    const group = currentProject.agentGroups[currentProject.activeEntity.name];
    if (!group || !group.members || group.members.length === 0) { return; }
    session.groupChatState.isRunning = true;
    isLoading = true;
    document.getElementById('sendBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'flex';
    abortController = new AbortController();
    try {
        let conversationPlan;
        if (group.flowType === 'auto-moderator') {
            conversationPlan = await createModeratorDefinedPlan(group, session.history, session);
        } else {
            conversationPlan = createRoundRobinPlan(group);
        }
        if (!conversationPlan || conversationPlan.length === 0) {
            throw new Error("Failed to create a valid conversation plan.");
        }
        for (const speakerName of conversationPlan) {
            try {
                if (!session.groupChatState.isRunning) { break; }
                const speakerAgent = currentProject.agentPresets[speakerName];
                if (!speakerAgent) { console.warn(`Agent '${speakerName}' not found. Skipping.`); continue; }
                updateStatus(`${speakerName} is typing...`, 'loading');
                const assistantMsgIndex = session.history.length;
                const assistantMsgDiv = addMessageToUI('assistant', '', assistantMsgIndex, speakerName);
                const contentDiv = assistantMsgDiv.querySelector('.message-content');
                contentDiv.innerHTML = `<span class="speaker-label">${speakerAgent.icon || '🤖'} ${speakerName}:</span> <div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div></div>`;
                const messagesForSpeaker = buildPayloadMessages(session.history, speakerName, session);
                const responseText = await streamLLMResponse(contentDiv, speakerAgent, messagesForSpeaker, speakerName);
                session.history.push({ role: 'assistant', content: responseText, speaker: speakerName });
                assistantMsgDiv.remove();
                addMessageToUI('assistant', responseText, assistantMsgIndex, speakerName);
            } catch(agentError) {
                console.error(`Agent '${speakerName}' failed to respond:`, agentError);
                const errorMessage = `[Agent '${speakerName}' failed to respond. Error: ${agentError.message}]`;
                session.history.push({ role: 'assistant', content: errorMessage, speaker: "System"});
                renderChatMessages();
            }
            if (session.groupChatState.isRunning) { await new Promise(resolve => setTimeout(resolve, 500)); }
        }
    } catch (error) {
        console.error("A critical error occurred in the conversation flow:", error);
        updateStatus(`Critical Error: ${error.message}`, 'error');
    } finally {
        stopGeneration();
        await saveCurrentChatHistory(session.history);
        console.log("Group conversation turn finished.");
    }
}
async function createModeratorDefinedPlan(group, contextHistory, session) {
    const moderatorAgentName = group.moderatorAgent;
    const moderator = currentProject.agentPresets[moderatorAgentName];
    if (!moderator) {
        console.warn(`Moderator agent '${moderatorAgentName}' not found. Falling back to Round Robin.`);
        return createRoundRobinPlan(group);
    }
    updateStatus(`Moderator (${moderatorAgentName}) is planning the conversation...`, 'loading');
    const availableMembers = group.members.filter(name => name !== moderatorAgentName);
    const userPrompt = contextHistory.findLast(m => m.role === 'user')?.content || "";
    const agentDescriptions = availableMembers
        .map(name => {
            const agent = currentProject.agentPresets[name];
            return `- ${agent.icon || '🤖'} ${name}: ${agent?.systemPrompt.substring(0, 150)}...`;
        })
        .join('\n');
    const metaPrompt = `You are a master of ceremonies...`; // Same as before
    const moderatorMessages = buildPayloadMessages(contextHistory, moderatorAgentName, session);
    moderatorMessages.push({ role: 'user', content: metaPrompt });
    try {
        const responseText = await callLLM(moderator, moderatorMessages);
        const jsonMatch = responseText.match(/{.*}/s);
        if (!jsonMatch) { throw new Error("No valid JSON object found."); }
        const jsonString = jsonMatch[0];
        const parsed = JSON.parse(jsonString);
        if (parsed.plan && Array.isArray(parsed.plan)) {
            const validPlan = parsed.plan.filter(name => availableMembers.includes(name));
            if (validPlan.length > 0) {
                updateStatus('Moderator has created a plan. Starting conversation...', 'loading');
                return validPlan;
            }
        }
        throw new Error("Invalid plan format from moderator.");
    } catch (error) {
        console.error("Moderator failed to create a plan:", error, "Falling back to Round Robin.");
        updateStatus('Moderator plan failed. Falling back to simple sequence...', 'warning');
        return createRoundRobinPlan(group);
    }
}
function createRoundRobinPlan(group) {
    const members = group.members.filter(name => name !== group.moderatorAgent);
    const maxTurns = group.maxTurns || members.length;
    const plan = [];
    if (!members || members.length === 0) return [];
    for (let i = 0; i < maxTurns; i++) {
        plan.push(members[i % members.length]);
    }
    return plan;
}
function stopGeneration(){
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (session && session.groupChatState) {
        session.groupChatState.isRunning = false;
    }
    if(abortController){
        abortController.abort();
    }
    isLoading = false;
    document.getElementById('sendBtn').style.display = 'flex';
    document.getElementById('stopBtn').style.display = 'none';
    abortController = null;
    updateStatus('Ready', 'connected');
}
function exportChat(sessionId = null) {
    const idToExport = sessionId || currentProject.activeSessionId;
    if (!idToExport) { alert('No active chat session to export.'); return; }
    const session = currentProject.chatSessions.find(s => s.id === idToExport);
    if (!session) { alert('Could not find session data to export.'); return; }
    const sessionName = session.name || 'Untitled_Chat';
    let exportText = `Chat Export - Session: ${sessionName}\n================\n\n`;
    session.history.forEach(msg => {
        const sender = msg.speaker || (msg.role.charAt(0).toUpperCase() + msg.role.slice(1));
        let contentText = '';
        if(typeof msg.content === 'string') { contentText = msg.content; }
        else if (Array.isArray(msg.content)) { contentText = msg.content.find(p => p.type === 'text')?.text || '[Image]'; }
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
function saveMemoryPackage() {
    try {
        const packageData = { memories: currentProject.memories, agentPresets: currentProject.agentPresets };
        const dataStr = JSON.stringify(packageData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `promptprim_agent_package_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('Error saving agent package.');
        console.error(e);
    }
}
function loadMemoryPackage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && Array.isArray(data.memories) && typeof data.agentPresets === 'object') {
                currentProject.memories = [...currentProject.memories, ...data.memories.filter(newMem => !currentProject.memories.find(oldMem => oldMem.name === newMem.name))];
                Object.assign(currentProject.agentPresets, data.agentPresets);
                renderAllSidebarLists();
                alert('Agent package loaded successfully!');
                updateAndPersistState();
            } else {
                throw new Error('Invalid JSON format for agent package.');
            }
        } catch (error) {
            alert(`Error loading agent package: ${error.message}`);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { alert('File size exceeds 100MB.'); return; }
    attachedFile = { name: file.name, type: file.type, data: null };
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => { attachedFile.data = e.target.result; showFilePreview(); };
        reader.readAsDataURL(file);
    } else { showFilePreview(); }
    hideImageUploadModal();
    event.target.value = '';
}
function handleImageUrlConfirm() {
    const url = document.getElementById('image-url-input').value.trim();
    if (url) { attachedFile = { name: url.split('/').pop(), type: 'image/url', data: url }; showFilePreview(); }
    hideImageUploadModal();
}