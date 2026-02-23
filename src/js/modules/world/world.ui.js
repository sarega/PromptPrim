// ===============================================
// FILE: src/js/modules/world/world.ui.js
// DESCRIPTION: Minimal Studio UI sections for Books and Worlds (MVP).
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { createDropdown, showCustomAlert, toggleDropdown } from '../../core/core.ui.js';
import * as SessionHandlers from '../session/session.handlers.js';
import {
    CHAPTER_WRITING_MODE_AUTHOR,
    CHAPTER_WRITING_MODE_WRITING,
    ensureProjectBooks,
    ensureProjectWorldBookOwnership,
    ensureProjectWorlds,
    isWorldItemVisibleForChapter,
    SESSION_KIND_BOOK_AGENT
} from './world.schema-utils.js';
import { buildWorldStructuredContextPack } from './world.retrieval.js';

function ensureWorldStudioState(project) {
    if (!project) return;
    ensureProjectWorlds(project);
    ensureProjectBooks(project);
    ensureProjectWorldBookOwnership(project);
    ensureProjectWorldBookTreeUIState(project);
    ensureProjectWorldBookChangesUIState(project);
    syncBookTreeCollapseStateFromProject(project);
}

const worldInlineUIState = {
    editingBookId: null,
    editingWorldItemId: null,
    editingChapterMetaSessionId: null,
    creatingBook: false,
    creatingWorld: false,
    creatingWorldItem: null
};

const bookSidebarUIState = {
    modal: null, // { type: 'book-create' | 'book-settings' | 'act-settings' | 'chapter-settings' | 'chapter-move-act', ... }
    collapsedBookIds: new Set(),
    collapsedActKeys: new Set()
};

const bookWorkspaceUIState = {
    activeBookId: null,
    tabByBookId: new Map(), // bookId -> overview|agent|composer|world|changes|settings
    composerDocByBookId: new Map() // bookId -> treatment|synopsis|outline|sceneBeats
};

const chapterOverviewSummaryUIState = {
    activeSessionIds: new Set(),
    batchByBookId: new Map() // bookId -> { source, startedAt, total }
};

const bookTreeDndState = {
    draggingSessionId: null,
    draggingBookId: null,
    justDroppedAt: 0
};

function normalizeUniqueStringList(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const result = [];
    values.forEach((value) => {
        const normalized = String(value ?? '').trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
}

function ensureProjectWorldBookTreeUIState(project) {
    if (!project || typeof project !== 'object') return null;
    if (!project.worldUiState || typeof project.worldUiState !== 'object') {
        project.worldUiState = {};
    }
    if (!project.worldUiState.bookTree || typeof project.worldUiState.bookTree !== 'object') {
        project.worldUiState.bookTree = {};
    }
    const tree = project.worldUiState.bookTree;
    tree.collapsedBookIds = normalizeUniqueStringList(tree.collapsedBookIds);
    tree.collapsedActKeys = normalizeUniqueStringList(tree.collapsedActKeys);
    return tree;
}

function ensureProjectWorldBookChangesUIState(project) {
    if (!project || typeof project !== 'object') return null;
    if (!project.worldUiState || typeof project.worldUiState !== 'object') {
        project.worldUiState = {};
    }
    if (!project.worldUiState.bookChanges || typeof project.worldUiState.bookChanges !== 'object') {
        project.worldUiState.bookChanges = {};
    }
    const changesUI = project.worldUiState.bookChanges;
    if (!changesUI.lastViewedAtByBookId || typeof changesUI.lastViewedAtByBookId !== 'object' || Array.isArray(changesUI.lastViewedAtByBookId)) {
        changesUI.lastViewedAtByBookId = {};
    }
    Object.keys(changesUI.lastViewedAtByBookId).forEach((bookId) => {
        const raw = Number(changesUI.lastViewedAtByBookId[bookId]);
        if (Number.isFinite(raw) && raw > 0) {
            changesUI.lastViewedAtByBookId[bookId] = Math.round(raw);
        } else {
            delete changesUI.lastViewedAtByBookId[bookId];
        }
    });
    return changesUI;
}

function getBookChangesLastViewedAt(project, bookId) {
    if (!project || !bookId) return 0;
    const changesUI = ensureProjectWorldBookChangesUIState(project);
    const raw = Number(changesUI?.lastViewedAtByBookId?.[bookId]);
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
}

function markBookChangesViewed(project, bookId) {
    if (!project || !bookId) return false;
    const changesUI = ensureProjectWorldBookChangesUIState(project);
    if (!changesUI) return false;
    changesUI.lastViewedAtByBookId[bookId] = Date.now();
    stateManager.setProject(project);
    stateManager.setAutoSaveDirty(true);
    stateManager.bus.publish('world:dataChanged', { bookId, reason: 'bookChanges:viewed' });
    return true;
}

function formatBookAgentScanSourceLabel(sourceKind) {
    const normalized = String(sourceKind || '').trim().toLowerCase();
    if (normalized === 'both') return 'Chat + Composer';
    if (normalized === 'composer') return 'Composer';
    if (normalized === 'chat') return 'Chat';
    return '—';
}

function formatBookAgentScanModeLabel(scanMode) {
    const normalized = String(scanMode || '').trim().toLowerCase();
    if (normalized === 'delta') return 'Auto (Delta)';
    if (normalized === 'manual') return 'Manual';
    return '—';
}

function formatAbsoluteTimestamp(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return 'Unknown time';
    try {
        return new Date(value).toLocaleString();
    } catch (_error) {
        return 'Unknown time';
    }
}

function syncBookTreeCollapseStateFromProject(project) {
    const tree = ensureProjectWorldBookTreeUIState(project);
    if (!tree) {
        bookSidebarUIState.collapsedBookIds.clear();
        bookSidebarUIState.collapsedActKeys.clear();
        return;
    }
    bookSidebarUIState.collapsedBookIds = new Set(tree.collapsedBookIds);
    bookSidebarUIState.collapsedActKeys = new Set(tree.collapsedActKeys);
}

function persistBookTreeCollapseStateToProject(project) {
    if (!project) return;
    const tree = ensureProjectWorldBookTreeUIState(project);
    if (!tree) return;
    tree.collapsedBookIds = Array.from(bookSidebarUIState.collapsedBookIds).sort();
    tree.collapsedActKeys = Array.from(bookSidebarUIState.collapsedActKeys).sort();
    stateManager.setProject(project);
    stateManager.setAutoSaveDirty(true);
}

function clearInlineEditors() {
    worldInlineUIState.editingBookId = null;
    worldInlineUIState.editingWorldItemId = null;
    worldInlineUIState.editingChapterMetaSessionId = null;
    worldInlineUIState.creatingBook = false;
    worldInlineUIState.creatingWorld = false;
    worldInlineUIState.creatingWorldItem = null;
    bookSidebarUIState.modal = null;
    bookSidebarUIState.collapsedBookIds.clear();
    bookSidebarUIState.collapsedActKeys.clear();
    bookWorkspaceUIState.activeBookId = null;
    bookWorkspaceUIState.tabByBookId.clear();
    bookWorkspaceUIState.composerDocByBookId.clear();
    chapterOverviewSummaryUIState.activeSessionIds.clear();
    chapterOverviewSummaryUIState.batchByBookId.clear();
}

function handleChapterOverviewSummaryProgressEvent(payload = {}) {
    const sessionId = String(payload.sessionId || '').trim();
    if (!sessionId) return;
    const state = String(payload.state || '').trim().toLowerCase();
    if (state === 'start') {
        chapterOverviewSummaryUIState.activeSessionIds.add(sessionId);
    } else {
        chapterOverviewSummaryUIState.activeSessionIds.delete(sessionId);
    }
    renderWorldUISurfaces();
}

function handleBookOverviewSummaryBatchProgressEvent(payload = {}) {
    const bookId = String(payload.bookId || '').trim();
    if (!bookId) return;
    const state = String(payload.state || '').trim().toLowerCase();
    if (state === 'start') {
        chapterOverviewSummaryUIState.batchByBookId.set(bookId, {
            source: String(payload.source || 'composer').trim().toLowerCase() === 'chat' ? 'chat' : 'composer',
            startedAt: Date.now(),
            total: Number.isFinite(Number(payload.total)) ? Math.max(0, Math.round(Number(payload.total))) : 0
        });
    } else {
        chapterOverviewSummaryUIState.batchByBookId.delete(bookId);
    }
    renderWorldUISurfaces();
}

function parsePositiveIntOrNull(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.round(parsed);
    return rounded > 0 ? rounded : null;
}

function readInputValue(container, selector, fallback = '') {
    if (!container) return fallback;
    const el = container.querySelector(selector);
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLSelectElement)) {
        return fallback;
    }
    return el.value;
}

function readCheckboxChecked(container, selector, fallback = false) {
    if (!container) return fallback;
    const el = container.querySelector(selector);
    if (!(el instanceof HTMLInputElement) || el.type !== 'checkbox') return fallback;
    return el.checked;
}

