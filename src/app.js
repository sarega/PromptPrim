// ===============================================
// FILE: src/app.js (ฉบับสมบูรณ์)
// DESCRIPTION: Main entry point for the application. Initializes all modules,
//              sets up event listeners, and manages workspace logic.
// ===============================================

import './main.jsx' // <-- [THE FIX] เพิ่มบรรทัดนี้เพื่อเรียกใช้โค้ด React
import SummaryCenterModal from './js/react-components/SummaryCenterModal.jsx';
// import './styles/tw-runtime.css';
import './styles/main.css';
import './styles/layout/_loading.css';
import './styles/layout/_right-sidebar.css';

import { mountPhotoStudio, unmountPhotoStudio, initKieAiUI } from './js/modules/kieai/kieai.ui.js';// Core Modules

import { stateManager } from './js/core/core.state.js';
import { setupLayout } from './js/core/core.layout.js';
import { loadAllProviderModels } from './js/core/core.api.js';
import { initCoreUI } from './js/core/core.ui.js';
import { initGlobalKeybindings } from './js/core/core.keyboard.js';
import { initRightSidebarToggle } from './js/modules/chat/chat.ui.js';
import { initGlobalDropdownListener } from './js/core/core.ui.js';
import { processQueue } from './js/modules/chat/chat.group.js';
import { setComposerState } from './js/modules/composer/composer.ui.js';

// UI & Handler Modules (Import all necessary modules)
import * as ProjectUI from './js/modules/project/project.ui.js';
import * as ProjectHandlers from './js/modules/project/project.handlers.js';
import * as SessionUI from './js/modules/session/session.ui.js';
import * as SessionHandlers from './js/modules/session/session.handlers.js';
import * as ChatUI from './js/modules/chat/chat.ui.js';
import * as ChatHandlers from './js/modules/chat/chat.handlers.js';
import * as SettingsUI from './js/modules/settings/settings.ui.js';
import * as StudioUI from './js/modules/studio/studio.ui.js';
import * as StudioHandlers from './js/modules/studio/studio.handlers.js';
import * as AgentUI from './js/modules/agent/agent.ui.js';
import * as AgentHandlers from './js/modules/agent/agent.handlers.js';
import * as GroupUI from './js/modules/group/group.ui.js';
import * as GroupHandlers from './js/modules/group/group.handlers.js';
import * as MemoryUI from './js/modules/memory/memory.ui.js';
import * as MemoryHandlers from './js/modules/memory/memory.handlers.js';
import * as KnowledgeHandlers from './js/modules/knowledge/knowledge.handlers.js';
import * as WorldHandlers from './js/modules/world/world.handlers.js';
import * as WorldUI from './js/modules/world/world.ui.js';
import { getBookLinkedSessionDisplayTitle } from './js/modules/world/world.schema-utils.js';
import * as ComposerUI from './js/modules/composer/composer.ui.js';
import * as ComposerHandlers from './js/modules/composer/composer.handlers.js';
import * as SummaryUI from './js/modules/summary/summary.ui.js';
import * as SummaryHandlers from './js/modules/summary/summary.handlers.js';
import * as UserUI from './js/modules/user/user.ui.js';
import * as UserService from './js/modules/user/user.service.js';
import * as UserHandlers from './js/modules/user/user.handlers.js';
import * as ModelManagerUI from './js/modules/models/model-manager.ui.js';
import * as GroupChat from './js/modules/chat/chat.group.js';
import * as AccountUI from './js/modules/account/account.ui.js';
import * as KieAIHandlers from './js/modules/kieai/kieai.handlers.js'; 
import * as KieAI_UI from './js/modules/kieai/kieai.ui.js';

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

function setWorkspaceToggleActive(workspace = 'chat') {
    document.querySelectorAll('.header-center .menu-toggle-btn').forEach(btn => btn.classList.remove('active'));

    if (workspace === 'world') {
        document.getElementById('switch-to-world-btn')?.classList.add('active');
        return;
    }

    if (workspace === 'photo') {
        document.getElementById('switch-to-photo-btn')?.classList.add('active');
        return;
    }

    if (workspace === 'composer') {
        document.getElementById('switch-to-composer-btn')?.classList.add('active');
        return;
    }

    document.getElementById('switch-to-chat-btn')?.classList.add('active');
}

const SESSION_WORKSPACE_CHAT = 'chat';
const SESSION_WORKSPACE_COMPOSER = 'composer';
const SESSION_COMPOSER_MODE_NORMAL = 'normal';
const SESSION_COMPOSER_MODE_MAXIMIZED = 'maximized';
let suppressWorkspacePreferenceSync = false;

function normalizeSessionWorkspacePreference(workspace) {
    return workspace === SESSION_WORKSPACE_COMPOSER
        ? SESSION_WORKSPACE_COMPOSER
        : SESSION_WORKSPACE_CHAT;
}

