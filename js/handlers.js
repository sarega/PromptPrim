// [โค้ดสำหรับดีบักชั่วคราว]
console.log('HANDLERS.JS LOADED: Is defaultSystemUtilityAgent defined?', typeof defaultSystemUtilityAgent);
if (typeof defaultSystemUtilityAgent === 'undefined') {
    alert('FATAL ERROR: state.js is not loaded correctly before handlers.js! Please clear your browser cache (Hard Refresh: Ctrl+Shift+R) and check the script order in index.html.');
}
// ---

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
        agentPresets: { [defaultAgentName]: { ...defaultAgentSettings, activeMemories: [] } },
        agentGroups: {},
        memories: JSON.parse(JSON.stringify(defaultMemories)),
        chatSessions: [],
        summaryLogs: [],
        globalSettings: {
            fontFamilySelect: "'Sarabun', sans-serif",
            apiKey: "",
            ollamaBaseUrl: "http://localhost:11434",
            allModels: [],
            systemUtilityAgent: { ...defaultSystemUtilityAgent },
            summarizationPromptPresets: JSON.parse(JSON.stringify(defaultSummarizationPresets)) // [NEW] เพิ่มส่วนนี้
        }
    };
}

function migrateProjectData(projectData) {
    if (!projectData.globalSettings) projectData.globalSettings = {};
    if (!projectData.globalSettings.systemUtilityAgent) {
        projectData.globalSettings.systemUtilityAgent = { ...defaultSystemUtilityAgent };
    }
        if (!projectData.globalSettings.summarizationPromptPresets) {
        projectData.globalSettings.summarizationPromptPresets = JSON.parse(JSON.stringify(defaultSummarizationPresets));
    }
    if (projectData.activeAgent && !projectData.activeEntity) {
        projectData.activeEntity = { type: 'agent', name: projectData.activeAgent };
        delete projectData.activeAgent;
    } else if (!projectData.activeEntity) {
        const firstAgentName = projectData.agentPresets ? Object.keys(projectData.agentPresets)[0] : "Default Agent";
        projectData.activeEntity = { type: 'agent', name: firstAgentName };
    }
    if (projectData.agentPresets && projectData.agentPresets['undefined']) {
        delete projectData.agentPresets['undefined'];
    }
    if (!projectData.summaryLogs) projectData.summaryLogs = [];
    if (projectData.agentPresets) {
        for (const agentName in projectData.agentPresets) {
            if (!projectData.agentPresets[agentName].icon) projectData.agentPresets[agentName].icon = '🤖';
            if (!projectData.agentPresets[agentName].activeMemories) projectData.agentPresets[agentName].activeMemories = [];
        }
    }
    if (Array.isArray(projectData.chatSessions)) {
        projectData.chatSessions.forEach(session => {
            if (typeof session.id === 'number') {
                session.id = `sid_${session.id}`;
            }
            session.pinned = session.pinned ?? false;
            session.archived = session.archived ?? false;
            session.linkedEntity = session.linkedEntity ?? { ...projectData.activeEntity };
            if (!session.groupChatState) session.groupChatState = { isRunning: false };
            if (session.summaryState && session.summaryState.hasOwnProperty('lastSummary')) {
                session.summaryState = { activeSummaryId: null, summarizedUntilIndex: session.summaryState.summarizedUntilIndex || 0 };
            } else if (!session.summaryState) {
                 session.summaryState = { activeSummaryId: null, summarizedUntilIndex: 0 };
            }
            if (session.linkedAgentName) delete session.linkedAgentName;
            if (session.roundRobinState) delete session.roundRobinState;
        });
    }
    return projectData;
}

// [REFACTORED] Replace this function to correctly handle model list initialization
async function loadProjectData(projectData, overwriteDb = false) {
    const migratedProject = migrateProjectData(projectData);
    if (db && db.name !== `${DB_NAME_PREFIX}${migratedProject.id}`) {
        db.close(); db = null;
        await openDb(migratedProject.id);
    } else if (!db) {
        await openDb(migratedProject.id);
    }
    
    currentProject = migratedProject;
    allProviderModels = currentProject.globalSettings.allModels || [];
    localStorage.setItem('lastActiveProjectId', currentProject.id);

    if (overwriteDb) {
        await clearObjectStores([SESSIONS_STORE_NAME, METADATA_STORE_NAME]);
        const transaction = db.transaction([SESSIONS_STORE_NAME, METADATA_STORE_NAME], 'readwrite');
        // ... (rest of DB logic is the same)
        const sessionStore = transaction.objectStore(SESSIONS_STORE_NAME);
        currentProject.chatSessions.forEach(session => sessionStore.put(session));
        const metadata = { ...currentProject };
        delete metadata.chatSessions;
        transaction.objectStore(METADATA_STORE_NAME).put({ id: METADATA_KEY, ...metadata });
        await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = reject; });
    }

    document.getElementById('project-title').textContent = currentProject.name;
    
    // [MODIFIED] Corrected loading order
    populateModelSelectors(); // 1. Populate UI dropdowns with models
    await loadGlobalSettings(); // 2. Set the selected values on the populated dropdowns
    
    if (allProviderModels.length === 0 && currentProject.globalSettings.apiKey) {
        await loadAllProviderModels();
    }
    
    renderAllSidebarLists();
    const sortedSessions = [...currentProject.chatSessions].filter(s => !s.archived).sort((a,b) => b.updatedAt - a.updatedAt);
    if (sortedSessions.length > 0) { await loadChatSession(sortedSessions[0].id); } 
    else { await createNewChatSession(); }
    
    markAsClean();
}

