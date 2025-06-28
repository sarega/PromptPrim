// ===============================================
// FILE: src/main.js (แก้ไขแล้ว)
// DESCRIPTION: แก้ไข Logic การเริ่มต้นแอป, เพิ่ม Debounce สำหรับ Auto-Save
// ===============================================

// 1. Import CSS
import './styles/main.css';

// 2. Import Core Modules
import { stateManager } from './js/core/core.state.js';
import { loadAllProviderModels } from './js/core/core.api.js';
import { initCoreUI, showCustomAlert } from './js/core/core.ui.js';

// 3. Import ALL other module initializers and handlers
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
import * as SummaryUI from './js/modules/summary/summary.ui.js';
// Summary has no handlers, its logic is in ChatHandlers

// --- [NEW] Debounce Utility Function ---
/**
 * Creates a debounced function that delays invoking the provided function
 * until after `wait` milliseconds have elapsed since the last time the
 * debounced function was invoked.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// --- Main Application Initialization ---
async function init() {
    try {
        marked.setOptions({
            highlight: function (code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            gfm: true, breaks: true,
        });

        initializeTheme();

        // Initialize all UI modules first
        initCoreUI();
        ProjectUI.initProjectUI();
        SessionUI.initSessionUI();
        AgentUI.initAgentUI();
        GroupUI.initGroupUI();
        MemoryUI.initMemoryUI();
        ChatUI.initChatUI();
        SummaryUI.initSummaryUI();

        // Then setup all event subscriptions that link UI to handlers
        setupEventSubscriptions();
        
        // [MODIFIED] The startup logic is now handled by the DOMContentLoaded listener below
        // This function now only handles setup.

    } catch (error) {
        console.error("Critical initialization failed:", error);
        showCustomAlert(
            `An unexpected error occurred during startup: ${error.message}. Please try clearing website data and reloading.`,
            "Fatal Error"
        );
    }
}

// --- Event Bus Setup ---
function setupEventSubscriptions() {
    const bus = stateManager.bus;

    // --- [MODIFIED] Debounced Auto-Save ---
    // This creates a version of the persist function that will only run
    // 1.5 seconds after the *last* change was made.
    const debouncedSave = debounce(() => {
        console.log('[AutoSave] Debounced save triggered.');
        ProjectHandlers.persistCurrentProject();
    }, 1500);

    // When the state becomes dirty, trigger the debounced save.
    // This solves the race condition and improves performance.
    bus.subscribe('dirty:changed', (isDirty) => {
        if (isDirty) {
            debouncedSave();
        }
    });

    // --- Core & Project ---
    // bus.subscribe('project:persistRequired', ProjectHandlers.persistProjectMetadata); // REMOVED - Replaced by debounced save
    bus.subscribe('project:new', ProjectHandlers.createNewProject);
    bus.subscribe('project:open', () => document.getElementById('load-project-input').click());
    bus.subscribe('project:fileSelectedForOpen', (e) => ProjectHandlers.handleFileSelectedForOpen(e));
    bus.subscribe('project:save', (saveAs) => ProjectHandlers.saveProject(saveAs));
    bus.subscribe('project:saveConfirm', ({ projectName }) => ProjectHandlers.handleProjectSaveConfirm(projectName));
    bus.subscribe('project:unsavedChangesChoice', (choice) => ProjectHandlers.handleUnsavedChanges(choice));
    bus.subscribe('project:exportChat', ({ sessionId }) => SessionHandlers.exportChat(sessionId));
    
    // --- API & Settings ---
    bus.subscribe('api:loadModels', loadAllProviderModels);
    bus.subscribe('settings:fontChanged', ProjectHandlers.handleFontChange);
    bus.subscribe('settings:apiKeyChanged', ProjectHandlers.handleApiKeyChange);
    bus.subscribe('settings:ollamaUrlChanged', ProjectHandlers.handleOllamaUrlChange);
    bus.subscribe('settings:systemAgentChanged', ProjectHandlers.saveSystemUtilityAgentSettings);
    bus.subscribe('settings:summaryPresetChanged', MemoryHandlers.handleSummarizationPresetChange);
    bus.subscribe('settings:saveSummaryPreset', MemoryHandlers.handleSaveSummarizationPreset);
    
    // --- Entity Selection ---
    bus.subscribe('entity:select', ({ type, name }) => ProjectHandlers.selectEntity(type, name));

    // --- Sessions ---
    bus.subscribe('session:new', SessionHandlers.createNewChatSession);
    bus.subscribe('session:load', ({ sessionId }) => SessionHandlers.loadChatSession(sessionId));
    bus.subscribe('session:rename', ({ sessionId, event }) => SessionHandlers.renameChatSession(sessionId, event));
    bus.subscribe('session:clone', ({ sessionId, event }) => SessionHandlers.cloneSession(sessionId, event));
    bus.subscribe('session:archive', ({ sessionId, event }) => SessionHandlers.archiveSession(sessionId, event));
    bus.subscribe('session:pin', ({ sessionId, event }) => SessionHandlers.togglePinSession(sessionId, event));
    bus.subscribe('session:delete', ({ sessionId, event }) => SessionHandlers.deleteChatSession(sessionId, event));
    bus.subscribe('session:autoRename', ({ sessionId, newName }) => SessionHandlers.renameChatSession(sessionId, null, newName));

    // --- Agents ---
    bus.subscribe('agent:create', () => AgentUI.showAgentEditor(false));
    bus.subscribe('agent:edit', ({ agentName }) => AgentUI.showAgentEditor(true, agentName));
    bus.subscribe('agent:save', AgentHandlers.saveAgentPreset);
    bus.subscribe('agent:delete', ({ agentName }) => AgentHandlers.deleteAgentPreset(agentName));
    bus.subscribe('agent:generateProfile', AgentHandlers.generateAgentProfile);
    
    // --- Groups ---
    bus.subscribe('group:create', () => GroupUI.showAgentGroupEditor(false));
    bus.subscribe('group:edit', ({ groupName }) => GroupUI.showAgentGroupEditor(true, groupName));
    bus.subscribe('group:save', GroupHandlers.saveAgentGroup);
    bus.subscribe('group:delete', ({ groupName }) => GroupHandlers.deleteAgentGroup(groupName));

    // --- Memories ---
    bus.subscribe('memory:create', () => MemoryUI.showMemoryEditor(null));
    bus.subscribe('memory:edit', ({ index, event }) => MemoryUI.showMemoryEditor(index, event));
    bus.subscribe('memory:save', MemoryHandlers.saveMemory);
    bus.subscribe('memory:delete', ({ index, event }) => MemoryHandlers.deleteMemory(index, event));
    bus.subscribe('memory:toggle', ({ name, event }) => MemoryHandlers.toggleMemory(name, event));
    bus.subscribe('memory:exportPackage', MemoryHandlers.saveMemoryPackage);
    bus.subscribe('memory:importPackage', () => document.getElementById('load-memory-package-input').click());
    bus.subscribe('memory:fileSelectedForImport', MemoryHandlers.loadMemoryPackage);
    
    // --- Chat & Summary ---
    bus.subscribe('chat:sendMessage', () => ChatHandlers.sendMessage(false));
    bus.subscribe('chat:stopGeneration', ChatHandlers.stopGeneration);
    bus.subscribe('chat:fileUpload', (event) => ChatHandlers.handleFileUpload(event));
    bus.subscribe('chat:summarize', ChatHandlers.handleManualSummarize);
    bus.subscribe('chat:removeFile', ({ index }) => {
        if (ChatHandlers.attachedFiles && ChatHandlers.attachedFiles[index]) {
            ChatHandlers.attachedFiles.splice(index, 1);
            ChatUI.renderFilePreviews(ChatHandlers.attachedFiles);
        }
    });
    bus.subscribe('chat:clearSummary', ChatHandlers.unloadSummaryFromActiveSession);
    bus.subscribe('chat:copyMessage', ({index, event}) => ChatHandlers.copyMessageToClipboard(index, event));
    bus.subscribe('chat:editMessage', ({index}) => ChatHandlers.editMessage(index));
    bus.subscribe('chat:regenerate', ({index}) => ChatHandlers.regenerateMessage(index));
    bus.subscribe('chat:deleteMessage', ({index}) => ChatHandlers.deleteMessage(index));
    bus.subscribe('summary:view', ({ logId }) => SummaryUI.showSummaryModal(logId));
    bus.subscribe('summary:load', ({ logId }) => ChatHandlers.loadSummaryIntoContext(logId));
    bus.subscribe('summary:delete', ({ logId }) => ChatHandlers.deleteSummary(logId));

    console.log("Event bus subscriptions are set up.");
}

// --- Theme Management Logic ---
function applyTheme(theme) {
    if (theme === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('dark-mode', systemPrefersDark);
    } else {
        document.body.classList.toggle('dark-mode', theme === 'dark');
    }
}

function handleThemeChange(event) {
    const selectedTheme = event.target.value;
    localStorage.setItem('theme', selectedTheme);
    applyTheme(selectedTheme);
}

function initializeTheme() {
    const themeSwitcher = document.getElementById('theme-switcher');
    if (!themeSwitcher) return;

    const themeRadios = themeSwitcher.querySelectorAll('input[type="radio"]');
    const savedTheme = localStorage.getItem('theme') || 'system';
    
    themeRadios.forEach(radio => {
        if (radio.value === savedTheme) {
            radio.checked = true;
        }
        radio.addEventListener('change', handleThemeChange);
    });

    applyTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const currentTheme = localStorage.getItem('theme') || 'system';
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });
}

// --- [MODIFIED] Start the application ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize UI and event listeners
    await init();

    // 2. Determine which project to load
    try {
        const lastProjectId = localStorage.getItem('lastActiveProjectId');

        if (lastProjectId) {
            console.log(`[Startup] Found last project ID: ${lastProjectId}. Loading...`);
            // This function from project.handlers will open the DB and load all data
            await ProjectHandlers.loadLastProject(lastProjectId);
        } else {
            console.log('[Startup] No saved project found, creating a new one.');
            // This function creates a fresh project state and DB
            await ProjectHandlers.proceedWithCreatingNewProject();
        }
    } catch (error) {
        console.error('[Startup Error] Failed to load project, creating a new one as a fallback.', error);
        localStorage.removeItem('lastActiveProjectId'); // Clear potentially corrupted ID
        await ProjectHandlers.proceedWithCreatingNewProject();
    }
});
