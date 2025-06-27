// ===============================================
// FILE: src/main.js (Refactored)
// DESCRIPTION: Main application entry point, orchestrator, and event hub.
// ===============================================

// 1. Import CSS (This must be the first import)
import './styles/main.css';

// 2. Import Core Modules
import { stateManager } from './js/core/core.state.js';
import { loadAllProviderModels } from './js/core/core.api.js';
import { initCoreUI, showCustomAlert } from './js/core/core.ui.js';

// 3. Import ALL other module initializers and handlers
// We use 'import * as ...' to group all exported functions from a file.
import * as ProjectUI from './js/modules/project/project.ui.js';
import * as ProjectHandlers from './js/modules/project/project.handlers.js';
import * as SessionUI from './js/modules/session/session.ui.js';
import * as SessionHandlers from './js/modules/session/session.handlers.js';
import * as AgentUI from './js/modules/agent/agent.ui.js';
import * as AgentHandlers from './js/modules/agent/agent.handlers.js';
import * as GroupUI from './js/modules/group/group.ui.js';
import * as GroupHandlers from './js/modules/group/group.handlers.js';
import * as MemoryUI from './js/modules/memory/memory.ui.js';
import * as MemoryHandlers from './js/modules/memory/memory.handlers.js';
import * as ChatUI from './js/modules/chat/chat.ui.js';
import * as ChatHandlers from './js/modules/chat/chat.handlers.js';


/**
 * Main application initialization function.
 */
async function init() {
    try {
        console.log("Application initialization started.");

        // --- Library Setup ---
        if (window.marked) {
            marked.setOptions({
                highlight: (code, lang) => hljs.highlight(code, { language: hljs.getLanguage(lang) ? lang : 'plaintext' }).value,
                gfm: true, breaks: true
            });
        }

        // --- Initialize All UI Modules ---
        initCoreUI();
        ProjectUI.initProjectUI();
        SessionUI.initSessionUI();
        AgentUI.initAgentUI();
        GroupUI.initGroupUI();
        MemoryUI.initMemoryUI();
        ChatUI.initChatUI();

        // --- Setup Event Bus Connections (The "Brain") ---
        setupEventSubscriptions();

        // --- Theme Initialization ---
        const savedTheme = localStorage.getItem('theme') || 'system';
        document.querySelector(`#theme-switcher input[value="${savedTheme}"]`)?.setAttribute('checked', 'true');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('dark-mode', savedTheme === 'dark' || (savedTheme === 'system' && prefersDark));

        // --- Initial Project Load ---
        const lastProjectId = localStorage.getItem('lastActiveProjectId');
        if (lastProjectId) {
            await ProjectHandlers.loadLastProject(lastProjectId);
        } else {
            await ProjectHandlers.proceedWithCreatingNewProject();
        }

    } catch (error) {
        console.error("Critical initialization failed:", error);
        showCustomAlert(`A critical error occurred during startup: ${error.message}. Please try reloading.`, "Fatal Error");
    }
}

/**
 * Connects events published by the UI to the handler functions.
 * This is where we break the circular dependencies.
 */
