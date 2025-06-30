// ===============================================
// FILE: src/main.js (ฉบับสมบูรณ์)
// DESCRIPTION: รวม Event Listener ทั้งหมดเพื่อให้ทุกส่วนของ UI ทำงานได้อย่างถูกต้อง
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
import * as SettingsUI from './js/modules/settings/settings.ui.js';

<<<<<<< HEAD
=======
// --- Debounce Utility Function ---
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

>>>>>>> 4fbef696f193b5cd9d648bccfe58d07aeb977a2e

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
        initCoreUI();
        ProjectUI.initProjectUI();
        SessionUI.initSessionUI();
        AgentUI.initAgentUI();
        GroupUI.initGroupUI();
        MemoryUI.initMemoryUI();
        ChatUI.initChatUI();
        SummaryUI.initSummaryUI();
<<<<<<< HEAD
        SettingsUI.initSettingsUI(); // Assuming this exists and is needed
        setupEventSubscriptions();
        initMobileGestures(); // [NEW] Initialize swipe gestures for mobile
=======
        SettingsUI.initSettingsUI();
        setupEventSubscriptions();
        setupGlobalEventListeners();
>>>>>>> 4fbef696f193b5cd9d648bccfe58d07aeb977a2e

    } catch (error) {
        console.error("Critical initialization failed:", error);
        showCustomAlert(`An unexpected error occurred during startup: ${error.message}. Please try clearing website data and reloading.`, "Fatal Error");
    }
}

<<<<<<< HEAD
/**
 * [NEW] Initializes swipe-to-open gesture for the sidebar on mobile devices.
 */
function initMobileGestures() {
    const appWrapper = document.querySelector('.app-wrapper');
    const swipeZoneWidth = 40; // The area on the left edge where a swipe can start (in pixels)
    const swipeThreshold = 80; // The minimum distance the user must swipe right to trigger the action

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    // We listen on the body to catch swipes that start from the very edge.
    document.body.addEventListener('touchstart', (e) => {
        // A swipe can only start if the sidebar is currently collapsed and the touch begins on the far left of the screen.
        if (appWrapper.classList.contains('sidebar-collapsed') && e.touches[0].clientX < swipeZoneWidth) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }
    }, { passive: true });

    document.body.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        // To avoid interfering with vertical scrolling, we cancel the swipe if it's more vertical than horizontal.
        if (Math.abs(e.touches[0].clientY - touchStartY) > Math.abs(e.touches[0].clientX - touchStartX)) {
            isSwiping = false;
        }
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        if (e.changedTouches[0].clientX - touchStartX > swipeThreshold) {
            const hamburgerBtn = document.getElementById('hamburger-btn');
            if (hamburgerBtn) hamburgerBtn.click();
=======
function setupGlobalEventListeners() {
    document.addEventListener('click', (e) => {
        // Close all standard dropdowns if the click is outside of them
        const openDropdowns = document.querySelectorAll('.dropdown.open');
        openDropdowns.forEach(dropdown => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
                const parentItem = dropdown.closest('.item');
                if (parentItem) parentItem.classList.remove('z-index-front');
            }
        });

        // Close the custom entity selector if the click is outside
        const entitySelector = document.getElementById('custom-entity-selector-wrapper');
        if (entitySelector && entitySelector.classList.contains('open') && !entitySelector.contains(e.target)) {
            entitySelector.classList.remove('open');
        }

        // Close chat actions menu if open
        const chatActionsContainer = document.getElementById('chat-actions-container');
        if (chatActionsContainer && chatActionsContainer.classList.contains('open') && !chatActionsContainer.contains(e.target)) {
            chatActionsContainer.classList.remove('open');
>>>>>>> 4fbef696f193b5cd9d648bccfe58d07aeb977a2e
        }
    });
}


// --- Event Bus Setup ---
function setupEventSubscriptions() {
    const bus = stateManager.bus;

    // --- Debounced Auto-Save Listener ---
<<<<<<< HEAD
    let saveTimeout;
    bus.subscribe('autosave:required', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            if (stateManager.isAutoSaveDirty()) {
                console.log('[AutoSave] Debounced save triggered.');
                const success = await ProjectHandlers.persistCurrentProject();
                if (success) {
                    stateManager.setAutoSaveDirty(false);
                }
            }
        }, 1500);
    });
=======
    const debouncedSave = debounce(async () => {
        if (stateManager.isAutoSaveDirty()) {
            console.log('[AutoSave] Debounced save triggered.');
            const success = await ProjectHandlers.persistCurrentProject();
            if (success) {
                stateManager.setAutoSaveDirty(false);
            }
        }
    }, 1500);
    bus.subscribe('autosave:required', debouncedSave);