function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
    const safeName = String(filename || '').trim() || 'download.txt';
    const blob = new Blob([String(content ?? '')], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function sanitizeExportFilenameBase(value, fallback = 'book-export') {
    const raw = String(value || '').trim();
    const normalized = raw
        .replace(/[^\w\u0E00-\u0E7F\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    return normalized || fallback;
}

function normalizeBookWorkspaceTab(rawTab) {
    const normalized = String(rawTab || '').trim().toLowerCase();
    switch (normalized) {
        case 'agent':
        case 'composer':
        case 'blueprint':
        case 'world':
        case 'codex':
        case 'changes':
        case 'settings':
            if (normalized === 'blueprint') return 'composer';
            if (normalized === 'codex') return 'world';
            return normalized;
        default:
            return 'overview';
    }
}

function normalizeBookComposerDocKey(rawKey) {
    switch (String(rawKey || '').trim()) {
        case 'treatment':
        case 'synopsis':
        case 'outline':
        case 'sceneBeats':
            return String(rawKey).trim();
        default:
            return 'treatment';
    }
}

function getBookWorkspaceActiveTab(bookId) {
    if (!bookId) return 'overview';
    return normalizeBookWorkspaceTab(bookWorkspaceUIState.tabByBookId.get(bookId));
}

function setBookWorkspaceActiveTab(bookId, tab) {
    if (!bookId) return;
    bookWorkspaceUIState.tabByBookId.set(bookId, normalizeBookWorkspaceTab(tab));
}

function getBookComposerActiveDocKey(bookId) {
    if (!bookId) return 'treatment';
    return normalizeBookComposerDocKey(bookWorkspaceUIState.composerDocByBookId.get(bookId));
}

function setBookComposerActiveDocKey(bookId, docKey) {
    if (!bookId) return;
    bookWorkspaceUIState.composerDocByBookId.set(bookId, normalizeBookComposerDocKey(docKey));
}

function ensureBookSidebarSlot() {
    let slot = document.getElementById('book-sidebar-slot');
    if (slot) return slot;

    const sessionsFrame = document.querySelector('#sessions-panel .sessions-frame');
    if (!sessionsFrame) return null;

    slot = document.createElement('div');
    slot.id = 'book-sidebar-slot';
    sessionsFrame.insertBefore(slot, sessionsFrame.firstChild || null);
    return slot;
}

function buildWorldWorkspaceShellDOM() {
    const workspace = document.createElement('div');
    workspace.id = 'world-workspace';
    workspace.className = 'workspace hidden';
    workspace.innerHTML = `
        <div class="world-workspace-shell">
            <div class="world-workspace-header">
                <div class="world-workspace-heading">
                    <h2 id="world-workspace-title">World</h2>
                    <p id="world-workspace-meta">Open a project to start building worlds.</p>
                </div>
                <div class="world-workspace-header-actions">
                    <button type="button" class="btn btn-small btn-secondary" data-action="world:proposeFromCurrentChat">Propose Updates</button>
                </div>
            </div>
            <div id="world-workspace-content" class="world-workspace-content"></div>
        </div>
    `;
    return workspace;
}

function buildBookWorkspaceShellDOM() {
    const workspace = document.createElement('div');
    workspace.id = 'book-workspace';
    workspace.className = 'workspace hidden';
    workspace.innerHTML = `
        <div class="book-workspace-shell">
            <div class="book-workspace-header">
                <div class="book-workspace-heading">
                    <h2 id="book-workspace-title">Book</h2>
                    <p id="book-workspace-meta">Select a Book to open its overview, agent, and planning tools.</p>
                </div>
                <div id="book-workspace-header-actions" class="book-workspace-header-actions"></div>
            </div>
            <div id="book-workspace-tabs" class="book-workspace-tabs"></div>
            <div id="book-workspace-content" class="book-workspace-content"></div>
        </div>
    `;
    return workspace;
}

function ensureWorldWorkspaceSurface() {
    let workspace = document.getElementById('world-workspace');
    if (workspace && document.getElementById('world-workspace-content')) return workspace;

    const mainContentWrapper = document.querySelector('#main-chat-panel .main-content-wrapper');
    if (!mainContentWrapper) return workspace || null;

    if (!workspace) {
        workspace = buildWorldWorkspaceShellDOM();
        mainContentWrapper.appendChild(workspace);
        return workspace;
    }

    if (!document.getElementById('world-workspace-content')) {
        workspace.replaceWith(buildWorldWorkspaceShellDOM());
        workspace = document.getElementById('world-workspace');
    }

    return workspace;
}

function ensureBookWorkspaceSurface() {
    let workspace = document.getElementById('book-workspace');
    if (workspace && document.getElementById('book-workspace-content') && document.getElementById('book-workspace-header-actions')) return workspace;

    const mainContentWrapper = document.querySelector('#main-chat-panel .main-content-wrapper');
    if (!mainContentWrapper) return workspace || null;

    if (!workspace) {
        workspace = buildBookWorkspaceShellDOM();
        mainContentWrapper.appendChild(workspace);
        return workspace;
    }

    if (!document.getElementById('book-workspace-content') || !document.getElementById('book-workspace-header-actions')) {
        workspace.replaceWith(buildBookWorkspaceShellDOM());
        workspace = document.getElementById('book-workspace');
    }

    return workspace;
}

function ensureWorldUISurfacesDOM() {
    const bookSlot = ensureBookSidebarSlot();
    const bookWorkspace = ensureBookWorkspaceSurface();
    const worldWorkspace = ensureWorldWorkspaceSurface();
    return { bookSlot, bookWorkspace, worldWorkspace };
}

function ensureBookSidebarModalSurface() {
    let modal = document.getElementById('book-sidebar-settings-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'book-sidebar-settings-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-box world-book-settings-modal-box">
            <div class="world-book-settings-modal-header">
                <h3 id="book-sidebar-settings-modal-title">Book Settings</h3>
                <button type="button" class="modal-close-btn" data-action="worldui:bookSidebarModalClose" title="Close">&times;</button>
            </div>
            <div id="book-sidebar-settings-modal-meta" class="world-book-settings-modal-meta"></div>
            <div id="book-sidebar-settings-modal-body" class="world-book-settings-modal-body"></div>
        </div>
    `;
    modal.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target === modal || target.closest('.modal-close-btn')) {
            worldInlineUIState.creatingBook = false;
            worldInlineUIState.editingBookId = null;
            worldInlineUIState.editingChapterMetaSessionId = null;
            bookSidebarUIState.modal = null;
            renderWorldUISurfaces();
        }
    });
    document.body.appendChild(modal);
    return modal;
}

function getActiveSession(project) {
    if (!project?.activeSessionId) return null;
    return (project.chatSessions || []).find(session => session.id === project.activeSessionId) || null;
}

function getWorldById(project, worldId) {
    if (!project || !worldId) return null;
    return (project.worlds || []).find(world => world.id === worldId) || null;
}

function getBookById(project, bookId) {
    if (!project || !bookId) return null;
    return (project.books || []).find(book => book.id === bookId) || null;
}

function getSessionById(project, sessionId) {
    if (!project || !sessionId) return null;
    return (project.chatSessions || []).find(session => session.id === sessionId) || null;
}

function getAllAgentPresetNames(project) {
    return Object.keys(project?.agentPresets || {});
}

function getActiveSidebarAgentPresetName(project) {
    if (project?.activeEntity?.type === 'agent' && project.activeEntity.name && project.agentPresets?.[project.activeEntity.name]) {
        return project.activeEntity.name;
    }
    return getAllAgentPresetNames(project)[0] || '';
}

function getBookAgentPresetName(project, book) {
    const name = String(book?.bookAgentConfig?.agentPresetName || '').trim();
    return name && project?.agentPresets?.[name] ? name : '';
}

function getBookCodexAgentResolvedPresetName(project, book) {
    const codexConfig = (book?.codexAgentConfig && typeof book.codexAgentConfig === 'object')
        ? book.codexAgentConfig
        : {};
    if (codexConfig.useBookAgent !== false) {
        return getBookAgentPresetName(project, book);
    }
    const name = String(codexConfig.agentPresetName || '').trim();
    return name && project?.agentPresets?.[name] ? name : '';
}

function autoSeedBookAgentAndCodexBindingsIfMissing(project, book) {
    if (!project || !book) return { project, book, seeded: false, presetName: '' };
    const hasBookAgentPreset = Boolean(getBookAgentPresetName(project, book));
    const hasCodexPreset = Boolean(getBookCodexAgentResolvedPresetName(project, book));
    if (hasBookAgentPreset || hasCodexPreset) {
        return { project, book, seeded: false, presetName: hasCodexPreset ? getBookCodexAgentResolvedPresetName(project, book) : getBookAgentPresetName(project, book) };
    }

    const selectedPresetName = getActiveSidebarAgentPresetName(project);
    if (!selectedPresetName) {
        return { project, book, seeded: false, presetName: '' };
    }

    publishWorldUIAction('book:update', {
        bookId: book.id,
        bookAgentConfig: { agentPresetName: selectedPresetName },
        codexAgentConfig: { useBookAgent: true }
    });

    const refreshedProject = stateManager.getProject() || project;
    const refreshedBook = getBookById(refreshedProject, book.id) || book;
    return { project: refreshedProject, book: refreshedBook, seeded: true, presetName: selectedPresetName };
}

function extractTextFromMessageContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (typeof part === 'string') return part;
                if (!part || typeof part !== 'object') return '';
                if (typeof part.text === 'string') return part.text;
                if (typeof part.content === 'string') return part.content;
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    if (content && typeof content === 'object') {
        if (typeof content.text === 'string') return content.text;
        if (typeof content.content === 'string') return content.content;
    }
    return '';
}

function getRecentSessionPlainText(session, { maxMessages = 12 } = {}) {
    const messages = Array.isArray(session?.messages) ? session.messages : [];
    return messages
        .slice(-Math.max(1, maxMessages))
        .filter(message => message && message.role !== 'system')
        .map(message => extractTextFromMessageContent(message.content))
        .filter(Boolean)
        .join('\n')
        .toLowerCase();
}

function buildChapterContinuityWarnings(project, session) {
    const warnings = [];
    if (!project || !session) return warnings;

    const book = session.bookId ? getBookById(project, session.bookId) : null;
    const world = book?.linkedWorldId ? getWorldById(project, book.linkedWorldId) : null;
    const writingMode = session.writingMode === CHAPTER_WRITING_MODE_AUTHOR
        ? CHAPTER_WRITING_MODE_AUTHOR
        : CHAPTER_WRITING_MODE_WRITING;
    const chapterNumber = Number.isFinite(session.chapterNumber) ? session.chapterNumber : null;
    const asOfChapter = Number.isFinite(session?.revealScope?.asOfChapter) ? session.revealScope.asOfChapter : null;

    if (!session.bookId) {
        warnings.push({
            level: 'info',
            code: 'not_linked',
            message: 'Current chat is not linked to a Book yet, so chapter continuity checks are limited.'
        });
        return warnings;
    }

    if (!book) {
        warnings.push({
            level: 'warning',
            code: 'book_missing',
            message: 'Chat references a missing Book. Reassign this chat to a valid Book.'
        });
        return warnings;
    }

    if (!book.linkedWorldId) {
        warnings.push({
            level: 'warning',
            code: 'book_no_world',
            message: 'This Book has no linked World. Canon retrieval and spoiler gating will not run.'
        });
    } else if (!world) {
        warnings.push({
            level: 'warning',
            code: 'world_missing',
            message: 'This Book links to a World that no longer exists.'
        });
    }

    if (!chapterNumber) {
        warnings.push({
            level: 'warning',
            code: 'chapter_number_missing',
            message: 'Chapter number is missing. Reveal scope and chapter ordering may drift.'
        });
    }

    if (writingMode === CHAPTER_WRITING_MODE_WRITING && !asOfChapter && !chapterNumber) {
        warnings.push({
            level: 'warning',
            code: 'reveal_scope_missing',
            message: 'Writing mode is active but reveal scope is not set. Add chapter number or reveal as-of chapter.'
        });
    }

    if (writingMode === CHAPTER_WRITING_MODE_WRITING && chapterNumber && asOfChapter && asOfChapter > chapterNumber) {
        warnings.push({
            level: 'warning',
            code: 'reveal_ahead',
            message: `Reveal scope is ahead of this chapter (as-of Ch.${asOfChapter} > Ch.${chapterNumber}), which can leak future canon.`
        });
    }

    if (book && chapterNumber) {
        const duplicates = (project.chatSessions || [])
            .filter(other => other && other.id !== session.id && other.bookId === book.id && Number(other.chapterNumber) === Number(chapterNumber))
            .slice(0, 3);
        if (duplicates.length > 0) {
            warnings.push({
                level: 'warning',
                code: 'duplicate_chapter_number',
                message: `Chapter number Ch.${chapterNumber} is also used by ${duplicates.map(s => `"${s.name || 'Untitled chat'}"`).join(', ')}.`
            });
        }
    }

    if (world && Array.isArray(world.items)) {
        const accessContext = {
            mode: writingMode,
            asOfChapter: asOfChapter || chapterNumber || null
        };
        const hiddenItems = world.items.filter(item => !isWorldItemVisibleForChapter(item, accessContext));
        if (writingMode === CHAPTER_WRITING_MODE_WRITING && hiddenItems.length > 0) {
            warnings.push({
                level: 'info',
                code: 'spoiler_guard_active',
                message: `Spoiler guard is active: ${hiddenItems.length} gated world item(s) hidden at this chapter scope.`
            });
        }

        const recentText = getRecentSessionPlainText(session);
        if (recentText && hiddenItems.length > 0) {
            const matchedHiddenTitles = hiddenItems
                .map(item => String(item?.title || '').trim())
                .filter(title => title.length >= 3)
                .filter(title => recentText.includes(title.toLowerCase()))
                .slice(0, 3);
            if (matchedHiddenTitles.length > 0) {
                warnings.push({
                    level: 'warning',
                    code: 'mentions_gated_item',
                    message: `Recent chat mentions gated canon before reveal scope: ${matchedHiddenTitles.join(', ')}.`
                });
            }
        }
    }

    return warnings;
}

function buildContinuityWarningsBlock(warnings = []) {
    const block = document.createElement('div');
    block.className = 'studio-world-continuity-block';

    const heading = document.createElement('div');
    heading.className = 'studio-world-continuity-heading';
    heading.textContent = 'Continuity Warnings (Basic)';
    block.appendChild(heading);

    if (!Array.isArray(warnings) || warnings.length === 0) {
        const ok = document.createElement('div');
        ok.className = 'studio-world-inline-note';
        ok.textContent = 'No basic continuity warnings detected for the current chapter setup.';
        block.appendChild(ok);
        return block;
    }

    const list = document.createElement('div');
    list.className = 'studio-world-continuity-list';
    warnings.forEach(entry => {
        const row = document.createElement('div');
        row.className = `studio-world-continuity-row is-${entry.level === 'warning' ? 'warning' : 'info'}`;

        const pill = createLabelPill(entry.level === 'warning' ? 'Warning' : 'Info', entry.level === 'warning' ? 'pending' : 'muted');
        const text = document.createElement('div');
        text.className = 'studio-world-continuity-text';
        text.textContent = entry.message || 'Continuity signal';

        row.append(pill, text);
        list.appendChild(row);
    });
    block.appendChild(list);
    return block;
}

function countBookChapters(project, book) {
    if (!book) return 0;
    const refs = Array.isArray(book?.structure?.chapterSessionIds) ? book.structure.chapterSessionIds : [];
    if (refs.length > 0) return refs.length;
    return (project?.chatSessions || []).filter(session => session?.bookId === book.id).length;
}

function countUsableDialogueMessages(session) {
    return Array.isArray(session?.history)
        ? session.history.filter(message => message && (message.role === 'user' || message.role === 'assistant')).length
        : 0;
}

function getBookChapterSessions(project, book) {
    if (!project || !book) return [];
    const sessions = Array.isArray(project.chatSessions) ? project.chatSessions : [];
    const byId = new Map(sessions.map((session) => [session?.id, session]));
    const refs = Array.isArray(book?.structure?.chapterSessionIds) ? book.structure.chapterSessionIds : [];
    const ordered = [];
    const seen = new Set();

    refs.forEach((sessionId) => {
        const session = byId.get(sessionId);
        if (!session || session.bookId !== book.id || session.archived === true || seen.has(sessionId)) return;
        ordered.push(session);
        seen.add(sessionId);
    });

    sessions.forEach((session) => {
        if (!session || session.bookId !== book.id || session.archived === true || seen.has(session.id)) return;
        ordered.push(session);
        seen.add(session.id);
    });

    return ordered;
}

function groupBookChaptersByAct(project, book) {
    const sessions = getBookChapterSessions(project, book);
    const groups = new Map();
    const definedActs = Array.isArray(book?.structure?.acts) ? book.structure.acts : [];

    definedActs.forEach((act, index) => {
        const orderRaw = Number(act?.order);
        const actNumber = Number.isFinite(orderRaw) && Math.round(orderRaw) > 0 ? Math.round(orderRaw) : (index + 1);
        const key = `act:${actNumber}`;
        groups.set(key, {
            key,
            actNumber,
            title: String(act?.title || '').trim() || `Act ${actNumber}`,
            summary: String(act?.summary || ''),
            label: String(act?.title || '').trim() || `Act ${actNumber}`,
            sessions: []
        });
    });

    sessions.forEach((session) => {
        const actNumber = Number.isFinite(session?.actNumber) ? session.actNumber : null;
        const key = actNumber ? `act:${actNumber}` : 'act:unassigned';
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                actNumber,
                title: actNumber ? `Act ${actNumber}` : 'Unassigned',
                summary: '',
                label: actNumber ? `Act ${actNumber}` : 'Unassigned',
                sessions: []
            });
        }
        groups.get(key).sessions.push(session);
    });

    return Array.from(groups.values()).sort((a, b) => {
        if (a.actNumber === null && b.actNumber !== null) return 1;
        if (b.actNumber === null && a.actNumber !== null) return -1;
        if (a.actNumber !== b.actNumber) return (a.actNumber || 0) - (b.actNumber || 0);
        return String(a.label || '').localeCompare(String(b.label || ''));
    });
}

function normalizeMarkdownWhitespace(markdown = '') {
    return String(markdown || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function collapseTextForMarkdown(text = '') {
    return String(text || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function escapeInlineMarkdown(text = '') {
    return String(text || '')
        .replace(/\\/g, '\\\\')
        .replace(/([`*_{}\[\]()#+\-!>])/g, '\\$1');
}

function htmlToBasicMarkdown(html = '') {
    const source = String(html || '').trim();
    if (!source) return '';
    const root = document.createElement('div');
    root.innerHTML = source;

    const renderNode = (node, context = {}) => {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        const tag = String(node.tagName || '').toLowerCase();
        const childText = () => Array.from(node.childNodes).map(child => renderNode(child, context)).join('');
        const childInline = () => collapseTextForMarkdown(childText());

        if (tag === 'br') return '\n';
        if (tag === 'hr') return '\n\n***\n\n';
        if (tag === 'p') {
            const text = childInline();
            return text ? `${text}\n\n` : '\n';
        }
        if (/^h[1-6]$/.test(tag)) {
            const level = Number(tag[1]) || 2;
            const text = childInline();
            return text ? `${'#'.repeat(level)} ${text}\n\n` : '';
        }
        if (tag === 'blockquote') {
            const text = normalizeMarkdownWhitespace(childText());
            if (!text) return '';
            const quoted = text.split('\n').map(line => (line ? `> ${line}` : '>')).join('\n');
            return `${quoted}\n\n`;
        }
        if (tag === 'pre') {
            const codeText = (node.textContent || '').replace(/\r\n/g, '\n').trimEnd();
            return codeText ? `\n\`\`\`\n${codeText}\n\`\`\`\n\n` : '';
        }
        if (tag === 'code') {
            // Inline code only (pre is handled above)
            if (String(node.parentElement?.tagName || '').toLowerCase() === 'pre') return '';
            const codeText = collapseTextForMarkdown(node.textContent || '');
            return codeText ? `\`${codeText.replace(/`/g, '\\`')}\`` : '';
        }
        if (tag === 'a') {
            const label = childInline() || collapseTextForMarkdown(node.getAttribute('href') || '');
            const href = String(node.getAttribute('href') || '').trim();
            if (!href) return label;
            return `[${label}](${href})`;
        }
        if (tag === 'strong' || tag === 'b') {
            const text = childInline();
            return text ? `**${text}**` : '';
        }
        if (tag === 'em' || tag === 'i') {
            const text = childInline();
            return text ? `*${text}*` : '';
        }
        if (tag === 'ul' || tag === 'ol') {
            const isOrdered = tag === 'ol';
            const items = Array.from(node.children)
                .filter(child => String(child.tagName || '').toLowerCase() === 'li')
                .map((li, index) => {
                    const prefix = isOrdered ? `${index + 1}. ` : '- ';
                    const rendered = normalizeMarkdownWhitespace(renderNode(li, { ...context, listDepth: (context.listDepth || 0) + 1 }));
                    if (!rendered) return '';
                    const indent = '  '.repeat(context.listDepth || 0);
                    const lines = rendered.split('\n');
                    return [
                        `${indent}${prefix}${lines[0] || ''}`,
                        ...lines.slice(1).map(line => `${indent}  ${line}`)
                    ].join('\n');
                })
                .filter(Boolean);
            return items.length ? `${items.join('\n')}\n\n` : '';
        }
        if (tag === 'li') {
            return normalizeMarkdownWhitespace(childText());
        }
        if (tag === 'div' || tag === 'section' || tag === 'article') {
            return `${Array.from(node.childNodes).map(child => renderNode(child, context)).join('')}`;
        }
        return childText();
    };

    const raw = Array.from(root.childNodes).map(node => renderNode(node)).join('');
    return normalizeMarkdownWhitespace(raw);
}

function getChapterExportHeading(session, exportProfile = {}) {
    const mode = String(exportProfile?.chapterTitleMode || 'number_and_title').trim();
    const chapterNumber = Number.isFinite(session?.chapterNumber) ? session.chapterNumber : null;
    const chapterTitle = String(session?.chapterTitle || '').trim();
    const fallback = String(session?.name || '').trim() || 'Untitled Chapter';

    if (mode === 'title_only') {
        if (chapterTitle) return chapterTitle;
        if (chapterNumber) return `Chapter ${chapterNumber}`;
        return fallback;
    }

    if (chapterNumber && chapterTitle) return `Chapter ${chapterNumber}: ${chapterTitle}`;
    if (chapterNumber) return `Chapter ${chapterNumber}`;
    if (chapterTitle) return chapterTitle;
    return fallback;
}

function buildBookMarkdownExport(project, book, draftOverrides = {}) {
    if (!project || !book) {
        return { markdown: '', fileName: 'book-export.md', chapterCount: 0, exportedChapters: 0, missingContentCount: 0 };
    }

    const savedExportProfile = (book && typeof book.exportProfile === 'object' && book.exportProfile) ? book.exportProfile : {};
    const exportProfile = {
        ...savedExportProfile,
        ...(draftOverrides?.exportProfile && typeof draftOverrides.exportProfile === 'object' ? draftOverrides.exportProfile : {})
    };
    const groups = groupBookChaptersByAct(project, book);
    const allSessions = getBookChapterSessions(project, book);
    const bookTitle = String(exportProfile.title || book.name || 'Untitled Book').trim();
    const subtitle = String(exportProfile.subtitle || '').trim();
    const author = String(exportProfile.author || '').trim();
    const frontMatterNotes = String(exportProfile.frontMatterNotes || '').trim();
    const includeSummaries = exportProfile.includeChapterSummaries === true;
    const generatedAt = new Date().toISOString();

    const lines = [];
    lines.push(`# ${escapeInlineMarkdown(bookTitle)}`);
    if (subtitle) lines.push(`\n_${escapeInlineMarkdown(subtitle)}_`);
    if (author) lines.push(`\nAuthor: ${escapeInlineMarkdown(author)}`);
    lines.push(`\n<!-- Exported from PromptPrim Book Workspace on ${generatedAt} -->`);

    if (frontMatterNotes) {
        lines.push('\n## Front Matter Notes\n');
        lines.push(frontMatterNotes);
    }

    let exportedChapters = 0;
    let missingContentCount = 0;

    groups.forEach((group) => {
        const actHeading = group.actNumber
            ? `${group.title || `Act ${group.actNumber}`}`
            : `${group.title || 'Unassigned'}`;
        lines.push(`\n## ${escapeInlineMarkdown(actHeading)}\n`);
        if (String(group.summary || '').trim()) {
            lines.push(`${String(group.summary || '').trim()}\n`);
        }

        (group.sessions || []).forEach((session) => {
            exportedChapters += 1;
            const chapterHeading = getChapterExportHeading(session, exportProfile);
            lines.push(`### ${escapeInlineMarkdown(chapterHeading)}\n`);

            if (includeSummaries) {
                const chapterSummary = String(session?.chapterSummary || '').trim();
                if (chapterSummary) {
                    lines.push(`> Summary: ${chapterSummary}\n`);
                }
            }

            const composerHtml = typeof session?.composerContent === 'string' ? session.composerContent.trim() : '';
            let chapterBody = htmlToBasicMarkdown(composerHtml);
            if (!chapterBody) {
                const chapterSummary = String(session?.chapterSummary || '').trim();
                chapterBody = chapterSummary || '_No chapter composer content yet._';
                if (!chapterSummary) missingContentCount += 1;
            }
            lines.push(chapterBody);
            lines.push('');
        });
    });

    if (allSessions.length === 0) {
        lines.push('\n_No chapters in this book yet._\n');
    }

    const markdown = `${normalizeMarkdownWhitespace(lines.join('\n'))}\n`;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `${sanitizeExportFilenameBase(bookTitle, 'book-export')}_${dateStamp}.md`;
    return {
        markdown,
        fileName,
        chapterCount: allSessions.length,
        exportedChapters,
        missingContentCount
    };
}

function getBookActDefinition(book, actNumber) {
    if (!book || !Number.isFinite(actNumber)) return null;
    const acts = Array.isArray(book?.structure?.acts) ? book.structure.acts : [];
    return acts.find(act => Number(act?.order) === Math.round(actNumber)) || null;
}

function getNextBookActNumber(project, book) {
    const maxFromSessions = (project?.chatSessions || [])
        .filter(session => session?.bookId === book?.id)
        .reduce((max, session) => {
            const n = Number(session?.actNumber);
            return Number.isFinite(n) && n > max ? Math.round(n) : max;
        }, 0);
    const maxFromStructure = (Array.isArray(book?.structure?.acts) ? book.structure.acts : [])
        .reduce((max, act) => {
            const n = Number(act?.order);
            return Number.isFinite(n) && n > max ? Math.round(n) : max;
        }, 0);
    return Math.max(1, maxFromSessions, maxFromStructure) + (Math.max(maxFromSessions, maxFromStructure) > 0 ? 1 : 0);
}

function getChapterTreeLabel(session) {
    const chapterNumber = Number.isFinite(session?.chapterNumber) ? session.chapterNumber : null;
    const chapterTitle = String(session?.chapterTitle || '').trim();
    const sessionName = String(session?.name || '').trim();
    if (chapterNumber && chapterTitle) return `Chapter ${chapterNumber}: ${chapterTitle}`;
    if (chapterNumber) return `Chapter ${chapterNumber}`;
    if (chapterTitle) return chapterTitle;
    if (sessionName) return sessionName;
    return 'Untitled Chapter';
}

function formatProposalTypeLabel(type = '') {
    const normalized = String(type || '').trim();
    switch (normalized) {
        case 'create_item': return 'Create Item';
        case 'edit_item': return 'Edit Item';
        case 'delete_item': return 'Delete Item';
        case 'create_event': return 'Create Event';
        case 'update_relationship': return 'Update Relationship';
        case 'mark_conflict': return 'Mark Conflict';
        case 'suggest_reveal_change': return 'Reveal Change';
        default:
            return normalized || 'Proposal';
    }
}

function formatChangeStatusLabel(status = '') {
    const normalized = String(status || '').trim().toLowerCase();
    switch (normalized) {
        case 'approved': return 'Approved';
        case 'rejected': return 'Rejected';
        case 'edited': return 'Edited';
        default: return 'Pending';
    }
}

function getProposalSubject(change = {}) {
    const after = change?.afterPayload || {};
    const before = change?.beforePayload || {};
    if (after?.title) return after.title;
    if (after?.name) return after.name;
    if (before?.title) return before.title;
    if (before?.name) return before.name;
    if (change.targetItemId) return `Item ${change.targetItemId}`;
    return 'Untitled change';
}

function getChangeSummaryLine(change = {}) {
    const type = String(change?.proposalType || '');
    const after = change?.afterPayload || {};
    if (type === 'create_item') {
        return `Create ${after.type || 'item'} "${getProposalSubject(change)}"`;
    }
    if (type === 'edit_item') {
        return `Edit "${getProposalSubject(change)}"`;
    }
    if (type === 'delete_item') {
        return `Delete "${getProposalSubject(change)}"`;
    }
    return `${formatProposalTypeLabel(type)} • ${getProposalSubject(change)}`;
}

function safeJsonStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

function isPlainObjectLike(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatChangeValuePreview(value, { maxLen = 180 } = {}) {
    if (value === undefined) return '—';
    if (value === null) return 'null';
    if (typeof value === 'string') {
        const collapsed = value.replace(/\s+/g, ' ').trim();
        if (!collapsed) return '(empty)';
        return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen - 1)}…` : collapsed;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const json = safeJsonStringify(value);
    if (!json) return String(value);
    return json.length > maxLen ? `${json.slice(0, maxLen - 1)}…` : json;
}

function valuesEqualForDiff(a, b) {
    return safeJsonStringify(a) === safeJsonStringify(b);
}

function buildChangeDiffRows(change = {}) {
    const type = String(change?.proposalType || '').trim();
    const before = isPlainObjectLike(change?.beforePayload) ? change.beforePayload : {};
    const after = isPlainObjectLike(change?.afterPayload) ? change.afterPayload : {};
    const preferredKeyOrder = [
        'type',
        'title',
        'summary',
        'description',
        'status',
        'visibility',
        'revealGate',
        'tags',
        'sourceRefs',
        'content'
    ];

    const allKeys = Array.from(new Set([
        ...preferredKeyOrder,
        ...Object.keys(before),
        ...Object.keys(after)
    ]));

    if (type === 'create_item') {
        return allKeys
            .filter(key => after[key] !== undefined)
            .map(key => ({
                key,
                before: undefined,
                after: after[key],
                kind: 'added'
            }));
    }

    if (type === 'delete_item') {
        return allKeys
            .filter(key => before[key] !== undefined)
            .map(key => ({
                key,
                before: before[key],
                after: undefined,
                kind: 'removed'
            }));
    }

    if (type === 'edit_item') {
        return allKeys
            .filter(key => before[key] !== undefined || after[key] !== undefined)
            .filter(key => !valuesEqualForDiff(before[key], after[key]))
            .map(key => ({
                key,
                before: before[key],
                after: after[key],
                kind: before[key] === undefined ? 'added' : (after[key] === undefined ? 'removed' : 'changed')
            }));
    }

    return [];
}

function appendProposalDiffBlock(itemEl, change = {}) {
    const diffRows = buildChangeDiffRows(change);
    const before = change?.beforePayload;
    const after = change?.afterPayload;
    const hasPayload = before != null || after != null;
    if (!hasPayload && diffRows.length === 0) return;

    const details = document.createElement('details');
    details.className = 'studio-world-change-diff';
    details.open = String(change.status || 'pending').toLowerCase() === 'pending';

    const summary = document.createElement('summary');
    const labelCount = diffRows.length > 0 ? `${diffRows.length} field${diffRows.length === 1 ? '' : 's'}` : 'payload';
    summary.textContent = `Diff • ${labelCount}`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'studio-world-change-diff-body';

    if (diffRows.length > 0) {
        diffRows.forEach(row => {
            const line = document.createElement('div');
            line.className = `studio-world-change-diff-row is-${row.kind}`;

            const key = document.createElement('div');
            key.className = 'studio-world-change-diff-key';
            key.textContent = row.key;

            const beforeCol = document.createElement('div');
            beforeCol.className = 'studio-world-change-diff-value is-before';
            beforeCol.textContent = formatChangeValuePreview(row.before);

            const afterCol = document.createElement('div');
            afterCol.className = 'studio-world-change-diff-value is-after';
            afterCol.textContent = formatChangeValuePreview(row.after);

            line.append(key, beforeCol, afterCol);
            body.appendChild(line);
        });
    } else {
        const empty = document.createElement('div');
        empty.className = 'studio-world-inline-note';
        empty.textContent = 'No field-level diff available for this proposal type yet.';
        body.appendChild(empty);
    }

    if (Array.isArray(change.evidenceRefs) && change.evidenceRefs.length > 0) {
        const evidence = document.createElement('div');
        evidence.className = 'studio-world-change-evidence';
        evidence.textContent = `Evidence refs: ${change.evidenceRefs
            .slice(0, 4)
            .map(ref => {
                if (typeof ref === 'string') return ref;
                if (ref?.type && ref?.id) return `${ref.type}:${ref.id}`;
                if (ref?.id) return String(ref.id);
                return formatChangeValuePreview(ref, { maxLen: 48 });
            })
            .join(', ')}${change.evidenceRefs.length > 4 ? '…' : ''}`;
        body.appendChild(evidence);
    }

    details.appendChild(body);
    itemEl.appendChild(details);
}

function formatRelativeTimestamp(timestamp) {
    if (!Number.isFinite(timestamp)) return 'Unknown time';
    const deltaMs = Date.now() - timestamp;
    if (!Number.isFinite(deltaMs)) return 'Unknown time';
    const absMs = Math.abs(deltaMs);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (absMs < minute) return 'just now';
    if (absMs < hour) return `${Math.round(absMs / minute)}m ago`;
    if (absMs < day) return `${Math.round(absMs / hour)}h ago`;
    return `${Math.round(absMs / day)}d ago`;
}

function countLinkedBooks(project, worldId) {
    if (!worldId) return 0;
    return (project?.books || []).filter(book => book.linkedWorldId === worldId).length;
}

function getWorldOwnershipMeta(project, world) {
    if (!world) {
        return { mode: 'unassigned', ownerBook: null, linkedBooks: [] };
    }
    const linkedBooks = (project?.books || []).filter(book => book?.linkedWorldId === world.id);
    const ownerBook = world?.ownerBookId ? getBookById(project, world.ownerBookId) : null;
    const linkedCount = linkedBooks.length;
    const scope = String(world?.scope || '').trim().toLowerCase();
    if (scope === 'shared' || linkedCount > 1) {
        return { mode: 'shared', ownerBook, linkedBooks };
    }
    if (scope === 'book' || ownerBook || linkedCount === 1) {
        return { mode: 'book', ownerBook: ownerBook || linkedBooks[0] || null, linkedBooks };
    }
    return { mode: 'unassigned', ownerBook: null, linkedBooks };
}

function makeSection(titleText, {
    sectionClassName = '',
    createAction = null,
    createTitle = 'Create',
    dropdownOptions = []
} = {}) {
    const section = document.createElement('details');
    section.className = `collapsible-section ${sectionClassName}`.trim();
    section.open = true;

    const summary = document.createElement('summary');
    summary.className = 'section-header';

    const title = document.createElement('h3');
    title.textContent = titleText;

    const actions = document.createElement('div');
    actions.className = 'section-header-actions';

    if (createAction) {
        const createButton = document.createElement('button');
        createButton.type = 'button';
        createButton.className = 'btn-icon';
        createButton.dataset.action = createAction;
        createButton.title = createTitle;
        createButton.textContent = '+';
        actions.appendChild(createButton);
    }

    if (Array.isArray(dropdownOptions) && dropdownOptions.length > 0) {
        const dropdown = createDropdown(dropdownOptions);
        dropdown.classList.add('section-mini-menu');
        actions.appendChild(dropdown);
    }

    summary.append(title, actions);

    const box = document.createElement('div');
    box.className = 'section-box';

    section.append(summary, box);
    return { section, box };
}

function createLabelPill(text, tone = 'default') {
    const pill = document.createElement('span');
    pill.className = `studio-world-pill ${tone !== 'default' ? `is-${tone}` : ''}`.trim();
    pill.textContent = text;
    return pill;
}

function createMetaRow(parts = []) {
    const row = document.createElement('div');
    row.className = 'studio-world-item-meta';
    parts.filter(Boolean).forEach((part, index) => {
        const span = document.createElement('span');
        span.textContent = part;
        row.appendChild(span);
        if (index < parts.filter(Boolean).length - 1) {
            const sep = document.createElement('span');
            sep.className = 'studio-world-meta-sep';
            sep.textContent = '•';
            row.appendChild(sep);
        }
    });
    return row;
}

function createInlineField(labelText, inputEl) {
    const field = document.createElement('label');
    field.className = 'studio-world-inline-field';

    const label = document.createElement('span');
    label.className = 'studio-world-inline-field-label';
    label.textContent = labelText;

    field.append(label, inputEl);
    return field;
}

function createInlineTextInput({
    className = 'studio-world-inline-input',
    name = '',
    value = '',
    placeholder = ''
} = {}) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = className;
    if (name) input.name = name;
    input.value = value ?? '';
    if (placeholder) input.placeholder = placeholder;
    return input;
}

function createInlineNumberInput({
    name = '',
    value = '',
    min = 1,
    placeholder = ''
} = {}) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'studio-world-inline-input';
    if (name) input.name = name;
    input.min = String(min);
    input.step = '1';
    input.value = value ?? '';
    if (placeholder) input.placeholder = placeholder;
    return input;
}

function createInlineTextarea({
    name = '',
    value = '',
    rows = 3,
    placeholder = ''
} = {}) {
    const textarea = document.createElement('textarea');
    textarea.className = 'studio-world-inline-textarea';
    if (name) textarea.name = name;
    textarea.rows = rows;
    textarea.value = value ?? '';
    if (placeholder) textarea.placeholder = placeholder;
    return textarea;
}

function createInlineSelect({
    name = '',
    value = '',
    options = []
} = {}) {
    const select = document.createElement('select');
    select.className = 'studio-world-inline-select';
    if (name) select.name = name;
    options.forEach(option => {
        const opt = document.createElement('option');
        if (typeof option === 'string') {
            opt.value = option;
            opt.textContent = option;
        } else {
            opt.value = option.value;
            opt.textContent = option.label || option.value;
        }
        if (String(opt.value) === String(value ?? '')) opt.selected = true;
        select.appendChild(opt);
    });
    return select;
}

function createInlineEditorActions({ saveAction, cancelAction, saveLabel = 'Save', cancelLabel = 'Cancel', dataset = {} }) {
    const row = document.createElement('div');
    row.className = 'studio-world-inline-editor-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-small';
    saveBtn.dataset.action = saveAction;
    Object.entries(dataset || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        saveBtn.dataset[key] = String(value);
    });
    saveBtn.textContent = saveLabel;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-small btn-secondary';
    cancelBtn.dataset.action = cancelAction;
    Object.entries(dataset || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        cancelBtn.dataset[key] = String(value);
    });
    cancelBtn.textContent = cancelLabel;

    row.append(saveBtn, cancelBtn);
    return row;
}

function buildBookInlineEditor(project, book) {
    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor';
    editor.dataset.rowActionShield = 'true';
    editor.dataset.bookId = book.id;

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid';

    grid.appendChild(createInlineField('Book name', createInlineTextInput({
        name: 'bookName',
        value: book.name || '',
        placeholder: 'Book name'
    })));

    const worldOptions = [{ value: '', label: '(No linked world)' }]
        .concat((project.worlds || []).map(world => ({ value: world.id, label: world.name || world.id })));
    grid.appendChild(createInlineField('Linked world', createInlineSelect({
        name: 'linkedWorldId',
        value: book.linkedWorldId || '',
        options: worldOptions
    })));

    grid.appendChild(createInlineField('Description', createInlineTextarea({
        name: 'bookDescription',
        value: book.description || '',
        rows: 2,
        placeholder: 'Optional book description'
    })));

    const checkboxField = document.createElement('label');
    checkboxField.className = 'studio-world-inline-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'autoNumberChapters';
    checkbox.checked = book.autoNumberChapters !== false;
    checkboxField.append(checkbox, document.createTextNode(' Auto-number chapters'));
    grid.appendChild(checkboxField);

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:bookEditSave',
        cancelAction: 'worldui:bookEditCancel',
        dataset: { bookId: book.id }
    }));
    return editor;
}

function buildBookCreateInlineEditor(project) {
    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor';
    editor.dataset.rowActionShield = 'true';

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid';

    grid.appendChild(createInlineField('Book name', createInlineTextInput({
        name: 'newBookName',
        value: '',
        placeholder: `Book ${(project?.books?.length || 0) + 1}`
    })));

    const defaultLinkedWorldId = worldInlineUIState.creatingBook && typeof worldInlineUIState.creatingBook === 'object'
        ? (worldInlineUIState.creatingBook.linkedWorldId || '')
        : '';
    const worldOptions = [{ value: '', label: 'Create new Book World (Recommended)' }]
        .concat((project?.worlds || []).map(world => ({ value: world.id, label: world.name || world.id })));
    grid.appendChild(createInlineField('Use existing world (optional)', createInlineSelect({
        name: 'newBookLinkedWorldId',
        value: defaultLinkedWorldId,
        options: worldOptions
    })));

    const worldHelp = document.createElement('div');
    worldHelp.className = 'studio-world-inline-note';
    worldHelp.style.gridColumn = '1 / -1';
    worldHelp.textContent = 'Leave the recommended option to create a dedicated Book World. Choose an existing world only when this Book should share a codex (e.g. a series).';
    grid.appendChild(worldHelp);

    grid.appendChild(createInlineField('Description', createInlineTextarea({
        name: 'newBookDescription',
        value: '',
        rows: 2,
        placeholder: 'Optional book description'
    })));

    const checkboxField = document.createElement('label');
    checkboxField.className = 'studio-world-inline-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'newBookAutoNumber';
    checkbox.checked = true;
    checkboxField.append(checkbox, document.createTextNode(' Auto-number chapters'));
    grid.appendChild(checkboxField);

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:bookCreateSave',
        cancelAction: 'worldui:bookCreateCancel',
        saveLabel: 'Create Book'
    }));
    return editor;
}

function buildWorldCreateInlineEditor(project) {
    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor';
    editor.dataset.rowActionShield = 'true';

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid';
    const worldCreateScope = (worldInlineUIState.creatingWorld && typeof worldInlineUIState.creatingWorld === 'object')
        ? (String(worldInlineUIState.creatingWorld.scope || '').trim().toLowerCase() === 'shared' ? 'shared' : 'unassigned')
        : 'unassigned';

    grid.appendChild(createInlineField(worldCreateScope === 'shared' ? 'Shared world name' : 'World name', createInlineTextInput({
        name: 'newWorldName',
        value: '',
        placeholder: `World ${(project?.worlds?.length || 0) + 1}`
    })));

    grid.appendChild(createInlineField('Description', createInlineTextarea({
        name: 'newWorldDescription',
        value: '',
        rows: 2,
        placeholder: 'Optional world description'
    })));

    if (worldCreateScope === 'shared') {
        const note = document.createElement('div');
        note.className = 'studio-world-inline-note';
        note.style.gridColumn = '1 / -1';
        note.textContent = 'Shared Worlds can be linked to multiple Books (useful for a series or shared universe).';
        grid.appendChild(note);
    }

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:worldCreateSave',
        cancelAction: 'worldui:worldCreateCancel',
        saveLabel: worldCreateScope === 'shared' ? 'Create Shared World' : 'Create World'
    }));
    return editor;
}

function buildWorldItemCreateInlineEditor(project) {
    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor';
    editor.dataset.rowActionShield = 'true';

    const draft = worldInlineUIState.creatingWorldItem && typeof worldInlineUIState.creatingWorldItem === 'object'
        ? worldInlineUIState.creatingWorldItem
        : {};

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid';

    const worldOptions = (project?.worlds || []).map(world => ({ value: world.id, label: world.name || world.id }));
    grid.appendChild(createInlineField('World', createInlineSelect({
        name: 'newItemWorldId',
        value: draft.worldId || project?.activeWorldId || '',
        options: worldOptions
    })));
    grid.appendChild(createInlineField('Type', createInlineSelect({
        name: 'newItemType',
        value: draft.type || 'entity',
        options: ['entity', 'place', 'rule', 'event', 'note', 'source', 'relationship']
    })));
    grid.appendChild(createInlineField('Title', createInlineTextInput({
        name: 'newItemTitle',
        value: '',
        placeholder: 'Item title'
    })));
    grid.appendChild(createInlineField('Summary', createInlineTextarea({
        name: 'newItemSummary',
        value: '',
        rows: 3,
        placeholder: 'Summary / note'
    })));
    grid.appendChild(createInlineField('Tags', createInlineTextInput({
        name: 'newItemTags',
        value: '',
        placeholder: 'comma, separated, tags'
    })));
    grid.appendChild(createInlineField('Visibility', createInlineSelect({
        name: 'newItemVisibility',
        value: 'revealed',
        options: [
            { value: 'revealed', label: 'revealed' },
            { value: 'gated', label: 'gated' }
        ]
    })));
    grid.appendChild(createInlineField('Reveal @ chapter', createInlineNumberInput({
        name: 'newItemRevealChapter',
        value: '',
        placeholder: 'optional'
    })));

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:itemCreateSave',
        cancelAction: 'worldui:itemCreateCancel',
        saveLabel: 'Create Item'
    }));
    return editor;
}

function buildChapterMetaInlineEditor(session) {
    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor';
    editor.dataset.rowActionShield = 'true';
    editor.dataset.sessionId = session.id;

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid is-compact';

    grid.appendChild(createInlineField('Act', createInlineNumberInput({
        name: 'actNumber',
        value: session.actNumber ? String(session.actNumber) : '',
        placeholder: 'e.g. 1'
    })));
    grid.appendChild(createInlineField('Chapter', createInlineNumberInput({
        name: 'chapterNumber',
        value: session.chapterNumber ? String(session.chapterNumber) : '',
        placeholder: 'e.g. 3'
    })));
    grid.appendChild(createInlineField('Reveal as-of Ch.', createInlineNumberInput({
        name: 'asOfChapter',
        value: session.revealScope?.asOfChapter ? String(session.revealScope.asOfChapter) : '',
        placeholder: 'blank = follow chapter'
    })));
    grid.appendChild(createInlineField('Writing mode', createInlineSelect({
        name: 'writingMode',
        value: session.writingMode || 'writing',
        options: [
            { value: 'writing', label: 'writing' },
            { value: 'author', label: 'author' }
        ]
    })));
    grid.appendChild(createInlineField('Chapter title', createInlineTextInput({
        name: 'chapterTitle',
        value: session.chapterTitle || '',
        placeholder: 'Optional chapter title'
    })));
    grid.appendChild(createInlineField('Chapter summary', createInlineTextarea({
        name: 'chapterSummary',
        value: session.chapterSummary || '',
        rows: 4,
        placeholder: 'Short summary for Book overview cards'
    })));

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:chapterMetaSave',
        cancelAction: 'worldui:chapterMetaCancel',
        dataset: { sessionId: session.id }
    }));
    return editor;
}

function buildActSettingsInlineEditor(book, actNumber, actDefinition = null) {
    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor';
    editor.dataset.rowActionShield = 'true';
    editor.dataset.bookId = book.id;
    editor.dataset.actNumber = String(actNumber);

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid is-compact';

    grid.appendChild(createInlineField('Act number', createInlineNumberInput({
        name: 'actNumber',
        value: String(actNumber || ''),
        min: 1
    })));

    grid.appendChild(createInlineField('Act title', createInlineTextInput({
        name: 'actTitle',
        value: String(actDefinition?.title || `Act ${actNumber}`),
        placeholder: `Act ${actNumber}`
    })));

    grid.appendChild(createInlineField('Act summary', createInlineTextarea({
        name: 'actSummary',
        value: String(actDefinition?.summary || ''),
        rows: 3,
        placeholder: 'Optional arc / section note'
    })));

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:actEditSave',
        cancelAction: 'worldui:actEditCancel',
        dataset: { bookId: book.id, actNumber }
    }));
    return editor;
}

function buildChapterMoveToActInlineEditor(project, session) {
    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor';
    editor.dataset.rowActionShield = 'true';
    editor.dataset.sessionId = session.id;

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid is-compact';

    const currentBook = session?.bookId ? getBookById(project, session.bookId) : null;
    const currentAct = Number.isFinite(Number(session?.actNumber)) ? Math.round(Number(session.actNumber)) : null;

    grid.appendChild(createInlineField('Act number (blank = Unassigned)', createInlineNumberInput({
        name: 'moveActNumber',
        value: currentAct ? String(currentAct) : '',
        placeholder: 'e.g. 2'
    })));

    if (currentBook) {
        const acts = Array.isArray(currentBook?.structure?.acts) ? currentBook.structure.acts : [];
        const helper = document.createElement('div');
        helper.className = 'world-book-settings-modal-quick-actions';

        const unassignedBtn = document.createElement('button');
        unassignedBtn.type = 'button';
        unassignedBtn.className = 'btn btn-small btn-secondary';
        unassignedBtn.dataset.action = 'worldui:chapterMoveToActChoose';
        unassignedBtn.dataset.sessionId = session.id;
        unassignedBtn.dataset.actNumber = '';
        unassignedBtn.textContent = 'Unassigned';
        helper.appendChild(unassignedBtn);

        acts
            .slice()
            .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
            .forEach((act) => {
                const n = Number.isFinite(Number(act?.order)) ? Math.round(Number(act.order)) : null;
                if (!n) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn btn-small btn-secondary';
                btn.dataset.action = 'worldui:chapterMoveToActChoose';
                btn.dataset.sessionId = session.id;
                btn.dataset.actNumber = String(n);
                btn.textContent = String(act?.title || `Act ${n}`);
                helper.appendChild(btn);
            });

        if (helper.childNodes.length > 0) {
            const helperWrap = document.createElement('div');
            helperWrap.className = 'world-book-settings-modal-helper';
            helperWrap.innerHTML = '<div class="studio-world-inline-note">Quick choose:</div>';
            helperWrap.appendChild(helper);
            grid.appendChild(helperWrap);
        }
    }

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:chapterMoveToActSave',
        cancelAction: 'worldui:chapterMoveToActCancel',
        saveLabel: 'Move Chapter',
        dataset: { sessionId: session.id }
    }));
    return editor;
}

function buildWorldItemInlineEditor(worldId, item) {
    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor';
    editor.dataset.rowActionShield = 'true';
    editor.dataset.worldId = worldId;
    editor.dataset.itemId = item.id;

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid';

    grid.appendChild(createInlineField('Type', createInlineSelect({
        name: 'itemType',
        value: item.type || 'note',
        options: ['entity', 'place', 'rule', 'event', 'note', 'source', 'relationship']
    })));
    grid.appendChild(createInlineField('Title', createInlineTextInput({
        name: 'itemTitle',
        value: item.title || '',
        placeholder: 'Item title'
    })));
    grid.appendChild(createInlineField('Summary', createInlineTextarea({
        name: 'itemSummary',
        value: item.summary || '',
        rows: 3,
        placeholder: 'Summary / note'
    })));
    grid.appendChild(createInlineField('Tags', createInlineTextInput({
        name: 'itemTags',
        value: Array.isArray(item.tags) ? item.tags.join(', ') : '',
        placeholder: 'comma, separated, tags'
    })));
    grid.appendChild(createInlineField('Visibility', createInlineSelect({
        name: 'itemVisibility',
        value: item.visibility || 'revealed',
        options: [
            { value: 'revealed', label: 'revealed' },
            { value: 'gated', label: 'gated' }
        ]
    })));
    grid.appendChild(createInlineField('Reveal @ chapter', createInlineNumberInput({
        name: 'itemRevealChapter',
        value: item.revealGate?.kind === 'chapter_threshold' && Number.isFinite(item.revealGate?.value)
            ? String(item.revealGate.value)
            : '',
        placeholder: 'blank = manual gate / none'
    })));

    if (item.revealGate?.kind === 'manual_unlock') {
        const manualField = document.createElement('label');
        manualField.className = 'studio-world-inline-checkbox';
        const manualCheckbox = document.createElement('input');
        manualCheckbox.type = 'checkbox';
        manualCheckbox.name = 'itemManualUnlocked';
        manualCheckbox.checked = item.revealGate?.unlocked === true;
        manualField.append(manualCheckbox, document.createTextNode(' Manual gate unlocked'));
        grid.appendChild(manualField);
    }

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:itemEditSave',
        cancelAction: 'worldui:itemEditCancel',
        dataset: { worldId, itemId: item.id }
    }));
    return editor;
}

function appendItemDropdownToHeader(header, options = []) {
    if (!Array.isArray(options) || options.length === 0) return;
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const dropdown = createDropdown(options);
    actions.appendChild(dropdown);
    header.appendChild(actions);
}

function buildBookItem(project, book, activeSession) {
    const item = document.createElement('div');
    item.className = 'item book-project-item';
    if (project.activeBookId === book.id) item.classList.add('active');
    if (activeSession?.bookId === book.id) item.classList.add('is-session-linked');
    item.dataset.action = 'book:setActive';
    item.dataset.bookId = book.id;

    const header = document.createElement('div');
    header.className = 'item-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'item-name';
    titleWrap.textContent = book.name || 'Untitled Book';
    header.appendChild(titleWrap);

    appendItemDropdownToHeader(header, [
        { label: 'Set Active', action: 'book:setActive', data: { bookId: book.id } },
        { label: 'Rename...', action: 'book:renamePrompt', data: { bookId: book.id } },
        { label: 'Link World...', action: 'book:linkWorldPrompt', data: { bookId: book.id } },
        { label: 'Import Current Chat as Chapter', action: 'chapter:assignToBook', data: { bookId: book.id } },
        { label: 'Delete Book', action: 'book:delete', data: { bookId: book.id }, isDestructive: true }
    ]);

    item.appendChild(header);

    const world = getWorldById(project, book.linkedWorldId);
    const chapterCount = countBookChapters(project, book);
    item.appendChild(createMetaRow([
        world ? `World: ${world.name}` : 'No linked world',
        `${chapterCount} chapter${chapterCount === 1 ? '' : 's'}`
    ]));

    const footer = document.createElement('div');
    footer.className = 'studio-world-item-footer';
    if (project.activeBookId === book.id) {
        footer.appendChild(createLabelPill('Active Book', 'active'));
    }
    if (activeSession?.bookId === book.id) {
        const chapterLabel = activeSession.chapterNumber ? `Chat linked • Ch.${activeSession.chapterNumber}` : 'Current chat linked';
        footer.appendChild(createLabelPill(chapterLabel, 'linked'));
    }
    if (book.autoNumberChapters !== false) {
        footer.appendChild(createLabelPill('Auto #'));
    }
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-small btn-secondary';
    editBtn.dataset.action = worldInlineUIState.editingBookId === book.id
        ? 'worldui:bookEditCancel'
        : 'worldui:bookEditStart';
    editBtn.dataset.bookId = book.id;
    editBtn.textContent = worldInlineUIState.editingBookId === book.id ? 'Close Editor' : 'Edit';
    footer.appendChild(editBtn);
    if (footer.childNodes.length > 0) {
        item.appendChild(footer);
    }

    if (worldInlineUIState.editingBookId === book.id) {
        item.appendChild(buildBookInlineEditor(project, book));
    }

    return item;
}

function buildBookTreeRowLabel(text, { secondary = null } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'book-tree-row-label';

    const primaryEl = document.createElement('div');
    primaryEl.className = 'book-tree-row-primary';
    primaryEl.textContent = text;
    wrap.appendChild(primaryEl);

    if (secondary) {
        const secondaryEl = document.createElement('div');
        secondaryEl.className = 'book-tree-row-secondary';
        secondaryEl.textContent = secondary;
        wrap.appendChild(secondaryEl);
    }
    return wrap;
}

function getBookActCollapseKey(bookId, actNumber) {
    const normalizedBookId = String(bookId || '').trim();
    const normalizedAct = Number.isFinite(Number(actNumber)) ? String(Math.round(Number(actNumber))) : 'unassigned';
    return `${normalizedBookId}::${normalizedAct}`;
}

function buildBookTreeChapterNode(project, book, session, activeSession) {
    const row = document.createElement('div');
    row.className = 'book-tree-row is-chapter';
    row.draggable = true;
    if (activeSession?.id === session.id) row.classList.add('active');
    row.dataset.action = 'worldui:bookChapterOpen';
    row.dataset.bookId = book.id;
    row.dataset.sessionId = session.id;

    const labelWrap = buildBookTreeRowLabel(
        getChapterTreeLabel(session),
        session.name && session.name !== getChapterTreeLabel(session) ? session.name : null
    );
    row.appendChild(labelWrap);

    const rowActions = document.createElement('div');
    rowActions.className = 'book-tree-row-actions';
    const dropdown = createDropdown([
        { label: 'Open Chapter', action: 'worldui:bookChapterOpen', data: { bookId: book.id, sessionId: session.id } },
        { label: 'Chapter Settings...', action: 'worldui:chapterSettingsOpen', data: { sessionId: session.id } },
        { label: 'Move Up', action: 'chapter:moveInBookOrder', data: { sessionId: session.id, direction: 'up' } },
        { label: 'Move Down', action: 'chapter:moveInBookOrder', data: { sessionId: session.id, direction: 'down' } },
        { label: 'Move to Act...', action: 'worldui:chapterMoveToActOpen', data: { sessionId: session.id } },
        { label: 'Remove from Book (Keep Chat)', action: 'chapter:detachFromBook', data: { sessionId: session.id } },
        { label: 'Delete Chapter + Chat', action: 'session:delete', data: { sessionId: session.id }, isDestructive: true }
    ]);
    rowActions.appendChild(dropdown);
    row.appendChild(rowActions);

    return row;
}

function buildBookTreeActNode(project, book, group, activeSession) {
    const block = document.createElement('div');
    block.className = 'book-tree-act-block';
    block.dataset.bookId = book.id;
    const actNumber = Number.isFinite(group?.actNumber) ? group.actNumber : null;
    if (actNumber) block.dataset.actNumber = String(actNumber);
    const actCollapseKey = getBookActCollapseKey(book.id, actNumber);
    const isCollapsed = bookSidebarUIState.collapsedActKeys.has(actCollapseKey);
    if (isCollapsed) block.classList.add('is-collapsed');
    block.dataset.actCollapseKey = actCollapseKey;

    const row = document.createElement('div');
    row.className = 'book-tree-row is-act';
    const actTitle = String(group?.title || group?.label || 'Act').trim() || 'Act';
    const defaultActLabel = actNumber ? `Act ${actNumber}` : 'Unassigned';
    const primary = actTitle && actTitle !== defaultActLabel ? actTitle : defaultActLabel;
    const secondary = actTitle && actTitle !== defaultActLabel ? defaultActLabel : null;
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'book-tree-collapse-toggle is-act-toggle';
    collapseBtn.dataset.action = 'worldui:actToggleOpen';
    collapseBtn.dataset.bookId = book.id;
    if (actNumber) collapseBtn.dataset.actNumber = String(actNumber);
    collapseBtn.dataset.open = isCollapsed ? 'true' : 'false';
    collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
    collapseBtn.setAttribute('aria-label', isCollapsed ? `Expand ${defaultActLabel}` : `Collapse ${defaultActLabel}`);
    collapseBtn.title = isCollapsed ? `Expand ${defaultActLabel}` : `Collapse ${defaultActLabel}`;
    collapseBtn.innerHTML = `<span aria-hidden="true">${isCollapsed ? '▸' : '▾'}</span>`;
    row.appendChild(collapseBtn);
    row.appendChild(buildBookTreeRowLabel(primary, { secondary }));

    const rowActions = document.createElement('div');
    rowActions.className = 'book-tree-row-actions';
    const options = [
        { label: isCollapsed ? 'Expand Act' : 'Collapse Act', action: 'worldui:actToggleOpen', data: { bookId: book.id, actNumber, open: isCollapsed } }
    ];
    if (actNumber) {
        options.push(
            { label: 'New Chapter in Act', action: 'worldui:bookChapterCreate', data: { bookId: book.id, actNumber } },
            { label: 'Act Settings...', action: 'worldui:actSettingsOpen', data: { bookId: book.id, actNumber } }
        );
    }
    if (options.length > 0) {
        rowActions.appendChild(createDropdown(options));
        row.appendChild(rowActions);
    }
    block.appendChild(row);

    const children = document.createElement('div');
    children.className = 'book-tree-children';
    (group.sessions || []).forEach(session => {
        children.appendChild(buildBookTreeChapterNode(project, book, session, activeSession));
    });
    block.appendChild(children);
    return block;
}

function buildBookTreeBookNode(project, book, activeSession) {
    const block = document.createElement('div');
    block.className = 'book-tree-book-block';
    if (project.activeBookId === book.id) block.classList.add('is-active-book');
    const isCollapsed = bookSidebarUIState.collapsedBookIds.has(book.id);
    if (isCollapsed) block.classList.add('is-collapsed');
    block.dataset.bookId = book.id;

    const row = document.createElement('div');
    row.className = 'book-tree-row is-book';
    if (project.activeBookId === book.id) row.classList.add('active');
    row.dataset.action = 'worldui:bookOpenWorkspace';
    row.dataset.bookId = book.id;

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'book-tree-collapse-toggle';
    collapseBtn.dataset.action = 'worldui:bookToggleOpen';
    collapseBtn.dataset.bookId = book.id;
    collapseBtn.dataset.open = isCollapsed ? 'true' : 'false';
    collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
    collapseBtn.setAttribute('aria-label', isCollapsed ? 'Expand Book' : 'Collapse Book');
    collapseBtn.title = isCollapsed ? 'Expand Book' : 'Collapse Book';
    collapseBtn.innerHTML = `<span aria-hidden="true">${isCollapsed ? '▸' : '▾'}</span>`;
    row.appendChild(collapseBtn);

    const world = getWorldById(project, book.linkedWorldId);
    const chapterCount = countBookChapters(project, book);
    row.appendChild(buildBookTreeRowLabel(
        book.name || 'Untitled Book',
        [world ? `World: ${world.name}` : null, `${chapterCount} chapter${chapterCount === 1 ? '' : 's'}`].filter(Boolean).join(' • ')
    ));

    const rowActions = document.createElement('div');
    rowActions.className = 'book-tree-row-actions';
    const agentQuickBtn = document.createElement('button');
    agentQuickBtn.type = 'button';
    agentQuickBtn.className = 'btn-icon book-tree-quick-agent-btn';
    agentQuickBtn.dataset.action = 'worldui:bookAgentOpen';
    agentQuickBtn.dataset.bookId = book.id;
    agentQuickBtn.title = 'Open Book Agent';
    agentQuickBtn.setAttribute('aria-label', 'Open Book Agent');
    agentQuickBtn.textContent = 'AI';
    rowActions.appendChild(agentQuickBtn);
    const dropdown = createDropdown([
        { label: 'Open Book Workspace', action: 'worldui:bookOpenWorkspace', data: { bookId: book.id, tab: 'overview' } },
        { label: 'Open Book Agent', action: 'worldui:bookAgentOpen', data: { bookId: book.id } },
        { label: isCollapsed ? 'Expand Book' : 'Collapse Book', action: 'worldui:bookToggleOpen', data: { bookId: book.id, open: isCollapsed } },
        { label: 'Book Settings...', action: 'worldui:bookSettingsOpen', data: { bookId: book.id } },
        { label: 'New Chapter', action: 'worldui:bookChapterCreate', data: { bookId: book.id } },
        { label: 'New Act...', action: 'worldui:bookActCreate', data: { bookId: book.id } },
        { label: 'Re-number Chapters', action: 'book:renumberChapters', data: { bookId: book.id } },
        { label: 'Set Active', action: 'book:setActive', data: { bookId: book.id } },
        { label: 'Import Current Chat as Chapter', action: 'chapter:assignToBook', data: { bookId: book.id } },
        { label: 'Delete Book', action: 'book:delete', data: { bookId: book.id }, isDestructive: true }
    ]);
    rowActions.appendChild(dropdown);
    row.appendChild(rowActions);
    block.appendChild(row);

    const groups = groupBookChaptersByAct(project, book);
    const children = document.createElement('div');
    children.className = 'book-tree-children is-book-root';

    if (groups.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'book-tree-empty';
        empty.innerHTML = `
            <div>No chapters in this Book yet.</div>
            <div class="book-tree-empty-actions">
                <button type="button" class="btn btn-small" data-action="worldui:bookChapterCreate" data-book-id="${book.id}">New Chapter</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="chapter:assignToBook" data-book-id="${book.id}">Import Current Chat</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookActCreate" data-book-id="${book.id}">New Act</button>
            </div>
        `;
        children.appendChild(empty);
    } else {
        groups.forEach(group => {
            children.appendChild(buildBookTreeActNode(project, book, group, activeSession));
        });
    }

    block.appendChild(children);
    return block;
}

function renderBookSidebarModal() {
    const modal = ensureBookSidebarModalSurface();
    const titleEl = modal?.querySelector('#book-sidebar-settings-modal-title');
    const metaEl = modal?.querySelector('#book-sidebar-settings-modal-meta');
    const bodyEl = modal?.querySelector('#book-sidebar-settings-modal-body');
    if (!modal || !titleEl || !metaEl || !bodyEl) return;

    const modalState = bookSidebarUIState.modal;
    const project = stateManager.getProject();
    if (!modalState || !project) {
        modal.style.display = 'none';
        bodyEl.innerHTML = '';
        metaEl.textContent = '';
        return;
    }

    ensureWorldStudioState(project);
    bodyEl.innerHTML = '';

    if (modalState.type === 'book-create') {
        titleEl.textContent = 'Create Book';
        metaEl.textContent = 'Set up the book and optionally link it to a World.';
        bodyEl.appendChild(buildBookCreateInlineEditor(project));
    } else if (modalState.type === 'book-settings') {
        const book = getBookById(project, modalState.bookId);
        if (!book) {
            titleEl.textContent = 'Book Settings';
            metaEl.textContent = 'Book not found.';
        } else {
            const linkedWorld = getWorldById(project, book.linkedWorldId);
            titleEl.textContent = 'Book Settings';
            metaEl.textContent = [
                book.name || 'Untitled Book',
                linkedWorld ? `World: ${linkedWorld.name}` : 'No linked world',
                `${countBookChapters(project, book)} chapter${countBookChapters(project, book) === 1 ? '' : 's'}`
            ].join(' • ');

            const quick = document.createElement('div');
            quick.className = 'world-book-settings-modal-quick-actions';
            quick.innerHTML = `
                <button type="button" class="btn btn-small btn-secondary" data-action="book:setActive" data-book-id="${book.id}">Set Active</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookChapterCreate" data-book-id="${book.id}">New Chapter</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookActCreate" data-book-id="${book.id}">New Act</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="chapter:assignToBook" data-book-id="${book.id}">Import Current Chat</button>
            `;
            bodyEl.appendChild(quick);
            bodyEl.appendChild(buildBookInlineEditor(project, book));
        }
    } else if (modalState.type === 'act-settings') {
        const book = getBookById(project, modalState.bookId);
        const actNumber = Number.isFinite(Number(modalState.actNumber)) ? Math.round(Number(modalState.actNumber)) : null;
        const actDef = book && actNumber ? getBookActDefinition(book, actNumber) : null;
        titleEl.textContent = 'Act Settings';
        metaEl.textContent = [
            book?.name || null,
            actNumber ? `Act ${actNumber}` : null
        ].filter(Boolean).join(' • ') || 'Act settings';

        if (!book || !actNumber) {
            const note = document.createElement('div');
            note.className = 'studio-world-inline-note';
            note.textContent = 'Act not found.';
            bodyEl.appendChild(note);
        } else {
            const quick = document.createElement('div');
            quick.className = 'world-book-settings-modal-quick-actions';
            quick.innerHTML = `
                <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookChapterCreate" data-book-id="${book.id}" data-act-number="${actNumber}">New Chapter in Act</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookSettingsOpen" data-book-id="${book.id}">Back to Book Settings</button>
            `;
            bodyEl.appendChild(quick);
            bodyEl.appendChild(buildActSettingsInlineEditor(book, actNumber, actDef));
        }
    } else if (modalState.type === 'chapter-settings') {
        const session = getSessionById(project, modalState.sessionId);
        const book = session?.bookId ? getBookById(project, session.bookId) : null;
        titleEl.textContent = 'Chapter Settings';
        metaEl.textContent = [
            book ? book.name : null,
            session?.name || null
        ].filter(Boolean).join(' • ') || 'Chapter settings';
        if (!session) {
            const note = document.createElement('div');
            note.className = 'studio-world-inline-note';
            note.textContent = 'Chapter session not found.';
            bodyEl.appendChild(note);
        } else {
            const openBtn = document.createElement('div');
            openBtn.className = 'world-book-settings-modal-quick-actions';
            openBtn.innerHTML = `<button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookChapterOpen" data-session-id="${session.id}" ${book ? `data-book-id="${book.id}"` : ''}>Open Chapter Chat</button>`;
            bodyEl.appendChild(openBtn);
            bodyEl.appendChild(buildChapterMetaInlineEditor(session));
        }
    } else if (modalState.type === 'chapter-move-act') {
        const session = getSessionById(project, modalState.sessionId);
        const book = session?.bookId ? getBookById(project, session.bookId) : null;
        titleEl.textContent = 'Move Chapter to Act';
        metaEl.textContent = [
            book?.name || null,
            session ? getChapterTreeLabel(session) : null
        ].filter(Boolean).join(' • ') || 'Move chapter';

        if (!session || !book) {
            const note = document.createElement('div');
            note.className = 'studio-world-inline-note';
            note.textContent = 'Chapter or Book not found.';
            bodyEl.appendChild(note);
        } else {
            bodyEl.appendChild(buildChapterMoveToActInlineEditor(project, session));
        }
    } else {
        titleEl.textContent = 'Book Settings';
        metaEl.textContent = '';
    }

    modal.style.display = 'flex';
}

