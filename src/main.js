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
// import { marked } from 'marked'; // ตรวจสอบว่ามีการ import marked แล้ว
// import { updateSummarizationActionMenu } from './js/modules/project/project.ui.js';

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
import * as ComposerHandlers from './js/modules/composer/composer.handlers.js'; // <-- ตรวจสอบว่ามีบรรทัดนี้
import * as SummaryUI from './js/modules/summary/summary.ui.js';
import * as SummaryHandlers from './js/modules/summary/summary.handlers.js';
import * as UserUI from './js/modules/user/user.ui.js';
import * as UserService from './js/modules/user/user.service.js';
import * as UserHandlers from './js/modules/user/user.handlers.js';
import * as ModelManagerUI from './js/modules/models/model-manager.ui.js';
import * as AccountUI from './js/modules/account/account.ui.js';

// --- State for Lazy Initialization ---
let isStudioInitialized = false;
const renderer = new marked.Renderer();
const originalLinkRenderer = renderer.link;

// Override การแสดงผลของลิงก์
renderer.link = (href, title, text) => {
    const html = originalLinkRenderer.call(renderer, href, title, text);
    return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
};

marked.setOptions({
    renderer: renderer,
    gfm: true,
    breaks: false
});

// --- End of Configuration ---

function initCrossTabSync() {
    window.addEventListener('storage', (event) => {
        if (event.key === 'promptPrimUserDatabase_v1') {
            // [FIX] Call the new, lightweight reload function instead of the full init.
            UserService.reloadDatabaseFromStorage();
        }
    });
}
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
    // bus.subscribe('session:load', ({ sessionId }) => SessionHandlers.loadChatSession(sessionId));
    // --- [NEW] สร้าง Listener กลางสำหรับจัดการ UI ทั้งหมดหลังโหลด Session ---
    bus.subscribe('session:loaded', ({ session }) => {
        // ฟังก์ชันเหล่านี้จะถูกเรียกตามลำดับอย่างเป็นระเบียบ
        ChatUI.updateChatTitle(session.name);
        ChatUI.renderMessages(); 

        // [FIX] เรียกใช้ฟังก์ชันจาก Module ที่ถูกต้อง
        ComposerHandlers.loadComposerContent(); // <--- แก้ไขบรรทัดนี้

        SessionUI.renderSessionList();
        
        // ส่ง event ย่อยเพื่อให้โมดูลอื่นทำงานต่อ
        stateManager.bus.publish('entity:selected', session.linkedEntity);
        // ไม่จำเป็นต้อง publish context:requestData แล้ว เพราะ UI จะอัปเดตเอง
    });

    // --- [NEW] สร้าง Listener สำหรับเคลียร์หน้าจอ ---
    bus.subscribe('session:cleared', () => {
        ChatUI.clearChat();
        ComposerUI.setContent('');
        SessionUI.renderSessionList();
    });
    bus.subscribe('session:autoRename', SessionHandlers.handleAutoRename);
    bus.subscribe('session:rename', (payload) => SessionHandlers.renameChatSession(payload));
    bus.subscribe('session:clone', ({ sessionId, event }) => SessionHandlers.cloneSession(sessionId, event));
    bus.subscribe('session:archive', ({ sessionId, event }) => SessionHandlers.archiveSession(sessionId, event));
    bus.subscribe('session:pin', ({ sessionId, event }) => SessionHandlers.togglePinSession(sessionId, event));
    bus.subscribe('session:delete', (payload) => SessionHandlers.deleteChatSession(payload));
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
    bus.subscribe('memory:toggle', (payload) => {
        MemoryHandlers.toggleMemory(payload);
    });
    
    bus.subscribe('memory:exportPackage', MemoryHandlers.saveMemoryPackage);
    bus.subscribe('memory:importPackage', () => { document.getElementById('load-memory-package-input').click(); });

    bus.subscribe('studio:itemClicked', ProjectHandlers.handleStudioItemClick); 
    bus.subscribe('summary:view', ({ logId }) => SummaryUI.showSummaryModal(logId));
    bus.subscribe('summary:load', ({ logId }) => ChatHandlers.loadSummaryIntoContext(logId));
    bus.subscribe('summary:delete', ({ logId }) => ChatHandlers.deleteSummary(logId));
    bus.subscribe('summary:editFromChat', ({ logId }) => {
        SummaryUI.showSummarizationCenter();
        setTimeout(() => SummaryUI.selectLog(logId), 50);
    });
    bus.subscribe('summary:deleteFromChat', SummaryHandlers.deleteSummaryFromChat);
    bus.subscribe('chat:clearSummaryContext', ChatHandlers.clearSummaryContext); 
    bus.subscribe('entity:select', ({ type, name }) => ProjectHandlers.selectEntity(type, name));

    // Chat Actions
    bus.subscribe('open-composer', () => { stateManager.bus.publish('ui:toggleComposer');});
    bus.subscribe('composer:heightChanged', SessionHandlers.saveComposerHeight);
    bus.subscribe('chat:deleteMessage', (payload) => ChatHandlers.deleteMessage(payload));

    bus.subscribe('chat:sendMessage', ChatHandlers.sendMessage);
    bus.subscribe('chat:stopGeneration', ChatHandlers.stopGeneration);
    bus.subscribe('chat:editMessage', ({ index }) => ChatHandlers.editMessage({ index }));
    bus.subscribe('chat:copyMessage', ({ index, event }) => ChatHandlers.copyMessageToClipboard({ index, event }));
    bus.subscribe('chat:regenerateMessage', ({ index }) => ChatHandlers.regenerateMessage({ index }));
    bus.subscribe('chat:fileUpload', (event) => ChatHandlers.handleFileUpload(event));
    bus.subscribe('chat:filesSelected', (files) => ChatHandlers.handleFileUpload(files));
    bus.subscribe('chat:removeFile', ({ index }) => ChatHandlers.removeAttachedFile({ index }));

    bus.subscribe('chat:summarize', SummaryUI.showSummarizationCenter);    
    bus.subscribe('chat:clearSummary', ChatHandlers.unloadSummaryFromActiveSession);

    bus.subscribe('upload-file', () => { document.getElementById('file-input')?.click();});
    // [FIX] Settings Actions
    bus.subscribe('api:loadModels', loadAllProviderModels);
    bus.subscribe('api:loadUserModels', ({ apiKey, ollamaBaseUrl, isUserKey }) => {
        loadAllProviderModels({ apiKey, ollamaBaseUrl, isUserKey });
    });
    bus.subscribe('settings:apiKeyChanged', UserHandlers.handleApiKeyChange);
    bus.subscribe('settings:ollamaUrlChanged', UserHandlers.handleOllamaUrlChange);
    bus.subscribe('settings:fontChanged', ProjectHandlers.handleFontChange);
    bus.subscribe('settings:systemAgentChanged', ProjectHandlers.saveSystemUtilityAgentSettings);
    
    console.log("✅ Central Event Bus ready.");
}