async function saveProject(saveAs = false) {
    if (saveAs || currentProject.name === "Untitled Project") showSaveProjectModal();
    else await handleProjectSaveConfirm(currentProject.name);
}

async function handleProjectSaveConfirm(projectNameFromDirectSave = null) {
    const newName = projectNameFromDirectSave || document.getElementById('project-name-input').value.trim();
    if (!newName) { alert('กรุณาใส่ชื่อโปรเจกต์'); return false; }
    currentProject.name = newName;
    document.getElementById('project-title').textContent = newName;
    let projectToSave = JSON.parse(JSON.stringify(currentProject));
    projectToSave = migrateProjectData(projectToSave);
    try {
        const dataStr = JSON.stringify(projectToSave, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${newName.replace(/\s+/g, '_')}.json`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        await updateAndPersistState();
        hideSaveProjectModal();
        markAsClean();
        return true;
    } catch (error) { console.error("Failed to save project:", error); return false; }
}

async function _loadProjectFromFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && data.id && data.name && data.agentPresets) {
                await loadProjectData(data, true);
                showCustomAlert(`Project '${data.name}' loaded successfully!`, 'Project Loaded'); // <-- แก้ไขเป็นบรรทัดนี้
            } else { throw new Error('Invalid project file format.'); }
        } catch (error) { alert(`Error loading project: ${error.message}`); console.error(error); }
    };
    reader.readAsText(file);
}

async function loadGlobalSettings() {
    const gs = currentProject.globalSettings || {};
    document.getElementById('fontFamilySelect').value = gs.fontFamilySelect || "'Sarabun', sans-serif";
    document.getElementById('apiKey').value = gs.apiKey || '';
    document.getElementById('ollamaBaseUrl').value = gs.ollamaBaseUrl || 'http://localhost:11434';
    
    const sysAgent = gs.systemUtilityAgent || defaultSystemUtilityAgent;
    document.getElementById('system-utility-model-select').value = sysAgent.model;
    document.getElementById('system-utility-prompt').value = sysAgent.systemPrompt;
    document.getElementById('system-utility-summary-prompt').value = sysAgent.summarizationPrompt;
    document.getElementById('system-utility-temperature').value = sysAgent.temperature;
    document.getElementById('system-utility-topP').value = sysAgent.topP;
    
    renderSummarizationPresetSelector(); // [NEW] เรียกใช้ฟังก์ชัน render
    applyFontSettings();
}

function saveSystemUtilityAgentSettings() {
    if (!currentProject.globalSettings) return;
    const settings = currentProject.globalSettings.systemUtilityAgent;
    settings.model = document.getElementById('system-utility-model-select').value;
    settings.systemPrompt = document.getElementById('system-utility-prompt').value;
    settings.summarizationPrompt = document.getElementById('system-utility-summary-prompt').value; // [NEW]
    settings.temperature = parseFloat(document.getElementById('system-utility-temperature').value);
    settings.topP = parseFloat(document.getElementById('system-utility-topP').value);
    updateAndPersistState();
}

async function loadSelectedEntity() {
    const selector = document.getElementById('entitySelector');
    const [type, ...nameParts] = selector.value.split(/_(.*)/s);
    await selectEntity(type, nameParts.join('_'));
}

async function selectEntity(type, name) {
    currentProject.activeEntity = { type, name };
    const activeSession = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (activeSession) {
        if (activeSession.groupChatState) activeSession.groupChatState.isRunning = false;
        activeSession.linkedEntity = { ...currentProject.activeEntity };
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', activeSession);
    }
    renderEntitySelector();
    await updateAndPersistState();
    renderAllSidebarLists();
    scrollToLinkedEntity(type, name);
}

async function generateAgentProfile() {
    const enhancerPrompt = document.getElementById('enhancer-prompt-input').value.trim();
    if (!enhancerPrompt) {
        alert('Please describe the agent you want to create.');
        return;
    }

    const statusDiv = document.getElementById('enhancer-status');
    statusDiv.textContent = 'Generating profile...';
    statusDiv.style.color = 'var(--text-dark)';
    
    const utilityAgent = currentProject.globalSettings.systemUtilityAgent;
    if (!utilityAgent || !utilityAgent.model) {
        statusDiv.textContent = 'Error: System Utility Model not configured.';
        statusDiv.style.color = 'var(--error-color)';
        return;
    }

    // [MODIFIED] Updated the meta-prompt to request agent_name and agent_icon
    const metaPrompt = `You are an expert in designing LLM agent profiles. Based on the user's request, create a complete agent profile. Your response MUST be a single, valid JSON object with the following keys: "agent_name" (a creative and fitting name for the agent), "agent_icon" (a single, relevant emoji for the agent), "system_prompt" (string), "temperature" (number), "top_p" (number), "top_k" (number), "presence_penalty" (number), "frequency_penalty" (number). For the parameters, choose values that are optimal for the requested task (e.g., creative tasks need higher temperature). User's Request: "${enhancerPrompt}"`;

    try {
        const responseText = await callLLM(utilityAgent, [{ role: 'user', content: metaPrompt }]);

        const jsonMatch = responseText.match(/{.*}/s);
        if (!jsonMatch) {
            throw new Error("LLM did not return a valid JSON object.");
        }
        
        const jsonString = jsonMatch[0];
        const parsedResponse = JSON.parse(jsonString);
        
        // [NEW] Populate the name and icon fields from the LLM response
        document.getElementById('agent-name-input').value = parsedResponse.agent_name || '';
        document.getElementById('agent-icon-input').value = parsedResponse.agent_icon || '🤖';
        
        // Populate the rest of the fields
        document.getElementById('agent-system-prompt').value = parsedResponse.system_prompt || '';
        document.getElementById('agent-temperature').value = parsedResponse.temperature ?? 1.0;
        document.getElementById('agent-topP').value = parsedResponse.top_p ?? 1.0;
        document.getElementById('agent-topK').value = parsedResponse.top_k ?? 0;
        document.getElementById('agent-presence-penalty').value = parsedResponse.presence_penalty ?? 0.0;
        document.getElementById('agent-frequency-penalty').value = parsedResponse.frequency_penalty ?? 0.0;
        
        statusDiv.textContent = 'Profile generated successfully!';
        statusDiv.style.color = 'var(--success-color)';
    } catch (error) {
        console.error("Agent Profile Generation Error:", error);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.color = 'var(--error-color)';
    } finally {
        setTimeout(() => { statusDiv.textContent = ''; }, 5000);
    }
}
//... a lot of functions here are unchanged ...
// The full, correct, and complete set of functions will follow

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

    if (!newAgentSettings.icon) newAgentSettings.icon = '🤖';

    if (oldName && oldName !== newName) {
        if (currentProject.agentPresets[newName]) { alert(`An agent named '${newName}' already exists.`); return; }
        const agentData = currentProject.agentPresets[oldName];
        delete currentProject.agentPresets[oldName];
        currentProject.agentPresets[newName] = { ...agentData, ...newAgentSettings };
        currentProject.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === oldName) session.linkedEntity.name = newName;
        });
        Object.values(currentProject.agentGroups).forEach(group => {
           const memberIndex = group.members.indexOf(oldName);
           if (memberIndex > -1) group.members[memberIndex] = newName;
           if(group.moderatorAgent === oldName) group.moderatorAgent = newName;
        });
        if (currentProject.activeEntity.type === 'agent' && currentProject.activeEntity.name === oldName) currentProject.activeEntity.name = newName;
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
    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ Agent '${agentNameToDelete}'?`)) {
        delete currentProject.agentPresets[agentNameToDelete];
        Object.values(currentProject.agentGroups).forEach(group => {
            group.members = group.members.filter(m => m !== agentNameToDelete);
            if (group.moderatorAgent === agentNameToDelete) group.moderatorAgent = group.members[0] || '';
        });
        currentProject.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === agentNameToDelete) session.linkedEntity = null;
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

async function createNewChatSession() {
    const newSession = {
        id: `sid_${Date.now()}`, name: 'New Chat', history: [], createdAt: Date.now(), updatedAt: Date.now(),
        pinned: false, archived: false, linkedEntity: { ...currentProject.activeEntity },
        groupChatState: { isRunning: false }, summaryState: { activeSummaryId: null, summarizedUntilIndex: 0 }
    };
    try {
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'add', newSession);
        currentProject.chatSessions.unshift(newSession);
        await loadChatSession(newSession.id);
        updateAndPersistState();
    } catch (error) { console.error("Failed to create new session in DB:", error); alert("เกิดข้อผิดพลาดในการสร้าง Chat ใหม่"); }
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
        if (currentProject.activeEntity) { scrollToLinkedEntity(currentProject.activeEntity.type, currentProject.activeEntity.name); }
        document.getElementById('chat-title').textContent = session.name;
        renderEntitySelector(); renderChatMessages(); renderAllSidebarLists();
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
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        await updateAndPersistState();
        renderAllSidebarLists();
        if (id === currentProject.activeSessionId) document.getElementById('chat-title').textContent = newName;
    }
}