function getSessionWorkspacePreference(session) {
    return normalizeSessionWorkspacePreference(session?.workspaceView);
}

function normalizeSessionComposerMode(mode) {
    return mode === SESSION_COMPOSER_MODE_NORMAL
        ? SESSION_COMPOSER_MODE_NORMAL
        : SESSION_COMPOSER_MODE_MAXIMIZED;
}

function getSessionComposerMode(session) {
    return normalizeSessionComposerMode(session?.composerViewMode);
}

function getSessionComposerHeight(session) {
    const sessionHeight = Number(session?.composerHeight);
    if (Number.isFinite(sessionHeight) && sessionHeight > 0) {
        return sessionHeight;
    }

    const savedHeight = Number(localStorage.getItem('promptPrimComposerHeight'));
    if (Number.isFinite(savedHeight) && savedHeight > 0) {
        return savedHeight;
    }

    return null;
}

function getCurrentComposerMode() {
    if (!isComposerWorkspaceActive()) return null;
    const mainContentWrapper = document.querySelector('.main-content-wrapper');
    return mainContentWrapper?.classList.contains('composer-maximized')
        ? SESSION_COMPOSER_MODE_MAXIMIZED
        : SESSION_COMPOSER_MODE_NORMAL;
}

function hasComposerTextContent(rawHtml = '') {
    if (!rawHtml || typeof rawHtml !== 'string') return false;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawHtml;

    const normalizedText = String(tempDiv.textContent || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();

    return normalizedText.length > 0;
}

function appendComposerContentToActiveSession(rawContent) {
    const nextChunk = typeof rawContent === 'string' ? rawContent : '';
    if (!nextChunk.trim()) return false;

    const project = stateManager.getProject();
    if (!project?.activeSessionId || !Array.isArray(project.chatSessions)) return false;

    const activeSession = project.chatSessions.find(item => item.id === project.activeSessionId);
    if (!activeSession) return false;

    const currentRaw = typeof activeSession.composerContent === 'string' ? activeSession.composerContent : '';
    const currentNormalized = ComposerHandlers.normalizeComposerHtmlForStorage(currentRaw);

    let mergedContent = currentNormalized;
    if (hasComposerTextContent(currentNormalized)) {
        mergedContent += '<hr>';
    }
    mergedContent += nextChunk;

    const nextNormalized = ComposerHandlers.normalizeComposerHtmlForStorage(mergedContent);
    if (nextNormalized === currentRaw) return true;

    activeSession.composerContent = nextNormalized;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    return true;
}

function persistActiveSessionWorkspacePreference(workspace, composerMode = null) {
    const normalizedWorkspace = normalizeSessionWorkspacePreference(workspace);
    const project = stateManager.getProject();
    if (!project?.activeSessionId || !Array.isArray(project.chatSessions)) return;

    const activeSession = project.chatSessions.find(item => item.id === project.activeSessionId);
    if (!activeSession) return;

    const resolvedComposerMode = composerMode
        || getCurrentComposerMode()
        || activeSession.composerViewMode
        || SESSION_COMPOSER_MODE_MAXIMIZED;
    const normalizedComposerMode = normalizeSessionComposerMode(resolvedComposerMode);

    const currentWorkspace = normalizeSessionWorkspacePreference(activeSession.workspaceView);
    const currentComposerMode = normalizeSessionComposerMode(activeSession.composerViewMode);
    if (
        currentWorkspace === normalizedWorkspace &&
        currentComposerMode === normalizedComposerMode
    ) {
        return;
    }

    activeSession.workspaceView = normalizedWorkspace;
    activeSession.composerViewMode = normalizedComposerMode;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
}

function withWorkspacePreferenceSyncSuspended(callback) {
    suppressWorkspacePreferenceSync = true;
    try {
        callback();
    } finally {
        suppressWorkspacePreferenceSync = false;
    }
}

function isComposerWorkspaceActive() {
    const composerPanel = document.getElementById('composer-panel');
    return Boolean(composerPanel && !composerPanel.classList.contains('collapsed'));
}

function isPhotoWorkspaceActive() {
    const photoWorkspace = document.getElementById('kieai-studio-workspace');
    return Boolean(photoWorkspace && !photoWorkspace.classList.contains('hidden'));
}

function isWorldWorkspaceActive() {
    const worldWorkspace = document.getElementById('world-workspace');
    const bookWorkspace = document.getElementById('book-workspace');
    return Boolean(
        (worldWorkspace && !worldWorkspace.classList.contains('hidden'))
        || (bookWorkspace && !bookWorkspace.classList.contains('hidden'))
    );
}

function setEmbeddedWorldWorkspaceMode(isActive) {
    const mainContentWrapper = document.querySelector('#main-chat-panel .main-content-wrapper');
    if (mainContentWrapper) {
        mainContentWrapper.classList.toggle('world-workspace-active', !!isActive);
    }
}

function hideWorldWorkspace() {
    const worldWorkspace = document.getElementById('world-workspace');
    const bookWorkspace = document.getElementById('book-workspace');
    if (!worldWorkspace && !bookWorkspace) return;
    setEmbeddedWorldWorkspaceMode(false);
    worldWorkspace?.classList.add('hidden');
    bookWorkspace?.classList.add('hidden');
}

function showWorldWorkspace() {
    try {
        WorldUI.renderWorldWorkspace();
    } catch (_) {
        // ignore if world UI has not been initialized yet
    }
    const worldWorkspace = document.getElementById('world-workspace');
    if (!worldWorkspace) return;
    document.getElementById('book-workspace')?.classList.add('hidden');
    worldWorkspace.classList.remove('hidden');
    setEmbeddedWorldWorkspaceMode(true);
}

function syncWorkspaceToggleActive() {
    if (isWorldWorkspaceActive()) {
        setWorkspaceToggleActive('world');
        return;
    }

    if (isPhotoWorkspaceActive()) {
        setWorkspaceToggleActive('photo');
        return;
    }

    setWorkspaceToggleActive(isComposerWorkspaceActive() ? 'composer' : 'chat');
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

    bus.subscribe('project:loaded', (eventData) => {
        // โค้ดเดิมที่อัปเดต UI ยังอยู่เหมือนเดิม
        ProjectUI.updateProjectTitle(eventData.projectData.name);
        syncWorkspaceToggleActive();
    });

    // Session Management
    bus.subscribe('session:new', SessionHandlers.createNewChatSession);
    // bus.subscribe('session:load', ({ sessionId }) => SessionHandlers.loadChatSession(sessionId));
    // --- [NEW] สร้าง Listener กลางสำหรับจัดการ UI ทั้งหมดหลังโหลด Session ---

    bus.subscribe('session:loaded', ({ session }) => {
        // --- ส่วนที่ 1: วาด Chat UI ทั้งหมด (เหมือนเดิม) ---
        ChatUI.updateChatTitle(getBookLinkedSessionDisplayTitle(session, { fallback: session?.name || 'AI Assistant', includeAct: true }));
        ChatUI.renderMessages();
        SessionUI.renderSessionList();
        
        // [FIX] Only publish entity:selected if we're not preventing auto-mount
        // This prevents the photo studio from re-mounting when user clicks "Back to Chat"
        const preventAutoMount = stateManager.getState().preventPhotoStudioAutoMount;
        const entityForSession = session.linkedEntity || stateManager.getProject()?.activeEntity || null;
        if (!preventAutoMount) {
            if (entityForSession) {
                stateManager.bus.publish('entity:selected', entityForSession);
            }
        } else {
            // Still update the activeEntity in state, just don't trigger workspace switch
            const project = stateManager.getProject();
            if (entityForSession) {
                project.activeEntity = { ...entityForSession };
                stateManager.setProject(project);
            }
        }

        // --- ส่วนที่ 2: จัดการสถานะ Composer ต่อ session ---
        const workspacePreference = getSessionWorkspacePreference(session);
        const composerModePreference = getSessionComposerMode(session);
        try {
            if (workspacePreference === SESSION_WORKSPACE_COMPOSER) {
                setComposerState(composerModePreference);
                const preferredHeight = getSessionComposerHeight(session);
                const composerPanel = document.getElementById('composer-panel');
                if (preferredHeight && composerPanel && composerModePreference === SESSION_COMPOSER_MODE_NORMAL) {
                    composerPanel.style.flexBasis = `${Math.round(preferredHeight)}px`;
                }
            } else {
                setComposerState('collapsed');
            }
        } catch (error) {
            console.error("Could not set composer state on session load:", error);
        }
        persistActiveSessionWorkspacePreference(
            isComposerWorkspaceActive() ? SESSION_WORKSPACE_COMPOSER : SESSION_WORKSPACE_CHAT,
            getCurrentComposerMode()
        );

        // Always leave the photo workspace after loading a session.  The
        // linked entity can still be preserved, but the visible workspace
        // should be the standard chat/composer area and header toggle must
        // reflect whichever one is actually open.
        try {
            KieAI_UI.unmountPhotoStudio();
        } catch (_) {
            // ignore if unavailable
        }
        syncWorkspaceToggleActive();
    });

    
    bus.subscribe('composer:append', ({ content }) => {
        // มันจะไปดึง API ที่เราเพิ่งเก็บไว้ใน stateManager
        const composerApi = stateManager.getState().composerApi;
        if (composerApi && composerApi.appendContent) {
            // แล้วเรียกใช้ฟังก์ชัน appendContent ที่อยู่ใน React Component
            composerApi.appendContent(content);
            return;
        }

        if (!appendComposerContentToActiveSession(content)) {
            console.warn("Composer is not ready and no active session to store appended content.");
        }
    });

    // --- [NEW] สร้าง Listener สำหรับเคลียร์หน้าจอ ---
    bus.subscribe('session:cleared', () => {
        ChatUI.clearChat();
        ComposerUI.setContent('');
        SessionUI.renderSessionList();
    });
    bus.subscribe('session:autoRename', SessionHandlers.handleAutoRename);
    bus.subscribe('session:info', (payload) => SessionUI.openSessionInfoModal(payload));
    bus.subscribe('session:rename', (payload) => SessionHandlers.renameChatSession(payload));
    bus.subscribe('session:move', (payload) => SessionHandlers.moveSessionToFolder(payload));
    bus.subscribe('session:movePrompt', (payload) => SessionHandlers.moveSessionToFolderPrompt(payload));
    bus.subscribe('session:contextMode', (payload) => SessionHandlers.setSessionContextMode(payload));
    bus.subscribe('session:contextModePrompt', (payload) => SessionHandlers.setSessionContextModePrompt(payload));
    bus.subscribe('session:organizeSet', (payload) => SessionHandlers.setSessionListPreferences(payload));
    bus.subscribe('session:clone', ({ sessionId, event }) => SessionHandlers.cloneSession(sessionId, event));
    bus.subscribe('session:archive', ({ sessionId, event }) => SessionHandlers.archiveSession(sessionId, event));
    bus.subscribe('session:pin', ({ sessionId, event }) => SessionHandlers.togglePinSession(sessionId, event));
    bus.subscribe('session:delete', (payload) => SessionHandlers.deleteChatSession(payload));
    bus.subscribe('session:download', ({ sessionId }) => SessionHandlers.downloadChatSession({ sessionId }));
    bus.subscribe('folder:new', (payload) => SessionHandlers.createSessionFolder(payload));
    bus.subscribe('folder:rename', (payload) => SessionHandlers.renameSessionFolder(payload));
    bus.subscribe('folder:delete', (payload) => SessionHandlers.deleteSessionFolder(payload));
    bus.subscribe('folder:updateSettings', (payload) => SessionHandlers.updateSessionFolderSettings(payload));
    bus.subscribe('folder:newChat', (payload) => SessionHandlers.createChatInFolder(payload));
    bus.subscribe('folder:activate', (payload) => SessionHandlers.activateSessionFolder(payload));
    bus.subscribe('folder:collapse', (payload) => SessionHandlers.setFolderCollapsedState(payload));
    bus.subscribe('folder:sortMode', (payload) => SessionHandlers.setFolderSessionSortMode(payload));


    // Agent & Studio Actions
    bus.subscribe('agent:create', () => AgentUI.showAgentEditor(false));
    bus.subscribe('agent:save', AgentHandlers.saveAgentPreset);
    bus.subscribe('agent:edit', ({ agentName }) => AgentUI.showAgentEditor(true, agentName));
    bus.subscribe('agent:delete', ({ agentName }) => AgentHandlers.deleteAgentPreset(agentName));
    bus.subscribe('agent:duplicate', ({ agentName }) => AgentHandlers.duplicateAgentPreset(agentName));
    bus.subscribe('agent:import', () => document.getElementById('import-agents-input')?.click());
    bus.subscribe('agent:exportAll', StudioHandlers.exportAllAgents);
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
    bus.subscribe('studio:toggleSectionVisibility', (payload) => StudioHandlers.toggleStudioSectionVisibility(payload));
    bus.subscribe('studio:setAllSectionVisibility', (payload) => StudioHandlers.setAllStudioSectionVisibility(payload));
    bus.subscribe('entity:stagedApply', ProjectHandlers.applyStagedEntitySelection);
    bus.subscribe('entity:stagedCancel', ProjectHandlers.cancelStagedEntitySelection);
    bus.subscribe('session:loaded', () => ProjectHandlers.cancelStagedEntitySelection());
    bus.subscribe('summary:editFromChat', ({ logId }) => {
        SummaryUI.showSummarizationCenter();
        setTimeout(() => SummaryUI.selectLog(logId), 50);
    });

    // [ของใหม่] Actions ภายใน React Modal
    bus.subscribe('summary:generateNew', SummaryHandlers.generateNewSummary);
    bus.subscribe('summary:saveEdit', SummaryHandlers.saveSummaryEdit);
    bus.subscribe('summary:deleteLog', ({ logId }) => SummaryHandlers.deleteSummaryLog({ logId }));
    bus.subscribe('summary:loadToContext', ({ logId }) => SummaryHandlers.loadSummaryToContext({ logId }));

    // [ของใหม่] Preset Settings Actions ภายใน React Modal
    bus.subscribe('settings:saveSummaryPreset', (payload) => SummaryHandlers.handleSaveSummarizationPreset(payload));
    bus.subscribe('settings:renameSummaryPreset', (payload) => SummaryHandlers.renameSummarizationPreset(payload));
    bus.subscribe('settings:deleteSummaryPreset', (payload) => SummaryHandlers.deleteSummarizationPreset(payload));
    bus.subscribe('chat:clearSummaryContext', ChatHandlers.clearSummaryContext); 
    bus.subscribe('summary:saveNewLog', (payload) => SummaryHandlers.saveNewSummaryLog(payload));

    bus.subscribe('entity:select', ({ type, name }) => ProjectHandlers.selectEntity(type, name));

    // Chat Actions
    bus.subscribe('open-composer', () => { stateManager.bus.publish('ui:toggleComposer');});
    bus.subscribe('composer:heightChanged', SessionHandlers.saveComposerHeight);
    bus.subscribe('ui:requestComposerOpen', () => {
        hideWorldWorkspace();
        KieAI_UI.unmountPhotoStudio();
        setComposerState(SESSION_COMPOSER_MODE_NORMAL);
        persistActiveSessionWorkspacePreference(SESSION_WORKSPACE_COMPOSER, SESSION_COMPOSER_MODE_NORMAL);
        syncWorkspaceToggleActive();
    });
    bus.subscribe('ui:toggleComposer', () => {
        hideWorldWorkspace();
        KieAI_UI.unmountPhotoStudio();
        setComposerState(SESSION_COMPOSER_MODE_NORMAL);
        persistActiveSessionWorkspacePreference(SESSION_WORKSPACE_COMPOSER, SESSION_COMPOSER_MODE_NORMAL);
        syncWorkspaceToggleActive();
    });
    bus.subscribe('ui:openWorldWorkspace', () => {
        withWorkspacePreferenceSyncSuspended(() => {
            try {
                setComposerState('collapsed');
            } catch (_) {
                // ignore if unavailable
            }
        });
        KieAI_UI.unmountPhotoStudio();
        showWorldWorkspace();
        setWorkspaceToggleActive('world');
    });
    bus.subscribe('composer:visibilityChanged', () => {
        if (!suppressWorkspacePreferenceSync && !isPhotoWorkspaceActive() && !isWorldWorkspaceActive()) {
            persistActiveSessionWorkspacePreference(
                isComposerWorkspaceActive() ? SESSION_WORKSPACE_COMPOSER : SESSION_WORKSPACE_CHAT,
                getCurrentComposerMode()
            );
        }
        syncWorkspaceToggleActive();
    });
    bus.subscribe('composer:export', ComposerHandlers.exportComposerContent);
    
    bus.subscribe('chat:deleteMessage', (payload) => ChatHandlers.deleteMessage(payload));

    bus.subscribe('chat:sendMessage', ChatHandlers.sendMessage);
    bus.subscribe('chat:stopGeneration', ChatHandlers.stopGeneration);
    bus.subscribe('chat:assistantTurnCompleted', (payload) => WorldHandlers.handleBookAgentAssistantTurnCompleted(payload));
    bus.subscribe('chat:editMessage', ({ index }) => ChatHandlers.editMessage({ index }));
    bus.subscribe('chat:copyMessage', ({ index, event }) => ChatHandlers.copyMessageToClipboard({ index, event }));
    bus.subscribe('chat:regenerateMessage', ({ index }) => ChatHandlers.regenerateMessage({ index }));
    bus.subscribe('chat:fileUpload', (event) => ChatHandlers.handleFileUpload(event));
    bus.subscribe('chat:filesSelected', (files) => ChatHandlers.handleFileUpload(files));
    bus.subscribe('chat:removeFile', ({ index }) => ChatHandlers.removeAttachedFile({ index }));
    bus.subscribe('knowledge:upload', KnowledgeHandlers.openKnowledgeFilePicker);
    bus.subscribe('knowledge:filesSelected', (files) => KnowledgeHandlers.handleKnowledgeFilesSelected(files));
    bus.subscribe('knowledge:delete', ({ fileId }) => KnowledgeHandlers.deleteKnowledgeFile({ fileId }));
    bus.subscribe('knowledge:reindex', ({ fileId }) => KnowledgeHandlers.reindexKnowledgeFile({ fileId }));
    bus.subscribe('knowledge:reindexAll', KnowledgeHandlers.reindexAllKnowledgeFiles);
    bus.subscribe('knowledge:clearAll', KnowledgeHandlers.clearKnowledgeFiles);
    bus.subscribe('knowledge:updateSessionRagSettings', (payload) => KnowledgeHandlers.updateActiveSessionRagSettings(payload));
    bus.subscribe('knowledge:toggleSelection', ({ fileId }) => KnowledgeHandlers.toggleFileInActiveSessionScope({ fileId }));
    bus.subscribe('knowledge:setScopeSource', (payload) => KnowledgeHandlers.setActiveSessionRagScopeSource(payload));
    bus.subscribe('knowledge:focusChunk', (payload) => KnowledgeHandlers.focusKnowledgeChunk(payload));
    bus.subscribe('knowledge:clearFocus', KnowledgeHandlers.clearKnowledgeFocus);

    // --- World / Book / Chapter (MVP foundation) ---
    bus.subscribe('world:create', (payload) => WorldHandlers.createWorld(payload));
    bus.subscribe('world:createPrompt', (payload) => WorldHandlers.createWorldPrompt(payload));
    bus.subscribe('world:update', (payload) => WorldHandlers.updateWorld(payload));
    bus.subscribe('world:renamePrompt', (payload) => WorldHandlers.renameWorldPrompt(payload));
    bus.subscribe('world:delete', (payload) => WorldHandlers.deleteWorld(payload));
    bus.subscribe('world:setActive', (payload) => WorldHandlers.setActiveWorld(payload));
    bus.subscribe('world:itemCreate', (payload) => WorldHandlers.createWorldItem(payload));
    bus.subscribe('world:addSelectionVerbatim', (payload) => WorldHandlers.addSelectionVerbatimToWorld(payload));
    bus.subscribe('world:itemCreatePrompt', (payload) => WorldHandlers.createWorldItemPrompt(payload));
    bus.subscribe('world:itemUpdate', (payload) => WorldHandlers.updateWorldItem(payload));
    bus.subscribe('world:itemEditPrompt', (payload) => WorldHandlers.editWorldItemPrompt(payload));
    bus.subscribe('world:itemDelete', (payload) => WorldHandlers.deleteWorldItem(payload));
    bus.subscribe('world:changeCreate', (payload) => WorldHandlers.createWorldChangeProposal(payload));
    bus.subscribe('world:changeReview', (payload) => WorldHandlers.reviewWorldChangeProposal(payload));
    bus.subscribe('world:proposeFromCurrentChat', (payload) => WorldHandlers.proposeWorldUpdatesFromCurrentChat(payload));
    bus.subscribe('world:bookAgentScanProposals', (payload) => WorldHandlers.scanBookAgentForWorldProposals(payload));
    bus.subscribe('world:bookAgentResetScanCursor', (payload) => WorldHandlers.resetBookAgentProposalScanCursor(payload));

    bus.subscribe('book:create', (payload) => WorldHandlers.createBook(payload));
    bus.subscribe('book:createPrompt', (payload) => WorldHandlers.createBookPrompt(payload));
    bus.subscribe('book:update', (payload) => WorldHandlers.updateBook(payload));
    bus.subscribe('book:actUpsert', (payload) => WorldHandlers.upsertBookAct(payload));
    bus.subscribe('book:renumberChapters', (payload) => WorldHandlers.renumberBookChapters(payload));
    bus.subscribe('book:renamePrompt', (payload) => WorldHandlers.renameBookPrompt(payload));
    bus.subscribe('book:delete', (payload) => WorldHandlers.deleteBook(payload));
    bus.subscribe('book:ensureWorld', (payload) => WorldHandlers.ensureBookWorld(payload));
    bus.subscribe('book:setActive', (payload) => WorldHandlers.setActiveBook(payload));
    bus.subscribe('book:linkWorld', (payload) => WorldHandlers.linkBookToWorld(payload));
    bus.subscribe('book:linkWorldPrompt', (payload) => WorldHandlers.linkBookToWorldPrompt(payload));
    bus.subscribe('book:openWorkspace', (payload) => WorldUI.openBookWorkspaceFromExternal(payload));

    bus.subscribe('chapter:assignToBook', (payload) => WorldHandlers.assignSessionToBook(payload));
    bus.subscribe('chapter:assignToBookPrompt', (payload) => WorldHandlers.assignSessionToBookPrompt(payload));
    bus.subscribe('chapter:detachFromBook', (payload) => WorldHandlers.detachSessionFromBook(payload));
    bus.subscribe('chapter:moveInBookOrder', (payload) => WorldHandlers.moveChapterInBookOrder(payload));
    bus.subscribe('chapter:reorderInBook', (payload) => WorldHandlers.reorderChapterInBook(payload));
    bus.subscribe('chapter:moveToAct', (payload) => WorldHandlers.moveChapterToAct(payload));
    bus.subscribe('chapter:updateMeta', (payload) => WorldHandlers.updateChapterMetadata(payload));
    bus.subscribe('chapter:summarizeOverview', (payload) => WorldHandlers.summarizeChapterForOverview(payload));
    bus.subscribe('book:summarizeMissingOverview', (payload) => WorldHandlers.summarizeMissingBookChaptersForOverview(payload));
    bus.subscribe('chapter:updateMetaPrompt', (payload) => WorldHandlers.updateChapterMetadataPrompt(payload));

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

    //... ภายในฟังก์ชัน setupEventSubscriptions()
    bus.subscribe('group:manualSelectAgent', ({ agentName }) => {
        const project = stateManager.getProject();
        const session = project.chatSessions.find(s => s.id === project.activeSessionId);
        const group = project.agentGroups[project.activeEntity.name];
        if (!session || !group) return;

        const newJob = {
            type: 'agent_turn',
            agentName: agentName,
        };

        session.groupChatState.turnQueue.push(newJob);
        session.groupChatState.awaitsUserInput = false;
        stateManager.bus.publish('ui:renderAgentSelector');

        // เรียก "เครื่องจักร" ให้เริ่มทำงานกับ Job ที่เพิ่งสร้าง
        GroupChat.processQueue(project, session, group);
    });
    // [✅ NEW: Subscribe สำหรับ Kie.ai Generation Request]
    bus.subscribe('kieai:generate', KieAIHandlers.handleGenerationRequest);

    //
    // Subscribe header button clicks.  Each handler is responsible for
    // transitioning between the three primary workspaces (chat, photo
    // studio and composer) and updating the header active state.
    // When switching away from composer we always collapse it so that it
    // does not continue to occupy vertical space in the interface.
    
    document.getElementById('switch-to-photo-btn')?.addEventListener('click', () => {
        // Collapse the composer completely when entering the photo studio.
        withWorkspacePreferenceSyncSuspended(() => {
            try {
                setComposerState('collapsed');
            } catch (_) {
                // ignore if unavailable
            }
        });
        hideWorldWorkspace();
        // Prefer the newer workspace label if the project has that agent, while
        // keeping backward compatibility with existing "Visual Studio" setups.
        const project = stateManager.getProject();
        const studioAgentName = project?.agentPresets?.['Media Studio']
            ? 'Media Studio'
            : (project?.agentPresets?.['Visual Studio'] ? 'Visual Studio' : 'Media Studio');
        stateManager.bus.publish('entity:select', { type: 'agent', name: studioAgentName });
        setWorkspaceToggleActive('photo');
    });

    document.getElementById('switch-to-chat-btn')?.addEventListener('click', () => {
        // Collapse composer to free up space for chat
        try {
            setComposerState('collapsed');
        } catch (_) {
            // ignore if unavailable
        }
        persistActiveSessionWorkspacePreference(SESSION_WORKSPACE_CHAT);
        // Ensure any photo studio view is closed
        hideWorldWorkspace();
        KieAI_UI.unmountPhotoStudio();
        
        // [FIX] Set a flag to prevent auto-mounting photo studio when loading the session
        stateManager.setState('preventPhotoStudioAutoMount', true);
        
        // Load the current chat session
        const project = stateManager.getProject();
        SessionHandlers.loadChatSession(project.activeSessionId);
        
        // Clear the flag after a short delay to allow session loading to complete
        setTimeout(() => {
            stateManager.setState('preventPhotoStudioAutoMount', false);
        }, 100);
        
        setWorkspaceToggleActive('chat');
    });

    document.getElementById('switch-to-composer-btn')?.addEventListener('click', () => {
        // Restore the preferred composer mode for the active session.
        hideWorldWorkspace();
        KieAI_UI.unmountPhotoStudio();
        const project = stateManager.getProject();
        const activeSession = project?.chatSessions?.find((item) => item.id === project.activeSessionId);
        const preferredMode = getSessionComposerMode(activeSession);
        try {
            ComposerUI.setComposerState(preferredMode);
        } catch (_) {
            // fallback to the named import if namespace call fails
            try {
                setComposerState(preferredMode);
            } catch (_) {
                // ignore
            }
        }
        if (preferredMode === SESSION_COMPOSER_MODE_NORMAL) {
            const preferredHeight = getSessionComposerHeight(activeSession);
            const composerPanel = document.getElementById('composer-panel');
            if (preferredHeight && composerPanel) {
                composerPanel.style.flexBasis = `${Math.round(preferredHeight)}px`;
            }
        }
        persistActiveSessionWorkspacePreference(SESSION_WORKSPACE_COMPOSER, preferredMode);
        setWorkspaceToggleActive('composer');
    });

    document.getElementById('switch-to-world-btn')?.addEventListener('click', () => {
        withWorkspacePreferenceSyncSuspended(() => {
            try {
                setComposerState('collapsed');
            } catch (_) {
                // ignore if unavailable
            }
        });
        KieAI_UI.unmountPhotoStudio();
        showWorldWorkspace();
        setWorkspaceToggleActive('world');
    });
    
    // [✅ CRITICAL FIX: แก้ไข logic สลับหน้าใน entity:selected]
    bus.subscribe('entity:selected', (payload) => {
        const { type, name } = payload;
        
        // [FIX] Check if we should prevent auto-mounting (e.g., when user explicitly clicks "Back to Chat")
        const preventAutoMount = stateManager.getState().preventPhotoStudioAutoMount;
        
        // [FIX] Be more specific about which agents trigger Photo Studio
        // Only exact match for "Visual Studio" or agents with KieAI/Wan/Seedance in their names
        const isKieAIAgent = type === 'agent' && (
            name === 'Media Studio' ||
            name === 'Visual Studio' ||
            name.includes('KieAI') ||
            name.includes('Wan') ||
            name.includes('Seedance') ||
            name.includes('Veo') ||
            name.includes('Flux')
        );
        
        // 1. จัดการ Workspace
        if (isKieAIAgent && !preventAutoMount) {
            hideWorldWorkspace();
            KieAI_UI.mountPhotoStudio(name);
            setWorkspaceToggleActive('photo');
        } else if (!preventAutoMount) {
            // [✅ FIX: ใช้ KieAI_UI.unmountPhotoStudio() แทน StudioUI]
            KieAI_UI.unmountPhotoStudio();
            syncWorkspaceToggleActive();
        }
    });
    

    console.log("✅ Central Event Bus ready.");
}



// // --- Application Entry Point ---

function initializeUI() {
    initCoreUI();
    initGlobalKeybindings();
    setupLayout();
    initRightSidebarToggle();
    initGlobalDropdownListener();
    KieAI_UI.initKieAiUI();   
    ProjectUI.initProjectUI();
    SessionUI.initSessionUI();
    WorldUI.initWorldUI();
    ChatUI.initChatUI();
    SettingsUI.initSettingsUI();
    // ComposerUI.initComposerUI();
    StudioUI.initStudioUI();
    AgentUI.initAgentUI();
    GroupUI.initGroupUI();
    MemoryUI.initMemoryUI();
    ModelManagerUI.initModelManagerUI();
    SummaryUI.initSummaryUI();
    ChatHandlers.initMessageInteractions();
    UserUI.initUserProfileUI();
    AccountUI.initAccountUI();
    
    document.getElementById('import-settings-input')?.addEventListener('change', UserHandlers.handleSettingsFileSelect);

    console.log("✅ All UI modules initialized.");
}
/**
 * Main application entry point.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const loadingOverlay = document.getElementById('loading-overlay');
    try {
        // Always start with a collapsed composer on first load.  Clearing any
        // persisted composer state prevents previously maximized or normal
        // states from being restored automatically, which would otherwise
        // cause the composer to appear when opening the app.
        try {
            localStorage.removeItem('promptPrimComposerState');
            localStorage.removeItem('promptPrimComposerHeight');
        } catch (_) {
            // ignore if localStorage is unavailable
        }

        await UserService.initUserSettings();
        // --- [CRITICAL FIX] ---
        const currentUser = UserService.getCurrentUserProfile();
        const isMasterUser = UserService.isMasterProfile(currentUser);
        const systemSettings = UserService.getSystemApiSettings();
        const systemProviderEnabled = systemSettings.providerEnabled || {};

        // 1. โหลดโมเดลของระบบเฉพาะผู้ใช้ Free/Pro
        if (!isMasterUser) {
            await loadAllProviderModels({
                apiKey: systemProviderEnabled.openrouter !== false ? systemSettings.openrouterKey : '',
                ollamaBaseUrl: systemProviderEnabled.ollama !== false ? systemSettings.ollamaBaseUrl : '',
                isUserKey: false
            });
        }

        // 2. โหลดโมเดลของผู้ใช้เองสำหรับ Master Plan
        if (isMasterUser && currentUser) {
            const userProviderEnabled = currentUser.apiSettings?.providerEnabled || {};
            await loadAllProviderModels({
                apiKey: userProviderEnabled.openrouter !== false ? currentUser.apiSettings?.openrouterKey : '',
                ollamaBaseUrl: userProviderEnabled.ollama !== false ? currentUser.apiSettings?.ollamaBaseUrl : '',
                isUserKey: true
            });
        }
        console.log("🚀 Application starting...");

        // --- ส่วนของการ Initialize UI และ Event ทั้งหมดจะยังคงเหมือนเดิม ---
        initializeUI();
        initCrossTabSync(); // <-- [ADD THIS] Call the new function
        setupEventSubscriptions();
        ProjectHandlers.setupAutoSaveChanges();
        document.getElementById('load-memory-package-input').addEventListener('change', MemoryHandlers.loadMemoryPackage);
        document.getElementById('knowledge-file-input')?.addEventListener('change', (event) => {
            stateManager.bus.publish('knowledge:filesSelected', event.target.files);
            event.target.value = '';
        });

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


// [✅ NEW: Init Mobile Gestures]
initMobileGestures();

window.UserService = UserService; // Expose for debugging
// window.stateManager = stateManager; // << เพิ่มบรรทัดนี้เข้าไป
