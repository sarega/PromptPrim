// ===============================================
// FILE: src/js/modules/session/session.ui.js
// DESCRIPTION: Session list rendering and interactions, including folder UI.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as SessionHandlers from './session.handlers.js';
import {
    ensureProjectFolders,
    getFolderById,
    normalizeFolderContextPolicy,
    normalizeFolderRagSettings,
    normalizeSessionContextMode,
    normalizeSessionRagSettings
} from './session.folder-utils.js';

let isSessionUIInitialized = false;
let draggedSessionId = null;
let activeDropdownPortal = null;
let folderExpandHoverTimer = null;
let pendingFolderExpandId = null;
let suppressFolderCollapsePersistence = false;
const SESSION_LIST_ORGANIZE_FOLDER = 'folder';
const SESSION_LIST_ORGANIZE_CHRONOLOGICAL = 'chronological';
const SESSION_LIST_SORT_UPDATED = 'updated';
const SESSION_LIST_SORT_CREATED = 'created';
const SESSION_LIST_SHOW_ALL = 'all';
const SESSION_LIST_SHOW_RELEVANT = 'relevant';

function escapeSelectorValue(rawValue = '') {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(rawValue);
    }
    return String(rawValue).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getSessionSortTimestamp(session, sortBy = SESSION_LIST_SORT_UPDATED) {
    if (sortBy === SESSION_LIST_SORT_CREATED) {
        return Number(session?.createdAt || 0);
    }
    return Number(session?.updatedAt || 0);
}

function sortSessionsForList(sessions = [], sortBy = SESSION_LIST_SORT_UPDATED) {
    return [...sessions].sort((a, b) => {
        const sortDiff = getSessionSortTimestamp(b, sortBy) - getSessionSortTimestamp(a, sortBy);
        if (sortDiff !== 0) return sortDiff;
        return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
    });
}

function filterSessionsByShowMode(sessions = [], project, showMode = SESSION_LIST_SHOW_ALL) {
    if (showMode !== SESSION_LIST_SHOW_RELEVANT || !project?.activeSessionId) {
        return sessions;
    }

    const activeSession = (project.chatSessions || []).find(session => session.id === project.activeSessionId);
    if (!activeSession) return sessions;

    const activeFolderId = activeSession.folderId || null;
    return sessions.filter(session => (
        session.id === activeSession.id || (session.folderId || null) === activeFolderId
    ));
}

function updateSessionOrganizeMenuState(project) {
    const menu = document.getElementById('session-organize-menu');
    if (!menu || !project) return;

    const preferences = SessionHandlers.getSessionListPreferences(project);
    menu.querySelectorAll('.session-organize-option').forEach(option => {
        let isSelected = false;
        if (option.dataset.organizeBy) {
            isSelected = preferences.organizeBy === option.dataset.organizeBy;
        } else if (option.dataset.sortBy) {
            isSelected = preferences.sortBy === option.dataset.sortBy;
        } else if (option.dataset.showMode) {
            isSelected = preferences.showMode === option.dataset.showMode;
        }

        option.classList.toggle('is-selected', isSelected);
        option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });
}

function ensureSessionsPanelVisible() {
    const sessionsPanel = document.querySelector('.sessions-panel');
    if (!sessionsPanel) return;

    if (window.innerWidth <= 1024) {
        sessionsPanel.classList.add('is-open');
        document.getElementById('mobile-overlay')?.classList.add('active');
        return;
    }

    document.querySelector('.app-wrapper')?.classList.remove('sidebar-collapsed');
}

function highlightLocatedSession(item) {
    if (!item) return;
    item.classList.remove('session-locate-highlight');
    void item.offsetWidth;
    item.classList.add('session-locate-highlight');
    window.setTimeout(() => {
        item.classList.remove('session-locate-highlight');
    }, 1300);
}

function revealActiveSessionInList() {
    const project = stateManager.getProject();
    const activeSessionId = project?.activeSessionId;
    if (!project || !activeSessionId) return;

    ensureSessionsPanelVisible();

    let targetItem = document.querySelector(`.session-item[data-session-id="${escapeSelectorValue(activeSessionId)}"]`);
    if (!targetItem) {
        renderSessionList();
        targetItem = document.querySelector(`.session-item[data-session-id="${escapeSelectorValue(activeSessionId)}"]`);
    }
    if (!targetItem) return;

    const parentFolder = targetItem.closest('.session-folder[data-folder-id]');
    if (parentFolder && !parentFolder.open) {
        parentFolder.open = true;
    }

    requestAnimationFrame(() => {
        targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightLocatedSession(targetItem);
    });
}

function refreshFolderAnimationHeights() {
    document.querySelectorAll('.session-folder > .folder-session-list').forEach((list) => {
        if (!(list instanceof HTMLElement)) return;

        const folder = list.closest('.session-folder');
        const wasOpen = Boolean(folder?.open);

        // Temporarily expose full content height to avoid "instant jump" animation.
        if (!wasOpen && folder) {
            suppressFolderCollapsePersistence = true;
            folder.open = true;
        }

        list.style.maxHeight = 'none';
        const contentHeight = Math.max(0, Math.ceil(list.scrollHeight));
        list.style.maxHeight = '';
        list.style.setProperty('--folder-content-height', `${contentHeight}px`);

        if (!wasOpen && folder) {
            folder.open = false;
            suppressFolderCollapsePersistence = false;
        }
    });
}

function animateSessionFolderToggle(folderItem, shouldOpen) {
    const list = folderItem?.querySelector(':scope > .folder-session-list');
    if (!folderItem || !list) {
        if (folderItem) folderItem.open = Boolean(shouldOpen);
        return;
    }
    if (folderItem.dataset.folderAnimating === '1') return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        folderItem.open = Boolean(shouldOpen);
        refreshFolderAnimationHeights();
        return;
    }

    folderItem.dataset.folderAnimating = '1';
    const durationMs = 230;

    const finish = () => {
        folderItem.dataset.folderAnimating = '0';
        list.style.removeProperty('max-height');
        list.style.removeProperty('opacity');
        list.style.removeProperty('overflow');
        refreshFolderAnimationHeights();
    };

    let fallbackTimerId = null;
    const onTransitionEnd = (event) => {
        if (event.target !== list || event.propertyName !== 'max-height') return;
        list.removeEventListener('transitionend', onTransitionEnd);
        if (fallbackTimerId) {
            window.clearTimeout(fallbackTimerId);
        }

        if (!shouldOpen) {
            folderItem.open = false;
        }
        finish();
    };
    list.addEventListener('transitionend', onTransitionEnd);
    fallbackTimerId = window.setTimeout(() => {
        list.removeEventListener('transitionend', onTransitionEnd);
        if (!shouldOpen) {
            folderItem.open = false;
        }
        finish();
    }, durationMs + 90);

    if (shouldOpen) {
        folderItem.open = true;
        const targetHeight = Math.max(0, Math.ceil(list.scrollHeight));
        list.style.setProperty('--folder-content-height', `${targetHeight}px`);
        list.style.overflow = 'hidden';
        list.style.maxHeight = '0px';
        list.style.opacity = '0';

        requestAnimationFrame(() => {
            list.style.maxHeight = `${targetHeight}px`;
            list.style.opacity = '1';
        });
        return;
    }

    const currentHeight = Math.max(Math.ceil(list.scrollHeight), Math.ceil(list.getBoundingClientRect().height));
    list.style.setProperty('--folder-content-height', `${currentHeight}px`);
    list.style.overflow = 'hidden';
    list.style.maxHeight = `${currentHeight}px`;
    list.style.opacity = '1';

    requestAnimationFrame(() => {
        list.style.maxHeight = '0px';
        list.style.opacity = '0';
    });
}