function buildActiveChatBookCard(project, activeSession) {
    const card = document.createElement('div');
    card.className = 'studio-world-focus-card';

    const title = document.createElement('div');
    title.className = 'studio-world-focus-title';
    title.textContent = 'Current Chat (Book Context)';

    const sessionName = document.createElement('div');
    sessionName.className = 'studio-world-focus-meta';
    sessionName.textContent = activeSession?.name || 'No active chat';

    const controls = document.createElement('div');
    controls.className = 'studio-world-focus-actions';

    if (!activeSession) {
        const note = document.createElement('div');
        note.className = 'studio-world-inline-note';
        note.textContent = 'Open a chat session to attach it to a Book chapter.';
        card.append(title, sessionName, note);
        return card;
    }

    const linkedBook = activeSession.bookId ? getBookById(project, activeSession.bookId) : null;
    const linkedText = document.createElement('div');
    linkedText.className = 'studio-world-focus-meta';
    if (linkedBook) {
        const chapterBits = [];
        if (activeSession.actNumber) chapterBits.push(`Act ${activeSession.actNumber}`);
        if (activeSession.chapterNumber) chapterBits.push(`Chapter ${activeSession.chapterNumber}`);
        linkedText.textContent = `Linked to ${linkedBook.name}${chapterBits.length ? ` • ${chapterBits.join(' / ')}` : ''}`;
    } else {
        linkedText.textContent = 'This chat is not linked to a Book yet.';
    }

    const assignBtn = document.createElement('button');
    assignBtn.type = 'button';
    assignBtn.className = 'btn btn-small';
    assignBtn.dataset.action = 'chapter:assignToBookPrompt';
    assignBtn.textContent = linkedBook ? 'Reassign to Book' : 'Assign to Book';

    const metaBtn = document.createElement('button');
    metaBtn.type = 'button';
    metaBtn.className = 'btn btn-small btn-secondary';
    metaBtn.dataset.action = worldInlineUIState.editingChapterMetaSessionId === activeSession.id
        ? 'worldui:chapterMetaCancel'
        : 'worldui:chapterMetaEditStart';
    metaBtn.dataset.sessionId = activeSession.id;
    metaBtn.textContent = worldInlineUIState.editingChapterMetaSessionId === activeSession.id
        ? 'Close Meta'
        : 'Chapter Meta';

    const proposeBtn = document.createElement('button');
    proposeBtn.type = 'button';
    proposeBtn.className = 'btn btn-small btn-secondary';
    proposeBtn.dataset.action = 'world:proposeFromCurrentChat';
    proposeBtn.textContent = 'Propose World Updates';

    controls.append(assignBtn, metaBtn, proposeBtn);

    if (linkedBook) {
        const detachBtn = document.createElement('button');
        detachBtn.type = 'button';
        detachBtn.className = 'btn btn-small btn-secondary';
        detachBtn.dataset.action = 'chapter:detachFromBook';
        detachBtn.textContent = 'Detach';
        controls.append(detachBtn);
    }

    const continuityWarnings = buildChapterContinuityWarnings(project, activeSession);

    card.append(title, sessionName, linkedText, controls);
    card.appendChild(buildContinuityWarningsBlock(continuityWarnings));
    if (worldInlineUIState.editingChapterMetaSessionId === activeSession.id) {
        card.appendChild(buildChapterMetaInlineEditor(activeSession));
    }
    return card;
}

