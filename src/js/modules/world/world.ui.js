// ===============================================
// FILE: src/js/modules/world/world.ui.js
// DESCRIPTION: Minimal Studio UI sections for Books and Worlds (MVP).
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { createDropdown, showCustomAlert, toggleDropdown } from '../../core/core.ui.js';
import {
    CHAPTER_WRITING_MODE_AUTHOR,
    CHAPTER_WRITING_MODE_WRITING,
    ensureProjectBooks,
    ensureProjectWorlds,
    isWorldItemVisibleForChapter
} from './world.schema-utils.js';
import { buildWorldStructuredContextPack } from './world.retrieval.js';

function ensureWorldStudioState(project) {
    if (!project) return;
    ensureProjectWorlds(project);
    ensureProjectBooks(project);
}

const worldInlineUIState = {
    editingBookId: null,
    editingWorldItemId: null,
    editingChapterMetaSessionId: null,
    creatingBook: false,
    creatingWorld: false,
    creatingWorldItem: null
};

function clearInlineEditors() {
    worldInlineUIState.editingBookId = null;
    worldInlineUIState.editingWorldItemId = null;
    worldInlineUIState.editingChapterMetaSessionId = null;
    worldInlineUIState.creatingBook = false;
    worldInlineUIState.creatingWorld = false;
    worldInlineUIState.creatingWorldItem = null;
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
                    <button type="button" class="btn btn-small" data-action="worldui:worldCreateStart">New World</button>
                    <button type="button" class="btn btn-small btn-secondary" data-action="worldui:itemCreateStart">New Item</button>
                    <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookCreateStart">New Book</button>
                    <button type="button" class="btn btn-small btn-secondary" data-action="world:proposeFromCurrentChat">Propose Updates</button>
                </div>
            </div>
            <div id="world-workspace-content" class="world-workspace-content"></div>
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

function ensureWorldUISurfacesDOM() {
    const bookSlot = ensureBookSidebarSlot();
    const worldWorkspace = ensureWorldWorkspaceSurface();
    return { bookSlot, worldWorkspace };
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
        : (project?.activeWorldId || '');
    const worldOptions = [{ value: '', label: '(No linked world)' }]
        .concat((project?.worlds || []).map(world => ({ value: world.id, label: world.name || world.id })));
    grid.appendChild(createInlineField('Linked world', createInlineSelect({
        name: 'newBookLinkedWorldId',
        value: defaultLinkedWorldId,
        options: worldOptions
    })));

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

    grid.appendChild(createInlineField('World name', createInlineTextInput({
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

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:worldCreateSave',
        cancelAction: 'worldui:worldCreateCancel',
        saveLabel: 'Create World'
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

    editor.appendChild(grid);
    editor.appendChild(createInlineEditorActions({
        saveAction: 'worldui:chapterMetaSave',
        cancelAction: 'worldui:chapterMetaCancel',
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
        { label: 'Assign Current Chat', action: 'chapter:assignToBook', data: { bookId: book.id } },
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
    const activeSession = getActiveSession(project);
    const activeWorld = getWorldById(project, project.activeWorldId);

    const { section, box } = makeSection('📖 Books', {
        sectionClassName: 'book-projects-section',
        createAction: 'worldui:bookCreateStart',
        createTitle: 'Create Book',
        dropdownOptions: [
            { label: 'New Book...', action: 'worldui:bookCreateStart' },
            activeWorld ? { label: 'New Book (link active world)', action: 'worldui:bookCreateStart', data: { linkedWorldId: activeWorld.id } } : null,
            { label: 'Assign Current Chat...', action: 'chapter:assignToBookPrompt' }
        ].filter(Boolean)
    });

    box.appendChild(buildActiveChatBookCard(project, activeSession));
    if (worldInlineUIState.creatingBook) {
        box.appendChild(buildBookCreateInlineEditor(project));
    }

    const list = document.createElement('div');
    list.className = 'item-list';
    const books = Array.isArray(project.books) ? project.books : [];

    if (books.length === 0) {
        list.innerHTML = '<p class="no-items-message">No books yet. Create one to organize chats as chapters.</p>';
    } else {
        books.forEach(book => {
            list.appendChild(buildBookItem(project, book, activeSession));
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
        `${countLinkedBooks(project, world.id)} linked books`
    ]));

    if (project.activeWorldId === world.id) {
        const footer = document.createElement('div');
        footer.className = 'studio-world-item-footer';
        footer.appendChild(createLabelPill('Active World', 'active'));
        item.appendChild(footer);
    }

    return item;
}

function renderWorldsSection(assetsContainer, project) {
    const activeWorld = getWorldById(project, project.activeWorldId);
    const activeBook = getBookById(project, project.activeBookId);
    const { section, box } = makeSection('🌍 Worlds', {
        sectionClassName: 'world-library-section',
        createAction: 'worldui:worldCreateStart',
        createTitle: 'Create World',
        dropdownOptions: [
            { label: 'New World...', action: 'worldui:worldCreateStart' },
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
        worldList.innerHTML = '<p class="no-items-message">No worlds yet. Create one to store canon, rules, places, and events.</p>';
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
    const metaParts = [
        activeWorld ? `Active World: ${activeWorld.name}` : 'No active world',
        activeBook ? `Active Book: ${activeBook.name}` : 'No active book',
        activeSession ? `Chat: ${activeSession.name}` : 'No active chat',
        `${pendingChanges} pending change${pendingChanges === 1 ? '' : 's'}`
    ];
    meta.textContent = metaParts.join(' • ');

    const actions = document.createElement('div');
    actions.className = 'studio-world-focus-actions';
    actions.innerHTML = `
        <button type="button" class="btn btn-small" data-action="worldui:worldCreateStart">New World</button>
        <button type="button" class="btn btn-small btn-secondary" data-action="worldui:itemCreateStart">New Item</button>
        <button type="button" class="btn btn-small btn-secondary" data-action="worldui:bookCreateStart">New Book</button>
        <button type="button" class="btn btn-small btn-secondary" data-action="book:linkWorldPrompt">Link Active Book</button>
        <button type="button" class="btn btn-small btn-secondary" data-action="world:proposeFromCurrentChat">Propose World Updates</button>
    `;

    card.append(title, meta, actions);
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

function publishWorldUIAction(action, payload) {
    stateManager.bus.publish(action, payload || {});
}

function handleLocalWorldUIAction(actionTarget, eventPayload) {
    const action = String(actionTarget?.dataset?.action || '').trim();
    if (!action.startsWith('worldui:')) return false;

    const project = stateManager.getProject();

    if (action === 'worldui:bookCreateStart') {
        worldInlineUIState.creatingBook = {
            linkedWorldId: eventPayload.linkedWorldId || project?.activeWorldId || null
        };
        worldInlineUIState.creatingWorld = false;
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:bookCreateCancel') {
        worldInlineUIState.creatingBook = false;
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
        publishWorldUIAction('book:create', {
            name,
            description,
            linkedWorldId,
            autoNumberChapters
        });
        return true;
    }

    if (action === 'worldui:worldCreateStart') {
        worldInlineUIState.creatingWorld = true;
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
        worldInlineUIState.creatingWorld = false;
        publishWorldUIAction('world:create', { name, description });
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
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:bookEditCancel') {
        if (!eventPayload.bookId || worldInlineUIState.editingBookId === eventPayload.bookId) {
            worldInlineUIState.editingBookId = null;
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
        publishWorldUIAction('book:update', { bookId, name, description, autoNumberChapters });
        publishWorldUIAction('book:linkWorld', { bookId, worldId: linkedWorldId });
        return true;
    }

    if (action === 'worldui:chapterMetaEditStart') {
        worldInlineUIState.editingChapterMetaSessionId = eventPayload.sessionId || null;
        renderWorldUISurfaces();
        return true;
    }
    if (action === 'worldui:chapterMetaCancel') {
        if (!eventPayload.sessionId || worldInlineUIState.editingChapterMetaSessionId === eventPayload.sessionId) {
            worldInlineUIState.editingChapterMetaSessionId = null;
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
        const writingMode = String(readInputValue(editor, '[name="writingMode"]', 'writing') || 'writing')
            .trim()
            .toLowerCase() === 'author'
            ? 'author'
            : 'writing';

        worldInlineUIState.editingChapterMetaSessionId = null;
        publishWorldUIAction('chapter:updateMeta', {
            sessionId,
            actNumber,
            chapterNumber,
            chapterTitle,
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

function attachWorldActionSurface(container) {
    if (!container || container.dataset.worldUiListenerAttached === 'true') return;
    container.dataset.worldUiListenerAttached = 'true';

    container.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

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

function openWorldWorkspaceFallback() {
    ensureWorldWorkspaceSurface();
    renderWorldWorkspace();

    const mainContentWrapper = document.querySelector('#main-chat-panel .main-content-wrapper');
    if (mainContentWrapper) {
        mainContentWrapper.classList.remove('photo-studio-active');
        mainContentWrapper.classList.add('world-workspace-active');
    }

    document.getElementById('kieai-studio-workspace')?.classList.add('hidden');
    document.getElementById('world-workspace')?.classList.remove('hidden');
    setWorkspaceToggleActiveFallback('world');
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
    renderWorldWorkspace();
}

export function initWorldUI() {
    if (isWorldUIInitialized) return;
    isWorldUIInitialized = true;

    const { bookSlot, worldWorkspace } = ensureWorldUISurfacesDOM();
    attachWorldActionSurface(bookSlot);
    attachWorldActionSurface(worldWorkspace);
    attachWorldWorkspaceSwitchFallback();

    stateManager.bus.subscribe('project:loaded', () => {
        clearInlineEditors();
        renderWorldUISurfaces();
    });
    stateManager.bus.subscribe('project:stateChanged', renderWorldUISurfaces);
    stateManager.bus.subscribe('world:dataChanged', renderWorldUISurfaces);
    stateManager.bus.subscribe('session:loaded', renderWorldUISurfaces);
    stateManager.bus.subscribe('session:listChanged', renderWorldUISurfaces);

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

export { renderBookSidebarSection, renderWorldWorkspace, renderWorldPeekSection };

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