function getSessionSortIndex(session, fallback = 0) {
    const parsed = Number(session?.sortIndex);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function sortSessionsByManualOrder(a, b) {
    const sortDiff = getSessionSortIndex(a) - getSessionSortIndex(b);
    if (sortDiff !== 0) return sortDiff;
    return (b?.updatedAt || 0) - (a?.updatedAt || 0);
}

function closeSessionDropdownPortal() {
    if (!activeDropdownPortal) return;
    activeDropdownPortal.portal?.remove();
    activeDropdownPortal.dropdown?.classList.remove('open', 'portal-open');
    activeDropdownPortal = null;
    updateFolderOpenMenuLayers();
}

function positionSessionDropdownPortal() {
    if (!activeDropdownPortal) return;
    const { button, portal } = activeDropdownPortal;
    if (!button?.isConnected || !portal?.isConnected) {
        closeSessionDropdownPortal();
        return;
    }

    const rect = button.getBoundingClientRect();
    portal.style.left = '0px';
    portal.style.top = '0px';
    portal.style.visibility = 'hidden';
    portal.style.display = 'block';

    const menuRect = portal.getBoundingClientRect();
    const viewportPadding = 8;
    const preferredTop = rect.bottom + 6;
    const canOpenUp = rect.top >= menuRect.height + viewportPadding;
    const shouldOpenUp = (preferredTop + menuRect.height > window.innerHeight - viewportPadding) && canOpenUp;
    const top = shouldOpenUp
        ? Math.max(viewportPadding, rect.top - menuRect.height - 6)
        : Math.min(window.innerHeight - menuRect.height - viewportPadding, preferredTop);

    let left = rect.right - menuRect.width;
    if (left < viewportPadding) left = viewportPadding;
    if (left + menuRect.width > window.innerWidth - viewportPadding) {
        left = Math.max(viewportPadding, window.innerWidth - menuRect.width - viewportPadding);
    }

    portal.style.left = `${Math.round(left)}px`;
    portal.style.top = `${Math.round(top)}px`;
    portal.style.visibility = 'visible';
}

function buildPortalMetadataFromDropdown(dropdown, portal) {
    const sessionItem = dropdown.closest('.session-item[data-session-id]');
    const folderItem = dropdown.closest('.session-folder[data-folder-id]');
    const newSessionMenu = dropdown.closest('#new-session-menu');
    const organizeMenu = dropdown.closest('#session-organize-menu');

    if (sessionItem?.dataset.sessionId) {
        portal.dataset.sessionId = sessionItem.dataset.sessionId;
    }
    if (folderItem?.dataset.folderId) {
        portal.dataset.folderId = folderItem.dataset.folderId;
    }
    if (newSessionMenu) {
        portal.dataset.menuType = 'new-session';
    }
    if (organizeMenu) {
        portal.dataset.menuType = 'session-organize';
    }
}

function openSessionDropdownPortal(button) {
    const dropdown = button?.closest('.dropdown');
    if (!dropdown) return;

    const sourceContent = dropdown.querySelector(':scope > .dropdown-content');
    if (!sourceContent) return;

    closeSessionDropdownPortal();

    const portal = document.createElement('div');
    portal.className = 'dropdown-content dropdown-content-portal';
    portal.innerHTML = sourceContent.innerHTML;
    buildPortalMetadataFromDropdown(dropdown, portal);
    document.body.appendChild(portal);

    dropdown.classList.add('open', 'portal-open');
    activeDropdownPortal = { dropdown, button, portal };
    positionSessionDropdownPortal();
    updateFolderOpenMenuLayers();
}

function toggleSessionDropdownPortal(button) {
    const dropdown = button?.closest('.dropdown');
    if (!dropdown) return;
    if (activeDropdownPortal?.dropdown === dropdown) {
        closeSessionDropdownPortal();
        return;
    }
    openSessionDropdownPortal(button);
}

function updateFolderExpandTimer(target) {
    const folderItem = target?.closest?.('.session-folder[data-folder-id]') || null;
    if (!folderItem || folderItem.open) {
        if (folderExpandHoverTimer) {
            clearTimeout(folderExpandHoverTimer);
            folderExpandHoverTimer = null;
            pendingFolderExpandId = null;
        }
        return;
    }

    const folderId = folderItem.dataset.folderId;
    if (!folderId || pendingFolderExpandId === folderId) return;

    if (folderExpandHoverTimer) {
        clearTimeout(folderExpandHoverTimer);
    }
    pendingFolderExpandId = folderId;
    folderExpandHoverTimer = window.setTimeout(() => {
        const latestFolder = document.querySelector(`.session-folder[data-folder-id="${folderId}"]`);
        if (latestFolder && !latestFolder.open) {
            latestFolder.open = true;
        }
        folderExpandHoverTimer = null;
        pendingFolderExpandId = null;
    }, 450);
}

function updateFolderOpenMenuLayers() {
    document.querySelectorAll('.session-folder.has-open-menu')
        .forEach(folder => folder.classList.remove('has-open-menu'));

    document.querySelectorAll('.session-folder .dropdown.open')
        .forEach(dropdown => {
            const folder = dropdown.closest('.session-folder');
            if (folder) folder.classList.add('has-open-menu');
        });
}

function getSessionIcon(project, session) {
    if (session.linkedEntity?.type === 'agent' && project.agentPresets?.[session.linkedEntity.name]) {
        return project.agentPresets[session.linkedEntity.name].icon || '🤖';
    }
    if (session.linkedEntity?.type === 'group') {
        return '🤝';
    }
    return '💬';
}

function getSessionContextLabel(mode) {
    return mode === 'session_only' ? 'Session only' : 'Folder aware';
}

function createSessionElement(session, project) {
    const folder = getFolderById(project, session.folderId);
    const contextMode = normalizeSessionContextMode(session.contextMode);
    const ragSettings = normalizeSessionRagSettings(session.ragSettings, {
        scopeSource: session.folderId ? 'folder' : 'session'
    });
    const ragSourceLabel = ragSettings.scopeSource === 'folder' ? 'Folder RAG' : 'Session RAG';

    const item = document.createElement('div');
    item.className = 'item session-item';
    item.dataset.sessionId = session.id;
    item.draggable = true;

    if (session.pinned || session.isPinned) {
        item.classList.add('pinned');
    }
    if (session.archived) {
        item.classList.add('archived');
    }

    const sessionName = session.name || 'New Chat';
    const contextLabel = getSessionContextLabel(contextMode);
    const folderLabel = folder ? `Folder: ${folder.name}` : 'Main list';
    const sessionIcon = getSessionIcon(project, session);

    item.innerHTML = `
        <div class="item-header">
            <span class="item-name"><span class="item-icon">${sessionIcon}</span> ${sessionName}</span>
            <div class="item-actions">
                <div class="dropdown align-right">
                    <button class="btn-icon" data-action="toggle-menu" title="More options">&#8942;</button>
                    <div class="dropdown-content">
                        <a href="#" data-action="info">Session Info</a>
                        <a href="#" data-action="pin">${(session.pinned || session.isPinned) ? 'Unpin' : 'Pin'} Session</a>
                        <a href="#" data-action="rename">Rename</a>
                        <a href="#" data-action="move">Move to Folder...</a>
                        <a href="#" data-action="context-mode">Context Mode...</a>
                        <a href="#" data-action="clone">Clone Session</a>
                        <a href="#" data-action="archive">${session.archived ? 'Unarchive' : 'Archive'} Session</a>
                        <a href="#" data-action="download">Download Chat</a>
                        <div class="dropdown-divider"></div>
                        <a href="#" data-action="delete" class="is-destructive">
                            <span class="material-symbols-outlined">delete</span> Delete Session
                        </a>
                    </div>
                </div>
            </div>
        </div>
        <div class="session-item-meta">${folderLabel} • ${contextLabel} • ${ragSourceLabel}</div>
    `;

    return item;
}

function createFolderElement(folder, sessions, project) {
    const details = document.createElement('details');
    details.className = 'session-folder';
    details.dataset.folderId = folder.id;
    details.dataset.sessionDropTarget = 'folder';
    details.open = !folder.collapsed;

    const summary = document.createElement('summary');
    summary.className = 'session-folder-summary';
    summary.innerHTML = `
        <span class="session-folder-title">
            <span class="session-folder-caret material-symbols-outlined">chevron_right</span>
            <span class="session-folder-icon-closed material-symbols-outlined">folder</span>
            <span class="session-folder-icon-open material-symbols-outlined">folder_open</span>
            <span>${folder.name}</span>
            <span class="session-folder-count">${sessions.length}</span>
        </span>
        <div class="item-actions">
            <div class="dropdown align-right">
                <button class="btn-icon" data-action="toggle-menu" title="Folder options">&#8942;</button>
                <div class="dropdown-content">
                    <a href="#" data-action="folder:new-chat">New Chat in Folder</a>
                    <a href="#" data-action="folder:rename">Rename Folder</a>
                    <a href="#" data-action="folder:settings">Folder Context Budget...</a>
                    <div class="dropdown-divider"></div>
                    <a href="#" data-action="folder:delete" class="is-destructive">Delete Folder</a>
                </div>
            </div>
        </div>
    `;
    details.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'item-list folder-session-list';
    list.dataset.sessionDropTarget = 'folder';
    list.dataset.folderId = folder.id;

    if (sessions.length === 0) {
        list.innerHTML = '<p class="no-items-message">Drop sessions here or create a new one.</p>';
    } else {
        sessions.forEach(session => {
            list.appendChild(createSessionElement(session, project));
        });
    }

    details.appendChild(list);
    return details;
}

function updateActiveSessionUI(activeSessionId) {
    const allItems = document.querySelectorAll('.session-item');
    allItems.forEach(item => {
        item.classList.toggle('active', item.dataset.sessionId === activeSessionId);
    });
}

function estimateTokens(text = '') {
    if (!text) return 0;
    return Math.max(1, Math.round(String(text).length / 4));
}

function escapeHtml(input = '') {
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSessionInfo(session, project) {
    ensureProjectFolders(project);
    const entity = session.linkedEntity || null;
    const stagedEntity = stateManager.getStagedEntity();
    const activeEntity = project.activeEntity || null;
    const folder = getFolderById(project, session.folderId);
    const contextMode = normalizeSessionContextMode(session.contextMode);
    const sessionRag = normalizeSessionRagSettings(session.ragSettings, {
        scopeSource: session.folderId ? 'folder' : 'session'
    });
    const folderRag = folder ? normalizeFolderRagSettings(folder.ragSettings) : null;
    const effectiveRag = sessionRag.scopeSource === 'folder' && folderRag ? folderRag : sessionRag;

    const selectedIds = Array.isArray(effectiveRag.selectedFileIds)
        ? [...new Set(effectiveRag.selectedFileIds)]
        : [];
    const knowledgeFiles = Array.isArray(project.knowledgeFiles) ? project.knowledgeFiles : [];
    const fileMap = new Map(knowledgeFiles.map(file => [file.id, file]));
    const selectedFiles = selectedIds.map(id => fileMap.get(id)).filter(Boolean);
    const indexedFiles = knowledgeFiles.filter(file => Number(file.chunkCount) > 0);
    const totalChunks = indexedFiles.reduce((sum, file) => sum + (Number(file.chunkCount) || 0), 0);
    const messageCount = Array.isArray(session.history) ? session.history.length : 0;

    const historyText = (session.history || []).map(msg => {
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
            return msg.content
                .filter(part => part?.type === 'text' && part.text)
                .map(part => part.text)
                .join('\n');
        }
        return '';
    }).join('\n');
    const approxHistoryTokens = estimateTokens(historyText);

    const usageTotals = (session.history || []).reduce((acc, msg) => {
        const stats = msg?.stats || {};
        acc.prompt += Number(stats.prompt_tokens || stats.promptTokens || 0);
        acc.completion += Number(stats.completion_tokens || stats.completionTokens || 0);
        return acc;
    }, { prompt: 0, completion: 0 });

    const linkedAgent = entity?.type === 'agent' ? project.agentPresets?.[entity.name] : null;
    const linkedGroup = entity?.type === 'group' ? project.agentGroups?.[entity.name] : null;
    const memoryList = Array.isArray(linkedAgent?.activeMemories) ? linkedAgent.activeMemories : [];
    const groupMembers = Array.isArray(linkedGroup?.agents) ? linkedGroup.agents : [];
    const contextLabel = getSessionContextLabel(contextMode);

    return `
        <div class="info-grid">
            <strong>Session Name:</strong><span>${escapeHtml(session.name || 'Untitled')}</span>
            <strong>Session ID:</strong><span>${escapeHtml(session.id || '-')}</span>
            <strong>Created:</strong><span>${new Date(session.createdAt || Date.now()).toLocaleString('th-TH')}</span>
            <strong>Updated:</strong><span>${new Date(session.updatedAt || Date.now()).toLocaleString('th-TH')}</span>
            <strong>Folder:</strong><span>${escapeHtml(folder?.name || 'Main list')}</span>
            <strong>Context Mode:</strong><span>${escapeHtml(contextLabel)}</span>
            <strong>Linked Entity:</strong><span>${escapeHtml(entity ? `${entity.type}:${entity.name}` : 'None')}</span>
            <strong>Active Entity:</strong><span>${escapeHtml(activeEntity ? `${activeEntity.type}:${activeEntity.name}` : 'None')}</span>
            <strong>Staged Entity:</strong><span>${escapeHtml(stagedEntity ? `${stagedEntity.type}:${stagedEntity.name} (pending confirm)` : 'None')}</span>
            <strong>Messages:</strong><span>${messageCount.toLocaleString()}</span>
            <strong>Approx History Tokens:</strong><span>~${approxHistoryTokens.toLocaleString()}</span>
            <strong>Usage Prompt Tokens:</strong><span>${usageTotals.prompt.toLocaleString()}</span>
            <strong>Usage Completion Tokens:</strong><span>${usageTotals.completion.toLocaleString()}</span>
        </div>
        <h4>Agent / Group Detail</h4>
        <pre>${escapeHtml(
            entity?.type === 'agent'
                ? `Agent: ${entity.name}\nModel: ${linkedAgent?.model || 'N/A'}\nActive Memories: ${memoryList.length ? memoryList.join(', ') : 'None'}`
                : entity?.type === 'group'
                    ? `Group: ${entity.name}\nModerator: ${linkedGroup?.moderatorAgent || 'N/A'}\nMembers: ${groupMembers.length ? groupMembers.join(', ') : 'None'}`
                    : 'No linked entity'
        )}</pre>
        <h4>RAG Detail</h4>
        <pre>${escapeHtml(
            [
                `RAG Source: ${sessionRag.scopeSource === 'folder' ? 'folder' : 'session'}`,
                `Scope: ${effectiveRag.scopeMode === 'selected' ? 'selected' : 'all'}`,
                `Top-K: ${Number(effectiveRag.retrievalTopK || 0)}`,
                `Token Budget: ${Number(effectiveRag.maxContextTokens || 0)}`,
                `Selected Docs: ${selectedFiles.length}`,
                selectedFiles.length
                    ? `Selected Names: ${selectedFiles.map(file => file.name).join(', ')}`
                    : 'Selected Names: None',
                `Indexed Files in Project: ${indexedFiles.length}/${knowledgeFiles.length}`,
                `Total Indexed Chunks: ${totalChunks}`,
                folder?.contextPolicy
                    ? `Folder Shared Context: ${folder.contextPolicy.autoSharedContext === false ? 'Disabled' : 'Enabled'} | Budget ${folder.contextPolicy.sharedContextBudgetTokens} tokens, max ${folder.contextPolicy.maxSharedSessions} sessions`
                    : 'Folder Shared Context Budget: N/A',
                folder?.ragSettings
                    ? `Folder Auto RAG: ${folder.ragSettings.autoRetrieve === false ? 'Disabled' : 'Enabled'}`
                    : 'Folder Auto RAG: N/A'
            ].join('\n')
        )}</pre>
    `;
}

function hideSessionInfoModal() {
    const modal = document.getElementById('session-info-modal');
    if (modal) modal.style.display = 'none';
}

function hideFolderSettingsModal() {
    const modal = document.getElementById('folder-settings-modal');
    if (modal) modal.style.display = 'none';
}

function renderFolderSettingsFileSelection(project, ragSettings) {
    const list = document.getElementById('folder-settings-file-list');
    if (!list) return;

    const files = Array.isArray(project?.knowledgeFiles) ? project.knowledgeFiles : [];
    const selectedSet = new Set(Array.isArray(ragSettings?.selectedFileIds) ? ragSettings.selectedFileIds : []);
    list.innerHTML = '';

    if (files.length === 0) {
        list.innerHTML = '<p class="no-items-message">No knowledge files uploaded yet.</p>';
        return;
    }

    files.forEach(file => {
        const item = document.createElement('label');
        item.className = 'folder-settings-file-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.fileId = file.id;
        checkbox.checked = selectedSet.has(file.id);

        const name = document.createElement('span');
        const chunkCount = Number(file.chunkCount) || 0;
        name.textContent = `${file.name} (${chunkCount} chunk${chunkCount === 1 ? '' : 's'})`;

        item.appendChild(checkbox);
        item.appendChild(name);
        list.appendChild(item);
    });
}

function applyFolderSettingsModalState() {
    const autoSharedInput = document.getElementById('folder-settings-auto-shared-context');
    const autoRagInput = document.getElementById('folder-settings-auto-rag');
    const sharedBudgetInput = document.getElementById('folder-settings-shared-budget');
    const maxSessionsInput = document.getElementById('folder-settings-max-sessions');
    const ragScopeInput = document.getElementById('folder-settings-rag-scope');
    const ragTopKInput = document.getElementById('folder-settings-rag-topk');
    const ragBudgetInput = document.getElementById('folder-settings-rag-budget');
    const fileList = document.getElementById('folder-settings-file-list');

    if (!autoSharedInput || !autoRagInput) return;

    const sharedEnabled = Boolean(autoSharedInput.checked);
    const ragEnabled = Boolean(autoRagInput.checked);
    const selectedScope = ragScopeInput?.value || 'all';
    const allowFileSelection = ragEnabled && selectedScope === 'selected';

    [sharedBudgetInput, maxSessionsInput].forEach(input => {
        if (input) input.disabled = !sharedEnabled;
    });

    [ragScopeInput, ragTopKInput, ragBudgetInput].forEach(input => {
        if (input) input.disabled = !ragEnabled;
    });

    if (fileList) {
        fileList.classList.toggle('is-disabled', !allowFileSelection);
    }
}

export function openFolderSettingsModal({ folderId } = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const folder = getFolderById(project, folderId);
    if (!folder) {
        showCustomAlert('Folder not found.', 'Folder Settings');
        return;
    }

    const policy = normalizeFolderContextPolicy(folder.contextPolicy);
    const rag = normalizeFolderRagSettings(folder.ragSettings);

    const modal = document.getElementById('folder-settings-modal');
    const folderIdInput = document.getElementById('folder-settings-id');
    const folderNameInput = document.getElementById('folder-settings-name');
    const autoSharedInput = document.getElementById('folder-settings-auto-shared-context');
    const sharedBudgetInput = document.getElementById('folder-settings-shared-budget');
    const maxSessionsInput = document.getElementById('folder-settings-max-sessions');
    const autoRagInput = document.getElementById('folder-settings-auto-rag');
    const ragScopeInput = document.getElementById('folder-settings-rag-scope');
    const ragTopKInput = document.getElementById('folder-settings-rag-topk');
    const ragBudgetInput = document.getElementById('folder-settings-rag-budget');

    if (!modal || !folderIdInput || !folderNameInput || !autoSharedInput || !sharedBudgetInput || !maxSessionsInput || !autoRagInput || !ragScopeInput || !ragTopKInput || !ragBudgetInput) {
        return;
    }

    folderIdInput.value = folder.id;
    folderNameInput.value = folder.name || '';
    autoSharedInput.checked = policy.autoSharedContext !== false;
    sharedBudgetInput.value = String(policy.sharedContextBudgetTokens);
    maxSessionsInput.value = String(policy.maxSharedSessions);
    autoRagInput.checked = rag.autoRetrieve !== false;
    ragScopeInput.value = rag.scopeMode;
    ragTopKInput.value = String(rag.retrievalTopK);
    ragBudgetInput.value = String(rag.maxContextTokens);
    renderFolderSettingsFileSelection(project, rag);
    applyFolderSettingsModalState();

    modal.style.display = 'flex';
}

function saveFolderSettingsFromModal() {
    const folderId = document.getElementById('folder-settings-id')?.value || '';
    if (!folderId) return;

    const name = document.getElementById('folder-settings-name')?.value?.trim() || '';
    const autoSharedContext = Boolean(document.getElementById('folder-settings-auto-shared-context')?.checked);
    const sharedBudgetRaw = Number(document.getElementById('folder-settings-shared-budget')?.value);
    const maxSessionsRaw = Number(document.getElementById('folder-settings-max-sessions')?.value);
    const autoRag = Boolean(document.getElementById('folder-settings-auto-rag')?.checked);
    const ragScope = document.getElementById('folder-settings-rag-scope')?.value || 'all';
    const ragTopKRaw = Number(document.getElementById('folder-settings-rag-topk')?.value);
    const ragBudgetRaw = Number(document.getElementById('folder-settings-rag-budget')?.value);

    const contextPolicy = {
        autoSharedContext
    };
    if (Number.isFinite(sharedBudgetRaw)) {
        contextPolicy.sharedContextBudgetTokens = sharedBudgetRaw;
    }
    if (Number.isFinite(maxSessionsRaw)) {
        contextPolicy.maxSharedSessions = maxSessionsRaw;
    }

    const ragSettings = {
        autoRetrieve: autoRag,
        scopeMode: ragScope === 'selected' ? 'selected' : 'all'
    };
    if (Number.isFinite(ragTopKRaw)) {
        ragSettings.retrievalTopK = ragTopKRaw;
    }
    if (Number.isFinite(ragBudgetRaw)) {
        ragSettings.maxContextTokens = ragBudgetRaw;
    }
    ragSettings.selectedFileIds = Array.from(
        document.querySelectorAll('#folder-settings-file-list input[type="checkbox"][data-file-id]:checked')
    ).map(input => input.dataset.fileId).filter(Boolean);

    stateManager.bus.publish('folder:updateSettings', {
        folderId,
        name,
        contextPolicy,
        ragSettings
    });

    hideFolderSettingsModal();
}

function hideFolderNameModal() {
    const modal = document.getElementById('folder-name-modal');
    if (modal) modal.style.display = 'none';
}

function openFolderNameModal({ mode = 'create', folderId = '', defaultName = '' } = {}) {
    const modal = document.getElementById('folder-name-modal');
    const modeInput = document.getElementById('folder-name-mode');
    const folderIdInput = document.getElementById('folder-name-folder-id');
    const title = document.getElementById('folder-name-modal-title');
    const nameInput = document.getElementById('folder-name-input');
    if (!modal || !modeInput || !folderIdInput || !title || !nameInput) return;

    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    modeInput.value = mode === 'rename' ? 'rename' : 'create';
    folderIdInput.value = folderId || '';
    title.textContent = mode === 'rename' ? 'Rename Folder' : 'Create Folder';
    nameInput.value = defaultName || (mode === 'rename' ? '' : 'New Folder');
    modal.style.display = 'flex';
    requestAnimationFrame(() => nameInput.focus());
}

function saveFolderNameModal() {
    const mode = document.getElementById('folder-name-mode')?.value || 'create';
    const folderId = document.getElementById('folder-name-folder-id')?.value || '';
    const name = document.getElementById('folder-name-input')?.value?.trim() || '';
    if (!name) return;

    if (mode === 'rename') {
        stateManager.bus.publish('folder:rename', { folderId, name });
    } else {
        stateManager.bus.publish('folder:new', { askName: false, name });
    }
    hideFolderNameModal();
}

function hideSessionMoveModal() {
    const modal = document.getElementById('session-move-modal');
    if (modal) modal.style.display = 'none';
}

function openSessionMoveModal({ sessionId } = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = (project.chatSessions || []).find(item => item.id === sessionId);
    if (!session) return;

    const modal = document.getElementById('session-move-modal');
    const idInput = document.getElementById('session-move-session-id');
    const select = document.getElementById('session-move-folder-select');
    const title = document.getElementById('session-move-modal-title');
    if (!modal || !idInput || !select || !title) return;

    idInput.value = session.id;
    title.textContent = `Move "${session.name || 'Untitled'}"`;
    select.innerHTML = '<option value="">Main list (no folder)</option>';
    (project.chatFolders || []).forEach(folder => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        select.appendChild(option);
    });
    select.value = session.folderId || '';
    const createInput = document.getElementById('session-move-new-folder-name');
    if (createInput) createInput.value = '';
    modal.style.display = 'flex';
}