async function deleteChatSession(id, e) {
    if (e) e.stopPropagation();
    if (!confirm("ลบ Chat?")) return;
    const sessionIndex = currentProject.chatSessions.findIndex(s => s.id === id);
    if (sessionIndex === -1) return;
    currentProject.chatSessions.splice(sessionIndex, 1);
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'delete', id);
    if (currentProject.activeSessionId === id) {
        currentProject.activeSessionId = null;
        const nextSession = [...currentProject.chatSessions].filter(s => !s.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (nextSession) { await loadChatSession(nextSession.id); } 
        else { await createNewChatSession(); }
    } else {
        await updateAndPersistState();
        renderAllSidebarLists();
    }
}

async function togglePinSession(id, event) {
    event.preventDefault(); event.stopPropagation();
    const session = currentProject.chatSessions.find(s => s.id === id);
    if (!session) return;
    session.pinned = !session.pinned;
    session.updatedAt = Date.now();
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    await updateAndPersistState();
    renderAllSidebarLists();
}

async function cloneSession(id, event) {
    event.preventDefault(); event.stopPropagation();
    const sessionToClone = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'get', id);
    if (!sessionToClone) { alert("Error: Could not find session to clone."); return; }
    const newSession = JSON.parse(JSON.stringify(sessionToClone));
    newSession.id = `sid_${Date.now()}`;
    newSession.name = `${sessionToClone.name} (Copy)`;
    newSession.createdAt = Date.now(); newSession.updatedAt = Date.now();
    newSession.pinned = false; newSession.archived = false;
    try {
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'add', newSession);
        currentProject.chatSessions.unshift(newSession);
        await loadChatSession(newSession.id);
        await updateAndPersistState();
    } catch (error) { console.error("Failed to save cloned session:", error); alert("An error occurred while cloning the session."); }
}