// // --- Application Entry Point ---

function initializeUI() {
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
    ModelManagerUI.initModelManagerUI(); // <-- เพิ่มบรรทัดนี้
    SummaryUI.initSummaryUI();
    ChatHandlers.initMessageInteractions();
    UserUI.initUserProfileUI(); // << เพิ่มอันนี้เข้ามาแทน
    AccountUI.initAccountUI(); // <-- [ADD THIS]

    document.getElementById('import-settings-input')?.addEventListener('change', UserHandlers.handleSettingsFileSelect);


    console.log("✅ All UI modules initialized.");
}
/**
 * Main application entry point.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const loadingOverlay = document.getElementById('loading-overlay');
    try {
        await UserService.initUserSettings();

        // const systemApiKey = UserService.getSystemApiSettings().openrouterKey;
        // if (systemApiKey) {
        //     // Load system models using the admin key
        //     await loadAllProviderModels({ apiKey: systemApiKey, isUserKey: false });
        // } else {
        //     console.warn("No SYSTEM API key available. Skipping initial model load for Free/Pro users.");
        // }
       const systemSettings = UserService.getSystemApiSettings();
        await loadAllProviderModels({ 
            apiKey: systemSettings.openrouterKey, 
            ollamaBaseUrl: systemSettings.ollamaBaseUrl,
            isUserKey: false 
        });
        console.log("🚀 Application starting...");

        // --- ส่วนของการ Initialize UI และ Event ทั้งหมดจะยังคงเหมือนเดิม ---
        initializeUI();
        initCrossTabSync(); // <-- [ADD THIS] Call the new function
        setupEventSubscriptions();
        ProjectHandlers.setupAutoSaveChanges();
        document.getElementById('load-memory-package-input').addEventListener('change', MemoryHandlers.loadMemoryPackage);

        // --- [DEFINITIVE FIX] เพิ่ม try...catch เพื่อจัดการ Error ตอนโหลดโปรเจกต์ ---
        const lastProjectId = localStorage.getItem('lastActiveProjectId');
        
        if (lastProjectId) {
            console.log(`Attempting to load last project with ID: ${lastProjectId}`);
            try {
                // พยายามโหลดโปรเจกต์ล่าสุดตามปกติ
                await ProjectHandlers.loadLastProject(lastProjectId);
            } catch (error) {
                // --- นี่คือ "ทางออกฉุกเฉิน" ของเรา ---
                console.error(`[RECOVERY] Failed to load last project (ID: ${lastProjectId}). This is likely due to corrupted data.`, error);
                
                // 1. แสดง Alert ที่เป็นมิตรต่อผู้ใช้
                alert("Could not load your last project due to an error. A new project will be created.");
                
                // 2. ล้าง ID ที่มีปัญหาออกจาก localStorage
                localStorage.removeItem('lastActiveProjectId');
                
                // 3. สร้างโปรเจกต์ใหม่เพื่อให้ผู้ใช้สามารถทำงานต่อได้
                console.log("[RECOVERY] Creating a new project as a fallback.");
                await ProjectHandlers.createNewProject();
            }
        } else {
            // ถ้าไม่มีโปรเจกต์ล่าสุด ก็สร้างใหม่ตามปกติ
            await ProjectHandlers.createNewProject();
        }
        // --------------------------------------------------------------------

        loadingOverlay?.classList.remove('active');
        console.log("🎉 Application initialized successfully.");

    } catch (error) {
        console.error('[FATAL STARTUP ERROR]', error);
        loadingOverlay.querySelector('p').textContent = `A critical error occurred: ${error.message}`;
    }
});
window.UserService = UserService; // Expose for debugging
// window.stateManager = stateManager; // << เพิ่มบรรทัดนี้เข้าไป