function saveSessionMoveModal() {
    const sessionId = document.getElementById('session-move-session-id')?.value || '';
    const folderId = document.getElementById('session-move-folder-select')?.value || null;
    if (!sessionId) return;
    stateManager.bus.publish('session:move', { sessionId, folderId });
    hideSessionMoveModal();
}

function hideSessionContextModeModal() {
    const modal = document.getElementById('session-context-mode-modal');
    if (modal) modal.style.display = 'none';
}

function openSessionContextModeModal({ sessionId } = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = (project.chatSessions || []).find(item => item.id === sessionId);
    if (!session) return;

    const modal = document.getElementById('session-context-mode-modal');
    const idInput = document.getElementById('session-context-mode-session-id');
    const select = document.getElementById('session-context-mode-select');
    const title = document.getElementById('session-context-mode-title');
    if (!modal || !idInput || !select || !title) return;

    idInput.value = session.id;
    title.textContent = `Context Mode for "${session.name || 'Untitled'}"`;
    select.value = normalizeSessionContextMode(session.contextMode);
    if (!session.folderId && select.value === 'folder_aware') {
        select.value = 'session_only';
    }
    modal.style.display = 'flex';
}

function saveSessionContextModeModal() {
    const sessionId = document.getElementById('session-context-mode-session-id')?.value || '';
    const mode = document.getElementById('session-context-mode-select')?.value || 'folder_aware';
    if (!sessionId) return;
    if (mode === 'folder_aware') {
        const project = stateManager.getProject();
        const session = (project?.chatSessions || []).find(item => item.id === sessionId);
        if (!session?.folderId) {
            showCustomAlert('This session is not in a folder yet. Move it into a folder first.', 'Context Mode');
            return;
        }
    }
    stateManager.bus.publish('session:contextMode', { sessionId, mode });
    hideSessionContextModeModal();
}