async function archiveSession(id, event) {
    event.preventDefault(); event.stopPropagation();
    const session = currentProject.chatSessions.find(s => s.id === id);
    if (!session) return;
    session.archived = !session.archived;
    if (session.archived) session.pinned = false;
    session.updatedAt = Date.now();
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    if (currentProject.activeSessionId === id && session.archived) {
        currentProject.activeSessionId = null;
        const nextSession = currentProject.chatSessions.find(s => !s.archived);
        if (nextSession) { await loadChatSession(nextSession.id); }
        else { await createNewChatSession(); }
    } else {
        await updateAndPersistState();
        renderAllSidebarLists();
    }
}


function downloadSession(id, event) { event.preventDefault(); event.stopPropagation(); exportChat(id); }

async function saveCurrentChatHistory(history) {
    if (!currentProject.activeSessionId) return;
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session) return;
    session.history = history;
    session.updatedAt = Date.now();
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    await updateAndPersistState();
}

// [MODIFIED] Overhaul the copy function to support Rich Text (HTML) and Plain Text.
async function copyMessageToClipboard(event, index) {
    console.log('Running the NEW copy function!');
    event.stopPropagation();
    const btn = event.currentTarget;

    // Find the rendered message content DOM element using its data-index
    const messageContentEl = document.querySelector(`.message[data-index='${index}'] .message-content`);

    if (!messageContentEl) {
        console.error('Could not find message content element to copy.');
        return;
    }

    try {
        // Get the innerHTML for Rich Text pasting
        const htmlContent = messageContentEl.innerHTML;

        // Get the innerText for clean Plain Text pasting
        const textContent = messageContentEl.innerText;

        // Create Blob objects for both formats
        const blobHtml = new Blob([htmlContent], { type: 'text/html' });
        const blobText = new Blob([textContent], { type: 'text/plain' });

        // Use the Clipboard API to write both formats at once
        const data = [new ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText
        })];

        await navigator.clipboard.write(data);

        // Provide user feedback
        btn.innerHTML = '&#10003;'; // Checkmark icon
        setTimeout(() => {
            btn.innerHTML = '&#128203;'; // Original clipboard icon
        }, 2000);

    } catch (err) {
        console.error('Failed to copy message using Clipboard API:', err);
        // Fallback for older browsers if needed, though the original method had the same issue.
        alert('Failed to copy message.');
    }
}

