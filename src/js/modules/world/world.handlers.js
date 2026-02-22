// ===============================================
// FILE: src/js/modules/world/world.handlers.js
// DESCRIPTION: Project-level CRUD and workflow handlers for World/Book/Chapter metadata (MVP).
// ===============================================

import { stateManager, defaultSystemUtilityAgent } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';
import { callLLM } from '../../core/core.api.js';
import { buildWorldStructuredContextPack } from './world.retrieval.js';
import {
    createBookId,
    createWorldChangeId,
    createWorldId,
    ensureProjectBooks,
    ensureProjectWorldChanges,
    ensureProjectWorlds,
    normalizeBook,
    normalizeChapterSessionMetadata,
    normalizeWorld,
    normalizeWorldChange,
    normalizeWorldItem
} from './world.schema-utils.js';

const WORLD_PROPOSAL_EXTRACTION_SCHEMA_VERSION = 1;

function getProject() {
    return stateManager.getProject();
}

function ensureWorldProjectState(project) {
    if (!project || typeof project !== 'object') return;
    ensureProjectWorlds(project);
    ensureProjectWorldChanges(project);
    ensureProjectBooks(project);
}

function publishWorldChanged({ worldId = null, bookId = null, reason = 'update' } = {}) {
    stateManager.bus.publish('world:dataChanged', { worldId, bookId, reason });
    stateManager.bus.publish('studio:contentShouldRender');
}

function persistWorldProjectState({ worldId = null, bookId = null, reason = 'update', includeSessionListRefresh = false } = {}) {
    const project = getProject();
    if (!project) return;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    if (includeSessionListRefresh) {
        stateManager.bus.publish('session:listChanged');
    }
    publishWorldChanged({ worldId, bookId, reason });
}

function findWorld(project, worldId) {
    if (!project || !worldId) return null;
    return (project.worlds || []).find(world => world.id === worldId) || null;
}

function findBook(project, bookId) {
    if (!project || !bookId) return null;
    return (project.books || []).find(book => book.id === bookId) || null;
}

function findSession(project, sessionId) {
    if (!project || !sessionId) return null;
    return (project.chatSessions || []).find(session => session.id === sessionId) || null;
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function uniquePush(list, value) {
    if (!Array.isArray(list) || !value) return list;
    if (!list.includes(value)) {
        list.push(value);
    }
    return list;
}

function removeValue(list, value) {
    if (!Array.isArray(list) || !value) return list;
    return list.filter(item => item !== value);
}

function sanitizeBookChapterReferences(project, book) {
    if (!book?.structure) return;
    const validSessionIds = new Set((project.chatSessions || []).map(session => session.id));
    book.structure.chapterSessionIds = ensureArray(book.structure.chapterSessionIds)
        .filter(sessionId => validSessionIds.has(sessionId));
}

function nextChapterNumberForBook(project, bookId) {
    const sessions = (project?.chatSessions || []).filter(session => session?.bookId === bookId);
    if (sessions.length === 0) return 1;
    const maxChapter = sessions.reduce((max, session) => {
        const chapterNumber = Number(session?.chapterNumber);
        return Number.isFinite(chapterNumber) && chapterNumber > max ? Math.round(chapterNumber) : max;
    }, 0);
    return Math.max(1, maxChapter + 1);
}

function nextActNumberForBook(project, bookId) {
    const sessions = (project?.chatSessions || []).filter(session => session?.bookId === bookId);
    if (sessions.length === 0) return 1;
    const maxAct = sessions.reduce((max, session) => {
        const actNumber = Number(session?.actNumber);
        return Number.isFinite(actNumber) && actNumber > max ? Math.round(actNumber) : max;
    }, 0);
    return Math.max(1, maxAct || 1);
}

function resolveTargetSessionId(payload = {}) {
    if (payload.sessionId) return payload.sessionId;
    return getProject()?.activeSessionId || null;
}

function cloneJsonish(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return Array.isArray(value) ? [...value] : { ...value };
    }
}

function extractTextFromMessageContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (part?.type === 'text') return part.text || '';
                if (part?.type === 'image_url') return '[image]';
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    if (content && typeof content === 'object') {
        try {
            return JSON.stringify(content);
        } catch (_error) {
            return String(content);
        }
    }
    return '';
}