function renderBooksSection(assetsContainer, project) {
    ensureProjectWorldBookTreeUIState(project);
    syncBookTreeCollapseStateFromProject(project);

    const activeSession = getActiveSession(project);
    const activeWorld = getWorldById(project, project.activeWorldId);

    const { section, box } = makeSection('📖 Books', {
        sectionClassName: 'book-projects-section',
        createAction: 'worldui:bookCreateStart',
        createTitle: 'Create Book',
        dropdownOptions: [
            { label: 'New Book...', action: 'worldui:bookCreateStart' },
            activeWorld ? { label: 'New Book (link active world)', action: 'worldui:bookCreateStart', data: { linkedWorldId: activeWorld.id } } : null,
            { label: 'Import Current Chat as Chapter...', action: 'chapter:assignToBookPrompt' }
        ].filter(Boolean)
    });
    section.open = true;

    const list = document.createElement('div');
    list.className = 'book-tree-list';
    const books = Array.isArray(project.books) ? project.books : [];
    const validBookIds = new Set(books.map(book => String(book?.id || '')).filter(Boolean));
    let collapseStatePruned = false;
    Array.from(bookSidebarUIState.collapsedBookIds).forEach((bookId) => {
        if (!validBookIds.has(bookId)) {
            bookSidebarUIState.collapsedBookIds.delete(bookId);
            collapseStatePruned = true;
        }
    });
    const validActKeys = new Set();
    books.forEach((book) => {
        const groups = groupBookChaptersByAct(project, book);
        groups.forEach((group) => validActKeys.add(getBookActCollapseKey(book.id, Number.isFinite(group?.actNumber) ? group.actNumber : null)));
    });
    Array.from(bookSidebarUIState.collapsedActKeys).forEach((actKey) => {
        if (!validActKeys.has(actKey)) {
            bookSidebarUIState.collapsedActKeys.delete(actKey);
            collapseStatePruned = true;
        }
    });
    if (collapseStatePruned) {
        const tree = ensureProjectWorldBookTreeUIState(project);
        if (tree) {
            tree.collapsedBookIds = Array.from(bookSidebarUIState.collapsedBookIds).sort();
            tree.collapsedActKeys = Array.from(bookSidebarUIState.collapsedActKeys).sort();
        }
    }

    if (books.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'book-tree-empty';
        empty.innerHTML = `
            <div>No books yet.</div>
            <button type="button" class="btn btn-small" data-action="worldui:bookCreateStart">Create Book</button>
        `;
        list.appendChild(empty);
    } else {
        books.forEach(book => {
            list.appendChild(buildBookTreeBookNode(project, book, activeSession));
        });
    }

    box.appendChild(list);
    assetsContainer.appendChild(section);
}

function buildWorldItemPreviewRow(worldId, item) {
    const row = document.createElement('div');
    row.className = 'item world-entry-item';

    const header = document.createElement('div');
    header.className = 'item-header';

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = `${item.title || 'Untitled'} (${item.type || 'note'})`;
    header.appendChild(name);

    appendItemDropdownToHeader(header, [
        { label: 'Edit Inline', action: 'worldui:itemEditStart', data: { worldId, itemId: item.id } },
        { label: 'Edit...', action: 'world:itemEditPrompt', data: { worldId, itemId: item.id } },
        { label: 'Delete', action: 'world:itemDelete', data: { worldId, itemId: item.id }, isDestructive: true }
    ]);
    row.appendChild(header);

    if (item.summary || item.visibility === 'gated') {
        row.appendChild(createMetaRow([
            item.summary ? String(item.summary).slice(0, 80) : null,
            item.visibility === 'gated' ? `Gated${item.revealGate?.value ? ` @ch${item.revealGate.value}` : ''}` : 'Revealed'
        ]));
    }

    const footer = document.createElement('div');
    footer.className = 'studio-world-item-footer';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-small btn-secondary';
    editBtn.dataset.action = worldInlineUIState.editingWorldItemId === item.id
        ? 'worldui:itemEditCancel'
        : 'worldui:itemEditStart';
    editBtn.dataset.worldId = worldId;
    editBtn.dataset.itemId = item.id;
    editBtn.textContent = worldInlineUIState.editingWorldItemId === item.id ? 'Close Editor' : 'Edit';
    footer.appendChild(editBtn);
    row.appendChild(footer);

    if (worldInlineUIState.editingWorldItemId === item.id) {
        row.appendChild(buildWorldItemInlineEditor(worldId, item));
    }

    return row;
}

function buildWorldPeekPreviewRow(item) {
    const row = document.createElement('div');
    row.className = 'item world-entry-item';

    const header = document.createElement('div');
    header.className = 'item-header';

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = `${item.title || 'Untitled'} (${item.type || 'note'})`;
    header.appendChild(name);
    row.appendChild(header);

    row.appendChild(createMetaRow([
        item.summary ? String(item.summary).slice(0, 90) : null,
        item.visibility === 'gated' ? 'Gated' : 'Visible'
    ]));

    const footer = document.createElement('div');
    footer.className = 'studio-world-item-footer';
    if (item.status) footer.appendChild(createLabelPill(item.status, 'muted'));
    if (Array.isArray(item.tags) && item.tags.length > 0) {
        footer.appendChild(createLabelPill(`#${item.tags[0]}`, 'muted'));
    }
    if (footer.childNodes.length > 0) row.appendChild(footer);

    return row;
}

function buildWorldItemQuickAddToolbar(activeWorld) {
    const toolbar = document.createElement('div');
    toolbar.className = 'studio-world-quick-actions';

    const label = document.createElement('div');
    label.className = 'studio-world-inline-note';
    label.textContent = activeWorld
        ? `Quick add to "${activeWorld.name}"`
        : 'Select or create a World to add canon items.';
    toolbar.appendChild(label);

    const buttonRow = document.createElement('div');
    buttonRow.className = 'studio-world-quick-button-row';
    const quickTypes = [
        ['entity', 'Entity'],
        ['place', 'Place'],
        ['rule', 'Rule'],
        ['event', 'Event'],
        ['note', 'Note']
    ];
    quickTypes.forEach(([type, labelText]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-small btn-secondary';
        btn.textContent = `+ ${labelText}`;
        btn.disabled = !activeWorld;
        btn.dataset.action = 'worldui:itemCreateStart';
        if (activeWorld) {
            btn.dataset.worldId = activeWorld.id;
            btn.dataset.type = type;
        }
        buttonRow.appendChild(btn);
    });
    toolbar.appendChild(buttonRow);
    return toolbar;
}

function buildWorldItem(world, project) {
    const item = document.createElement('div');
    item.className = 'item world-library-item';
    if (project.activeWorldId === world.id) item.classList.add('active');
    item.dataset.action = 'world:setActive';
    item.dataset.worldId = world.id;
    const ownership = getWorldOwnershipMeta(project, world);

    const header = document.createElement('div');
    header.className = 'item-header';

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = world.name || 'Untitled World';
    header.appendChild(name);

    appendItemDropdownToHeader(header, [
        { label: 'Set Active', action: 'world:setActive', data: { worldId: world.id } },
        { label: 'Rename...', action: 'world:renamePrompt', data: { worldId: world.id } },
        { label: 'Add Item...', action: 'worldui:itemCreateStart', data: { worldId: world.id } },
        { label: 'Delete World', action: 'world:delete', data: { worldId: world.id }, isDestructive: true }
    ]);
    item.appendChild(header);

    item.appendChild(createMetaRow([
        `${(world.items || []).length} items`,
        `${countLinkedBooks(project, world.id)} linked books`,
        ownership.mode === 'shared'
            ? `Shared${ownership.ownerBook ? ` (owner: ${ownership.ownerBook.name})` : ''}`
            : (ownership.mode === 'book'
                ? `Book-owned${ownership.ownerBook ? ` (${ownership.ownerBook.name})` : ''}`
                : 'Unassigned')
    ]));

    if (project.activeWorldId === world.id) {
        const footer = document.createElement('div');
        footer.className = 'studio-world-item-footer';
        footer.appendChild(createLabelPill('Active World', 'active'));
        if (ownership.mode === 'shared') {
            footer.appendChild(createLabelPill('Shared World', 'linked'));
        } else if (ownership.mode === 'book') {
            footer.appendChild(createLabelPill('Book World', 'muted'));
        }
        item.appendChild(footer);
    }

    return item;
}

function renderWorldsSection(assetsContainer, project) {
    const activeWorld = getWorldById(project, project.activeWorldId);
    const activeBook = getBookById(project, project.activeBookId);
    const { section, box } = makeSection('🌍 Worlds', {
        sectionClassName: 'world-library-section',
        createAction: null,
        dropdownOptions: [
            { label: 'Create Shared World...', action: 'worldui:worldCreateStart', data: { scope: 'shared' } },
            { label: 'New Item in Active World...', action: 'worldui:itemCreateStart' },
            activeBook ? { label: 'Link Active Book to World...', action: 'book:linkWorldPrompt', data: { bookId: activeBook.id } } : null
        ].filter(Boolean)
    });

    box.appendChild(buildWorldItemQuickAddToolbar(activeWorld));
    if (worldInlineUIState.creatingWorld) {
        box.appendChild(buildWorldCreateInlineEditor(project));
    }
    if (worldInlineUIState.creatingWorldItem) {
        box.appendChild(buildWorldItemCreateInlineEditor(project));
    }

    const worldList = document.createElement('div');
    worldList.className = 'item-list';
    const worlds = Array.isArray(project.worlds) ? project.worlds : [];
    if (worlds.length === 0) {
        worldList.innerHTML = '<p class="no-items-message">No worlds yet. Create a Book from the left (recommended) or use the section menu to create a shared world.</p>';
    } else {
        worlds.forEach(world => {
            worldList.appendChild(buildWorldItem(world, project));
        });
    }
    box.appendChild(worldList);

    const previewWrap = document.createElement('div');
    previewWrap.className = 'studio-world-preview';

    const previewTitle = document.createElement('div');
    previewTitle.className = 'studio-world-focus-title';
    previewTitle.textContent = activeWorld ? `Active World Items: ${activeWorld.name}` : 'Active World Items';
    previewWrap.appendChild(previewTitle);

    const previewList = document.createElement('div');
    previewList.className = 'item-list';
    if (!activeWorld) {
        previewList.innerHTML = '<p class="no-items-message">Select a world to inspect its items.</p>';
    } else if (!Array.isArray(activeWorld.items) || activeWorld.items.length === 0) {
        previewList.innerHTML = '<p class="no-items-message">No items yet in this world.</p>';
    } else {
        const sortedItems = [...activeWorld.items]
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .slice(0, 8);
        sortedItems.forEach(item => {
            previewList.appendChild(buildWorldItemPreviewRow(activeWorld.id, item));
        });
        if (activeWorld.items.length > sortedItems.length) {
            const note = document.createElement('p');
            note.className = 'no-items-message';
            note.textContent = `Showing ${sortedItems.length} of ${activeWorld.items.length} items (most recently updated).`;
            previewList.appendChild(note);
        }
    }
    previewWrap.appendChild(previewList);
    box.appendChild(previewWrap);

    assetsContainer.appendChild(section);
}

function buildWorldPeekSummaryCard(project, activeSession, contextPack) {
    const card = document.createElement('div');
    card.className = 'studio-world-focus-card';

    const title = document.createElement('div');
    title.className = 'studio-world-focus-title';
    title.textContent = 'World Peek';

    const meta = document.createElement('div');
    meta.className = 'studio-world-focus-meta';

    if (!activeSession) {
        meta.textContent = 'Open a chat session to preview chapter-aware world context.';
        card.append(title, meta);
        return card;
    }

    if (!contextPack?.enabled) {
        const fallbackBits = [
            activeSession.bookId ? 'Book linked' : 'No Book link',
            activeSession.chapterNumber ? `Chapter ${activeSession.chapterNumber}` : 'No chapter number'
        ];
        meta.textContent = `${fallbackBits.join(' • ')} • World context unavailable`;
        card.append(title, meta);
        return card;
    }

    const diagnostics = contextPack.diagnostics || {};
    const access = contextPack.access || {};
    const parts = [
        contextPack.book?.name ? `Book: ${contextPack.book.name}` : null,
        contextPack.world?.name ? `World: ${contextPack.world.name}` : null,
        access.mode ? `Mode: ${access.mode}` : null,
        Number.isFinite(access.asOfChapter) ? `As-of Ch.${access.asOfChapter}` : null,
        `${diagnostics.selectedItemCount || 0} selected`,
        `${diagnostics.hiddenItemCount || 0} gated hidden`
    ].filter(Boolean);
    meta.textContent = parts.join(' • ');

    const actions = document.createElement('div');
    actions.className = 'studio-world-focus-actions';

    const openWorldBtn = document.createElement('button');
    openWorldBtn.type = 'button';
    openWorldBtn.className = 'btn btn-small btn-secondary';
    openWorldBtn.dataset.action = 'ui:openWorldWorkspace';
    openWorldBtn.textContent = 'Open World';

    const proposeBtn = document.createElement('button');
    proposeBtn.type = 'button';
    proposeBtn.className = 'btn btn-small btn-secondary';
    proposeBtn.dataset.action = 'world:proposeFromCurrentChat';
    proposeBtn.textContent = 'Propose Updates';

    actions.append(openWorldBtn, proposeBtn);
    card.append(title, meta, actions);
    return card;
}

function renderWorldPeekSection(assetsContainer, project) {
    if (!assetsContainer || !project) return;
    ensureWorldStudioState(project);

    const activeSession = getActiveSession(project);
    const contextPack = activeSession
        ? buildWorldStructuredContextPack(project, activeSession, {
            queryText: getRecentSessionPlainText(activeSession, { maxMessages: 8 }),
            maxItems: 6
        })
        : null;

    const { section, box } = makeSection('🧭 World Peek', {
        sectionClassName: 'world-peek-section'
    });
    section.open = true;

    box.appendChild(buildWorldPeekSummaryCard(project, activeSession, contextPack));

    if (activeSession) {
        box.appendChild(buildContinuityWarningsBlock(buildChapterContinuityWarnings(project, activeSession)));
    }

    const list = document.createElement('div');
    list.className = 'item-list';

    if (!activeSession) {
        list.innerHTML = '<p class="no-items-message">Open a chat session to preview selected world context.</p>';
    } else if (!contextPack?.enabled) {
        const reasonNote = document.createElement('p');
        reasonNote.className = 'no-items-message';
        const reason = String(contextPack?.reason || 'no_world');
        if (reason === 'no_world') {
            reasonNote.textContent = 'No linked World found for the current chat/book.';
        } else if (reason === 'no_book') {
            reasonNote.textContent = 'Current chat is not linked to a Book yet.';
        } else {
            reasonNote.textContent = `World context unavailable (${reason}).`;
        }
        list.appendChild(reasonNote);
    } else if (!Array.isArray(contextPack.selectedItems) || contextPack.selectedItems.length === 0) {
        list.innerHTML = '<p class="no-items-message">No visible world items selected for the current prompt scope.</p>';
    } else {
        contextPack.selectedItems.slice(0, 6).forEach(item => {
            list.appendChild(buildWorldPeekPreviewRow(item));
        });
    }

    box.appendChild(list);
    assetsContainer.appendChild(section);
}