// [REFACTORED] Overhaul the editMessage function for a better UX
function editMessage(index) {
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session) return;

    const message = session.history[index];
    const messageDiv = document.querySelector(`.message[data-index='${index}']`);
    const contentDiv = messageDiv.querySelector('.message-content');

    // Prevent editing if another edit is already in progress
    if (messageDiv.classList.contains('is-editing')) return;

    if (message.role === 'user') {
        // --- In-line editing for User messages ---
        messageDiv.classList.add('is-editing');
        contentDiv.style.display = 'none'; // Hide the original content

        const editContainer = document.createElement('div');
        editContainer.className = 'inline-edit-container';

        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-textarea';
        textarea.value = (typeof message.content === 'string') ? message.content : (message.content.find(p => p.type === 'text')?.text || '');
        
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'inline-edit-actions';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'btn btn-small btn-secondary';

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save & Submit';
        saveButton.className = 'btn btn-small';

        actionsContainer.appendChild(cancelButton);
        actionsContainer.appendChild(saveButton);
        editContainer.appendChild(textarea);
        editContainer.appendChild(actionsContainer);
        messageDiv.appendChild(editContainer);

        textarea.focus();
        textarea.style.height = textarea.scrollHeight + 'px'; // Auto-adjust height

        const cancelEdit = () => {
            editContainer.remove();
            contentDiv.style.display = 'block';
            messageDiv.classList.remove('is-editing');
        };

        const saveChanges = () => {
            const newContent = textarea.value.trim();
            const oldContent = (typeof message.content === 'string') ? message.content.trim() : '';

            if (newContent && newContent !== oldContent) {
                // This is the original logic: truncate history and resubmit
                session.history = session.history.slice(0, index);
                renderChatMessages();
                document.getElementById('chatInput').value = newContent;
                sendMessage();
            } else {
                // If no change, just cancel the edit
                cancelEdit();
            }
        };

        // Event Listeners
        saveButton.onclick = saveChanges;
        cancelButton.onclick = cancelEdit;
        textarea.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveChanges();
            } else if (e.key === 'Escape') {
                cancelEdit();
            }
        };

    } else if (message.role === 'assistant') {
        // --- Existing in-line editing for Assistant messages ---
        const isEditing = contentDiv.isContentEditable;
        if (isEditing) {
            contentDiv.contentEditable = false;
            // Update the history with the new content
            session.history[index].content = contentDiv.textContent; 
            saveCurrentChatHistory(session.history);
            contentDiv.style.border = 'none';
        } else {
            contentDiv.contentEditable = true;
            contentDiv.style.border = '1px solid var(--primary-color)';
            contentDiv.focus();
        }
    }
}

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
        for (let i = index; i >= 0; i--) { if (session.history[i].role === 'user') { lastUserIndex = i; break; } }
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

function getFullSystemPrompt(agentName) {
    if (!currentProject.agentPresets || !agentName) return "";
    const agent = currentProject.agentPresets[agentName];
    if (!agent) return "";
    const systemPrompt = agent.systemPrompt || '';
    const activeMemoryNames = agent.activeMemories || [];
    const activeMemoriesContent = currentProject.memories.filter(m => activeMemoryNames.includes(m.name)).map(m => m.content).join('\n');
    let finalSystemContent = systemPrompt;
    if (activeMemoriesContent) finalSystemContent += `\n\n--- Active Memories ---\n` + activeMemoriesContent;
    return finalSystemContent.trim();
}

function estimateTokens(text) { return Math.ceil((text || "").length / 3); }

function calculateHistoryTokens(historyArray) {
    let totalTokens = 0;
    for (const msg of historyArray) {
        let textContent = '';
        if (typeof msg.content === 'string') textContent = msg.content;
        else if (Array.isArray(msg.content)) { const textPart = msg.content.find(p => p.type === 'text'); if (textPart) textContent = textPart.text; }
        if (msg.role !== 'system' || !textContent.startsWith('[ ระบบได้ทำการสรุป')) totalTokens += estimateTokens(textContent);
    }
    return totalTokens;
}

