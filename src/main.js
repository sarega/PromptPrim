// ===============================================
// FILE: src/main.js (ฉบับสมบูรณ์)
// DESCRIPTION: Main entry point for the application. Initializes all modules,
//              sets up event listeners, and manages workspace logic.
// ===============================================

import './styles/main.css';
import './styles/layout/_loading.css';
import './styles/layout/_right-sidebar.css';

// Core Modules
import { stateManager } from './js/core/core.state.js';
import { setupLayout } from './js/core/core.layout.js';
import { loadAllProviderModels } from './js/core/core.api.js';
import { initCoreUI } from './js/core/core.ui.js';
import { initGlobalKeybindings } from './js/core/core.keyboard.js';
import { initRightSidebarToggle } from './js/modules/chat/chat.ui.js';
import { initGlobalDropdownListener } from './js/core/core.ui.js';

// UI & Handler Modules (Import all necessary modules)
import * as ProjectUI from './js/modules/project/project.ui.js';
import * as ProjectHandlers from './js/modules/project/project.handlers.js';
import * as SessionUI from './js/modules/session/session.ui.js';
import * as SessionHandlers from './js/modules/session/session.handlers.js';
import * as ChatUI from './js/modules/chat/chat.ui.js';
import * as ChatHandlers from './js/modules/chat/chat.handlers.js';
import * as SettingsUI from './js/modules/settings/settings.ui.js';
import * as StudioUI from './js/modules/studio/studio.ui.js';
import * as ComposerUI from './js/modules/composer/composer.ui.js';
import * as AgentUI from './js/modules/agent/agent.ui.js';
import * as AgentHandlers from './js/modules/agent/agent.handlers.js';
import * as GroupUI from './js/modules/group/group.ui.js';
import * as GroupHandlers from './js/modules/group/group.handlers.js';
import * as MemoryUI from './js/modules/memory/memory.ui.js';
import * as MemoryHandlers from './js/modules/memory/memory.handlers.js';
import * as SummaryUI from './js/modules/summary/summary.ui.js';


// import { initChatHandlers } from './js/modules/chat/chat.handlers.js';

// --- State for Lazy Initialization ---
let isStudioInitialized = false;


// --- Main Application Initialization ---

/**
 * Initializes a two-finger swipe-to-open gesture for the sidebar on mobile.
 * This avoids conflicts with the native single-finger "back" gesture on iOS.
 */