function buildWorldChangeItem(project, change) {
    const item = document.createElement('div');
    item.className = 'item world-change-item';
    item.dataset.changeId = change.id;

    const status = String(change.status || 'pending').toLowerCase();
    if (status === 'pending') item.classList.add('is-pending');

    const world = getWorldById(project, change.worldId);
    const book = getBookById(project, change.bookId);
    const chapterSession = getSessionById(project, change.chapterSessionId);

    const header = document.createElement('div');
    header.className = 'item-header';

    const name = document.createElement('div');
    name.className = 'item-name';
    name.textContent = getChangeSummaryLine(change);
    header.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    if (status === 'pending') {
        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'btn btn-small';
        approveBtn.dataset.action = 'world:changeReview';
        approveBtn.dataset.status = 'approved';
        approveBtn.textContent = 'Approve';

        const rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'btn btn-small btn-secondary';
        rejectBtn.dataset.action = 'world:changeReview';
        rejectBtn.dataset.status = 'rejected';
        rejectBtn.textContent = 'Reject';

        actions.append(approveBtn, rejectBtn);
    }

    if (status === 'pending') {
        const dropdown = createDropdown([
            { label: 'Approve', action: 'world:changeReview', data: { changeId: change.id, status: 'approved' } },
            { label: 'Reject', action: 'world:changeReview', data: { changeId: change.id, status: 'rejected' } }
        ]);
        actions.appendChild(dropdown);
    }
    header.appendChild(actions);
    item.appendChild(header);

    const metaParts = [
        world ? `World: ${world.name}` : (change.worldId ? `World: ${change.worldId}` : null),
        book ? `Book: ${book.name}` : null,
        chapterSession ? `Chat: ${chapterSession.name}` : null,
        formatRelativeTimestamp(change.createdAt)
    ];
    item.appendChild(createMetaRow(metaParts));

    const footer = document.createElement('div');
    footer.className = 'studio-world-item-footer';
    const statusTone = status === 'approved'
        ? 'active'
        : (status === 'rejected' ? 'danger' : (status === 'edited' ? 'linked' : 'pending'));
    footer.appendChild(createLabelPill(formatChangeStatusLabel(status), statusTone));
    footer.appendChild(createLabelPill(formatProposalTypeLabel(change.proposalType), 'muted'));
    if (Array.isArray(change.evidenceRefs) && change.evidenceRefs.length > 0) {
        footer.appendChild(createLabelPill(`${change.evidenceRefs.length} evidence`, 'muted'));
    }
    item.appendChild(footer);

    if (change.reason) {
        const reason = document.createElement('div');
        reason.className = 'studio-world-inline-note studio-world-change-reason';
        reason.textContent = change.reason;
        item.appendChild(reason);
    }

    appendProposalDiffBlock(item, change);

    return item;
}

function renderWorldChangesSection(assetsContainer, project) {
    const { section, box } = makeSection('🧾 World Changes', {
        sectionClassName: 'world-changes-section'
    });

    const changes = Array.isArray(project.worldChanges) ? project.worldChanges : [];
    const pending = changes.filter(change => String(change.status || 'pending') === 'pending');
    const reviewed = changes.filter(change => String(change.status || 'pending') !== 'pending');

    const summary = document.createElement('div');
    summary.className = 'studio-world-focus-card';
    summary.innerHTML = `
        <div class="studio-world-focus-title">Review Queue</div>
        <div class="studio-world-focus-meta">${pending.length} pending • ${reviewed.length} reviewed</div>
    `;
    box.appendChild(summary);

    const pendingList = document.createElement('div');
    pendingList.className = 'item-list';
    if (pending.length === 0) {
        pendingList.innerHTML = '<p class="no-items-message">No pending world changes.</p>';
    } else {
        pending.slice(0, 12).forEach(change => {
            pendingList.appendChild(buildWorldChangeItem(project, change));
        });
        if (pending.length > 12) {
            const note = document.createElement('p');
            note.className = 'no-items-message';
            note.textContent = `Showing 12 of ${pending.length} pending proposals.`;
            pendingList.appendChild(note);
        }
    }
    box.appendChild(pendingList);

    if (reviewed.length > 0) {
        const reviewedBlock = document.createElement('details');
        reviewedBlock.className = 'studio-world-reviewed-block';
        reviewedBlock.open = false;

        const reviewedSummary = document.createElement('summary');
        reviewedSummary.textContent = `Recent Reviewed (${Math.min(reviewed.length, 8)})`;
        reviewedBlock.appendChild(reviewedSummary);

        const reviewedList = document.createElement('div');
        reviewedList.className = 'item-list';
        reviewed.slice(0, 8).forEach(change => {
            reviewedList.appendChild(buildWorldChangeItem(project, change));
        });
        reviewedBlock.appendChild(reviewedList);
        box.appendChild(reviewedBlock);
    }

    assetsContainer.appendChild(section);
}

function estimateSessionWordCount(session) {
    const composerText = typeof session?.composerContent === 'string' ? session.composerContent.trim() : '';
    const source = composerText || (Array.isArray(session?.history)
        ? session.history
            .map((message) => {
                const content = message?.content;
                if (typeof content === 'string') return content;
                if (Array.isArray(content)) {
                    return content
                        .filter(part => part?.type === 'text')
                        .map(part => part.text || '')
                        .join(' ');
                }
                return '';
            })
            .join(' ')
            .trim()
        : '');
    if (!source) return 0;
    return source.split(/\s+/).filter(Boolean).length;
}

function formatWordCountLabel(count) {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.round(Number(count))) : 0;
    return `${safeCount.toLocaleString()} word${safeCount === 1 ? '' : 's'}`;
}

function buildBookOverviewChapterCard(project, book, session, activeSession) {
    const card = document.createElement('div');
    card.className = 'book-overview-chapter-card';
    if (activeSession?.id === session.id) card.classList.add('is-active');
    card.dataset.sessionId = session.id;
    card.dataset.bookId = book.id;

    const header = document.createElement('div');
    header.className = 'book-overview-chapter-card-header';

    const titleWrap = document.createElement('button');
    titleWrap.type = 'button';
    titleWrap.className = 'book-overview-chapter-open';
    titleWrap.dataset.action = 'worldui:bookChapterOpen';
    titleWrap.dataset.sessionId = session.id;
    titleWrap.dataset.bookId = book.id;
    titleWrap.innerHTML = `
        <div class="book-overview-chapter-kicker">${formatWordCountLabel(estimateSessionWordCount(session))}</div>
        <div class="book-overview-chapter-title">${getChapterTreeLabel(session)}</div>
    `;
    header.appendChild(titleWrap);

    const headerActions = document.createElement('div');
    headerActions.className = 'book-overview-chapter-actions';
    headerActions.appendChild(createDropdown([
        { label: 'Open Chapter', action: 'worldui:bookChapterOpen', data: { sessionId: session.id, bookId: book.id } },
        { label: 'Chapter Settings...', action: 'worldui:chapterSettingsOpen', data: { sessionId: session.id } },
        { label: 'Summarize Bubble from Chat', action: 'chapter:summarizeOverview', data: { sessionId: session.id, source: 'chat' } },
        { label: 'Summarize Bubble from Composer', action: 'chapter:summarizeOverview', data: { sessionId: session.id, source: 'composer' } }
    ]));
    header.appendChild(headerActions);
    card.appendChild(header);

    const summaryWrap = document.createElement('div');
    summaryWrap.className = 'book-overview-chapter-summary';
    const isSummaryRunning = chapterOverviewSummaryUIState.activeSessionIds.has(String(session?.id || ''));
    const chapterSummaryText = String(session?.chapterSummary || '').trim();
    const chapterSummaryMeta = (session?.chapterSummaryMeta && typeof session.chapterSummaryMeta === 'object')
        ? session.chapterSummaryMeta
        : null;
    if (chapterSummaryText && chapterSummaryMeta?.source) {
        const badgeRow = document.createElement('div');
        badgeRow.className = 'book-overview-chapter-summary-badges';
        const sourceBadge = createLabelPill(
            chapterSummaryMeta.source === 'composer' ? 'Summary: Composer' : 'Summary: Chat',
            chapterSummaryMeta.source === 'composer' ? 'linked' : 'muted'
        );
        const presetName = String(chapterSummaryMeta?.presetName || '').trim();
        const updatedAt = Number(chapterSummaryMeta?.updatedAt);
        const tooltipParts = [];
        if (presetName) tooltipParts.push(`Preset: ${presetName}`);
        if (Number.isFinite(updatedAt) && updatedAt > 0) tooltipParts.push(`Updated: ${new Date(updatedAt).toLocaleString()}`);
        if (tooltipParts.length > 0) {
            sourceBadge.title = tooltipParts.join(' • ');
        }
        badgeRow.appendChild(sourceBadge);
        summaryWrap.appendChild(badgeRow);
    }
    if (isSummaryRunning) {
        const progressRow = document.createElement('div');
        progressRow.className = 'book-overview-chapter-summary-badges';
        progressRow.appendChild(createLabelPill('Summarizing…', 'linked'));
        summaryWrap.appendChild(progressRow);
    }
    const summaryText = document.createElement('div');
    summaryText.className = 'book-overview-chapter-summary-text';
    summaryText.textContent = chapterSummaryText || 'No chapter summary yet.';
    summaryWrap.appendChild(summaryText);
    card.appendChild(summaryWrap);

    const meta = document.createElement('div');
    meta.className = 'book-overview-chapter-meta';
    const chips = [];
    if (Number.isFinite(Number(session?.chapterNumber))) {
        chips.push(createLabelPill(`Chapter ${Math.round(Number(session.chapterNumber))}`, 'muted'));
    }
    if (session?.writingMode) {
        chips.push(createLabelPill(`Mode: ${session.writingMode}`, session.writingMode === 'author' ? 'linked' : 'muted'));
    }
    if (Number.isFinite(Number(session?.revealScope?.asOfChapter))) {
        chips.push(createLabelPill(`Reveal as-of Ch. ${Math.round(Number(session.revealScope.asOfChapter))}`, 'muted'));
    }
    chips.forEach(chip => meta.appendChild(chip));
    if (chips.length > 0) card.appendChild(meta);

    return card;
}

function buildBookOverviewActColumn(project, book, group, activeSession) {
    const column = document.createElement('section');
    column.className = 'book-overview-act-column';
    column.dataset.bookId = book.id;
    if (Number.isFinite(group?.actNumber)) column.dataset.actNumber = String(group.actNumber);

    const heading = document.createElement('div');
    heading.className = 'book-overview-act-heading';
    const actLabel = Number.isFinite(group?.actNumber) ? `Act ${group.actNumber}` : 'Unassigned';
    const actTitle = String(group?.title || '').trim();
    const primary = document.createElement('div');
    primary.className = 'book-overview-act-title';
    primary.textContent = actTitle && actTitle !== actLabel ? actTitle : actLabel;
    heading.appendChild(primary);
    const secondary = document.createElement('div');
    secondary.className = 'book-overview-act-meta';
    const totalWords = (group.sessions || []).reduce((sum, session) => sum + estimateSessionWordCount(session), 0);
    secondary.textContent = [
        actTitle && actTitle !== actLabel ? actLabel : null,
        `${(group.sessions || []).length} chapter${(group.sessions || []).length === 1 ? '' : 's'}`,
        formatWordCountLabel(totalWords)
    ].filter(Boolean).join(' • ');
    heading.appendChild(secondary);
    column.appendChild(heading);

    const chapterList = document.createElement('div');
    chapterList.className = 'book-overview-chapter-list';
    (group.sessions || []).forEach((session) => {
        chapterList.appendChild(buildBookOverviewChapterCard(project, book, session, activeSession));
    });
    if ((group.sessions || []).length === 0) {
        const empty = document.createElement('div');
        empty.className = 'book-overview-empty';
        empty.textContent = 'No chapters in this Act yet.';
        chapterList.appendChild(empty);
    }
    column.appendChild(chapterList);
    return column;
}

function buildBookOverviewTab(project, book) {
    const wrap = document.createElement('div');
    wrap.className = 'book-workspace-pane';

    const activeSession = getActiveSession(project);
    const groups = groupBookChaptersByAct(project, book);
    const totalChapters = groups.reduce((sum, group) => sum + (Array.isArray(group?.sessions) ? group.sessions.length : 0), 0);
    const missingSummaryCount = groups.reduce((sum, group) => {
        const sessions = Array.isArray(group?.sessions) ? group.sessions : [];
        return sum + sessions.filter((session) => !String(session?.chapterSummary || '').trim()).length;
    }, 0);
    const toolbar = document.createElement('div');
    toolbar.className = 'book-overview-toolbar';
    const toolbarMeta = document.createElement('div');
    toolbarMeta.className = 'book-overview-toolbar-meta';
    toolbarMeta.textContent = `${totalChapters} chapter${totalChapters === 1 ? '' : 's'} • ${missingSummaryCount} missing summaries`;
    toolbar.appendChild(toolbarMeta);
    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'book-overview-toolbar-actions';
    const activeBatch = chapterOverviewSummaryUIState.batchByBookId.get(book.id) || null;
    const isBatchRunning = Boolean(activeBatch);
    const activeBatchSource = activeBatch?.source === 'chat' ? 'chat' : 'composer';
    const summarizeBtn = document.createElement('button');
    summarizeBtn.type = 'button';
    summarizeBtn.className = 'btn btn-small';
    summarizeBtn.dataset.action = 'book:summarizeMissingOverview';
    summarizeBtn.dataset.bookId = book.id;
    summarizeBtn.dataset.source = 'composer';
    summarizeBtn.textContent = isBatchRunning && activeBatchSource === 'composer'
        ? 'Summarizing...'
        : 'Summarize Missing (Composer)';
    if (missingSummaryCount === 0 || isBatchRunning) {
        summarizeBtn.disabled = true;
        summarizeBtn.title = missingSummaryCount === 0
            ? 'All chapters already have summary bubbles.'
            : 'A batch summarize job is currently running.';
    }
    toolbarActions.appendChild(summarizeBtn);
    const summarizeChatBtn = document.createElement('button');
    summarizeChatBtn.type = 'button';
    summarizeChatBtn.className = 'btn btn-small btn-secondary';
    summarizeChatBtn.dataset.action = 'book:summarizeMissingOverview';
    summarizeChatBtn.dataset.bookId = book.id;
    summarizeChatBtn.dataset.source = 'chat';
    summarizeChatBtn.textContent = isBatchRunning && activeBatchSource === 'chat'
        ? 'Summarizing...'
        : 'Summarize Missing (Chat)';
    if (missingSummaryCount === 0 || isBatchRunning) {
        summarizeChatBtn.disabled = true;
        summarizeChatBtn.title = missingSummaryCount === 0
            ? 'All chapters already have summary bubbles.'
            : 'A batch summarize job is currently running.';
    }
    toolbarActions.appendChild(summarizeChatBtn);
    toolbar.appendChild(toolbarActions);
    wrap.appendChild(toolbar);

    const board = document.createElement('div');
    board.className = 'book-overview-board';
    if (groups.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'book-overview-empty large';
        empty.innerHTML = `
            <div>No chapters yet in this Book.</div>
            <div class="book-tree-empty-actions">
                <button type="button" class="btn btn-small" data-action="worldui:bookChapterCreate" data-book-id="${book.id}">New Chapter</button>
            </div>
        `;
        board.appendChild(empty);
    } else {
        groups.forEach((group) => board.appendChild(buildBookOverviewActColumn(project, book, group, activeSession)));
    }
    wrap.appendChild(board);
    return wrap;
}

function buildBookAgentTab(project, book) {
    const wrap = document.createElement('div');
    wrap.className = 'book-workspace-pane';
    const assignedAgentPresetName = getBookAgentPresetName(project, book);
    const activeSidebarAgentName = getActiveSidebarAgentPresetName(project);
    const agentPresetNames = getAllAgentPresetNames(project);
    const bookAgentPromptOverride = String(book?.bookAgentConfig?.systemPromptOverride || '');
    const card = document.createElement('div');
    card.className = 'studio-world-focus-card';
    const agentSession = book?.bookAgentSessionId ? getSessionById(project, book.bookAgentSessionId) : null;
    const messageCount = Array.isArray(agentSession?.history) ? agentSession.history.length : 0;
    card.innerHTML = `
        <div class="studio-world-focus-title">Book Agent</div>
        <div class="studio-world-focus-meta">
            ${agentSession
                ? `${agentSession.name || 'Book Agent'} • ${messageCount} message${messageCount === 1 ? '' : 's'}`
                : 'No Book Agent chat yet for this book'}
        </div>
    `;
    const actions = document.createElement('div');
    actions.className = 'studio-world-focus-actions';
    actions.innerHTML = `
        <button type="button" class="btn btn-small" data-action="worldui:bookAgentOpen" data-book-id="${book.id}" ${assignedAgentPresetName ? '' : 'disabled'}>${agentSession ? 'Open Book Agent Chat' : 'Create & Open Book Agent'}</button>
    `;
    card.appendChild(actions);
    wrap.appendChild(card);

    const setup = document.createElement('div');
    setup.className = 'studio-world-inline-editor';
    setup.dataset.rowActionShield = 'true';
    setup.dataset.bookId = book.id;
    setup.innerHTML = `
        <div class="book-composer-active-doc-header">
            <div class="book-composer-active-doc-title">Book Agent Preset</div>
            <div class="book-composer-active-doc-meta">${assignedAgentPresetName ? `Bound to Agent preset: ${assignedAgentPresetName}` : 'Select which Agent preset this Book Agent chat should use.'}</div>
        </div>
    `;
    const setupGrid = document.createElement('div');
    setupGrid.className = 'studio-world-inline-grid is-compact';
    setupGrid.appendChild(createInlineField('Agent preset', createInlineSelect({
        name: 'bookAgentPresetName',
        value: assignedAgentPresetName || activeSidebarAgentName || '',
        options: [
            { value: '', label: agentPresetNames.length > 0 ? 'Select agent preset…' : 'No agent presets available' },
            ...agentPresetNames.map(name => ({ value: name, label: name }))
        ]
    })));
    setupGrid.appendChild(createInlineField('Book Agent prompt override', createInlineTextarea({
        name: 'bookAgentSystemPromptOverride',
        value: bookAgentPromptOverride,
        rows: 4,
        placeholder: 'Optional extra system prompt for this Book Agent only (kept on top of the selected Agent preset).'
    })));
    setup.appendChild(setupGrid);
    setup.appendChild(createInlineEditorActions({
        saveAction: 'worldui:bookAgentConfigSave',
        cancelAction: 'worldui:bookAgentTabRefresh',
        cancelLabel: 'Reset',
        dataset: { bookId: book.id, tab: 'agent' }
    }));
    const setupActions = document.createElement('div');
    setupActions.className = 'studio-world-focus-actions';
    setupActions.innerHTML = `
        <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookAgentBindCurrentAgent" data-book-id="${book.id}">Use Selected Agent Preset</button>
    `;
    setup.appendChild(setupActions);
    wrap.appendChild(setup);

    const note = document.createElement('div');
    note.className = 'studio-world-inline-note';
    note.textContent = 'Use Book Agent to brainstorm the whole project. Runtime prompt = Agent preset system prompt + optional Book Agent override above.';
    wrap.appendChild(note);
    return wrap;
}

function buildBookComposerTab(project, book) {
    const wrap = document.createElement('div');
    wrap.className = 'book-workspace-pane';
    const docs = book?.composerDocs || {};
    const exportProfile = book?.exportProfile || {};
    const activeDocKey = getBookComposerActiveDocKey(book.id);
    const docDefs = [
        { key: 'treatment', label: 'Treatment', placeholder: 'High-level treatment of the book.' },
        { key: 'synopsis', label: 'Synopsis', placeholder: 'Concise story summary / pitch.' },
        { key: 'outline', label: 'Outline', placeholder: 'Act and chapter outline.' },
        { key: 'sceneBeats', label: 'Scene Beats', placeholder: 'Cross-chapter beats / sequencing notes.' }
    ];
    const activeDocDef = docDefs.find(doc => doc.key === activeDocKey) || docDefs[0];
    const activeDocText = typeof docs?.[activeDocDef.key] === 'string' ? docs[activeDocDef.key] : '';

    const card = document.createElement('div');
    card.className = 'studio-world-focus-card';
    card.innerHTML = `
        <div class="studio-world-focus-title">Blueprint</div>
        <div class="studio-world-focus-meta">Core story setup docs for this book (treatment, synopsis, outline, scene beats) plus export prep.</div>
    `;
    wrap.appendChild(card);

    const list = document.createElement('div');
    list.className = 'book-composer-doc-list';
    docDefs.forEach((doc) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'book-composer-doc-card is-selectable';
        if (doc.key === activeDocDef.key) item.classList.add('active');
        item.dataset.action = 'worldui:bookComposerDocSelect';
        item.dataset.bookId = book.id;
        item.dataset.docKey = doc.key;
        const text = typeof docs?.[doc.key] === 'string' ? docs[doc.key].trim() : '';
        item.innerHTML = `
            <div class="book-composer-doc-title">${doc.label}</div>
            <div class="book-composer-doc-meta">${text ? formatWordCountLabel(text.split(/\\s+/).filter(Boolean).length) : 'Empty'}</div>
        `;
        list.appendChild(item);
    });
    wrap.appendChild(list);

    const editor = document.createElement('div');
    editor.className = 'studio-world-inline-editor book-composer-editor';
    editor.dataset.rowActionShield = 'true';
    editor.dataset.bookId = book.id;
    editor.dataset.activeDocKey = activeDocDef.key;

    const docHeader = document.createElement('div');
    docHeader.className = 'book-composer-active-doc-header';
    docHeader.innerHTML = `
        <div class="book-composer-active-doc-title">${activeDocDef.label}</div>
        <div class="book-composer-active-doc-meta">Saved to this Book Blueprint and planned to be exportable later as part of the manuscript package.</div>
    `;
    editor.appendChild(docHeader);

    const grid = document.createElement('div');
    grid.className = 'studio-world-inline-grid';
    grid.appendChild(createInlineField(`${activeDocDef.label} content`, createInlineTextarea({
        name: 'bookComposerDocContent',
        value: activeDocText,
        rows: 14,
        placeholder: activeDocDef.placeholder
    })));
    editor.appendChild(grid);

    const exportCard = document.createElement('div');
    exportCard.className = 'book-composer-export-card';
    exportCard.innerHTML = `<div class="book-composer-export-title">Export Prep (for future Book Export)</div>`;

    const exportGrid = document.createElement('div');
    exportGrid.className = 'studio-world-inline-grid is-compact';
    exportGrid.appendChild(createInlineField('Export title', createInlineTextInput({
        name: 'exportTitle',
        value: exportProfile.title || book.name || '',
        placeholder: book.name || 'Book title'
    })));
    exportGrid.appendChild(createInlineField('Subtitle', createInlineTextInput({
        name: 'exportSubtitle',
        value: exportProfile.subtitle || '',
        placeholder: 'Optional subtitle'
    })));
    exportGrid.appendChild(createInlineField('Author', createInlineTextInput({
        name: 'exportAuthor',
        value: exportProfile.author || '',
        placeholder: 'Author name'
    })));
    exportGrid.appendChild(createInlineField('Chapter title format', createInlineSelect({
        name: 'exportChapterTitleMode',
        value: exportProfile.chapterTitleMode || 'number_and_title',
        options: [
            { value: 'number_and_title', label: 'Number + Title' },
            { value: 'title_only', label: 'Title only' }
        ]
    })));
    exportGrid.appendChild(createInlineField('Scene break marker', createInlineTextInput({
        name: 'exportSceneBreakMarker',
        value: exportProfile.sceneBreakMarker || '***',
        placeholder: '***'
    })));
    exportGrid.appendChild(createInlineField('Front matter notes', createInlineTextarea({
        name: 'exportFrontMatterNotes',
        value: exportProfile.frontMatterNotes || '',
        rows: 3,
        placeholder: 'Notes for cover page, dedication, foreword, etc.'
    })));

    const includeSummariesField = document.createElement('label');
    includeSummariesField.className = 'studio-world-inline-checkbox';
    const includeSummariesInput = document.createElement('input');
    includeSummariesInput.type = 'checkbox';
    includeSummariesInput.name = 'exportIncludeChapterSummaries';
    includeSummariesInput.checked = exportProfile.includeChapterSummaries === true;
    includeSummariesField.append(includeSummariesInput, document.createTextNode(' Include chapter summaries in export package metadata'));
    exportGrid.appendChild(includeSummariesField);

    exportCard.appendChild(exportGrid);

    const exportActions = document.createElement('div');
    exportActions.className = 'studio-world-focus-actions';
    exportActions.innerHTML = `
        <button type="button" class="btn btn-small" data-action="worldui:bookExportMarkdown" data-book-id="${book.id}">Export Book (.md)</button>
        <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookComposerSave" data-book-id="${book.id}" data-doc-key="${activeDocDef.key}">Save Export Prep</button>
    `;
    exportCard.appendChild(exportActions);
    editor.appendChild(exportCard);

    const exportPreview = document.createElement('div');
    exportPreview.className = 'studio-world-inline-note';
    const chapterCount = (project.chatSessions || []).filter(session => session?.bookId === book.id).length;
    const summaryCount = (project.chatSessions || []).filter(session => session?.bookId === book.id && String(session?.chapterSummary || '').trim()).length;
    exportPreview.textContent = `Export preview readiness: ${chapterCount} chapters • ${summaryCount} chapter summaries • Markdown export available now • DOCX/EPUB pending.`;
    editor.appendChild(exportPreview);

    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:bookComposerSave',
        cancelAction: 'worldui:bookWorkspaceTabOpen',
        cancelLabel: 'Reset',
        dataset: { bookId: book.id, tab: 'composer' }
    }));
    wrap.appendChild(editor);
    return wrap;
}