function buildPayloadMessages(history, targetAgentName, session) { 
    // 1. เริ่มต้นด้วย Array ว่างสำหรับ Payload สุดท้าย
    const messages = [];
    const finalSystemPrompt = getFullSystemPrompt(targetAgentName);
    
    // 2. เพิ่ม System Prompt หลักของ Agent เข้าไปก่อน
    if (finalSystemPrompt) {
        messages.push({ role: 'system', content: finalSystemPrompt });
    }

    // 3. เตรียม history ที่จะใช้ (ซึ่งจะถูกแก้ไขถ้ามี summary)
    let historyToSend = [...history];

    // 4. ตรวจสอบว่ามี Summary ที่ใช้งานอยู่หรือไม่
    if (session && session.summaryState && session.summaryState.activeSummaryId) {
        const activeLog = currentProject.summaryLogs.find(log => log.id === session.summaryState.activeSummaryId);
        if (activeLog) {
            // ---- START FIX ----
            // 4.1. เพิ่ม Context ของ Summary เข้าไปใน 'messages' payload โดยตรง!
            const summaryContext = `[This is a loaded summary to provide context for the following conversation. SUMMARY CONTENT: ${activeLog.content}]`;
            messages.push({ role: 'system', content: summaryContext });

            // 4.2. แก้ไข historyToSend ให้มีเฉพาะข้อความ "ใหม่" ที่เกิดขึ้นหลังการโหลด summary เท่านั้น
            historyToSend = history.slice(session.summaryState.summarizedUntilIndex);
            // ---- END FIX ----
        }
    }

    // 5. วน Loop เฉพาะ historyToSend ที่ถูกเตรียมไว้อย่างถูกต้องแล้ว
    const agent = currentProject.agentPresets[targetAgentName];
    if (!agent) return messages; // ควร return messages ที่มี system prompt, ไม่ใช่ array ว่าง

    const modelData = allProviderModels.find(m => m.id === agent.model);
    const provider = modelData ? modelData.provider : null;

    historyToSend.forEach(msg => {
        // Loop นี้จะกรอง system message ที่อาจหลงเหลือใน history ออกไป แต่ไม่เป็นไร
        // เพราะเราได้เพิ่ม summary context เข้าไปใน 'messages' โดยตรงแล้ว
        if(msg.role === 'system') return; 
        
        let apiMessage = { role: msg.role };
        if(msg.speaker && msg.role === 'assistant') apiMessage.name = msg.speaker.replace(/\s+/g, '_');
        if (typeof msg.content === 'string') apiMessage.content = msg.content;
        else if (Array.isArray(msg.content)) {
            if (provider === 'ollama') {
                const textPart = msg.content.find(p => p.type === 'text');
                const imagePart = msg.content.find(p => p.type === 'image_url');
                if (textPart) apiMessage.content = textPart.text;
                if (imagePart) apiMessage.images = [imagePart.url.split(',')[1]];
            } else apiMessage.content = msg.content.map(part => (part.type === 'image_url') ? { type: 'image_url', image_url: { url: part.url } } : part);
        }
        messages.push(apiMessage);
    });

    // 6. Return Payload สุดท้ายที่สมบูรณ์
    console.log('Final Payload Sent to LLM:', messages);
    return messages;
}

async function sendMessage(isRegeneration = false) {
    const { type } = currentProject.activeEntity;
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (session && session.groupChatState && session.groupChatState.isRunning) stopGeneration();
    if (type === 'group') await runConversationTurn();
    else await sendSingleAgentMessage(isRegeneration);
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
        if (error.name !== 'AbortError') session.history.push({ role: 'assistant', content: `เกิดข้อผิดพลาด: ${error.message}` });
        else session.history.push({ role: 'assistant', content: `<i>การสร้างข้อความถูกยกเลิก</i>` });
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

async function handleManualSummarize() {
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session) { alert("No active session found."); return; }
    if (confirm(`คุณต้องการให้ System Utility Agent สรุปบทสนทนาหรือไม่?`)) {
        await summarizeHistoryAndCreateLog(session);
    }
}