function initMobileGestures() {
    if (!('ontouchstart' in window)) return;

    const sessionsPanel = document.querySelector('.sessions-panel');
    if (!sessionsPanel) return;

    const swipeZoneWidth = 60; // Area on the left edge where the swipe must start
    const swipeThreshold = 80; // Minimum distance for the swipe to be recognized

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    document.body.addEventListener('touchstart', (e) => {
        if (!sessionsPanel.classList.contains('visible') &&
            e.touches.length === 2 &&
            e.touches[0].clientX < swipeZoneWidth) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }
    }, { passive: true });

    document.body.addEventListener('touchmove', (e) => {
        if (!isSwiping || e.touches.length !== 2) {
            isSwiping = false;
            return;
        }
        const touchCurrentX = e.touches[0].clientX;
        const touchCurrentY = e.touches[0].clientY;
        if (Math.abs(touchCurrentY - touchStartY) > Math.abs(touchCurrentX - touchStartX)) {
            isSwiping = false; // Cancel if swipe is more vertical
        }
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        const touchEndX = e.changedTouches[0].clientX;
        isSwiping = false;

        if (touchEndX - touchStartX > swipeThreshold) {
            document.getElementById('hamburger-btn')?.click();
        }
    });
}
// --- Event Bus Setup ---
function setupEventSubscriptions() {
    const bus = stateManager.bus;

    // Project Lifecycle
    bus.subscribe('project:new', ProjectHandlers.createNewProject);
    bus.subscribe('project:open', ProjectHandlers.openProject);
    bus.subscribe('project:fileSelectedForOpen', ProjectHandlers.handleFileSelectedForOpen);
    bus.subscribe('project:save', (saveAs) => ProjectHandlers.saveProject(saveAs));
    bus.subscribe('project:saveConfirm', ({ projectName }) => ProjectHandlers.handleProjectSaveConfirm(projectName));
    bus.subscribe('project:unsavedChangesChoice', ProjectHandlers.handleUnsavedChanges);

    // Session Management
    bus.subscribe('session:new', SessionHandlers.createNewChatSession);
    bus.subscribe('session:load', ({ sessionId }) => SessionHandlers.loadChatSession(sessionId));
    bus.subscribe('session:rename', ({ sessionId, event }) => SessionHandlers.renameChatSession(sessionId, event));
    bus.subscribe('session:clone', ({ sessionId, event }) => SessionHandlers.cloneSession(sessionId, event));
    bus.subscribe('session:archive', ({ sessionId, event }) => SessionHandlers.archiveSession(sessionId, event));
    bus.subscribe('session:pin', ({ sessionId, event }) => SessionHandlers.togglePinSession(sessionId, event));
    bus.subscribe('session:delete', ({ sessionId, event }) => SessionHandlers.deleteChatSession(sessionId, event));
    bus.subscribe('session:download', ({ sessionId }) => SessionHandlers.downloadChatSession({ sessionId }));


    // Agent & Studio Actions
    bus.subscribe('agent:create', () => AgentUI.showAgentEditor(false));
    bus.subscribe('agent:save', AgentHandlers.saveAgentPreset);
    bus.subscribe('agent:edit', ({ agentName }) => AgentUI.showAgentEditor(true, agentName));
    bus.subscribe('agent:delete', ({ agentName }) => AgentHandlers.deleteAgentPreset(agentName));
    bus.subscribe('agent:generateProfile', AgentHandlers.generateAgentProfile);

    bus.subscribe('group:create', () => GroupUI.showAgentGroupEditor(false));
    bus.subscribe('group:save', GroupHandlers.saveAgentGroup);
    bus.subscribe('group:edit', ({ groupName }) => GroupUI.showAgentGroupEditor(true, groupName));
    bus.subscribe('group:delete', ({ groupName }) => GroupHandlers.deleteAgentGroup({ groupName }));
    bus.subscribe('memory:create', () => MemoryUI.showMemoryEditor(null));
    bus.subscribe('memory:save', MemoryHandlers.saveMemory);
    bus.subscribe('memory:edit', ({ index }) => MemoryUI.showMemoryEditor(index));
    bus.subscribe('memory:delete', ({ index }) => MemoryHandlers.deleteMemory({ index }));
    bus.subscribe('memory:toggle', ({ name }) => MemoryHandlers.toggleMemory({ name }));
    bus.subscribe('studio:itemClicked', ProjectHandlers.handleStudioItemClick); 
    bus.subscribe('summary:view', ({ logId }) => SummaryUI.showSummaryModal(logId));
    bus.subscribe('summary:load', ({ logId }) => ChatHandlers.loadSummaryIntoContext(logId));
    bus.subscribe('summary:delete', ({ logId }) => ChatHandlers.deleteSummary(logId));
    bus.subscribe('entity:select', ({ type, name }) => ProjectHandlers.selectEntity(type, name));

    // Chat Actions
    bus.subscribe('chat:sendMessage', ChatHandlers.sendMessage);
    bus.subscribe('chat:stopGeneration', ChatHandlers.stopGeneration);
    bus.subscribe('chat:editMessage', ({ index }) => ChatHandlers.editMessage({ index }));
    bus.subscribe('chat:deleteMessage', ({ index }) => ChatHandlers.deleteMessage({ index }));
    bus.subscribe('chat:copyMessage', ({ index, event }) => ChatHandlers.copyMessageToClipboard({ index, event }));
    bus.subscribe('chat:regenerateMessage', ({ index }) => ChatHandlers.regenerateMessage({ index }));

    bus.subscribe('chat:fileUpload', (event) => ChatHandlers.handleFileUpload(event));
    bus.subscribe('chat:removeFile', ({ index }) => ChatHandlers.removeAttachedFile({ index }));
    bus.subscribe('open-composer', () => { stateManager.bus.publish('ui:toggleComposer');});
    bus.subscribe('composer:heightChanged', SessionHandlers.saveComposerHeight);

    bus.subscribe('chat:summarize', ChatHandlers.handleManualSummarize);
    bus.subscribe('chat:clearSummary', ChatHandlers.unloadSummaryFromActiveSession);

    bus.subscribe('upload-file', () => { document.getElementById('file-input')?.click();});
    // [FIX] Settings Actions
    bus.subscribe('api:loadModels', loadAllProviderModels);
    bus.subscribe('settings:apiKeyChanged', ProjectHandlers.handleApiKeyChange);
    bus.subscribe('settings:ollamaUrlChanged', ProjectHandlers.handleOllamaUrlChanged);
    bus.subscribe('settings:fontChanged', ProjectHandlers.handleFontChange);
    bus.subscribe('settings:systemAgentChanged', ProjectHandlers.saveSystemUtilityAgentSettings);
    bus.subscribe('settings:summaryPresetChanged', MemoryHandlers.handleSummarizationPresetChange);
    bus.subscribe('settings:saveSummaryPreset', MemoryHandlers.handleSaveSummarizationPreset);

    console.log("✅ Central Event Bus ready.");
}