function buildBookWorldTab(project, book) {
    const wrap = document.createElement('div');
    wrap.className = 'book-workspace-pane';
    const bookAgentPresetName = getBookAgentPresetName(project, book);
    const codexUsesBookAgent = book?.codexAgentConfig?.useBookAgent !== false;
    const codexPresetExplicit = String(book?.codexAgentConfig?.agentPresetName || '').trim();
    const codexResolvedPresetName = getBookCodexAgentResolvedPresetName(project, book);
    const activeSidebarAgentName = getActiveSidebarAgentPresetName(project);
    const agentPresetNames = getAllAgentPresetNames(project);
    const codexSetup = document.createElement('div');
    codexSetup.className = 'studio-world-inline-editor';
    codexSetup.dataset.rowActionShield = 'true';
    codexSetup.dataset.bookId = book.id;
    codexSetup.innerHTML = `
        <div class="book-composer-active-doc-header">
            <div class="book-composer-active-doc-title">Codex Agent Setup</div>
            <div class="book-composer-active-doc-meta">${codexResolvedPresetName ? `Codex actions will use Agent preset: ${codexResolvedPresetName}` : 'Configure which Agent preset should run Codex/World proposal extraction and generation.'}</div>
        </div>
    `;
    const codexGrid = document.createElement('div');
    codexGrid.className = 'studio-world-inline-grid is-compact';
    const sameAsBookField = document.createElement('label');
    sameAsBookField.className = 'studio-world-inline-checkbox';
    const sameAsBookInput = document.createElement('input');
    sameAsBookInput.type = 'checkbox';
    sameAsBookInput.name = 'codexUseBookAgent';
    sameAsBookInput.checked = codexUsesBookAgent;
    sameAsBookField.append(sameAsBookInput, document.createTextNode(' Use same Agent preset as Book Agent'));
    codexGrid.appendChild(sameAsBookField);
    const codexPresetSelect = createInlineSelect({
        name: 'codexAgentPresetName',
        value: codexPresetExplicit || activeSidebarAgentName || '',
        options: [
            { value: '', label: agentPresetNames.length > 0 ? 'Select agent preset…' : 'No agent presets available' },
            ...agentPresetNames.map(name => ({ value: name, label: name }))
        ]
    });
    codexPresetSelect.disabled = codexUsesBookAgent;
    codexGrid.appendChild(createInlineField('Codex agent preset', codexPresetSelect));
    codexGrid.appendChild(createInlineField('Codex prompt override', createInlineTextarea({
        name: 'codexSystemPromptOverride',
        value: String(book?.codexAgentConfig?.systemPromptOverride || ''),
        rows: 4,
        placeholder: 'Optional extra instruction for Codex tasks (proposal extraction, world generation).'
    })));
    codexSetup.appendChild(codexGrid);
    codexSetup.appendChild(createInlineEditorActions({
        saveAction: 'worldui:codexAgentConfigSave',
        cancelAction: 'worldui:bookWorkspaceTabOpen',
        cancelLabel: 'Reset',
        dataset: { bookId: book.id, tab: 'world' }
    }));
    const codexActions = document.createElement('div');
    codexActions.className = 'studio-world-focus-actions';
    codexActions.innerHTML = `
        <button type="button" class="btn btn-small btn-secondary" data-action="worldui:codexAgentBindCurrentAgent" data-book-id="${book.id}">Use Selected Agent Preset</button>
    `;
    codexSetup.appendChild(codexActions);
    if (!codexResolvedPresetName) {
        const warn = document.createElement('div');
        warn.className = 'studio-world-inline-note';
        warn.textContent = codexUsesBookAgent && !bookAgentPresetName
            ? 'Codex Agent is waiting for a Book Agent preset. Set Book Agent preset first or uncheck "Use same Agent".'
            : 'Codex Agent is not configured yet. Codex proposal scan/generation actions will be blocked until you save this setup.';
        codexSetup.appendChild(warn);
    }
    wrap.appendChild(codexSetup);

    const world = getWorldById(project, book?.linkedWorldId);
    if (!world) {
        const empty = document.createElement('div');
        empty.className = 'studio-world-focus-card';
        empty.innerHTML = `
            <div class="studio-world-focus-title">Codex (Book World)</div>
            <div class="studio-world-focus-meta">No world linked to this Book yet.</div>
            <div class="studio-world-focus-actions">
                <button type="button" class="btn btn-small" data-action="book:ensureWorld" data-book-id="${book.id}">Create Book World</button>
                <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookSettingsOpen" data-book-id="${book.id}">Link World in Book Settings</button>
            </div>
        `;
        wrap.appendChild(empty);
        return wrap;
    }

    const summary = document.createElement('div');
    summary.className = 'studio-world-focus-card';
    const items = Array.isArray(world.items) ? world.items : [];
    const ownership = getWorldOwnershipMeta(project, world);
    summary.innerHTML = `
        <div class="studio-world-focus-title">Codex: ${world.name}</div>
        <div class="studio-world-focus-meta">Book-level canon and references • ${items.length} item${items.length === 1 ? '' : 's'} • ${ownership.mode === 'shared' ? 'Shared World' : (ownership.mode === 'book' ? 'Book-owned World' : 'World')}</div>
        <div class="studio-world-focus-actions">
            <button type="button" class="btn btn-small btn-secondary" data-action="world:setActive" data-world-id="${world.id}">Set Active World</button>
            <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookWorldFocus" data-book-id="${book.id}">Focus Book World</button>
            <button type="button" class="btn btn-small btn-secondary" data-action="worldui:openWorldWorkspace">Open World Hub</button>
        </div>
    `;
    wrap.appendChild(summary);

    const ownershipRow = document.createElement('div');
    ownershipRow.className = 'studio-world-item-footer';
    if (ownership.mode === 'shared') {
        ownershipRow.appendChild(createLabelPill('Shared World', 'linked'));
        if (ownership.ownerBook) ownershipRow.appendChild(createLabelPill(`Owner: ${ownership.ownerBook.name}`, 'muted'));
        ownershipRow.appendChild(createLabelPill(`${ownership.linkedBooks.length} linked books`, 'muted'));
    } else if (ownership.mode === 'book') {
        ownershipRow.appendChild(createLabelPill('Book-owned World', 'muted'));
        if (ownership.ownerBook) ownershipRow.appendChild(createLabelPill(`Owner: ${ownership.ownerBook.name}`, 'muted'));
    } else {
        ownershipRow.appendChild(createLabelPill('Unassigned World', 'pending'));
    }
    wrap.appendChild(ownershipRow);

    const list = document.createElement('div');
    list.className = 'item-list';
    items.slice(0, 12).forEach(item => list.appendChild(buildWorldItemPreviewRow(world.id, item)));
    if (items.length === 0) {
        list.innerHTML = '<p class="no-items-message">No world items yet.</p>';
    } else if (items.length > 12) {
        const note = document.createElement('p');
        note.className = 'no-items-message';
        note.textContent = `Showing 12 of ${items.length} items.`;
        list.appendChild(note);
    }
    wrap.appendChild(list);
    return wrap;
}

function buildBookChangesTab(project, book) {
    const wrap = document.createElement('div');
    wrap.className = 'book-workspace-pane';
    const changes = (project.worldChanges || []).filter(change => change?.bookId === book.id);
    const pending = changes.filter(change => String(change.status || 'pending') === 'pending');
    const reviewed = changes.filter(change => String(change.status || 'pending') !== 'pending');
    const lastViewedAt = getBookChangesLastViewedAt(project, book.id);
    const newPending = pending.filter(change => Number(change?.createdAt) > lastViewedAt).length;
    const automation = (book?.agentAutomation?.worldProposals && typeof book.agentAutomation.worldProposals === 'object')
        ? book.agentAutomation.worldProposals
        : {};
    const autoEnabled = automation.autoProposeEnabled === true;
    const codexAgentPresetName = getBookCodexAgentResolvedPresetName(project, book);
    const codexReady = Boolean(codexAgentPresetName);
    const bookAgentPresetName = getBookAgentPresetName(project, book);
    const bookAgentReady = Boolean(bookAgentPresetName);
    const scanCursor = Number.isFinite(Number(automation.lastScannedMessageCount))
        ? Math.max(0, Math.round(Number(automation.lastScannedMessageCount)))
        : 0;
    const lastScanSourceLabel = formatBookAgentScanSourceLabel(automation.lastScanSourceKind);
    const lastScanModeLabel = formatBookAgentScanModeLabel(automation.lastScanMode);
    const lastScanCreatedCount = Number.isFinite(Number(automation.lastScanCreatedCount))
        ? Math.max(0, Math.round(Number(automation.lastScanCreatedCount)))
        : 0;
    const lastScanAttemptAt = Number.isFinite(Number(automation.lastScanAttemptAt))
        ? Math.round(Number(automation.lastScanAttemptAt))
        : 0;
    const hasLastScan = lastScanAttemptAt > 0;
    const lastScanResult = String(automation.lastScanResult || '').trim().toLowerCase();
    const lastScanRelative = hasLastScan ? formatRelativeTimestamp(lastScanAttemptAt) : '—';
    const lastScanAbsolute = hasLastScan ? formatAbsoluteTimestamp(lastScanAttemptAt) : 'Unknown time';
    const showNoDeltaBadge = hasLastScan && lastScanResult === 'no_delta' && String(automation.lastScanMode || '').trim().toLowerCase() === 'delta';

    const card = document.createElement('div');
    card.className = 'studio-world-focus-card book-changes-card';

    const title = document.createElement('div');
    title.className = 'studio-world-focus-title';
    title.textContent = 'Book Changes';
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'studio-world-focus-meta';
    meta.textContent = 'Review proposals created from Book Agent and Codex workflows before they become canon.';
    card.appendChild(meta);

    const statusPills = document.createElement('div');
    statusPills.className = 'book-changes-status-pills';
    statusPills.appendChild(createLabelPill(`${pending.length} Pending`, pending.length > 0 ? 'pending' : 'muted'));
    statusPills.appendChild(createLabelPill(`${reviewed.length} Reviewed`, reviewed.length > 0 ? 'linked' : 'muted'));
    statusPills.appendChild(createLabelPill(`${newPending} New`, newPending > 0 ? 'danger' : 'muted'));
    statusPills.appendChild(createLabelPill(`Auto ${autoEnabled ? 'On' : 'Off'}`, autoEnabled ? 'linked' : 'muted'));
    statusPills.appendChild(createLabelPill(`Cursor ${scanCursor}`, 'muted'));
    statusPills.appendChild(createLabelPill(`Last Scan: ${lastScanSourceLabel}`, hasLastScan ? 'linked' : 'muted'));
    statusPills.appendChild(createLabelPill(`Mode: ${lastScanModeLabel}`, hasLastScan ? 'muted' : 'muted'));
    statusPills.appendChild(createLabelPill(`At ${lastScanRelative}`, hasLastScan ? 'muted' : 'muted'));
    if (showNoDeltaBadge) {
        statusPills.appendChild(createLabelPill('No new delta', 'pending'));
    }
    card.appendChild(statusPills);

    if (hasLastScan) {
        const scanMeta = document.createElement('div');
        scanMeta.className = 'studio-world-focus-meta';
        const resultLabel = showNoDeltaBadge
            ? 'no new delta'
            : `${lastScanCreatedCount} proposal${lastScanCreatedCount === 1 ? '' : 's'} created`;
        scanMeta.textContent = `Last scan at ${lastScanAbsolute} (${lastScanRelative}) • used ${lastScanSourceLabel.toLowerCase()} • ${lastScanModeLabel.toLowerCase()} • ${resultLabel}.`;
        card.appendChild(scanMeta);
    }

    const actionGroupPrimary = document.createElement('div');
    actionGroupPrimary.className = 'studio-world-focus-actions book-changes-actions';
    actionGroupPrimary.innerHTML = `
        <button type="button" class="btn btn-small ${autoEnabled ? 'btn-secondary' : ''}" data-action="worldui:bookAgentAutoProposeToggle" data-book-id="${book.id}" data-enabled="${autoEnabled ? 'false' : 'true'}" data-seed-cursor="${autoEnabled ? 'false' : 'true'}">${autoEnabled ? 'Disable Auto Propose' : 'Enable Auto Propose'}</button>
        <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookAgentScanNow" data-book-id="${book.id}">Scan Book Agent Chat</button>
        <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookAgentResetScanCursor" data-book-id="${book.id}">Reset Cursor</button>
    `;
    card.appendChild(actionGroupPrimary);

    if (!bookAgentReady || !codexReady) {
        const note = document.createElement('div');
        note.className = 'studio-world-inline-note book-changes-setup-note';
        const setupParts = [];
        if (!bookAgentReady) setupParts.push('Book Agent not set');
        if (!codexReady) setupParts.push('Codex Agent not set');
        note.textContent = `${setupParts.join(' • ')}. Use the Agent and Codex tabs above to finish setup, then return here to scan or enable auto-propose.`;
        card.appendChild(note);
    }
    wrap.appendChild(card);

    const list = document.createElement('div');
    list.className = 'item-list';
    if (changes.length === 0) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'studio-world-focus-card book-changes-empty-card';
        emptyCard.innerHTML = `
            <div class="studio-world-focus-title">No changes yet</div>
            <div class="studio-world-focus-meta">Chat in the Agent tab, then use the actions above to scan and create proposals for this Book's Codex.</div>
        `;
        list.appendChild(emptyCard);
    } else {
        changes.slice(0, 10).forEach(change => list.appendChild(buildWorldChangeItem(project, change)));
    }
    wrap.appendChild(list);
    return wrap;
}

function buildBookSettingsTab(project, book) {
    const wrap = document.createElement('div');
    wrap.className = 'book-workspace-pane';
    wrap.appendChild(buildBookInlineEditor(project, book));
    return wrap;
}

function buildBookWorkspaceTabContent(project, book, tab) {
    switch (normalizeBookWorkspaceTab(tab)) {
        case 'agent':
            return buildBookAgentTab(project, book);
        case 'composer':
            return buildBookComposerTab(project, book);
        case 'world':
            return buildBookWorldTab(project, book);
        case 'changes':
            return buildBookChangesTab(project, book);
        case 'settings':
            return buildBookSettingsTab(project, book);
        default:
            return buildBookOverviewTab(project, book);
    }
}

function updateBookWorkspaceHeader(project, book) {
    const titleEl = document.getElementById('book-workspace-title');
    const metaEl = document.getElementById('book-workspace-meta');
    const tabsEl = document.getElementById('book-workspace-tabs');
    const headerActionsEl = document.getElementById('book-workspace-header-actions');
    const workspace = document.getElementById('book-workspace');
    if (!workspace) return;

    if (!project || !book) {
        if (titleEl) titleEl.textContent = 'Book';
        if (metaEl) metaEl.textContent = 'Select a Book to open its overview, agent, and planning tools.';
        if (tabsEl) tabsEl.innerHTML = '';
        if (headerActionsEl) headerActionsEl.innerHTML = '';
        return;
    }

    const linkedWorld = getWorldById(project, book.linkedWorldId);
    const chapterCount = countBookChapters(project, book);
    const bookAgentPresetName = getBookAgentPresetName(project, book);
    const codexAgentPresetName = getBookCodexAgentResolvedPresetName(project, book);
    const autoProposeEnabled = book?.agentAutomation?.worldProposals?.autoProposeEnabled === true;
    const proposalCursorCount = Number.isFinite(Number(book?.agentAutomation?.worldProposals?.lastScannedMessageCount))
        ? Math.max(0, Math.round(Number(book.agentAutomation.worldProposals.lastScannedMessageCount)))
        : 0;
    if (titleEl) titleEl.textContent = book.name || 'Untitled Book';
    if (metaEl) {
        metaEl.textContent = [
            `${chapterCount} chapter${chapterCount === 1 ? '' : 's'}`,
            linkedWorld ? `Codex: ${linkedWorld.name}` : 'No linked codex',
            bookAgentPresetName ? `Agent: ${bookAgentPresetName}` : 'Agent: Not set',
            codexAgentPresetName ? `Codex Agent: ${codexAgentPresetName}` : 'Codex Agent: Not set',
            book.bookAgentSessionId ? 'Book Agent chat ready' : 'No Book Agent chat yet'
        ].join(' • ');
    }

    if (headerActionsEl) {
        headerActionsEl.innerHTML = '';
        const newChapterBtn = document.createElement('button');
        newChapterBtn.type = 'button';
        newChapterBtn.className = 'btn btn-small';
        newChapterBtn.dataset.action = 'worldui:bookChapterCreate';
        newChapterBtn.dataset.bookId = book.id;
        newChapterBtn.textContent = 'New Chapter';
        headerActionsEl.appendChild(newChapterBtn);

        const menu = createDropdown([
            { label: 'Open Book Agent Chat', action: 'worldui:bookAgentOpen', data: { bookId: book.id } },
            { label: 'Bind Book Agent to Selected Agent Preset', action: 'worldui:bookAgentBindCurrentAgent', data: { bookId: book.id } },
            { label: 'Book Settings...', action: 'worldui:bookSettingsOpen', data: { bookId: book.id } },
            { label: 'New Act...', action: 'worldui:bookActCreate', data: { bookId: book.id } },
            { label: 'Import Current Chat as Chapter', action: 'chapter:assignToBook', data: { bookId: book.id } },
            { label: 'Re-number Chapters', action: 'book:renumberChapters', data: { bookId: book.id } },
            { label: autoProposeEnabled ? 'Disable Auto Propose (Book Agent)' : 'Enable Auto Propose (Book Agent)', action: 'worldui:bookAgentAutoProposeToggle', data: { bookId: book.id, enabled: !autoProposeEnabled, seedCursor: !autoProposeEnabled } },
            { label: `Scan Book Agent Chat -> Propose (${proposalCursorCount} scanned)`, action: 'worldui:bookAgentScanNow', data: { bookId: book.id } },
            { label: 'Reset Book Agent Scan Cursor', action: 'worldui:bookAgentResetScanCursor', data: { bookId: book.id } },
            { label: 'Export Book (.md)', action: 'worldui:bookExportMarkdown', data: { bookId: book.id } }
        ]);
        headerActionsEl.appendChild(menu);
    }

    if (tabsEl) {
        const activeTab = getBookWorkspaceActiveTab(book.id);
        tabsEl.innerHTML = '';
        [
            ['overview', 'Overview'],
            ['agent', 'Agent'],
            ['composer', 'Blueprint'],
            ['world', 'Codex'],
            ['changes', 'Changes']
        ].forEach(([tabKey, label]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'book-workspace-tab-btn';
            if (activeTab === tabKey) btn.classList.add('active');
            btn.dataset.action = 'worldui:bookWorkspaceTabOpen';
            btn.dataset.bookId = book.id;
            btn.dataset.tab = tabKey;
            btn.textContent = label;
            tabsEl.appendChild(btn);
        });
    }
}

function renderBookWorkspace() {
    const workspace = ensureBookWorkspaceSurface();
    const content = document.getElementById('book-workspace-content');
    if (!workspace || !content) return;

    content.innerHTML = '';
    const project = stateManager.getProject();
    const activeBookId = bookWorkspaceUIState.activeBookId || project?.activeBookId || null;
    const book = project ? getBookById(project, activeBookId) || getBookById(project, project.activeBookId) : null;
    updateBookWorkspaceHeader(project, book || null);

    if (!project || !book) {
        const empty = document.createElement('p');
        empty.className = 'no-items-message';
        empty.textContent = 'Select a Book from the left sidebar to open Book Workspace.';
        content.appendChild(empty);
        return;
    }

    bookWorkspaceUIState.activeBookId = book.id;
    const preferredTab = getBookWorkspaceActiveTab(book.id);
    const tab = preferredTab === 'settings' ? 'overview' : preferredTab;
    setBookWorkspaceActiveTab(book.id, tab);
    content.appendChild(buildBookWorkspaceTabContent(project, book, tab));
}

function buildWorldWorkspaceOverviewCard(project) {
    const card = document.createElement('div');
    card.className = 'studio-world-focus-card world-workspace-overview-card';

    const activeWorld = getWorldById(project, project.activeWorldId);
    const activeBook = getBookById(project, project.activeBookId);
    const activeSession = getActiveSession(project);
    const pendingChanges = Array.isArray(project.worldChanges)
        ? project.worldChanges.filter(change => String(change.status || 'pending') === 'pending').length
        : 0;

    const title = document.createElement('div');
    title.className = 'studio-world-focus-title';
    title.textContent = 'World Workspace';

    const meta = document.createElement('div');
    meta.className = 'studio-world-focus-meta';
    meta.textContent = 'World hub for codex review and shared-world management. Create Books from the Books section on the left.';

    const statusPills = document.createElement('div');
    statusPills.className = 'world-workspace-status-pills';
    statusPills.appendChild(createLabelPill(activeWorld ? `World: ${activeWorld.name}` : 'No active world', activeWorld ? 'active' : 'muted'));
    statusPills.appendChild(createLabelPill(activeBook ? `Book: ${activeBook.name}` : 'No active book', activeBook ? 'linked' : 'muted'));
    statusPills.appendChild(createLabelPill(activeSession ? `Chat: ${activeSession.name}` : 'No active chat', activeSession ? 'muted' : 'muted'));
    statusPills.appendChild(createLabelPill(`${pendingChanges} pending`, pendingChanges > 0 ? 'pending' : 'muted'));

    card.append(title, meta, statusPills);
    return card;
}

function updateWorldWorkspaceHeader(project) {
    const headerTitle = document.getElementById('world-workspace-title');
    const headerMeta = document.getElementById('world-workspace-meta');
    if (!headerTitle && !headerMeta) return;

    if (!project) {
        if (headerTitle) headerTitle.textContent = 'World';
        if (headerMeta) headerMeta.textContent = 'Open a project to start building worlds.';
        return;
    }

    ensureWorldStudioState(project);
    const activeWorld = getWorldById(project, project.activeWorldId);
    const activeBook = getBookById(project, project.activeBookId);
    const activeSession = getActiveSession(project);

    if (headerTitle) {
        headerTitle.textContent = activeWorld ? `World: ${activeWorld.name}` : 'World';
    }
    if (headerMeta) {
        const parts = [
            `${(project.worlds || []).length} world${(project.worlds || []).length === 1 ? '' : 's'}`,
            `${(project.books || []).length} book${(project.books || []).length === 1 ? '' : 's'}`,
            activeBook ? `Book: ${activeBook.name}` : null,
            activeSession ? `Chat: ${activeSession.name}` : null
        ].filter(Boolean);
        headerMeta.textContent = parts.join(' • ');
    }
}

function renderBookSidebarSection() {
    const slot = ensureBookSidebarSlot();
    if (!slot) return;
    slot.innerHTML = '';

    const project = stateManager.getProject();
    if (!project) {
        slot.classList.add('hidden');
        return;
    }

    slot.classList.remove('hidden');
    ensureWorldStudioState(project);
    renderBooksSection(slot, project);
}

function renderWorldWorkspace() {
    const workspace = ensureWorldWorkspaceSurface();
    const content = document.getElementById('world-workspace-content');
    if (!workspace || !content) return;

    content.innerHTML = '';

    const project = stateManager.getProject();
    updateWorldWorkspaceHeader(project);
    if (!project) {
        const empty = document.createElement('p');
        empty.className = 'no-items-message';
        empty.textContent = 'Open a project to create Worlds and review World Changes.';
        content.appendChild(empty);
        return;
    }

    ensureWorldStudioState(project);
    content.appendChild(buildWorldWorkspaceOverviewCard(project));
    renderWorldsSection(content, project);
    renderWorldChangesSection(content, project);
}