function clearDropTargetState(resetFolderTimer = true, clearDragging = true) {
    document.querySelectorAll('[data-session-drop-target].is-drop-target')
        .forEach(el => el.classList.remove('is-drop-target'));
    document.querySelectorAll('.session-item.is-drop-before, .session-item.is-drop-after')
        .forEach(el => {
            el.classList.remove('is-drop-before');
            el.classList.remove('is-drop-after');
        });
    if (clearDragging) {
        document.querySelectorAll('.session-item.is-dragging')
            .forEach(el => el.classList.remove('is-dragging'));
    }
    if (resetFolderTimer) {
        if (folderExpandHoverTimer) {
            clearTimeout(folderExpandHoverTimer);
            folderExpandHoverTimer = null;
        }
        pendingFolderExpandId = null;
    }
}

function getDropIntentFromEvent(event) {
    const project = stateManager.getProject();
    if (!project || !draggedSessionId) return null;

    const targetSessionItem = event.target.closest('.session-item[data-session-id]');
    if (targetSessionItem && targetSessionItem.dataset.sessionId !== draggedSessionId) {
        const targetSession = (project.chatSessions || []).find(item => item.id === targetSessionItem.dataset.sessionId);
        if (!targetSession || targetSession.archived) return null;

        const rect = targetSessionItem.getBoundingClientRect();
        const position = event.clientY < (rect.top + rect.height / 2) ? 'before' : 'after';
        return {
            folderId: targetSession.folderId || null,
            targetSessionId: targetSession.id,
            position,
            dropElement: targetSessionItem
        };
    }

    const folderList = event.target.closest('.folder-session-list[data-folder-id]');
    if (folderList) {
        return {
            folderId: folderList.dataset.folderId || null,
            targetSessionId: null,
            position: 'after',
            dropElement: folderList
        };
    }

    const folderItem = event.target.closest('.session-folder[data-folder-id]');
    if (folderItem) {
        return {
            folderId: folderItem.dataset.folderId || null,
            targetSessionId: null,
            position: 'after',
            dropElement: folderItem.querySelector('.folder-session-list') || folderItem
        };
    }

    const rootList = event.target.closest('#sessionListContainer[data-session-drop-target="root"]');
    if (rootList) {
        return {
            folderId: null,
            targetSessionId: null,
            position: 'after',
            dropElement: rootList
        };
    }

    return null;
}