// --- Theme Management Logic ---
function initializeTheme() {
    const themeSwitcher = document.getElementById('theme-switcher');
    if (!themeSwitcher) return;

    const themeRadios = themeSwitcher.querySelectorAll('input[type="radio"]');
    const savedTheme = localStorage.getItem('theme') || 'system';
    
    // อ้างอิงถึง Stylesheet ของ highlight.js ทั้งสองอัน
    const lightThemeSheet = document.getElementById('hljs-light-theme');
    const darkThemeSheet = document.getElementById('hljs-dark-theme');
    
    const applyTheme = (theme) => {
        document.body.classList.remove('dark-mode', 'light-mode');
        
        let isDark = theme === 'dark';
        if (theme === 'system') {
            isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        document.body.classList.add(isDark ? 'dark-mode' : 'light-mode');

        // [DEFINITIVE FIX] สั่งเปิด/ปิด Stylesheet ของโค้ดตาม Theme
        if (lightThemeSheet) lightThemeSheet.disabled = isDark;
        if (darkThemeSheet) darkThemeSheet.disabled = !isDark;
    };

    themeRadios.forEach(radio => {
        if (radio.value === savedTheme) radio.checked = true;
        radio.addEventListener('change', (event) => {
            const selectedTheme = event.target.value;
            localStorage.setItem('theme', selectedTheme);
            applyTheme(selectedTheme);
        });
    });

    applyTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem('theme') || 'system') === 'system') {
            applyTheme('system');
        }
    });
}
// // --- Application Entry Point ---

function initializeUI() {
    initializeTheme();
    initCoreUI();
    initGlobalKeybindings();
    setupLayout();
    initRightSidebarToggle();
    initGlobalDropdownListener();

    ProjectUI.initProjectUI();
    SessionUI.initSessionUI();
    ChatUI.initChatUI();
    SettingsUI.initSettingsUI();
    ComposerUI.initComposerUI();
    StudioUI.initStudioUI();
    AgentUI.initAgentUI();
    GroupUI.initGroupUI();
    MemoryUI.initMemoryUI();
    SummaryUI.initSummaryUI();
    ChatHandlers.initMessageInteractions();

    console.log("✅ All UI modules initialized.");
}
/**
 * Main application entry point.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const loadingOverlay = document.getElementById('loading-overlay');
    try {
        console.log("🚀 Application starting...");

        initializeUI();
        setupEventSubscriptions();
        // ChatHandlers.initChatHandlers();
        ProjectHandlers.setupAutoSaveChanges();

        const lastProjectId = localStorage.getItem('lastActiveProjectId');
        if (lastProjectId) {
            await ProjectHandlers.loadLastProject(lastProjectId);
        } else {
            await ProjectHandlers.createNewProject();
        }

        loadingOverlay?.classList.remove('active');
        console.log("🎉 Application initialized successfully.");

    } catch (error) {
        console.error('[Startup Error]', error);
        loadingOverlay.querySelector('p').textContent = `Error: ${error.message}`;
    }
});