function ensureBookAgentSessionForBook(project, book) {
    if (!project || !book) return null;
    let didMutateBookConfig = false;
    let bookAgentPresetName = getBookAgentPresetName(project, book);
    if (!bookAgentPresetName) {
        const seededAgentName = getActiveSidebarAgentPresetName(project);
        if (seededAgentName) {
            if (!book.bookAgentConfig || typeof book.bookAgentConfig !== 'object') {
                book.bookAgentConfig = {};
            }
            book.bookAgentConfig.agentPresetName = seededAgentName;
            if (!book.codexAgentConfig || typeof book.codexAgentConfig !== 'object') {
                book.codexAgentConfig = { useBookAgent: true, agentPresetName: null, systemPromptOverride: '' };
            } else if (book.codexAgentConfig.useBookAgent === undefined) {
                book.codexAgentConfig.useBookAgent = true;
            }
            book.updatedAt = Date.now();
            didMutateBookConfig = true;
            bookAgentPresetName = seededAgentName;
        }
    }
    let session = book.bookAgentSessionId ? getSessionById(project, book.bookAgentSessionId) : null;

    if (session) {
        session.kind = SESSION_KIND_BOOK_AGENT;
        session.bookAgentBookId = book.id;
        if (bookAgentPresetName) {
            session.linkedEntity = { type: 'agent', name: bookAgentPresetName };
        }
        if (!session.name || session.name === 'New Chat') {
            session.name = `Book Agent — ${book.name || 'Untitled Book'}`;
        }
        session.updatedAt = Date.now();
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        return session;
    }

    const previousActiveSessionId = project.activeSessionId || null;
    SessionHandlers.createNewChatSession({
        kind: SESSION_KIND_BOOK_AGENT,
        bookAgentBookId: book.id
    });
    const updatedProject = stateManager.getProject();
    const newSessionId = updatedProject?.activeSessionId || null;
    if (!newSessionId || newSessionId === previousActiveSessionId) {
        return null;
    }

    session = getSessionById(updatedProject, newSessionId);
    if (!session) return null;
    session.kind = SESSION_KIND_BOOK_AGENT;
    session.bookAgentBookId = book.id;
    const refreshedBook = getBookById(updatedProject, book.id);
    const resolvedPresetName = getBookAgentPresetName(updatedProject, refreshedBook || book) || bookAgentPresetName;
    if (resolvedPresetName) {
        session.linkedEntity = { type: 'agent', name: resolvedPresetName };
    }
    session.name = `Book Agent — ${book.name || 'Untitled Book'}`;
    session.updatedAt = Date.now();
    stateManager.setProject(updatedProject);
    stateManager.updateAndPersistState();
    publishWorldUIAction('book:update', {
        bookId: book.id,
        bookAgentSessionId: session.id,
        ...(didMutateBookConfig && book.bookAgentConfig ? { bookAgentConfig: { ...book.bookAgentConfig } } : {})
    });
    return session;
}

function publishWorldUIAction(action, payload) {
    stateManager.bus.publish(action, payload || {});
}

function handleLocalWorldUIAction(actionTarget, eventPayload) {
    const action = String(actionTarget?.dataset?.action || '').trim();
    if (!action.startsWith('worldui:')) return false;

    const project = stateManager.getProject();

    if (action === 'worldui:bookSidebarModalClose') {
        worldInlineUIState.creatingBook = false;
        worldInlineUIState.editingBookId = null;
        worldInlineUIState.editingChapterMetaSessionId = null;
        bookSidebarUIState.modal = null;
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:bookToggleOpen') {
        const bookId = String(eventPayload.bookId || '').trim();
        if (!bookId) return true;
        const explicitOpen = String(eventPayload.open ?? '').trim().toLowerCase();
        if (explicitOpen === 'true') {
            bookSidebarUIState.collapsedBookIds.delete(bookId);
        } else if (explicitOpen === 'false') {
            bookSidebarUIState.collapsedBookIds.add(bookId);
        } else if (bookSidebarUIState.collapsedBookIds.has(bookId)) {
            bookSidebarUIState.collapsedBookIds.delete(bookId);
        } else {
            bookSidebarUIState.collapsedBookIds.add(bookId);
        }
        if (project) {
            persistBookTreeCollapseStateToProject(project);
        } else {
            renderBookSidebarSection();
        }
        return true;
    }

    if (action === 'worldui:bookOpenWorkspace') {
        const bookId = String(eventPayload.bookId || '').trim();
        if (!bookId) return true;
        const tab = normalizeBookWorkspaceTab(eventPayload.tab || 'overview');
        bookWorkspaceUIState.activeBookId = bookId;
        setBookWorkspaceActiveTab(bookId, tab);
        publishWorldUIAction('book:setActive', { bookId });
        if (tab === 'changes' && project) {
            markBookChangesViewed(project, bookId);
        }
        openBookWorkspaceFallback(bookId, { tab });
        return true;
    }

    if (action === 'worldui:bookWorkspaceTabOpen') {
        const bookId = String(eventPayload.bookId || project?.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!bookId) {
            showCustomAlert('Select a Book first.', 'Book');
            return true;
        }
        const tab = normalizeBookWorkspaceTab(eventPayload.tab || 'overview');
        bookWorkspaceUIState.activeBookId = bookId;
        publishWorldUIAction('book:setActive', { bookId });
        if (tab === 'agent') {
            const refreshedProject = stateManager.getProject();
            const activeBook = refreshedProject ? getBookById(refreshedProject, bookId) : null;
            const hasBoundAgentPreset = Boolean(activeBook && getBookAgentPresetName(refreshedProject, activeBook));
            if (!hasBoundAgentPreset) {
                setBookWorkspaceActiveTab(bookId, 'agent');
                openBookWorkspaceFallback(bookId, { tab: 'agent' });
                return true;
            }
            const agentSession = ensureBookAgentSessionForBook(refreshedProject, activeBook);
            if (!agentSession) {
                showCustomAlert('Could not create Book Agent chat.', 'Book');
                return true;
            }
            SessionHandlers.loadChatSession(agentSession.id);
            openChatWorkspaceFallback();
            return true;
        }
        setBookWorkspaceActiveTab(bookId, tab);
        if (tab === 'changes') {
            const refreshedProjectForView = stateManager.getProject();
            if (refreshedProjectForView) {
                markBookChangesViewed(refreshedProjectForView, bookId);
            }
        }
        if (tab === 'world') {
            const refreshedProject = stateManager.getProject();
            const activeBook = refreshedProject ? getBookById(refreshedProject, bookId) : null;
            if (activeBook?.linkedWorldId) {
                publishWorldUIAction('world:setActive', { worldId: activeBook.linkedWorldId });
            }
        }
        openBookWorkspaceFallback(bookId, { tab });
        return true;
    }

    if (action === 'worldui:bookComposerDocSelect') {
        const bookId = String(eventPayload.bookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!bookId) return true;
        setBookComposerActiveDocKey(bookId, eventPayload.docKey);
        setBookWorkspaceActiveTab(bookId, 'composer');
        renderBookWorkspace();
        return true;
    }

    if (action === 'worldui:bookExportMarkdown') {
        const bookId = String(eventPayload.bookId || project?.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!project || !bookId) {
            showCustomAlert('Select a Book first.', 'Book Export');
            return true;
        }
        const book = getBookById(project, bookId);
        if (!book) {
            showCustomAlert('Book not found.', 'Book Export');
            return true;
        }

        let draftExportProfile = null;
        const composerEditor = document.querySelector(`.book-composer-editor[data-book-id="${CSS.escape(bookId)}"]`);
        if (composerEditor) {
            draftExportProfile = {
                title: String(readInputValue(composerEditor, '[name="exportTitle"]', book?.exportProfile?.title || book.name || '') || ''),
                subtitle: String(readInputValue(composerEditor, '[name="exportSubtitle"]', book?.exportProfile?.subtitle || '') || ''),
                author: String(readInputValue(composerEditor, '[name="exportAuthor"]', book?.exportProfile?.author || '') || ''),
                chapterTitleMode: String(readInputValue(composerEditor, '[name="exportChapterTitleMode"]', book?.exportProfile?.chapterTitleMode || 'number_and_title') || 'number_and_title'),
                sceneBreakMarker: String(readInputValue(composerEditor, '[name="exportSceneBreakMarker"]', book?.exportProfile?.sceneBreakMarker || '***') || '***'),
                frontMatterNotes: String(readInputValue(composerEditor, '[name="exportFrontMatterNotes"]', book?.exportProfile?.frontMatterNotes || '') || ''),
                includeChapterSummaries: readCheckboxChecked(composerEditor, '[name="exportIncludeChapterSummaries"]', book?.exportProfile?.includeChapterSummaries === true)
            };
        }

        const exportResult = buildBookMarkdownExport(project, book, {
            exportProfile: draftExportProfile || undefined
        });

        if (!exportResult?.markdown) {
            showCustomAlert('Nothing to export yet for this Book.', 'Book Export');
            return true;
        }

        downloadTextFile(exportResult.fileName, exportResult.markdown, 'text/markdown;charset=utf-8');
        const missingMsg = exportResult.missingContentCount > 0
            ? ` • ${exportResult.missingContentCount} chapter${exportResult.missingContentCount === 1 ? '' : 's'} missing composer content`
            : '';
        showCustomAlert(`Exported Markdown for ${exportResult.exportedChapters} chapter${exportResult.exportedChapters === 1 ? '' : 's'}${missingMsg}.`, 'Book Export');
        return true;
    }

    if (action === 'worldui:bookComposerSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        const bookId = String(eventPayload.bookId || editor?.dataset?.bookId || '').trim();
        if (!editor || !bookId) return true;
        const activeDocKey = normalizeBookComposerDocKey(eventPayload.docKey || editor.dataset.activeDocKey || getBookComposerActiveDocKey(bookId));
        const docContent = String(readInputValue(editor, '[name="bookComposerDocContent"]', '') || '');
        const exportTitle = String(readInputValue(editor, '[name="exportTitle"]', '') || '');
        const exportSubtitle = String(readInputValue(editor, '[name="exportSubtitle"]', '') || '');
        const exportAuthor = String(readInputValue(editor, '[name="exportAuthor"]', '') || '');
        const exportChapterTitleMode = String(readInputValue(editor, '[name="exportChapterTitleMode"]', 'number_and_title') || 'number_and_title');
        const exportSceneBreakMarker = String(readInputValue(editor, '[name="exportSceneBreakMarker"]', '***') || '***');
        const exportFrontMatterNotes = String(readInputValue(editor, '[name="exportFrontMatterNotes"]', '') || '');
        const exportIncludeChapterSummaries = readCheckboxChecked(editor, '[name="exportIncludeChapterSummaries"]', false);

        setBookComposerActiveDocKey(bookId, activeDocKey);
        publishWorldUIAction('book:update', {
            bookId,
            composerDocs: { [activeDocKey]: docContent },
            exportProfile: {
                title: exportTitle,
                subtitle: exportSubtitle,
                author: exportAuthor,
                chapterTitleMode: exportChapterTitleMode,
                sceneBreakMarker: exportSceneBreakMarker,
                frontMatterNotes: exportFrontMatterNotes,
                includeChapterSummaries: exportIncludeChapterSummaries
            }
        });
        // Keep user on composer tab and force refresh from normalized saved state.
        setBookWorkspaceActiveTab(bookId, 'composer');
        renderBookWorkspace();
        return true;
    }

    if (action === 'worldui:bookAgentOpen') {
        const bookId = String(eventPayload.bookId || project?.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!bookId || !project) return true;
        const book = getBookById(project, bookId);
        if (!book) {
            showCustomAlert('Book not found.', 'Book');
            return true;
        }
        if (!getBookAgentPresetName(project, book)) {
            setBookWorkspaceActiveTab(book.id, 'agent');
            openBookWorkspaceFallback(book.id, { tab: 'agent' });
            showCustomAlert('Set a Book Agent preset first (Agent tab) before opening the Book Agent chat.', 'Book Agent');
            return true;
        }
        const agentSession = ensureBookAgentSessionForBook(project, book);
        if (!agentSession) {
            showCustomAlert('Could not create Book Agent chat.', 'Book');
            return true;
        }
        publishWorldUIAction('book:setActive', { bookId: book.id });
        SessionHandlers.loadChatSession(agentSession.id);
        openChatWorkspaceFallback();
        return true;
    }

    if (action === 'worldui:bookAgentTabRefresh') {
        const bookId = String(eventPayload.bookId || project?.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!bookId) return true;
        setBookWorkspaceActiveTab(bookId, 'agent');
        openBookWorkspaceFallback(bookId, { tab: 'agent' });
        return true;
    }

    if (action === 'worldui:bookAgentBindCurrentAgent') {
        if (!project) return true;
        const bookId = String(eventPayload.bookId || project.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        const book = getBookById(project, bookId);
        if (!book) {
            showCustomAlert('Book not found.', 'Book Agent');
            return true;
        }
        const agentPresetName = getActiveSidebarAgentPresetName(project);
        if (!agentPresetName) {
            showCustomAlert('No Agent preset available. Create one in Agent & Asset Studio first.', 'Book Agent');
            return true;
        }
        publishWorldUIAction('book:update', {
            bookId,
            bookAgentConfig: { agentPresetName }
        });
        const refreshedProject = stateManager.getProject();
        const refreshedBook = getBookById(refreshedProject, bookId);
        const agentSession = refreshedBook?.bookAgentSessionId ? getSessionById(refreshedProject, refreshedBook.bookAgentSessionId) : null;
        if (agentSession) {
            agentSession.linkedEntity = { type: 'agent', name: agentPresetName };
            agentSession.updatedAt = Date.now();
            stateManager.setProject(refreshedProject);
            stateManager.updateAndPersistState();
        }
        showCustomAlert(`Book Agent is now bound to "${agentPresetName}".`, 'Book Agent');
        renderBookWorkspace();
        return true;
    }

    if (action === 'worldui:bookAgentConfigSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        if (!editor || !project) return true;
        const bookId = String(eventPayload.bookId || editor.dataset.bookId || '').trim();
        const book = getBookById(project, bookId);
        if (!book) {
            showCustomAlert('Book not found.', 'Book Agent');
            return true;
        }
        const agentPresetName = String(readInputValue(editor, '[name="bookAgentPresetName"]', '') || '').trim();
        const systemPromptOverride = String(readInputValue(editor, '[name="bookAgentSystemPromptOverride"]', '') || '');
        if (!agentPresetName || !project.agentPresets?.[agentPresetName]) {
            showCustomAlert('Please select a valid Agent preset for Book Agent.', 'Book Agent');
            return true;
        }
        publishWorldUIAction('book:update', {
            bookId,
            bookAgentConfig: {
                agentPresetName,
                systemPromptOverride
            }
        });
        const refreshedProject = stateManager.getProject();
        const refreshedBook = getBookById(refreshedProject, bookId);
        const agentSession = refreshedBook?.bookAgentSessionId ? getSessionById(refreshedProject, refreshedBook.bookAgentSessionId) : null;
        if (agentSession) {
            agentSession.linkedEntity = { type: 'agent', name: agentPresetName };
            agentSession.updatedAt = Date.now();
            stateManager.setProject(refreshedProject);
            stateManager.updateAndPersistState();
        }
        showCustomAlert(`Saved Book Agent settings (${agentPresetName}).`, 'Book Agent');
        renderBookWorkspace();
        return true;
    }

    if (action === 'worldui:codexAgentBindCurrentAgent') {
        if (!project) return true;
        const bookId = String(eventPayload.bookId || project.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        const book = getBookById(project, bookId);
        if (!book) {
            showCustomAlert('Book not found.', 'Codex Agent');
            return true;
        }
        const agentPresetName = getActiveSidebarAgentPresetName(project);
        if (!agentPresetName) {
            showCustomAlert('No Agent preset available. Create one in Agent & Asset Studio first.', 'Codex Agent');
            return true;
        }
        publishWorldUIAction('book:update', {
            bookId,
            codexAgentConfig: { useBookAgent: false, agentPresetName }
        });
        showCustomAlert(`Codex Agent is now bound to "${agentPresetName}".`, 'Codex Agent');
        renderBookWorkspace();
        return true;
    }

    if (action === 'worldui:codexAgentConfigSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        if (!editor || !project) return true;
        const bookId = String(eventPayload.bookId || editor.dataset.bookId || '').trim();
        const book = getBookById(project, bookId);
        if (!book) {
            showCustomAlert('Book not found.', 'Codex Agent');
            return true;
        }
        const useBookAgent = readCheckboxChecked(editor, '[name="codexUseBookAgent"]', true);
        const agentPresetName = String(readInputValue(editor, '[name="codexAgentPresetName"]', '') || '').trim();
        const systemPromptOverride = String(readInputValue(editor, '[name="codexSystemPromptOverride"]', '') || '');
        if (!useBookAgent && (!agentPresetName || !project.agentPresets?.[agentPresetName])) {
            showCustomAlert('Please select a valid Agent preset for Codex Agent.', 'Codex Agent');
            return true;
        }
        if (useBookAgent && !getBookAgentPresetName(project, book)) {
            showCustomAlert('Book Agent preset is not set yet. Set it first or uncheck "Use same Agent".', 'Codex Agent');
            return true;
        }
        publishWorldUIAction('book:update', {
            bookId,
            codexAgentConfig: {
                useBookAgent,
                agentPresetName: useBookAgent ? null : agentPresetName,
                systemPromptOverride
            }
        });
        showCustomAlert('Codex Agent settings saved.', 'Codex Agent');
        renderBookWorkspace();
        return true;
    }

    if (action === 'worldui:bookAgentAutoProposeToggle') {
        const bookId = String(eventPayload.bookId || project?.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!bookId || !project) return true;
        let book = getBookById(project, bookId);
        if (!book) return true;
        const seededResult = autoSeedBookAgentAndCodexBindingsIfMissing(project, book);
        if (seededResult.seeded) {
            book = seededResult.book;
        }
        const current = book?.agentAutomation?.worldProposals?.autoProposeEnabled === true;
        const explicit = String(eventPayload.enabled ?? '').trim().toLowerCase();
        const nextEnabled = explicit === 'true' ? true : (explicit === 'false' ? false : !current);
        if (nextEnabled && !getBookCodexAgentResolvedPresetName(project, book)) {
            showCustomAlert('Set a Codex Agent in the Codex tab before enabling Auto Propose.', 'Book Agent');
            return true;
        }
        const agentSession = book?.bookAgentSessionId ? getSessionById(project, book.bookAgentSessionId) : null;
        const usableCount = countUsableDialogueMessages(agentSession);
        const currentCursor = Number(book?.agentAutomation?.worldProposals?.lastScannedMessageCount);
        const nextCursor = nextEnabled && !Number.isFinite(currentCursor)
            ? usableCount
            : (nextEnabled && current === false && (eventPayload.seedCursor === 'true' || eventPayload.seedCursor === true)
                ? usableCount
                : (Number.isFinite(currentCursor) ? Math.max(0, Math.round(currentCursor)) : 0));

        publishWorldUIAction('book:update', {
            bookId,
            agentAutomation: {
                worldProposals: {
                    autoProposeEnabled: nextEnabled,
                    lastScannedMessageCount: nextCursor,
                    lastScannedAt: Date.now()
                }
            }
        });
        showCustomAlert(
            nextEnabled
                ? `Auto Propose from Book Agent enabled${seededResult.seeded ? ` (using ${seededResult.presetName})` : ''}${agentSession ? ' (starting from current point)' : ''}.`
                : 'Auto Propose from Book Agent disabled.',
            'Book Agent'
        );
        return true;
    }

    if (action === 'worldui:bookAgentScanNow') {
        const bookId = String(eventPayload.bookId || project?.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!bookId || !project) return true;
        let book = getBookById(project, bookId);
        if (!book) return true;
        const seededResult = autoSeedBookAgentAndCodexBindingsIfMissing(project, book);
        if (seededResult.seeded) {
            book = seededResult.book;
        }
        if (!getBookCodexAgentResolvedPresetName(project, book)) {
            showCustomAlert('Set a Codex Agent in the Codex tab before scanning Book Agent chat.', 'World Proposals');
            return true;
        }
        publishWorldUIAction('world:bookAgentScanProposals', {
            bookId,
            // Manual scan should re-scan recent Book Agent chat even if the auto cursor is already up-to-date.
            delta: false,
            requireAutoEnabled: false,
            silent: false
        });
        return true;
    }

    if (action === 'worldui:bookAgentResetScanCursor') {
        const bookId = String(eventPayload.bookId || project?.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!bookId) return true;
        publishWorldUIAction('world:bookAgentResetScanCursor', { bookId });
        return true;
    }

    if (action === 'worldui:bookWorldFocus') {
        const bookId = String(eventPayload.bookId || project?.activeBookId || bookWorkspaceUIState.activeBookId || '').trim();
        if (!bookId) return true;
        publishWorldUIAction('book:ensureWorld', { bookId, setActive: true });
        bookWorkspaceUIState.activeBookId = bookId;
        setBookWorkspaceActiveTab(bookId, 'world');
        renderBookWorkspace();
        return true;
    }

    if (action === 'worldui:openWorldWorkspace') {
        openWorldWorkspaceFallback();
        return true;
    }

    if (action === 'worldui:actToggleOpen') {
        const bookId = String(eventPayload.bookId || '').trim();
        if (!bookId) return true;
        const actNumberRaw = String(eventPayload.actNumber ?? '').trim();
        const actNumber = actNumberRaw ? parsePositiveIntOrNull(actNumberRaw) : null;
        const actKey = getBookActCollapseKey(bookId, actNumber);
        const explicitOpen = String(eventPayload.open ?? '').trim().toLowerCase();
        if (explicitOpen === 'true') {
            bookSidebarUIState.collapsedActKeys.delete(actKey);
        } else if (explicitOpen === 'false') {
            bookSidebarUIState.collapsedActKeys.add(actKey);
        } else if (bookSidebarUIState.collapsedActKeys.has(actKey)) {
            bookSidebarUIState.collapsedActKeys.delete(actKey);
        } else {
            bookSidebarUIState.collapsedActKeys.add(actKey);
        }
        if (project) {
            persistBookTreeCollapseStateToProject(project);
        } else {
            renderBookSidebarSection();
        }
        return true;
    }

    if (action === 'worldui:bookSettingsOpen') {
        if (!eventPayload.bookId) return true;
        worldInlineUIState.editingBookId = null;
        bookSidebarUIState.modal = { type: 'book-settings', bookId: eventPayload.bookId };
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:chapterSettingsOpen') {
        if (!eventPayload.sessionId) return true;
        worldInlineUIState.editingChapterMetaSessionId = null;
        bookSidebarUIState.modal = { type: 'chapter-settings', sessionId: eventPayload.sessionId };
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:chapterMoveToActOpen') {
        const sessionId = String(eventPayload.sessionId || '').trim();
        if (!sessionId) return true;
        bookSidebarUIState.modal = { type: 'chapter-move-act', sessionId };
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:chapterMoveToActCancel') {
        if (bookSidebarUIState.modal?.type === 'chapter-move-act') {
            bookSidebarUIState.modal = null;
        }
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:chapterMoveToActChoose') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        if (!editor) return true;
        const input = editor.querySelector('[name="moveActNumber"]');
        if (!(input instanceof HTMLInputElement)) return true;
        input.value = String(eventPayload.actNumber || '');
        input.focus();
        input.select?.();
        return true;
    }

    if (action === 'worldui:chapterMoveToActSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        const sessionId = String(eventPayload.sessionId || editor?.dataset?.sessionId || '').trim();
        if (!editor || !sessionId) return true;
        const rawValue = String(readInputValue(editor, '[name="moveActNumber"]', '') || '').trim();
        if (!rawValue) {
            publishWorldUIAction('chapter:moveToAct', { sessionId, actNumber: null });
            bookSidebarUIState.modal = null;
            renderWorldUISurfaces();
            return true;
        }
        const actNumber = parsePositiveIntOrNull(rawValue);
        if (!actNumber) {
            showCustomAlert('Please enter a valid positive act number.', 'Book');
            return true;
        }
        bookSidebarUIState.modal = null;
        publishWorldUIAction('chapter:moveToAct', { sessionId, actNumber });
        return true;
    }

    if (action === 'worldui:actSettingsOpen') {
        const bookId = String(eventPayload.bookId || '').trim();
        const actNumber = parsePositiveIntOrNull(eventPayload.actNumber);
        if (!bookId || !actNumber) return true;
        bookSidebarUIState.modal = { type: 'act-settings', bookId, actNumber };
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:bookActCreate') {
        if (!project) return true;
        const bookId = String(eventPayload.bookId || project.activeBookId || '').trim();
        const book = getBookById(project, bookId);
        if (!book) {
            showCustomAlert('Book not found.', 'Book');
            return true;
        }
        const nextActNumber = getNextBookActNumber(project, book);
        bookSidebarUIState.modal = { type: 'act-settings', bookId: book.id, actNumber: nextActNumber };
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:actEditCancel') {
        if (bookSidebarUIState.modal?.type === 'act-settings') {
            bookSidebarUIState.modal = null;
        }
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:actEditSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        const bookId = String(eventPayload.bookId || editor?.dataset?.bookId || '').trim();
        const actNumber = parsePositiveIntOrNull(eventPayload.actNumber || readInputValue(editor, '[name="actNumber"]', ''));
        if (!bookId || !actNumber) {
            showCustomAlert('Act number is required.', 'Book');
            return true;
        }
        const title = String(readInputValue(editor, '[name="actTitle"]', '') || '').trim();
        const summary = String(readInputValue(editor, '[name="actSummary"]', '') || '');
        publishWorldUIAction('book:actUpsert', { bookId, actNumber, title, summary });
        bookSidebarUIState.modal = null;
        renderWorldUISurfaces();
        return true;
    }

    if (action === 'worldui:bookChapterCreate') {
        if (!project) return true;
        const bookId = String(eventPayload.bookId || project.activeBookId || '').trim();
        const book = getBookById(project, bookId);
        if (!book) {
            showCustomAlert('Book not found.', 'Book');
            return true;
        }
        const actNumber = parsePositiveIntOrNull(eventPayload.actNumber);
        try {
            publishWorldUIAction('book:setActive', { bookId: book.id });
            const previousSessionId = stateManager.getProject()?.activeSessionId || null;
            SessionHandlers.createNewChatSession({ kind: 'chapter' });
            const updatedProject = stateManager.getProject();
            const newSessionId = updatedProject?.activeSessionId || null;
            if (!newSessionId || newSessionId === previousSessionId) {
                showCustomAlert('Could not create a new chapter chat.', 'Book');
                return true;
            }
            publishWorldUIAction('chapter:assignToBook', {
                sessionId: newSessionId,
                bookId: book.id,
                ...(actNumber ? { actNumber } : {})
            });
            openChatWorkspaceFallback();
            bookSidebarUIState.modal = { type: 'chapter-settings', sessionId: newSessionId };
            renderWorldUISurfaces();
        } catch (error) {
            console.error('Failed to create chapter from Book tree:', error);
            showCustomAlert('Failed to create chapter.', 'Book');
        }
        return true;
    }

    if (action === 'worldui:bookChapterOpen') {
        const sessionId = String(eventPayload.sessionId || '').trim();
        const bookId = String(eventPayload.bookId || '').trim() || null;
        if (!sessionId || !project) return true;
        if (bookId) {
            publishWorldUIAction('book:setActive', { bookId });
        }
        bookSidebarUIState.modal = null;
        try {
            SessionHandlers.loadChatSession(sessionId);
            openChatWorkspaceFallback();
        } catch (error) {
            console.error('Failed to open chapter session from Book tree:', error);
            showCustomAlert('Could not open chapter chat.', 'Book');
        }
        return true;
    }

    if (action === 'worldui:bookCreateStart') {
        worldInlineUIState.creatingBook = {
            linkedWorldId: eventPayload.linkedWorldId || null
        };
        worldInlineUIState.creatingWorld = false;
        bookSidebarUIState.modal = { type: 'book-create' };
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:bookCreateCancel') {
        worldInlineUIState.creatingBook = false;
        if (bookSidebarUIState.modal?.type === 'book-create') {
            bookSidebarUIState.modal = null;
        }
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:bookCreateSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        if (!editor || !project) return true;
        const name = String(readInputValue(editor, '[name="newBookName"]', '') || '').trim();
        if (!name) {
            showCustomAlert('Book name is required.', 'Info');
            return true;
        }
        const description = String(readInputValue(editor, '[name="newBookDescription"]', '') || '');
        const linkedWorldIdRaw = String(readInputValue(editor, '[name="newBookLinkedWorldId"]', '') || '').trim();
        const linkedWorldId = linkedWorldIdRaw || null;
        const autoNumberChapters = readCheckboxChecked(editor, '[name="newBookAutoNumber"]', true);
        worldInlineUIState.creatingBook = false;
        if (bookSidebarUIState.modal?.type === 'book-create') {
            bookSidebarUIState.modal = null;
        }
        publishWorldUIAction('book:create', {
            name,
            description,
            linkedWorldId,
            autoNumberChapters
        });
        const createdProject = stateManager.getProject();
        const createdBookId = String(createdProject?.activeBookId || '').trim();
        const createdBook = createdBookId ? getBookById(createdProject, createdBookId) : null;
        if (createdBook) {
            // Book-first default scaffold: create Act 1 and Chapter 1 automatically.
            publishWorldUIAction('book:actUpsert', {
                bookId: createdBook.id,
                actNumber: 1,
                title: 'Act 1',
                summary: ''
            });
            const previousSessionId = stateManager.getProject()?.activeSessionId || null;
            SessionHandlers.createNewChatSession({ kind: 'chapter' });
            const postSessionProject = stateManager.getProject();
            const newSessionId = postSessionProject?.activeSessionId || null;
            if (newSessionId && newSessionId !== previousSessionId) {
                publishWorldUIAction('chapter:assignToBook', {
                    sessionId: newSessionId,
                    bookId: createdBook.id,
                    actNumber: 1,
                    chapterNumber: 1,
                    revealScope: { asOfChapter: 1 },
                    writingMode: 'writing'
                });
            }
            bookWorkspaceUIState.activeBookId = createdBook.id;
            setBookWorkspaceActiveTab(createdBook.id, 'overview');
            openBookWorkspaceFallback(createdBook.id, { tab: 'overview' });
            showCustomAlert('Created Book with Act 1 / Chapter 1.', 'Book');
        }
        return true;
    }

    if (action === 'worldui:worldCreateStart') {
        worldInlineUIState.creatingWorld = {
            scope: String(eventPayload.scope || '').trim().toLowerCase() === 'shared' ? 'shared' : 'unassigned'
        };
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:worldCreateCancel') {
        worldInlineUIState.creatingWorld = false;
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:worldCreateSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        if (!editor || !project) return true;
        const name = String(readInputValue(editor, '[name="newWorldName"]', '') || '').trim();
        if (!name) {
            showCustomAlert('World name is required.', 'Info');
            return true;
        }
        const description = String(readInputValue(editor, '[name="newWorldDescription"]', '') || '');
        const scope = (worldInlineUIState.creatingWorld && typeof worldInlineUIState.creatingWorld === 'object')
            ? (String(worldInlineUIState.creatingWorld.scope || '').trim().toLowerCase() === 'shared' ? 'shared' : 'unassigned')
            : 'unassigned';
        worldInlineUIState.creatingWorld = false;
        publishWorldUIAction('world:create', { name, description, scope });
        return true;
    }

    if (action === 'worldui:itemCreateStart') {
        if (!project || !Array.isArray(project.worlds) || project.worlds.length === 0) {
            showCustomAlert('Create a World first before adding items.', 'Info');
            return true;
        }
        worldInlineUIState.creatingWorldItem = {
            worldId: eventPayload.worldId || project.activeWorldId || project.worlds[0]?.id || null,
            type: eventPayload.type || 'entity'
        };
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:itemCreateCancel') {
        worldInlineUIState.creatingWorldItem = null;
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:itemCreateSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        if (!editor || !project) return true;
        const worldId = String(readInputValue(editor, '[name="newItemWorldId"]', '') || '').trim();
        const type = String(readInputValue(editor, '[name="newItemType"]', 'entity') || 'entity').trim().toLowerCase() || 'entity';
        const title = String(readInputValue(editor, '[name="newItemTitle"]', '') || '').trim();
        if (!worldId) {
            showCustomAlert('Select a World for the new item.', 'Info');
            return true;
        }
        if (!title) {
            showCustomAlert('Item title is required.', 'Info');
            return true;
        }
        const summary = String(readInputValue(editor, '[name="newItemSummary"]', '') || '');
        const tags = String(readInputValue(editor, '[name="newItemTags"]', '') || '')
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean);
        const visibility = String(readInputValue(editor, '[name="newItemVisibility"]', 'revealed') || 'revealed')
            .trim()
            .toLowerCase() === 'gated'
            ? 'gated'
            : 'revealed';
        const revealChapter = parsePositiveIntOrNull(readInputValue(editor, '[name="newItemRevealChapter"]', ''));
        const revealGate = visibility === 'gated'
            ? (revealChapter
                ? { kind: 'chapter_threshold', value: revealChapter }
                : { kind: 'manual_unlock', unlocked: false })
            : null;

        worldInlineUIState.creatingWorldItem = null;
        publishWorldUIAction('world:itemCreate', {
            worldId,
            type,
            title,
            summary,
            tags,
            status: 'canon',
            visibility,
            revealGate
        });
        return true;
    }

    if (action === 'worldui:bookEditStart') {
        worldInlineUIState.editingBookId = eventPayload.bookId || null;
        worldInlineUIState.editingWorldItemId = null;
        if (eventPayload.bookId) {
            bookSidebarUIState.modal = { type: 'book-settings', bookId: eventPayload.bookId };
        }
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:bookEditCancel') {
        if (!eventPayload.bookId || worldInlineUIState.editingBookId === eventPayload.bookId) {
            worldInlineUIState.editingBookId = null;
        }
        if (!eventPayload.bookId || bookSidebarUIState.modal?.bookId === eventPayload.bookId) {
            bookSidebarUIState.modal = null;
        }
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:bookEditSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        const bookId = eventPayload.bookId || editor?.dataset?.bookId || null;
        if (!bookId || !project) return true;
        const name = String(readInputValue(editor, '[name="bookName"]', '') || '').trim();
        const description = String(readInputValue(editor, '[name="bookDescription"]', '') || '');
        const linkedWorldIdRaw = String(readInputValue(editor, '[name="linkedWorldId"]', '') || '').trim();
        const linkedWorldId = linkedWorldIdRaw || null;
        const autoNumberChapters = readCheckboxChecked(editor, '[name="autoNumberChapters"]', true);
        if (!name) return true;

        worldInlineUIState.editingBookId = null;
        if (!bookSidebarUIState.modal || bookSidebarUIState.modal.type === 'book-settings') {
            bookSidebarUIState.modal = null;
        }
        publishWorldUIAction('book:update', { bookId, name, description, autoNumberChapters });
        publishWorldUIAction('book:linkWorld', { bookId, worldId: linkedWorldId });
        return true;
    }

    if (action === 'worldui:chapterMetaEditStart') {
        worldInlineUIState.editingChapterMetaSessionId = eventPayload.sessionId || null;
        if (eventPayload.sessionId) {
            bookSidebarUIState.modal = { type: 'chapter-settings', sessionId: eventPayload.sessionId };
        }
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:chapterMetaCancel') {
        if (!eventPayload.sessionId || worldInlineUIState.editingChapterMetaSessionId === eventPayload.sessionId) {
            worldInlineUIState.editingChapterMetaSessionId = null;
        }
        if (!eventPayload.sessionId || bookSidebarUIState.modal?.sessionId === eventPayload.sessionId) {
            bookSidebarUIState.modal = null;
        }
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:chapterMetaSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        const sessionId = eventPayload.sessionId || editor?.dataset?.sessionId || null;
        if (!sessionId) return true;

        const actNumber = parsePositiveIntOrNull(readInputValue(editor, '[name="actNumber"]', ''));
        const chapterNumber = parsePositiveIntOrNull(readInputValue(editor, '[name="chapterNumber"]', ''));
        const asOfChapter = parsePositiveIntOrNull(readInputValue(editor, '[name="asOfChapter"]', ''));
        const chapterTitle = String(readInputValue(editor, '[name="chapterTitle"]', '') || '');
        const chapterSummary = String(readInputValue(editor, '[name="chapterSummary"]', '') || '');
        const writingMode = String(readInputValue(editor, '[name="writingMode"]', 'writing') || 'writing')
            .trim()
            .toLowerCase() === 'author'
            ? 'author'
            : 'writing';

        worldInlineUIState.editingChapterMetaSessionId = null;
        if (!bookSidebarUIState.modal || bookSidebarUIState.modal.type === 'chapter-settings') {
            bookSidebarUIState.modal = null;
        }
        publishWorldUIAction('chapter:updateMeta', {
            sessionId,
            actNumber,
            chapterNumber,
            chapterTitle,
            chapterSummary,
            writingMode,
            revealScope: { asOfChapter }
        });
        return true;
    }

    if (action === 'worldui:itemEditStart') {
        worldInlineUIState.editingWorldItemId = eventPayload.itemId || null;
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:itemEditCancel') {
        if (!eventPayload.itemId || worldInlineUIState.editingWorldItemId === eventPayload.itemId) {
            worldInlineUIState.editingWorldItemId = null;
        }
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:itemEditSave') {
        const editor = actionTarget.closest('.studio-world-inline-editor');
        const worldId = eventPayload.worldId || editor?.dataset?.worldId || null;
        const itemId = eventPayload.itemId || editor?.dataset?.itemId || null;
        if (!worldId || !itemId || !project) return true;

        const title = String(readInputValue(editor, '[name="itemTitle"]', '') || '').trim();
        if (!title) return true;
        const type = String(readInputValue(editor, '[name="itemType"]', 'note') || 'note').trim().toLowerCase() || 'note';
        const summary = String(readInputValue(editor, '[name="itemSummary"]', '') || '');
        const tags = String(readInputValue(editor, '[name="itemTags"]', '') || '')
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean);
        const visibility = String(readInputValue(editor, '[name="itemVisibility"]', 'revealed') || 'revealed')
            .trim()
            .toLowerCase() === 'gated'
            ? 'gated'
            : 'revealed';
        const revealChapter = parsePositiveIntOrNull(readInputValue(editor, '[name="itemRevealChapter"]', ''));
        const manualUnlocked = readCheckboxChecked(editor, '[name="itemManualUnlocked"]', false);

        let revealGate = null;
        if (visibility === 'gated') {
            if (revealChapter) {
                revealGate = { kind: 'chapter_threshold', value: revealChapter };
            } else {
                revealGate = { kind: 'manual_unlock', unlocked: manualUnlocked };
            }
        }

        worldInlineUIState.editingWorldItemId = null;
        publishWorldUIAction('world:itemUpdate', {
            worldId,
            itemId,
            patch: {
                type,
                title,
                summary,
                tags,
                visibility,
                revealGate
            }
        });
        return true;
    }

    return false;
}