export function renderSessionList() {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);
    closeSessionDropdownPortal();

    const pinnedList = document.getElementById('pinnedSessionList');
    const regularList = document.getElementById('sessionListContainer');
    const archivedList = document.getElementById('archivedSessionList');
    const archivedSection = document.getElementById('archivedSessionsSection');

    if (!pinnedList || !regularList || !archivedList || !archivedSection) {
        return;
    }

    pinnedList.innerHTML = '';
    regularList.innerHTML = '';
    archivedList.innerHTML = '';

    regularList.dataset.sessionDropTarget = 'root';
    regularList.dataset.folderId = '';

    const preferences = SessionHandlers.getSessionListPreferences(project);
    const sessions = Array.isArray(project.chatSessions) ? project.chatSessions : [];
    const activeSessionsAll = sessions.filter(session => !session.archived);
    const archivedSessionsAll = sessions.filter(session => session.archived);
    const activeSessions = filterSessionsByShowMode(activeSessionsAll, project, preferences.showMode);
    const archivedSessions = filterSessionsByShowMode(archivedSessionsAll, project, preferences.showMode);

    if (preferences.organizeBy === SESSION_LIST_ORGANIZE_CHRONOLOGICAL) {
        const sortedChronological = sortSessionsForList(activeSessions, preferences.sortBy);
        const pinnedChronological = sortedChronological.filter(session => (session.pinned || session.isPinned) && !session.folderId);
        const regularChronological = sortedChronological.filter(session => !(session.pinned || session.isPinned) || session.folderId);

        pinnedChronological.forEach(session => {
            pinnedList.appendChild(createSessionElement(session, project));
        });
        regularChronological.forEach(session => {
            regularList.appendChild(createSessionElement(session, project));
        });
    } else {
        const pinnedSessions = sortSessionsForList(
            activeSessions.filter(session => (session.pinned || session.isPinned) && !session.folderId),
            preferences.sortBy
        );
        const regularRootSessions = sortSessionsForList(
            activeSessions.filter(session => !(session.pinned || session.isPinned) && !session.folderId),
            preferences.sortBy
        );

        pinnedSessions.forEach(session => {
            pinnedList.appendChild(createSessionElement(session, project));
        });

        const folderList = Array.isArray(project.chatFolders) ? project.chatFolders : [];
        const activeSession = (project.chatSessions || []).find(item => item.id === project.activeSessionId) || null;
        const relevantFolderId = activeSession?.folderId || null;
        const foldersToRender = preferences.showMode === SESSION_LIST_SHOW_RELEVANT
            ? folderList.filter(folder => folder.id === relevantFolderId)
            : folderList;

        foldersToRender.forEach(folder => {
            const folderSessions = sortSessionsForList(
                activeSessions.filter(session => session.folderId === folder.id),
                preferences.sortBy
            );
            if (preferences.showMode !== SESSION_LIST_SHOW_RELEVANT || folderSessions.length > 0) {
                regularList.appendChild(createFolderElement(folder, folderSessions, project));
            }
        });

        regularRootSessions.forEach(session => {
            regularList.appendChild(createSessionElement(session, project));
        });
    }

    if (regularList.children.length === 0) {
        regularList.innerHTML = preferences.showMode === SESSION_LIST_SHOW_RELEVANT
            ? '<p class="no-items-message">No relevant sessions for this chat.</p>'
            : '<p class="no-items-message">No sessions yet. Create your first chat.</p>';
    }

    archivedSessions
        .sort((a, b) => getSessionSortTimestamp(b, preferences.sortBy) - getSessionSortTimestamp(a, preferences.sortBy))
        .forEach(session => archivedList.appendChild(createSessionElement(session, project)));

    archivedSection.classList.toggle('hidden', archivedSessions.length === 0);
    updateSessionOrganizeMenuState(project);
    updateActiveSessionUI(project.activeSessionId);

    requestAnimationFrame(refreshFolderAnimationHeights);
}