async function summarizeHistoryAndCreateLog(session) {
    updateStatus("Summarizing conversation...", 'loading');
    const utilityAgent = currentProject.globalSettings.systemUtilityAgent;
    if (!utilityAgent || !utilityAgent.model) {
        updateStatus('System Utility Model not configured.', 'error');
        return;
    }
    const historyToSummarize = session.history.slice((session.summaryState?.summarizedUntilIndex || 0));
    if (historyToSummarize.length === 0) {
        updateStatus('No new messages to summarize.', 'connected');
        return;
    }
    try {
        updateStatus("Generating title...", 'loading');
        const titlePrompt = `Based on the conversation, create a very short, descriptive title (5-7 words). Respond with ONLY the title.`;
        const generatedTitle = await callLLM(utilityAgent, [{ role: 'user', content: titlePrompt }]);
        
        updateStatus("Generating summary content...", 'loading');
        
        const previousSummary = session.summaryState?.activeSummaryId ? (currentProject.summaryLogs.find(l => l.id === session.summaryState.activeSummaryId)?.content || "") : "This is the beginning of the conversation.";
        
        // [MODIFIED] Use the customizable prompt from settings
        const summaryPromptTemplate = utilityAgent.summarizationPrompt || defaultSystemUtilityAgent.summarizationPrompt;
        const newMessages = historyToSummarize.map(m=>`${m.speaker||m.role}: ${typeof m.content==='string'?m.content:'[multimodal content]'}`).join('\n');
        const summaryPrompt = summaryPromptTemplate
                                .replace(/\$\{previousSummary\}/g, previousSummary)
                                .replace(/\$\{newMessages\}/g, newMessages);

        const summaryContent = await callLLM(utilityAgent, [{ role: 'user', content: summaryPrompt }]);
        
        // ... (rest of the function is the same as before)
        const newLog = {
            id: `sum_${Date.now()}`, content: summaryContent,
            metadata: { title: generatedTitle.trim(), originType: currentProject.activeEntity.type, originName: currentProject.activeEntity.name, originSession: { id: session.id, name: session.name }, createdAt: Date.now() }
        };
        currentProject.summaryLogs.push(newLog);
        session.summaryState = { activeSummaryId: newLog.id, summarizedUntilIndex: session.history.length };
        session.history.push({ role: 'system', content: `[ ระบบได้ทำการสรุปบทสนทนาในหัวข้อ: "${newLog.metadata.title}" และบันทึกลงในคลังแล้ว ]` });
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        await updateAndPersistState();
        renderChatMessages(); renderSummaryLogList();
        updateStatus("Summarization complete.", 'connected');
    } catch (error) {
        console.error("Failed to summarize history:", error);
        updateStatus("Failed to summarize.", 'error');
    }
}

async function loadSummaryToActiveSession(summaryId, event) {
    event.preventDefault(); event.stopPropagation();
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    const summaryLog = currentProject.summaryLogs.find(l => l.id === summaryId);
    if (!session || !summaryLog) return;
    session.summaryState = { activeSummaryId: summaryId, summarizedUntilIndex: session.history.length };
    const systemMessage = { role: 'system', content: `[ ระบบได้โหลดบริบทจากบทสรุป: "${summaryLog.metadata.title}" ]` };
    session.history.push(systemMessage);
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    await updateAndPersistState();
    renderChatMessages();
    renderSummaryLogList();
}

async function unloadSummaryFromActiveSession(event) {
    event.preventDefault(); event.stopPropagation();
    document.getElementById('chat-actions-menu').classList.remove('active');
    const session = currentProject.chatSessions.find(s => s.id === currentProject.activeSessionId);
    if (!session || !session.summaryState?.activeSummaryId) return;
    session.summaryState = { activeSummaryId: null, summarizedUntilIndex: session.history.length };
    const systemMessage = { role: 'system', content: `[ ระบบได้ล้างบริบทจากบทสรุปแล้ว การสนทนาจะใช้ประวัติล่าสุดตามปกติ ]` };
    session.history.push(systemMessage);
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    await updateAndPersistState();
    renderChatMessages();
    renderSummaryLogList();
}

function viewSummary(summaryId, event) {
    event.preventDefault(); event.stopPropagation();
    const summaryLog = currentProject.summaryLogs.find(l => l.id === summaryId);
    if (!summaryLog) return;
    document.getElementById('view-summary-title').textContent = summaryLog.metadata.title;
    document.getElementById('view-summary-content').textContent = summaryLog.content;
    showViewSummaryModal();
}