function trimTextForPrompt(text, maxChars = 5000) {
    const normalized = String(text || '').trim();
    if (!normalized) return '';
    return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars)}\n...[trimmed]`;
}

function safeParseJsonBlock(text = '') {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenceMatch?.[1]?.trim() || raw;
    try {
        return JSON.parse(candidate);
    } catch (_error) {
        const objectMatch = raw.match(/\{[\s\S]*\}$/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch (_error2) {
                return null;
            }
        }
        return null;
    }
}

function getWorldProposalUtilityAgent(project) {
    const utilityAgent = project?.globalSettings?.systemUtilityAgent;
    if (utilityAgent?.model) {
        return { ...utilityAgent, temperature: 0.1 };
    }
    if (defaultSystemUtilityAgent?.model) {
        return { ...defaultSystemUtilityAgent, temperature: 0.1 };
    }
    return null;
}

function getRecentSessionMessagesForWorldProposal(session, maxMessages = 8) {
    const usableMessages = ensureArray(session?.history)
        .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
        .slice(-Math.max(2, maxMessages));

    return usableMessages.map((message, index) => {
        const speaker = message.speaker || message.role || 'unknown';
        const text = trimTextForPrompt(extractTextFromMessageContent(message.content), 1800) || '(no text)';
        return `[${index + 1}] ${speaker}\n${text}`;
    }).join('\n\n');
}

function buildWorldProposalExtractionPrompt({ session, world, worldContextPack, latestMessagesText }) {
    const visibleItems = Array.isArray(worldContextPack?.selectedItems) ? worldContextPack.selectedItems : [];
    const visibleLines = visibleItems.length > 0
        ? visibleItems.map(item => `- id=${item.id} | type=${item.type} | title=${item.title}`).join('\n')
        : '- (none)';

    return [
        'You are a continuity scribe for a writing app.',
        'Extract proposed updates to the World from the recent chat conversation.',
        'Return JSON only (no markdown).',
        '',
        `Schema version: ${WORLD_PROPOSAL_EXTRACTION_SCHEMA_VERSION}`,
        'Output format:',
        '{',
        '  "schemaVersion": 1,',
        '  "proposals": [',
        '    {',
        '      "proposalType": "create_item" | "edit_item",',
        '      "targetItemId": "required for edit_item, omit for create_item",',
        '      "afterPayload": {',
        '        "type": "entity|place|rule|event|note|source|relationship",',
        '        "title": "string",',
        '        "summary": "string",',
        '        "tags": ["optional", "tags"],',
        '        "visibility": "revealed|gated",',
        '        "revealGate": { "kind": "chapter_threshold", "value": number } | null',
        '      },',
        '      "reason": "short reason based on the conversation"',
        '    }',
        '  ]',
        '}',
        '',
        'Rules:',
        '- Only propose changes that are explicitly stated or strongly implied in the recent messages.',
        '- Prefer create_item unless an existing visible item clearly matches and should be edited.',
        '- Do not delete items.',
        '- Keep proposals concise and specific.',
        '- If no useful world updates are found, return {"schemaVersion":1,"proposals":[]}.',
        '',
        `Current session: ${session?.name || 'Untitled'} (Act ${session?.actNumber || '-'}, Chapter ${session?.chapterNumber || '-'})`,
        `World: ${world?.name || 'Unknown'}`,
        '',
        'Visible world items already in context (you may edit these by targetItemId):',
        visibleLines,
        '',
        'World Context Pack (spoiler-safe canonical context):',
        trimTextForPrompt(worldContextPack?.contextText || '(none)', 6000),
        '',
        'Recent chat messages:',
        latestMessagesText || '(none)'
    ].join('\n');
}

function normalizeExtractedProposalType(value) {
    const type = String(value || '').trim();
    if (type === 'edit_item') return 'edit_item';
    return 'create_item';
}

function normalizeExtractedAfterPayload(raw = {}) {
    const base = {
        type: String(raw?.type || 'note').trim().toLowerCase() || 'note',
        title: String(raw?.title || '').trim(),
        summary: typeof raw?.summary === 'string' ? raw.summary : '',
        tags: Array.isArray(raw?.tags)
            ? raw.tags.map(tag => String(tag || '').trim()).filter(Boolean)
            : [],
        visibility: String(raw?.visibility || '').trim().toLowerCase() === 'gated' ? 'gated' : 'revealed',
        revealGate: null
    };

    const gate = raw?.revealGate;
    if (base.visibility === 'gated' && gate && typeof gate === 'object' && gate.kind === 'chapter_threshold') {
        const gateValue = Number(gate.value);
        if (Number.isFinite(gateValue) && Math.round(gateValue) > 0) {
            base.revealGate = { kind: 'chapter_threshold', value: Math.round(gateValue) };
        } else {
            base.visibility = 'revealed';
        }
    }

    return base;
}

function buildChoicePromptLines(items, {
    label = 'item',
    getName = (item) => item?.name || item?.title || 'Untitled',
    getExtra = () => '',
    includeNoneOption = false
} = {}) {
    const lines = [`Select ${label}:`];
    if (includeNoneOption) {
        lines.push('0. (None)');
    }
    items.forEach((item, index) => {
        const extra = String(getExtra(item) || '').trim();
        const suffix = extra ? ` — ${extra}` : '';
        lines.push(`${index + 1}. ${getName(item)}${suffix}`);
    });
    return lines.join('\n');
}

function promptForWorldId(project, {
    defaultWorldId = null,
    allowNone = false,
    title = 'World'
} = {}) {
    const worlds = ensureArray(project?.worlds);
    if (worlds.length === 0) {
        showCustomAlert('No worlds available yet.', 'Info');
        return undefined;
    }

    const defaultIndex = Math.max(0, worlds.findIndex(world => world.id === defaultWorldId));
    const raw = prompt(
        `${buildChoicePromptLines(worlds, {
            label: title,
            getName: (world) => world.name,
            getExtra: (world) => `${ensureArray(world.items).length} items`,
            includeNoneOption: allowNone
        })}\n\nEnter number:`,
        String(allowNone ? (defaultWorldId ? defaultIndex + 1 : 0) : (defaultIndex + 1))
    );
    if (raw === null) return undefined;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    if (allowNone && Math.round(parsed) === 0) return null;

    const choiceIndex = Math.round(parsed) - 1;
    if (choiceIndex < 0 || choiceIndex >= worlds.length) return undefined;
    return worlds[choiceIndex].id;
}

function promptForBookId(project, {
    defaultBookId = null,
    title = 'Book'
} = {}) {
    const books = ensureArray(project?.books);
    if (books.length === 0) {
        showCustomAlert('No books available yet.', 'Info');
        return undefined;
    }

    const defaultIndex = Math.max(0, books.findIndex(book => book.id === defaultBookId));
    const raw = prompt(
        `${buildChoicePromptLines(books, {
            label: title,
            getName: (book) => book.name,
            getExtra: (book) => {
                const chapterCount = ensureArray(book?.structure?.chapterSessionIds).length;
                return `${chapterCount} chapters${book?.linkedWorldId ? ', linked world' : ''}`;
            }
        })}\n\nEnter number:`,
        String(defaultIndex + 1)
    );
    if (raw === null) return undefined;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    const choiceIndex = Math.round(parsed) - 1;
    if (choiceIndex < 0 || choiceIndex >= books.length) return undefined;
    return books[choiceIndex].id;
}

function applyWorldItemPatch(item, patch = {}) {
    const merged = {
        ...item,
        ...patch,
        content: patch.content !== undefined ? cloneJsonish(patch.content) : cloneJsonish(item.content),
        tags: patch.tags !== undefined ? cloneJsonish(patch.tags) : cloneJsonish(item.tags),
        sourceRefs: patch.sourceRefs !== undefined ? cloneJsonish(patch.sourceRefs) : cloneJsonish(item.sourceRefs)
    };
    return normalizeWorldItem({
        ...merged,
        updatedAt: Date.now()
    });
}

export function createWorldPrompt() {
    const project = getProject();
    if (!project) return null;
    const name = prompt('World name:', `World ${ensureArray(project.worlds).length + 1}`);
    if (!name || !name.trim()) return null;
    return createWorld({ name: name.trim() });
}

export function renameWorldPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const world = findWorld(project, payload.worldId || project.activeWorldId);
    if (!world) return null;
    const nextName = prompt('Rename world:', world.name);
    if (!nextName || !nextName.trim()) return null;
    return updateWorld({ worldId: world.id, name: nextName.trim() });
}

export function createWorld(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const now = Date.now();
    const world = normalizeWorld({
        id: createWorldId(),
        name: (payload.name || '').trim() || `World ${project.worlds.length + 1}`,
        description: payload.description || '',
        createdAt: now,
        updatedAt: now,
        version: 1,
        items: []
    });

    project.worlds.unshift(world);
    if (payload.setActive !== false || !project.activeWorldId) {
        project.activeWorldId = world.id;
    }

    persistWorldProjectState({ worldId: world.id, reason: 'world:create' });
    return world;
}

export function updateWorld(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const world = findWorld(project, payload.worldId);
    if (!world) {
        showCustomAlert('World not found.', 'Error');
        return null;
    }

    if (typeof payload.name === 'string' && payload.name.trim()) {
        world.name = payload.name.trim();
    }
    if (typeof payload.description === 'string') {
        world.description = payload.description;
    }
    world.updatedAt = Date.now();

    persistWorldProjectState({ worldId: world.id, reason: 'world:update' });
    return world;
}

export function setActiveWorld(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const world = findWorld(project, payload.worldId);
    if (!world) return false;
    if (project.activeWorldId === world.id) return true;

    project.activeWorldId = world.id;
    persistWorldProjectState({ worldId: world.id, reason: 'world:setActive' });
    return true;
}

export function deleteWorld(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const worldId = payload.worldId;
    const world = findWorld(project, worldId);
    if (!world) return false;

    if (payload.confirm !== false) {
        const shouldDelete = confirm(`Delete world "${world.name}"?`);
        if (!shouldDelete) return false;
    }

    project.worlds = (project.worlds || []).filter(item => item.id !== worldId);
    project.worldChanges = (project.worldChanges || []).filter(change => change.worldId !== worldId);
    (project.books || []).forEach(book => {
        if (book.linkedWorldId === worldId) {
            book.linkedWorldId = null;
            book.updatedAt = Date.now();
        }
    });
    ensureProjectWorlds(project);
    ensureProjectBooks(project);

    persistWorldProjectState({ reason: 'world:delete' });
    return true;
}

export function createBookPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const name = prompt('Book name:', `Book ${ensureArray(project.books).length + 1}`);
    if (!name || !name.trim()) return null;
    return createBook({
        ...payload,
        name: name.trim(),
        linkedWorldId: payload.linkedWorldId || project.activeWorldId || null
    });
}

export function renameBookPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) return null;
    const nextName = prompt('Rename book:', book.name);
    if (!nextName || !nextName.trim()) return null;
    return updateBook({ bookId: book.id, name: nextName.trim() });
}

export function createBook(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const requestedWorldId = payload.linkedWorldId || project.activeWorldId || null;
    const validWorldId = requestedWorldId && findWorld(project, requestedWorldId)
        ? requestedWorldId
        : null;
    const now = Date.now();

    const book = normalizeBook({
        id: createBookId(),
        name: (payload.name || '').trim() || `Book ${project.books.length + 1}`,
        description: payload.description || '',
        linkedWorldId: validWorldId,
        autoNumberChapters: payload.autoNumberChapters !== false,
        constraints: typeof payload.constraints === 'object' && payload.constraints
            ? cloneJsonish(payload.constraints)
            : {},
        structure: {
            acts: [],
            chapterSessionIds: []
        },
        createdAt: now,
        updatedAt: now
    }, { validWorldIds: new Set((project.worlds || []).map(world => world.id)) });

    project.books.unshift(book);
    if (payload.setActive !== false || !project.activeBookId) {
        project.activeBookId = book.id;
    }

    persistWorldProjectState({ bookId: book.id, reason: 'book:create' });
    return book;
}

export function updateBook(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return null;
    }

    if (typeof payload.name === 'string' && payload.name.trim()) {
        book.name = payload.name.trim();
    }
    if (typeof payload.description === 'string') {
        book.description = payload.description;
    }
    if (payload.constraints && typeof payload.constraints === 'object') {
        book.constraints = {
            ...(book.constraints || {}),
            ...cloneJsonish(payload.constraints)
        };
    }
    if (payload.autoNumberChapters !== undefined) {
        book.autoNumberChapters = payload.autoNumberChapters !== false;
    }
    book.updatedAt = Date.now();

    persistWorldProjectState({ bookId: book.id, reason: 'book:update' });
    return book;
}

export function setActiveBook(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId);
    if (!book) return false;
    if (project.activeBookId === book.id) return true;

    project.activeBookId = book.id;
    persistWorldProjectState({ bookId: book.id, reason: 'book:setActive' });
    return true;
}

export function linkBookToWorldPrompt(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return false;
    }

    const selectedWorldId = promptForWorldId(project, {
        defaultWorldId: book.linkedWorldId || project.activeWorldId,
        allowNone: true,
        title: 'world to link'
    });
    if (selectedWorldId === undefined) return false;
    return linkBookToWorld({ bookId: book.id, worldId: selectedWorldId });
}

export function linkBookToWorld(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return false;
    }

    const nextWorldId = payload.worldId ? (findWorld(project, payload.worldId)?.id || null) : null;
    if (book.linkedWorldId === nextWorldId) return true;

    book.linkedWorldId = nextWorldId;
    book.updatedAt = Date.now();
    persistWorldProjectState({ worldId: nextWorldId, bookId: book.id, reason: 'book:linkWorld' });
    return true;
}

export function deleteBook(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const bookId = payload.bookId;
    const book = findBook(project, bookId);
    if (!book) return false;

    if (payload.confirm !== false) {
        const shouldDelete = confirm(`Delete book "${book.name}"? Chapter metadata links will be cleared.`);
        if (!shouldDelete) return false;
    }

    project.books = (project.books || []).filter(item => item.id !== bookId);
    (project.chatSessions || []).forEach(session => {
        if (session.bookId !== bookId) return;
        Object.assign(
            session,
            normalizeChapterSessionMetadata(
                {
                    ...session,
                    bookId: null,
                    actNumber: null,
                    chapterNumber: null,
                    chapterTitle: '',
                    revealScope: { asOfChapter: null }
                },
                { validBookIds: new Set() }
            )
        );
    });
    project.worldChanges = (project.worldChanges || []).filter(change => change.bookId !== bookId);
    ensureProjectBooks(project);

    persistWorldProjectState({ reason: 'book:delete', includeSessionListRefresh: true });
    return true;
}

export function assignSessionToBookPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('No active chat session to assign.', 'Info');
        return null;
    }

    const selectedBookId = promptForBookId(project, {
        defaultBookId: session.bookId || project.activeBookId,
        title: 'book for this chat'
    });
    if (!selectedBookId) return null;

    return assignSessionToBook({
        ...payload,
        sessionId,
        bookId: selectedBookId
    });
}

export function updateChapterMetadataPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('Chat session not found.', 'Error');
        return null;
    }

    const actRaw = prompt('Act number (blank to keep):', session.actNumber ? String(session.actNumber) : '');
    if (actRaw === null) return null;
    const chapterRaw = prompt('Chapter number (blank to keep):', session.chapterNumber ? String(session.chapterNumber) : '');
    if (chapterRaw === null) return null;
    const revealRaw = prompt('Reveal scope as-of chapter (blank = use chapter number):', session.revealScope?.asOfChapter ? String(session.revealScope.asOfChapter) : '');
    if (revealRaw === null) return null;
    const titleRaw = prompt('Chapter title (optional):', session.chapterTitle || '');
    if (titleRaw === null) return null;
    const modeRaw = prompt('Writing mode ("writing" or "author"):', session.writingMode || 'writing');
    if (modeRaw === null) return null;

    const toNumberOrNull = (value) => {
        const trimmed = String(value || '').trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? Math.round(parsed) : null;
    };

    return updateChapterMetadata({
        sessionId,
        actNumber: toNumberOrNull(actRaw),
        chapterNumber: toNumberOrNull(chapterRaw),
        chapterTitle: String(titleRaw || ''),
        writingMode: String(modeRaw || '').trim().toLowerCase() === 'author' ? 'author' : 'writing',
        revealScope: {
            asOfChapter: toNumberOrNull(revealRaw)
        }
    });
}

export function assignSessionToBook(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('Chat session not found.', 'Error');
        return null;
    }

    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return null;
    }

    const nextActNumber = payload.actNumber ?? session.actNumber ?? nextActNumberForBook(project, book.id);
    const shouldAutoNumber = payload.autoNumber !== false && book.autoNumberChapters !== false;
    const nextChapterNumber = payload.chapterNumber
        ?? session.chapterNumber
        ?? (shouldAutoNumber ? nextChapterNumberForBook(project, book.id) : null);

    const mergedMetadataSource = {
        ...session,
        bookId: book.id,
        actNumber: nextActNumber,
        chapterNumber: nextChapterNumber,
        chapterTitle: payload.chapterTitle ?? session.chapterTitle,
        chapterStatus: payload.chapterStatus ?? session.chapterStatus,
        revealScope: payload.revealScope ?? session.revealScope,
        writingMode: payload.writingMode ?? session.writingMode
    };

    const validBookIds = new Set((project.books || []).map(item => item.id));
    Object.assign(session, normalizeChapterSessionMetadata(mergedMetadataSource, { validBookIds }));
    if (payload.revealScope && typeof payload.revealScope === 'object') {
        session.revealScope = {
            ...(session.revealScope || {}),
            ...cloneJsonish(payload.revealScope)
        };
    }
    session.updatedAt = Date.now();

    (project.books || []).forEach(otherBook => {
        if (!otherBook?.structure) return;
        otherBook.structure.chapterSessionIds = removeValue(ensureArray(otherBook.structure.chapterSessionIds), session.id);
        sanitizeBookChapterReferences(project, otherBook);
    });
    if (!book.structure || typeof book.structure !== 'object') {
        book.structure = { acts: [], chapterSessionIds: [] };
    }
    book.structure.chapterSessionIds = ensureArray(book.structure.chapterSessionIds);
    uniquePush(book.structure.chapterSessionIds, session.id);
    book.updatedAt = Date.now();
    project.activeBookId = book.id;
    if (book.linkedWorldId) {
        project.activeWorldId = book.linkedWorldId;
    }

    persistWorldProjectState({
        worldId: book.linkedWorldId || null,
        bookId: book.id,
        reason: 'chapter:assignToBook',
        includeSessionListRefresh: true
    });
    return session;
}

export function detachSessionFromBook(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) return false;
    if (!session.bookId) return true;

    const previousBookId = session.bookId;
    const previousBook = findBook(project, previousBookId);

    Object.assign(
        session,
        normalizeChapterSessionMetadata(
            {
                ...session,
                bookId: null,
                actNumber: null,
                chapterNumber: null,
                chapterTitle: '',
                revealScope: { asOfChapter: null }
            },
            { validBookIds: new Set((project.books || []).map(book => book.id)) }
        )
    );
    session.updatedAt = Date.now();

    if (previousBook?.structure) {
        previousBook.structure.chapterSessionIds = removeValue(ensureArray(previousBook.structure.chapterSessionIds), session.id);
        previousBook.updatedAt = Date.now();
    }

    persistWorldProjectState({
        bookId: previousBookId,
        reason: 'chapter:detachFromBook',
        includeSessionListRefresh: true
    });
    return true;
}

export function updateChapterMetadata(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('Chat session not found.', 'Error');
        return null;
    }

    const validBookIds = new Set((project.books || []).map(book => book.id));
    const merged = {
        ...session,
        ...cloneJsonish(payload),
        revealScope: {
            ...(session.revealScope || {}),
            ...(payload.revealScope && typeof payload.revealScope === 'object' ? payload.revealScope : {})
        }
    };
    delete merged.sessionId;

    Object.assign(session, normalizeChapterSessionMetadata(merged, { validBookIds }));
    session.updatedAt = Date.now();

    if (session.bookId) {
        const book = findBook(project, session.bookId);
        if (book) {
            if (!book.structure || typeof book.structure !== 'object') {
                book.structure = { acts: [], chapterSessionIds: [] };
            }
            book.structure.chapterSessionIds = ensureArray(book.structure.chapterSessionIds);
            uniquePush(book.structure.chapterSessionIds, session.id);
            sanitizeBookChapterReferences(project, book);
            book.updatedAt = Date.now();
        }
    }

    persistWorldProjectState({
        bookId: session.bookId,
        reason: 'chapter:updateMeta',
        includeSessionListRefresh: true
    });
    return session;
}

export function createWorldItemPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const worldId = payload.worldId || project.activeWorldId;
    const world = findWorld(project, worldId);
    if (!world) {
        showCustomAlert('No active world selected.', 'Info');
        return null;
    }

    const defaultType = String(payload.type || 'entity');
    const typeRaw = payload.type
        ? defaultType
        : prompt('Item type (entity/place/rule/event/note/source/relationship):', defaultType);
    if (typeRaw === null) return null;

    const type = String(typeRaw || '').trim().toLowerCase() || 'entity';
    const title = prompt('Item title:', '');
    if (!title || !title.trim()) return null;
    const summary = prompt('Summary / note (optional):', '') ?? '';
    const tagsRaw = prompt('Tags (comma-separated, optional):', '') ?? '';
    const gatedRaw = prompt('Reveal gate chapter number (blank for revealed now):', '') ?? '';

    const gatedValue = Number(gatedRaw);
    const hasChapterGate = String(gatedRaw).trim() && Number.isFinite(gatedValue) && Math.round(gatedValue) > 0;

    return createWorldItem({
        worldId: world.id,
        type,
        title: title.trim(),
        summary: String(summary || ''),
        tags: String(tagsRaw || '')
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean),
        status: 'canon',
        visibility: hasChapterGate ? 'gated' : 'revealed',
        revealGate: hasChapterGate
            ? { kind: 'chapter_threshold', value: Math.round(gatedValue) }
            : null
    });
}

export function editWorldItemPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const world = findWorld(project, payload.worldId || project.activeWorldId);
    if (!world) return null;
    const item = ensureArray(world.items).find(entry => entry.id === payload.itemId);
    if (!item) {
        showCustomAlert('World item not found.', 'Error');
        return null;
    }

    const title = prompt('Item title:', item.title || '');
    if (title === null || !title.trim()) return null;
    const summary = prompt('Summary / note:', item.summary || '') ?? '';
    const tagsRaw = prompt('Tags (comma-separated):', ensureArray(item.tags).join(', ')) ?? '';
    const visibilityRaw = prompt('Visibility ("revealed" or "gated"):', item.visibility || 'revealed');
    if (visibilityRaw === null) return null;
    let revealGate = cloneJsonish(item.revealGate);
    let visibility = String(visibilityRaw || '').trim().toLowerCase() === 'gated' ? 'gated' : 'revealed';

    if (visibility === 'gated') {
        const currentGateVal = item.revealGate?.kind === 'chapter_threshold' ? item.revealGate.value : '';
        const gateRaw = prompt('Reveal at chapter number (blank to keep manual lock/none):', currentGateVal ? String(currentGateVal) : '');
        if (gateRaw === null) return null;
        const parsed = Number(gateRaw);
        if (String(gateRaw).trim() && Number.isFinite(parsed) && Math.round(parsed) > 0) {
            revealGate = { kind: 'chapter_threshold', value: Math.round(parsed) };
        }
    } else {
        revealGate = null;
    }

    return updateWorldItem({
        worldId: world.id,
        itemId: item.id,
        patch: {
            title: title.trim(),
            summary: String(summary || ''),
            tags: String(tagsRaw || '')
                .split(',')
                .map(tag => tag.trim())
                .filter(Boolean),
            visibility,
            revealGate
        }
    });
}

export function createWorldItem(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const worldId = payload.worldId || project.activeWorldId;
    const world = findWorld(project, worldId);
    if (!world) {
        showCustomAlert('World not found.', 'Error');
        return null;
    }

    const now = Date.now();
    const item = normalizeWorldItem({
        ...cloneJsonish(payload.item || {}),
        ...cloneJsonish(payload),
        worldId: undefined,
        item: undefined,
        status: payload.status || payload.item?.status || 'canon',
        createdBy: 'user',
        updatedBy: 'user',
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 1
    });

    if (!Array.isArray(world.items)) {
        world.items = [];
    }
    world.items.unshift(item);
    world.updatedAt = now;
    world.version = Number.isFinite(world.version) ? world.version + 1 : 1;

    persistWorldProjectState({ worldId: world.id, reason: 'worldItem:create' });
    return item;
}

export function updateWorldItem(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const worldId = payload.worldId || project.activeWorldId;
    const world = findWorld(project, worldId);
    if (!world) {
        showCustomAlert('World not found.', 'Error');
        return null;
    }
    if (!Array.isArray(world.items)) world.items = [];

    const index = world.items.findIndex(item => item.id === payload.itemId);
    if (index < 0) {
        showCustomAlert('World item not found.', 'Error');
        return null;
    }

    const patch = payload.patch && typeof payload.patch === 'object'
        ? payload.patch
        : payload;
    const nextItem = applyWorldItemPatch(world.items[index], {
        ...cloneJsonish(patch),
        updatedBy: 'user'
    });
    world.items[index] = nextItem;
    world.updatedAt = Date.now();
    world.version = Number.isFinite(world.version) ? world.version + 1 : 1;

    persistWorldProjectState({ worldId: world.id, reason: 'worldItem:update' });
    return nextItem;
}

export function deleteWorldItem(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const worldId = payload.worldId || project.activeWorldId;
    const world = findWorld(project, worldId);
    if (!world || !Array.isArray(world.items)) return false;

    const existing = world.items.find(item => item.id === payload.itemId);
    if (!existing) return false;

    if (payload.confirm !== false) {
        const shouldDelete = confirm(`Delete world item "${existing.title}"?`);
        if (!shouldDelete) return false;
    }

    world.items = world.items.filter(item => item.id !== payload.itemId);
    world.updatedAt = Date.now();
    world.version = Number.isFinite(world.version) ? world.version + 1 : 1;

    persistWorldProjectState({ worldId: world.id, reason: 'worldItem:delete' });
    return true;
}

export function createWorldChangeProposal(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const now = Date.now();
    const proposal = normalizeWorldChange({
        id: createWorldChangeId(),
        ...cloneJsonish(payload),
        status: 'pending',
        createdAt: now,
        updatedAt: now
    });

    project.worldChanges.unshift(proposal);
    persistWorldProjectState({ worldId: proposal.worldId, bookId: proposal.bookId, reason: 'worldChange:create' });
    return proposal;
}

function applyProposalToWorld(project, proposal, reviewPayload = {}) {
    if (!proposal || !proposal.worldId) {
        throw new Error('Proposal is missing worldId.');
    }
    const world = findWorld(project, proposal.worldId);
    if (!world) {
        throw new Error('Target world not found.');
    }
    if (!Array.isArray(world.items)) {
        world.items = [];
    }

    const proposalType = String(proposal.proposalType || '').trim();
    const afterPayload = reviewPayload.afterPayload !== undefined
        ? cloneJsonish(reviewPayload.afterPayload)
        : cloneJsonish(proposal.afterPayload);
    const targetItemId = reviewPayload.targetItemId || proposal.targetItemId || afterPayload?.id || null;

    if (proposalType === 'create_item') {
        const newItem = normalizeWorldItem({
            ...afterPayload,
            id: afterPayload?.id || targetItemId || undefined,
            createdBy: 'agent',
            updatedBy: 'agent',
            approvedAt: Date.now(),
            status: afterPayload?.status || 'canon'
        });
        const existingIndex = world.items.findIndex(item => item.id === newItem.id);
        if (existingIndex >= 0) {
            world.items[existingIndex] = newItem;
        } else {
            world.items.unshift(newItem);
        }
    } else if (proposalType === 'edit_item') {
        const index = world.items.findIndex(item => item.id === targetItemId);
        if (index < 0) {
            throw new Error('Target world item not found for edit proposal.');
        }
        world.items[index] = applyWorldItemPatch(world.items[index], {
            ...afterPayload,
            updatedBy: 'agent',
            approvedAt: Date.now()
        });
    } else if (proposalType === 'delete_item') {
        const index = world.items.findIndex(item => item.id === targetItemId);
        if (index >= 0) {
            world.items.splice(index, 1);
        }
    } else {
        throw new Error(`Unsupported proposal type for auto-apply: ${proposalType || '(empty)'}`);
    }

    world.updatedAt = Date.now();
    world.version = Number.isFinite(world.version) ? world.version + 1 : 1;
    return world;
}

export function reviewWorldChangeProposal(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const change = (project.worldChanges || []).find(item => item.id === payload.changeId);
    if (!change) {
        showCustomAlert('World proposal not found.', 'Error');
        return null;
    }

    const requestedStatus = payload.status === 'approved'
        ? 'approved'
        : (payload.status === 'rejected' ? 'rejected' : 'edited');

    const shouldApply = requestedStatus !== 'rejected' && payload.apply !== false;
    if (shouldApply) {
        try {
            applyProposalToWorld(project, change, payload);
        } catch (error) {
            console.error('[World] Failed to apply proposal:', error);
            showCustomAlert(error.message || 'Failed to apply world proposal.', 'Error');
            return null;
        }
    }

    change.status = requestedStatus;
    if (payload.afterPayload !== undefined) {
        change.afterPayload = cloneJsonish(payload.afterPayload);
    }
    if (payload.reason !== undefined && typeof payload.reason === 'string') {
        change.reason = payload.reason;
    }
    change.reviewedBy = payload.reviewedBy || 'user';
    change.reviewedAt = Date.now();
    change.updatedAt = Date.now();

    persistWorldProjectState({ worldId: change.worldId, bookId: change.bookId, reason: 'worldChange:review' });
    return change;
}

export async function proposeWorldUpdatesFromCurrentChat(payload = {}) {
    const project = getProject();
    if (!project) return [];
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('No active chat session found.', 'World Proposals');
        return [];
    }

    const book = findBook(project, payload.bookId || session.bookId || project.activeBookId);
    const world = findWorld(project, payload.worldId || book?.linkedWorldId || project.activeWorldId);
    if (!world) {
        showCustomAlert('No World is linked to this chat/book yet.', 'World Proposals');
        return [];
    }

    const utilityAgent = getWorldProposalUtilityAgent(project);
    if (!utilityAgent?.model) {
        showCustomAlert('System Utility Agent model is not configured.', 'World Proposals');
        return [];
    }

    const latestMessagesText = getRecentSessionMessagesForWorldProposal(session, Number(payload.maxMessages) || 8);
    if (!latestMessagesText.trim()) {
        showCustomAlert('Not enough chat content to extract proposals.', 'World Proposals');
        return [];
    }

    const worldContextPack = buildWorldStructuredContextPack(project, session, {
        queryText: latestMessagesText,
        maxItems: Number(payload.maxWorldItems) || 14
    });

    const extractionPrompt = buildWorldProposalExtractionPrompt({
        session,
        world,
        worldContextPack,
        latestMessagesText
    });

    stateManager.bus.publish('status:update', { message: 'Extracting World proposals...', state: 'loading' });

    try {
        const response = await callLLM(utilityAgent, [{ role: 'user', content: extractionPrompt }]);
        const parsed = safeParseJsonBlock(response?.content || '');
        const proposals = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
        const created = [];
        const skipped = [];

        proposals.forEach((rawProposal, index) => {
            const proposalType = normalizeExtractedProposalType(rawProposal?.proposalType);
            const afterPayload = normalizeExtractedAfterPayload(rawProposal?.afterPayload || {});
            const targetItemId = String(rawProposal?.targetItemId || '').trim() || null;

            if (!afterPayload.title) {
                skipped.push(`#${index + 1}: missing title`);
                return;
            }

            let beforePayload = null;
            if (proposalType === 'edit_item') {
                if (!targetItemId) {
                    skipped.push(`#${index + 1}: edit_item missing targetItemId`);
                    return;
                }
                const existingItem = ensureArray(world.items).find(item => item.id === targetItemId);
                if (!existingItem) {
                    skipped.push(`#${index + 1}: target item not found (${targetItemId})`);
                    return;
                }
                beforePayload = cloneJsonish(existingItem);
                if (!afterPayload.type) {
                    afterPayload.type = existingItem.type || 'note';
                }
            }

            const proposal = createWorldChangeProposal({
                worldId: world.id,
                bookId: book?.id || session.bookId || null,
                chapterSessionId: session.id,
                proposalType,
                targetItemId: proposalType === 'edit_item' ? targetItemId : null,
                beforePayload,
                afterPayload,
                reason: String(rawProposal?.reason || '').trim() || 'Extracted from recent chat conversation.',
                evidenceRefs: [
                    {
                        type: 'chat_session',
                        sessionId: session.id,
                        sessionName: session.name || 'Untitled'
                    }
                ],
                createdByAgentId: utilityAgent.model
            });

            if (proposal) {
                created.push(proposal);
            }
        });

        if (created.length === 0) {
            const skippedHint = skipped.length > 0 ? `\n\nSkipped:\n${skipped.slice(0, 5).join('\n')}` : '';
            showCustomAlert(`No world proposals were created.${skippedHint}`, 'World Proposals');
            return [];
        }

        const skippedLabel = skipped.length > 0 ? ` (${skipped.length} skipped)` : '';
        showCustomAlert(`Created ${created.length} world proposal(s)${skippedLabel}. Review them in World > Changes.`, 'World Proposals');
        return created;
    } catch (error) {
        console.error('[World] Proposal extraction failed:', error);
        showCustomAlert(`Failed to extract World proposals: ${error.message || 'Unknown error'}`, 'World Proposals');
        return [];
    } finally {
        stateManager.bus.publish('status:update', { message: 'Ready', state: 'connected' });
    }
}