export function openSessionInfoModal({ sessionId } = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const targetSessionId = sessionId || project.activeSessionId;
    const session = project.chatSessions?.find(item => item.id === targetSessionId);
    if (!session) return;

    const modal = document.getElementById('session-info-modal');
    const content = document.getElementById('session-info-content');
    if (!modal || !content) return;

    content.innerHTML = renderSessionInfo(session, project);
    modal.style.display = 'flex';
}

function handleSessionAction(action, sessionId, event) {
    if (action === 'move') {
        openSessionMoveModal({ sessionId });
        return;
    }
    if (action === 'context-mode') {
        openSessionContextModeModal({ sessionId });
        return;
    }
    stateManager.bus.publish(`session:${action}`, { sessionId, event });
}

function handleFolderAction(action, folderId) {
    if (action === 'folder:new-chat') {
        stateManager.bus.publish('folder:newChat', { folderId });
        return;
    }
    if (action === 'folder:rename') {
        const project = stateManager.getProject();
        if (!project) return;
        ensureProjectFolders(project);
        const folder = getFolderById(project, folderId);
        openFolderNameModal({
            mode: 'rename',
            folderId,
            defaultName: folder?.name || ''
        });
        return;
    }
    if (action === 'folder:settings') {
        stateManager.bus.publish('folder:settings', { folderId });
        return;
    }
    if (action === 'folder:delete') {
        stateManager.bus.publish('folder:delete', { folderId });
    }
}