async function deleteSummary(summaryId, event) {
    event.preventDefault(); event.stopPropagation();
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
        if (type === 'image_url') userMessageContent.push({ type: 'image_url', url: content });
        else userMessageContent.push({ type: 'text', text: content });
    }
    if (userMessageContent.length === 1 && userMessageContent[0].type === 'text') userMessageContent = userMessageContent[0].text;
    session.history.push({ role: 'user', content: userMessageContent });
    input.value = ''; input.style.height = 'auto';
    removeAttachedFile();
    renderChatMessages();
    const group = currentProject.agentGroups[currentProject.activeEntity.name];
    if (!group || !group.members || group.members.length === 0) return;
    session.groupChatState.isRunning = true;
    isLoading = true;
    document.getElementById('sendBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'flex';
    abortController = new AbortController();
    try {
        let conversationPlan;
        if (group.flowType === 'auto-moderator') conversationPlan = await createModeratorDefinedPlan(group, session.history, session);
        else conversationPlan = createRoundRobinPlan(group);
        if (!conversationPlan || conversationPlan.length === 0) throw new Error("Failed to create a valid conversation plan.");
        for (const speakerName of conversationPlan) {
            try {
                if (!session.groupChatState.isRunning) break;
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
            if (session.groupChatState.isRunning) await new Promise(resolve => setTimeout(resolve, 500));
        }
    } catch (error) { console.error("A critical error occurred in the conversation flow:", error); updateStatus(`Critical Error: ${error.message}`, 'error');
    } finally { stopGeneration(); await saveCurrentChatHistory(session.history); console.log("Group conversation turn finished."); }
}

async function createModeratorDefinedPlan(group, contextHistory, session) {
    const utilityAgent = currentProject.globalSettings.systemUtilityAgent;
    if (!utilityAgent || !utilityAgent.model) {
        console.warn(`System Utility Model not configured. Falling back to Round Robin.`);
        return createRoundRobinPlan(group);
    }
    updateStatus(`Moderator (${utilityAgent.model}) is planning...`, 'loading');
    const availableMembers = group.members.filter(name => name !== group.moderatorAgent);
    const agentDescriptions = availableMembers.map(name => { const agent = currentProject.agentPresets[name]; return `- ${agent.icon || '🤖'} ${name}: ${agent?.systemPrompt.substring(0, 150)}...`; }).join('\n');
    const metaPrompt = `You are a conversation moderator. Your goal is to decide which agent(s) should speak next based on the last user message. User message: "${contextHistory.findLast(m => m.role === 'user')?.content || ""}". Agents available:\n${agentDescriptions}\nRespond with a JSON object like {"plan": ["AgentName1", "AgentName2"]}. Choose agents best suited to respond.`;
    
    try {
        const responseText = await callLLM(utilityAgent, [{role: 'user', content: metaPrompt}]);
        const parsed = JSON.parse(responseText.match(/{.*}/s)[0]);
        if (parsed.plan && Array.isArray(parsed.plan)) {
            const validPlan = parsed.plan.filter(name => availableMembers.includes(name));
            if (validPlan.length > 0) { updateStatus('Plan created. Starting conversation...', 'loading'); return validPlan; }
        }
        throw new Error("Invalid plan format from moderator.");
    } catch (error) { console.error("Moderator failed to create a plan:", error, "Falling back to Round Robin."); updateStatus('Moderator plan failed. Falling back...', 'warning'); return createRoundRobinPlan(group); }
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
    if (session && session.groupChatState) session.groupChatState.isRunning = false;
    if(abortController) abortController.abort();
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
    } catch (e) { alert('Error saving agent package.'); console.error(e); }
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
            } else { throw new Error('Invalid JSON format for agent package.'); }
        } catch (error) { alert(`Error loading agent package: ${error.message}`); }
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

// [REVISED] ฟังก์ชันสำหรับจัดการการเลือก preset จาก dropdown
function handleSummarizationPresetChange() {
    const selector = document.getElementById('system-utility-summary-preset-select');
    const selectedName = selector.value;
    
    if (selectedName === 'custom') {
        return; // ไม่ต้องทำอะไรถ้าเป็น 'Custom'
    }

    const presets = currentProject.globalSettings.summarizationPromptPresets;
    if (presets && presets[selectedName]) {
        const presetContent = presets[selectedName];
        document.getElementById('system-utility-summary-prompt').value = presetContent;
        // บันทึกการเปลี่ยนแปลงลงใน state และอัปเดต UI ทันที
        saveSystemUtilityAgentSettings();
    }
}

// [REVISED] ฟังก์ชันสำหรับจัดการการบันทึก preset
function handleSaveSummarizationPreset() {
    const currentText = document.getElementById('system-utility-summary-prompt').value.trim();
    if (!currentText) {
        showCustomAlert('Prompt template cannot be empty.', 'Error');
        return;
    }

    // หมายเหตุ: เราจะยังคงใช้ prompt() ของเบราว์เซอร์ไปก่อนเพื่อความรวดเร็ว
    const newName = prompt('Enter a name for this new preset:', '');
    if (!newName || !newName.trim()) {
        return; // User กด Cancel หรือไม่ได้ใส่ชื่อ
    }

    const trimmedName = newName.trim();
    if (currentProject.globalSettings.summarizationPromptPresets[trimmedName]) {
        if (!confirm(`A preset named '${trimmedName}' already exists. Do you want to overwrite it?`)) {
            return;
        }
    }

    currentProject.globalSettings.summarizationPromptPresets[trimmedName] = currentText;
    updateAndPersistState().then(() => {
        renderSummarizationPresetSelector();
        // ตั้งค่า dropdown ให้เป็น preset ที่เพิ่งบันทึก/อัปเดต
        document.getElementById('system-utility-summary-preset-select').value = trimmedName;
        showCustomAlert(`Preset '${trimmedName}' saved successfully!`, 'Success');
    });
}