>>>>>>> 4fbef696f193b5cd9d648bccfe58d07aeb977a2e

    // --- Project & Settings ---
    bus.subscribe('project:new', ProjectHandlers.createNewProject);
    bus.subscribe('project:open', () => document.getElementById('load-project-input').click());
    bus.subscribe('project:fileSelectedForOpen', (e) => ProjectHandlers.handleFileSelectedForOpen(e));
    bus.subscribe('project:save', (saveAs) => ProjectHandlers.saveProject(saveAs));
    bus.subscribe('project:saveConfirm', ({ projectName }) => ProjectHandlers.handleProjectSaveConfirm(projectName));
    bus.subscribe('project:unsavedChangesChoice', (choice) => ProjectHandlers.handleUnsavedChanges(choice));
    bus.subscribe('project:exportChat', ({ sessionId }) => SessionHandlers.exportChat(sessionId));
    bus.subscribe('api:loadModels', loadAllProviderModels);
    bus.subscribe('settings:fontChanged', ProjectHandlers.handleFontChange);
    bus.subscribe('settings:apiKeyChanged', ProjectHandlers.handleApiKeyChange);
    bus.subscribe('settings:ollamaUrlChanged', ProjectHandlers.handleOllamaUrlChange);
    bus.subscribe('settings:systemAgentChanged', ProjectHandlers.saveSystemUtilityAgentSettings);
    bus.subscribe('settings:summaryPresetChanged', MemoryHandlers.handleSummarizationPresetChange);
    bus.subscribe('settings:saveSummaryPreset', MemoryHandlers.handleSaveSummarizationPreset);
    bus.subscribe('entity:select', ({ type, name }) => ProjectHandlers.selectEntity(type, name));

    // --- Session Management ---
    bus.subscribe('session:new', SessionHandlers.createNewChatSession);
    bus.subscribe('session:load', ({ sessionId }) => SessionHandlers.loadChatSession(sessionId));
    bus.subscribe('session:rename', ({ sessionId, event, newName }) => SessionHandlers.renameChatSession(sessionId, event, newName));
    bus.subscribe('session:clone', ({ sessionId, event }) => SessionHandlers.cloneSession(sessionId, event));
    bus.subscribe('session:archive', ({ sessionId, event }) => SessionHandlers.archiveSession(sessionId, event));
    bus.subscribe('session:pin', ({ sessionId, event }) => SessionHandlers.togglePinSession(sessionId, event));
    bus.subscribe('session:delete', ({ sessionId, event }) => SessionHandlers.deleteChatSession(sessionId, event));
    bus.subscribe('session:autoRename', ({ sessionId, newName }) => SessionHandlers.renameChatSession(sessionId, null, newName));

    // --- Agent Management ---
    bus.subscribe('agent:create', () => AgentUI.showAgentEditor(false));
    bus.subscribe('agent:edit', ({ agentName }) => AgentUI.showAgentEditor(true, agentName));
    bus.subscribe('agent:save', AgentHandlers.saveAgentPreset);
    bus.subscribe('agent:delete', ({ agentName }) => AgentHandlers.deleteAgentPreset(agentName));
    bus.subscribe('agent:generateProfile', AgentHandlers.generateAgentProfile);

    // --- Group Management ---
    bus.subscribe('group:create', () => GroupUI.showAgentGroupEditor(false));
    bus.subscribe('group:edit', ({ groupName }) => GroupUI.showAgentGroupEditor(true, groupName));
    bus.subscribe('group:save', GroupHandlers.saveAgentGroup);
    bus.subscribe('group:delete', ({ groupName }) => GroupHandlers.deleteAgentGroup(groupName));

    // --- Memory Management ---
    bus.subscribe('memory:create', () => MemoryUI.showMemoryEditor(null));
    bus.subscribe('memory:edit', ({ index, event }) => MemoryUI.showMemoryEditor(index, event));
    bus.subscribe('memory:save', MemoryHandlers.saveMemory);
    bus.subscribe('memory:delete', ({ index, event }) => MemoryHandlers.deleteMemory(index, event));
    bus.subscribe('memory:toggle', ({ name, event }) => MemoryHandlers.toggleMemory(name, event));
    bus.subscribe('memory:exportPackage', MemoryHandlers.saveMemoryPackage);
    bus.subscribe('memory:importPackage', () => document.getElementById('load-memory-package-input').click());
    bus.subscribe('memory:fileSelectedForImport', MemoryHandlers.loadMemoryPackage);

    // --- Chat & Message Actions ---
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
    
    // --- Summary Actions ---
    bus.subscribe('summary:view', ({ logId }) => SummaryUI.showSummaryModal(logId));
    bus.subscribe('summary:load', ({ logId }) => ChatHandlers.loadSummaryIntoContext(logId));
    bus.subscribe('summary:delete', ({ logId }) => ChatHandlers.deleteSummary(logId));

    console.log("Event bus subscriptions are set up.");
}

// --- Theme Management Logic ---
function initializeTheme() {
    const themeSwitcher = document.getElementById('theme-switcher');
    if (!themeSwitcher) return;

    const themeRadios = themeSwitcher.querySelectorAll('input[type="radio"]');
    const savedTheme = localStorage.getItem('theme') || 'system';
    
    const applyTheme = (theme) => {
        if (theme === 'system') {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.body.classList.toggle('dark-mode', systemPrefersDark);
        } else {
            document.body.classList.toggle('dark-mode', theme === 'dark');
        }
    };

    themeRadios.forEach(radio => {
        if (radio.value === savedTheme) {
            radio.checked = true;
        }
        radio.addEventListener('change', (event) => {
            const selectedTheme = event.target.value;
            localStorage.setItem('theme', selectedTheme);
            applyTheme(selectedTheme);
        });
    });

    applyTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const currentTheme = localStorage.getItem('theme') || 'system';
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });
}

// --- Start the application ---
document.addEventListener('DOMContentLoaded', async () => {
    await init();
    try {
        const lastProjectId = localStorage.getItem('lastActiveProjectId');
        if (lastProjectId) {
            await ProjectHandlers.loadLastProject(lastProjectId);
        } else {
            await ProjectHandlers.proceedWithCreatingNewProject();
        }
    } catch (error) {
        console.error('[Startup Error] Failed to load project, creating a new one.', error);
        localStorage.removeItem('lastActiveProjectId');
        await ProjectHandlers.proceedWithCreatingNewProject();
    }
});