function handleSessionOrganizeAction(actionLink) {
    if (!actionLink || actionLink.dataset.action !== 'session:organizeSet') return false;

    const payload = {};
    if (actionLink.dataset.organizeBy) payload.organizeBy = actionLink.dataset.organizeBy;
    if (actionLink.dataset.sortBy) payload.sortBy = actionLink.dataset.sortBy;
    if (actionLink.dataset.showMode) payload.showMode = actionLink.dataset.showMode;

    stateManager.bus.publish('session:organizeSet', payload);
    return true;
}

export function initSessionUI() {
    if (isSessionUIInitialized) {
        return;
    }
    isSessionUIInitialized = true;

    stateManager.bus.subscribe('project:loaded', renderSessionList);
    stateManager.bus.subscribe('session:listChanged', renderSessionList);
    stateManager.bus.subscribe('session:loaded', () => updateActiveSessionUI(stateManager.getProject()?.activeSessionId));
    stateManager.bus.subscribe('folder:settings', openFolderSettingsModal);

    const sessionsPanel = document.querySelector('.sessions-panel');
    if (sessionsPanel) {
        sessionsPanel.addEventListener('click', (e) => {
            const target = e.target;

            const actionLink = target.closest('.dropdown-content a[data-action]');
            if (actionLink) {
                e.preventDefault();
                e.stopPropagation();

                const action = actionLink.dataset.action;
                const sessionItem = actionLink.closest('.session-item[data-session-id]');
                const folderItem = actionLink.closest('.session-folder[data-folder-id]');
                const newSessionMenu = actionLink.closest('#new-session-menu');
                const sessionOrganizeMenu = actionLink.closest('#session-organize-menu');

                if (sessionItem) {
                    handleSessionAction(action, sessionItem.dataset.sessionId, e);
                } else if (folderItem) {
                    handleFolderAction(action, folderItem.dataset.folderId);
                } else if (newSessionMenu) {
                    if (action === 'new-chat') {
                        stateManager.bus.publish('session:new');
                    } else if (action === 'new-folder') {
                        openFolderNameModal({ mode: 'create' });
                    }
                } else if (sessionOrganizeMenu) {
                    handleSessionOrganizeAction(actionLink);
                }

                actionLink.closest('.dropdown.open')?.classList.remove('open', 'portal-open');
                updateFolderOpenMenuLayers();
                return;
            }

            const toggleButton = target.closest('button[data-action="toggle-menu"]');
            if (toggleButton) {
                e.preventDefault();
                e.stopPropagation();
                toggleSessionDropdownPortal(toggleButton);
                return;
            }

            if (target.closest('#new-chat-btn') && !target.closest('#new-session-menu')) {
                stateManager.bus.publish('session:new');
                return;
            }

            if (target.closest('#session-list-locate-trigger')) {
                e.preventDefault();
                revealActiveSessionInList();
                return;
            }

            const folderSummary = target.closest('.session-folder-summary');
            if (folderSummary) {
                const folderItem = folderSummary.closest('.session-folder[data-folder-id]');
                if (folderItem?.dataset.folderId) {
                    e.preventDefault();
                    stateManager.bus.publish('folder:activate', { folderId: folderItem.dataset.folderId });
                    animateSessionFolderToggle(folderItem, !folderItem.open);
                }
            }

            const sessionItemToLoad = target.closest('.session-item[data-session-id]');
            if (sessionItemToLoad) {
                const sessionId = sessionItemToLoad.dataset.sessionId;
                if (stateManager.getProject().activeSessionId !== sessionId) {
                    SessionHandlers.loadChatSession(sessionId);
                }
            }
        });

        sessionsPanel.addEventListener('dragstart', (event) => {
            const sessionItem = event.target.closest('.session-item[data-session-id]');
            if (!sessionItem) return;
            draggedSessionId = sessionItem.dataset.sessionId;
            sessionItem.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedSessionId);
        });

        sessionsPanel.addEventListener('dragend', () => {
            draggedSessionId = null;
            clearDropTargetState();
        });

        sessionsPanel.addEventListener('dragover', (event) => {
            const dropIntent = getDropIntentFromEvent(event);
            if (!draggedSessionId || !dropIntent) return;
            event.preventDefault();
            clearDropTargetState(false, false);
            if (dropIntent.targetSessionId && dropIntent.dropElement?.classList.contains('session-item')) {
                dropIntent.dropElement.classList.add(dropIntent.position === 'before' ? 'is-drop-before' : 'is-drop-after');
            } else {
                dropIntent.dropElement?.classList.add('is-drop-target');
            }
            updateFolderExpandTimer(event.target);
            event.dataTransfer.dropEffect = 'move';
        });

        sessionsPanel.addEventListener('drop', (event) => {
            const dropIntent = getDropIntentFromEvent(event);
            if (!draggedSessionId || !dropIntent) return;

            event.preventDefault();
            stateManager.bus.publish('session:move', {
                sessionId: draggedSessionId,
                folderId: dropIntent.folderId,
                targetSessionId: dropIntent.targetSessionId,
                position: dropIntent.position
            });
            draggedSessionId = null;
            clearDropTargetState();
        });

        sessionsPanel.addEventListener('toggle', (event) => {
            const folderItem = event.target.closest('.session-folder[data-folder-id]');
            if (!folderItem || event.target !== folderItem) return;
            if (suppressFolderCollapsePersistence || folderItem.dataset.folderAnimating === '1') return;
            stateManager.bus.publish('folder:collapse', {
                folderId: folderItem.dataset.folderId,
                collapsed: !folderItem.open
            });
        }, true);
    }

    document.addEventListener('click', (event) => {
        const portalAction = event.target.closest('.dropdown-content-portal a[data-action]');
        if (portalAction) {
            event.preventDefault();
            event.stopPropagation();

            const portal = portalAction.closest('.dropdown-content-portal');
            const action = portalAction.dataset.action;
            const sessionId = portal?.dataset.sessionId || '';
            const folderId = portal?.dataset.folderId || '';
            const menuType = portal?.dataset.menuType || '';

            if (sessionId) {
                handleSessionAction(action, sessionId, event);
            } else if (folderId) {
                handleFolderAction(action, folderId);
            } else if (menuType === 'new-session') {
                if (action === 'new-chat') {
                    stateManager.bus.publish('session:new');
                } else if (action === 'new-folder') {
                    openFolderNameModal({ mode: 'create' });
                }
            } else if (menuType === 'session-organize') {
                handleSessionOrganizeAction(portalAction);
            }
            closeSessionDropdownPortal();
            return;
        }

        if (
            activeDropdownPortal &&
            !activeDropdownPortal.portal.contains(event.target) &&
            !activeDropdownPortal.button.contains(event.target)
        ) {
            closeSessionDropdownPortal();
        }

        requestAnimationFrame(updateFolderOpenMenuLayers);
    });

    document.addEventListener('scroll', () => {
        if (activeDropdownPortal) {
            closeSessionDropdownPortal();
        }
    }, true);

    window.addEventListener('resize', () => {
        if (activeDropdownPortal) {
            positionSessionDropdownPortal();
        }
        refreshFolderAnimationHeights();
    });

    const sessionInfoModal = document.getElementById('session-info-modal');
    sessionInfoModal?.addEventListener('click', (e) => {
        if (e.target === sessionInfoModal || e.target.closest('.modal-close-btn')) {
            hideSessionInfoModal();
        }
    });

    const folderSettingsModal = document.getElementById('folder-settings-modal');
    folderSettingsModal?.addEventListener('click', (e) => {
        const target = e.target;
        if (target === folderSettingsModal || target.closest('.modal-close-btn')) {
            hideFolderSettingsModal();
            return;
        }
        if (target.closest('#folder-settings-save-btn')) {
            saveFolderSettingsFromModal();
        }
    });
    folderSettingsModal?.addEventListener('change', (e) => {
        const target = e.target;
        if (
            target?.id === 'folder-settings-auto-shared-context' ||
            target?.id === 'folder-settings-auto-rag' ||
            target?.id === 'folder-settings-rag-scope'
        ) {
            applyFolderSettingsModalState();
        }
    });

    const folderNameModal = document.getElementById('folder-name-modal');
    folderNameModal?.addEventListener('click', (e) => {
        const target = e.target;
        if (target === folderNameModal || target.closest('.modal-close-btn')) {
            hideFolderNameModal();
            return;
        }
        if (target.closest('#folder-name-save-btn')) {
            saveFolderNameModal();
        }
    });

    const sessionMoveModal = document.getElementById('session-move-modal');
    sessionMoveModal?.addEventListener('click', (e) => {
        const target = e.target;
        if (target === sessionMoveModal || target.closest('.modal-close-btn')) {
            hideSessionMoveModal();
            return;
        }
        if (target.closest('#session-move-save-btn')) {
            saveSessionMoveModal();
            return;
        }
        if (target.closest('#session-move-create-folder-btn')) {
            const rawName = document.getElementById('session-move-new-folder-name')?.value || '';
            const name = rawName.trim();
            if (!name) {
                showCustomAlert('Please enter a folder name before creating.', 'Move Session');
                return;
            }
            const folder = SessionHandlers.createSessionFolder({ askName: false, name });
            if (folder?.id) {
                const select = document.getElementById('session-move-folder-select');
                if (select) {
                    const option = document.createElement('option');
                    option.value = folder.id;
                    option.textContent = folder.name;
                    select.insertBefore(option, select.children[1] || null);
                    select.value = folder.id;
                }
                const nameInput = document.getElementById('session-move-new-folder-name');
                if (nameInput) nameInput.value = '';
            }
        }
    });

    const sessionContextModeModal = document.getElementById('session-context-mode-modal');
    sessionContextModeModal?.addEventListener('click', (e) => {
        const target = e.target;
        if (target === sessionContextModeModal || target.closest('.modal-close-btn')) {
            hideSessionContextModeModal();
            return;
        }
        if (target.closest('#session-context-mode-save-btn')) {
            saveSessionContextModeModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeDropdownPortal) {
            closeSessionDropdownPortal();
            return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.target?.id === 'session-list-locate-trigger') {
            event.preventDefault();
            revealActiveSessionInList();
        }
    });

    document.getElementById('locate-active-session-btn')?.addEventListener('click', (event) => {
        event.preventDefault();
        revealActiveSessionInList();
    });

    document.getElementById('chat-title')?.addEventListener('click', (event) => {
        event.preventDefault();
        revealActiveSessionInList();
    });

    console.log('✅ Session UI initialized with folder support.');
}