function dispatchWorldAction(actionTarget, event) {
    if (!actionTarget) return false;
    const action = String(actionTarget.dataset.action || '').trim();
    if (!action) return false;

    event.preventDefault();
    event.stopPropagation();

    const itemContext = actionTarget.closest('.item');
    const eventPayload = { ...(itemContext?.dataset || {}) };
    Object.entries(actionTarget.dataset || {}).forEach(([key, value]) => {
        if (key === 'action' || key === 'data') return;
        eventPayload[key] = value;
    });

    if (actionTarget.dataset.data) {
        try {
            Object.assign(eventPayload, JSON.parse(actionTarget.dataset.data));
        } catch (error) {
            console.error('Failed to parse world UI action payload:', error);
        }
    }

    if (action === 'toggle-menu') {
        toggleDropdown(event);
        return true;
    }

    if (handleLocalWorldUIAction(actionTarget, eventPayload)) {
        actionTarget.closest('.dropdown.open')?.classList.remove('open', 'portal-open');
        return true;
    }

    stateManager.bus.publish(action, eventPayload);
    actionTarget.closest('.dropdown.open')?.classList.remove('open', 'portal-open');
    return true;
}

function clearBookTreeDropIndicators(container) {
    if (!container) return;
    container.querySelectorAll('.book-tree-row.is-drop-before, .book-tree-row.is-drop-after, .book-tree-row.is-dragging')
        .forEach((row) => row.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging'));
}

function getBookTreeChapterRowFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('#book-sidebar-slot .book-tree-row.is-chapter');
}

function attachBookTreeDragSurface(container) {
    if (!container || container.dataset.bookTreeDragBound === 'true') return;
    container.dataset.bookTreeDragBound = 'true';

    container.addEventListener('dragstart', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.dropdown')) return;
        const row = getBookTreeChapterRowFromEventTarget(target);
        if (!row || !container.contains(row)) return;

        bookTreeDndState.draggingSessionId = String(row.dataset.sessionId || '');
        bookTreeDndState.draggingBookId = String(row.dataset.bookId || '');
        row.classList.add('is-dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', bookTreeDndState.draggingSessionId);
        }
    });

    container.addEventListener('dragover', (event) => {
        const target = event.target;
        const row = getBookTreeChapterRowFromEventTarget(target);
        if (!row || !container.contains(row)) return;
        const draggingSessionId = bookTreeDndState.draggingSessionId;
        const draggingBookId = bookTreeDndState.draggingBookId;
        if (!draggingSessionId || !draggingBookId) return;
        if (row.dataset.sessionId === draggingSessionId) return;
        if (String(row.dataset.bookId || '') !== draggingBookId) return;

        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + (rect.height / 2);
        const position = event.clientY >= midpoint ? 'after' : 'before';
        clearBookTreeDropIndicators(container);
        row.classList.add(position === 'after' ? 'is-drop-after' : 'is-drop-before');
    });

    container.addEventListener('drop', (event) => {
        const target = event.target;
        const row = getBookTreeChapterRowFromEventTarget(target);
        if (!row || !container.contains(row)) return;
        const draggingSessionId = bookTreeDndState.draggingSessionId;
        const draggingBookId = bookTreeDndState.draggingBookId;
        if (!draggingSessionId || !draggingBookId) return;
        if (row.dataset.sessionId === draggingSessionId) return;
        if (String(row.dataset.bookId || '') !== draggingBookId) return;

        event.preventDefault();

        const rect = row.getBoundingClientRect();
        const midpoint = rect.top + (rect.height / 2);
        const position = event.clientY >= midpoint ? 'after' : 'before';

        stateManager.bus.publish('chapter:reorderInBook', {
            sessionId: draggingSessionId,
            targetSessionId: row.dataset.sessionId,
            position,
            adoptTargetAct: true
        });

        bookTreeDndState.justDroppedAt = Date.now();
        bookTreeDndState.draggingSessionId = null;
        bookTreeDndState.draggingBookId = null;
        clearBookTreeDropIndicators(container);
    });

    container.addEventListener('dragend', () => {
        bookTreeDndState.draggingSessionId = null;
        bookTreeDndState.draggingBookId = null;
        clearBookTreeDropIndicators(container);
    });
}

function attachWorldActionSurface(container) {
    if (!container || container.dataset.worldUiListenerAttached === 'true') return;
    container.dataset.worldUiListenerAttached = 'true';

    if (container.id === 'book-sidebar-slot') {
        attachBookTreeDragSurface(container);
    }

    container.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        if (container.id === 'book-sidebar-slot' && Date.now() - (bookTreeDndState.justDroppedAt || 0) < 250) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        const actionTarget = target.closest('[data-action]');
        if (!actionTarget || !container.contains(actionTarget)) return;

        const inlineEditor = target.closest('.studio-world-inline-editor');
        if (inlineEditor && actionTarget === inlineEditor.closest('.item[data-action]')) {
            return;
        }
        dispatchWorldAction(actionTarget, event);
    });
}

let isWorldUIInitialized = false;

function setWorkspaceToggleActiveFallback(workspace = 'world') {
    document.querySelectorAll('.header-center .menu-toggle-btn').forEach(btn => btn.classList.remove('active'));
    if (workspace === 'world') {
        document.getElementById('switch-to-world-btn')?.classList.add('active');
    } else if (workspace === 'photo') {
        document.getElementById('switch-to-photo-btn')?.classList.add('active');
    } else if (workspace === 'composer') {
        document.getElementById('switch-to-composer-btn')?.classList.add('active');
    } else {
        document.getElementById('switch-to-chat-btn')?.classList.add('active');
    }
}

function openChatWorkspaceFallback() {
    const mainContentWrapper = document.querySelector('#main-chat-panel .main-content-wrapper');
    if (mainContentWrapper) {
        mainContentWrapper.classList.remove('photo-studio-active');
        mainContentWrapper.classList.remove('world-workspace-active');
    }
    document.getElementById('world-workspace')?.classList.add('hidden');
    document.getElementById('book-workspace')?.classList.add('hidden');
    setWorkspaceToggleActiveFallback('chat');
}

function openWorldWorkspaceFallback() {
    ensureWorldWorkspaceSurface();
    renderWorldWorkspace();

    const mainContentWrapper = document.querySelector('#main-chat-panel .main-content-wrapper');
    if (mainContentWrapper) {
        mainContentWrapper.classList.remove('photo-studio-active');
        mainContentWrapper.classList.add('world-workspace-active');
    }

    document.getElementById('kieai-studio-workspace')?.classList.add('hidden');
    document.getElementById('book-workspace')?.classList.add('hidden');
    document.getElementById('world-workspace')?.classList.remove('hidden');
    setWorkspaceToggleActiveFallback('world');
}

function openBookWorkspaceFallback(bookId = null, { tab = 'overview' } = {}) {
    ensureBookWorkspaceSurface();
    if (bookId) {
        bookWorkspaceUIState.activeBookId = String(bookId);
        setBookWorkspaceActiveTab(bookWorkspaceUIState.activeBookId, tab);
    }
    renderBookWorkspace();

    const mainContentWrapper = document.querySelector('#main-chat-panel .main-content-wrapper');
    if (mainContentWrapper) {
        mainContentWrapper.classList.remove('photo-studio-active');
        mainContentWrapper.classList.add('world-workspace-active');
    }

    document.getElementById('kieai-studio-workspace')?.classList.add('hidden');
    document.getElementById('world-workspace')?.classList.add('hidden');
    document.getElementById('book-workspace')?.classList.remove('hidden');
    setWorkspaceToggleActiveFallback('world');
}

export function openBookWorkspaceFromExternal({ bookId = null, tab = 'overview' } = {}) {
    const normalizedBookId = typeof bookId === 'string' ? bookId.trim() : '';
    if (!normalizedBookId) return false;
    const normalizedTab = normalizeBookWorkspaceTab(tab);
    if (normalizedTab === 'changes') {
        const project = stateManager.getProject();
        if (project) {
            ensureWorldStudioState(project);
            markBookChangesViewed(project, normalizedBookId);
        }
    }
    openBookWorkspaceFallback(normalizedBookId, { tab: normalizedTab });
    return true;
}

function attachWorldWorkspaceSwitchFallback() {
    const switchButton = document.getElementById('switch-to-world-btn');
    if (!switchButton || switchButton.dataset.worldUiFallbackBound === 'true') return;
    switchButton.dataset.worldUiFallbackBound = 'true';

    switchButton.addEventListener('click', () => {
        try {
            openWorldWorkspaceFallback();
        } catch (error) {
            console.error('World workspace fallback open failed:', error);
        }
    });
}

function renderWorldUISurfaces() {
    renderBookSidebarSection();
    renderBookWorkspace();
    renderWorldWorkspace();
    renderBookSidebarModal();
}

export function initWorldUI() {
    if (isWorldUIInitialized) return;
    isWorldUIInitialized = true;

    const { bookSlot, bookWorkspace, worldWorkspace } = ensureWorldUISurfacesDOM();
    const bookSidebarModal = ensureBookSidebarModalSurface();
    attachWorldActionSurface(bookSlot);
    attachWorldActionSurface(bookWorkspace);
    attachWorldActionSurface(worldWorkspace);
    attachWorldActionSurface(bookSidebarModal);
    attachWorldWorkspaceSwitchFallback();

    stateManager.bus.subscribe('project:loaded', () => {
        clearInlineEditors();
        renderWorldUISurfaces();
    });
    stateManager.bus.subscribe('project:stateChanged', renderWorldUISurfaces);
    stateManager.bus.subscribe('world:dataChanged', renderWorldUISurfaces);
    stateManager.bus.subscribe('session:loaded', renderWorldUISurfaces);
    stateManager.bus.subscribe('session:listChanged', renderWorldUISurfaces);
    stateManager.bus.subscribe('chapter:overviewSummaryProgress', handleChapterOverviewSummaryProgressEvent);
    stateManager.bus.subscribe('book:overviewSummaryBatchProgress', handleBookOverviewSummaryBatchProgressEvent);

    try {
        renderWorldUISurfaces();
    } catch (error) {
        console.error('World UI initial render failed:', error);
    }
}

export function loadAndRenderWorldStudioSections(assetsContainer, options = {}) {
    if (!assetsContainer) return;
    const project = stateManager.getProject();
    if (!project) return;
    ensureWorldStudioState(project);

    if (options.showBooks !== false) {
        renderBooksSection(assetsContainer, project);
    }
    if (options.showWorlds !== false) {
        renderWorldsSection(assetsContainer, project);
    }
    if (options.showChanges !== false) {
        renderWorldChangesSection(assetsContainer, project);
    }
}

export { renderBookSidebarSection, renderBookWorkspace, renderWorldWorkspace, renderWorldPeekSection };

// Fallback auto-init in case app initialization order skips or aborts before calling initWorldUI().
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            try {
                initWorldUI();
            } catch (error) {
                console.error('World UI auto-init failed:', error);
            }
        }, { once: true });
    } else {
        setTimeout(() => {
            try {
                initWorldUI();
            } catch (error) {
                console.error('World UI auto-init failed:', error);
            }
        }, 0);
    }
}