function setupEventSubscriptions() {
    const bus = stateManager.bus;

    // --- Core/Settings ---
    bus.subscribe('api:loadModels', loadAllProviderModels);
    bus.subscribe('settings:fontChanged', (font) => ProjectHandlers.handleFontChange(font));
    bus.subscribe('settings:apiKeyChanged', (key) => ProjectHandlers.handleApiKeyChange(key));
    bus.subscribe('settings:ollamaUrlChanged', (url) => ProjectHandlers.handleOllamaUrlChange(url));
    bus.subscribe('settings:systemAgentChanged', ProjectHandlers.saveSystemUtilityAgentSettings);
    bus.subscribe('settings:saveSummaryPreset', MemoryHandlers.handleSaveSummarizationPreset);
    bus.subscribe('settings:summaryPresetChanged', MemoryHandlers.handleSummarizationPresetChange);

    // --- Project ---
    bus.subscribe('project:new', ProjectHandlers.createNewProject);
    bus.subscribe('project:open', () => document.getElementById('load-project-input').click());
    bus.subscribe('project:save', (saveAs) => ProjectHandlers.saveProject(saveAs));
    bus.subscribe('project:exportChat', () => SessionHandlers.exportChat());
    bus.subscribe('project:fileSelectedForOpen', (event) => ProjectHandlers.handleFileSelectedForOpen(event));
    bus.subscribe('project:saveConfirm', ({ projectName }) => ProjectHandlers.handleProjectSaveConfirm(projectName));
    bus.subscribe('project:unsavedChangesChoice', ProjectHandlers.handleUnsavedChanges);

    // --- Session ---
    bus.subscribe('session:new', SessionHandlers.createNewChatSession);
    bus.subscribe('session:load', ({sessionId}) => SessionHandlers.loadChatSession(sessionId));
    bus.subscribe('session:pin', ({ sessionId, event }) => SessionHandlers.togglePinSession(sessionId, event));
    bus.subscribe('session:rename', ({ sessionId, event }) => SessionHandlers.renameChatSession(sessionId, event));
    bus.subscribe('session:clone', ({ sessionId, event }) => SessionHandlers.cloneSession(sessionId, event));
    bus.subscribe('session:archive', ({ sessionId, event }) => SessionHandlers.archiveSession(sessionId, event));
    bus.subscribe('session:delete', ({ sessionId, event }) => SessionHandlers.deleteChatSession(sessionId, event));
    bus.subscribe('session:autoRename', ({ sessionId, newName }) => SessionHandlers.renameChatSession(sessionId, null, newName));

    // --- Entity (Agent/Group) Selection ---
    bus.subscribe('entity:select', ({type, name}) => ProjectHandlers.selectEntity(type, name));

    // --- Agent ---
    bus.subscribe('agent:create', () => AgentUI.showAgentEditor(false));
    bus.subscribe('agent:edit', ({agentName}) => AgentUI.showAgentEditor(true, agentName));
    bus.subscribe('agent:save', AgentHandlers.saveAgentPreset);
    bus.subscribe('agent:delete', ({agentName}) => AgentHandlers.deleteAgentPreset(agentName));
    bus.subscribe('agent:generateProfile', AgentHandlers.generateAgentProfile);
    
    // --- Group ---
    bus.subscribe('group:create', () => GroupUI.showAgentGroupEditor(false));
    bus.subscribe('group:edit', ({groupName}) => GroupUI.showAgentGroupEditor(true, groupName));
    bus.subscribe('group:save', GroupHandlers.saveAgentGroup);
    bus.subscribe('group:delete', ({groupName}) => GroupHandlers.deleteAgentGroup(groupName));
    
    // --- Memory ---
    bus.subscribe('memory:create', () => MemoryUI.showMemoryEditor(null));
    bus.subscribe('memory:edit', ({index, event}) => MemoryUI.showMemoryEditor(index, event));
    bus.subscribe('memory:save', MemoryHandlers.saveMemory);
    bus.subscribe('memory:delete', ({index, event}) => MemoryHandlers.deleteMemory(index, event));
    bus.subscribe('memory:toggle', ({name, event}) => MemoryHandlers.toggleMemory(name, event));
    bus.subscribe('memory:exportPackage', MemoryHandlers.saveMemoryPackage);
    bus.subscribe('memory:importPackage', () => document.getElementById('load-memory-package-input').click());
    bus.subscribe('memory:fileSelectedForImport', MemoryHandlers.loadMemoryPackage);
    
    // --- Chat ---
    bus.subscribe('chat:sendMessage', ChatHandlers.sendMessage);
    bus.subscribe('chat:stopGeneration', ChatHandlers.stopGeneration);
    bus.subscribe('chat:fileUpload', (event) => ChatHandlers.handleFileUpload(event));
    bus.subscribe('chat:summarize', ChatHandlers.handleManualSummarize);
    bus.subscribe('chat:clearSummary', ChatHandlers.unloadSummaryFromActiveSession);
    bus.subscribe('chat:copyMessage', ({index, event}) => ChatHandlers.copyMessageToClipboard(index, event));
    bus.subscribe('chat:editMessage', ({index}) => ChatHandlers.editMessage(index));
    bus.subscribe('chat:regenerate', ({index}) => ChatHandlers.regenerateMessage(index));
    bus.subscribe('chat:deleteMessage', ({index}) => ChatHandlers.deleteMessage(index));


    console.log("Event bus subscriptions are set up.");
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
