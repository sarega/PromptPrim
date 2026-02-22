// ===============================================
// FILE: src/js/modules/world/world.retrieval.js
// DESCRIPTION: World retrieval + structured context-pack builder (MVP, no RAG).
// ===============================================

import {
    ensureProjectBooks,
    ensureProjectWorlds,
    CHAPTER_WRITING_MODE_AUTHOR,
    CHAPTER_WRITING_MODE_WRITING,
    isWorldItemVisibleForChapter
} from './world.schema-utils.js';

const DEFAULT_MAX_ITEMS = 8;

const TYPE_LABELS = {
    entity: 'Entities',
    place: 'Places',
    rule: 'Rules',
    event: 'Timeline Events',
    relationship: 'Relationships',
    note: 'Notes',
    source: 'Sources'
};

const SECTION_ORDER = ['rule', 'entity', 'place', 'event', 'relationship', 'note', 'source'];

function asPlainText(value, maxLength = 320) {
    if (value === null || value === undefined) return '';
    let text = '';
    if (typeof value === 'string') {
        text = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
        text = String(value);
    } else {
        try {
            text = JSON.stringify(value);
        } catch (_error) {
            text = String(value);
        }
    }

    text = text.replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
}

function normalizeQueryTokens(queryText = '') {
    return [...new Set(
        String(queryText || '')
            .toLowerCase()
            .split(/[^a-z0-9_\u0E00-\u0E7F]+/i)
            .map(token => token.trim())
            .filter(token => token.length >= 2)
    )];
}

function getItemSearchCorpus(item) {
    const parts = [
        item?.title,
        item?.summary,
        ...(Array.isArray(item?.tags) ? item.tags : []),
        asPlainText(item?.content, 1000)
    ];
    return parts
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function scoreWorldItem(item, queryTokens) {
    if (!item) return 0;

    // If no query terms are available, prioritize canon and generally useful types.
    if (!Array.isArray(queryTokens) || queryTokens.length === 0) {
        let score = 1;
        if (item.status === 'canon') score += 2;
        if (item.type === 'rule') score += 1.5;
        if (item.type === 'entity' || item.type === 'place') score += 1;
        return score;
    }

    const corpus = getItemSearchCorpus(item);
    if (!corpus) return 0;
    const titleLower = typeof item.title === 'string' ? item.title.toLowerCase() : '';
    const summaryLower = typeof item.summary === 'string' ? item.summary.toLowerCase() : '';

    let score = 0;
    for (const token of queryTokens) {
        if (!token) continue;
        if (titleLower.includes(token)) score += 6;
        if (summaryLower.includes(token)) score += 3;
        if (Array.isArray(item.tags) && item.tags.some(tag => String(tag).toLowerCase() === token)) score += 4;
        if (corpus.includes(token)) score += 1.2;
    }

    if (item.status === 'canon') score += 1.5;
    if (item.type === 'event') score += 0.4;
    return score;
}

function sortByScoreThenRecency(left, right) {
    const scoreDiff = (right?._score || 0) - (left?._score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (right?.updatedAt || 0) - (left?.updatedAt || 0);
}

function getBookById(project, bookId) {
    if (!project || !bookId) return null;
    return (project.books || []).find(book => book.id === bookId) || null;
}

function getWorldById(project, worldId) {
    if (!project || !worldId) return null;
    return (project.worlds || []).find(world => world.id === worldId) || null;
}

function resolveSessionBook(project, session) {
    if (!project) return null;
    const sessionBook = getBookById(project, session?.bookId);
    if (sessionBook) return sessionBook;
    return getBookById(project, project.activeBookId);
}

function resolveWorldForSession(project, session) {
    const book = resolveSessionBook(project, session);
    const preferredWorldId = book?.linkedWorldId || project?.activeWorldId || null;
    const world = getWorldById(project, preferredWorldId) || null;
    return {
        book,
        world
    };
}

function resolveWorldAccessContext(session) {
    const writingMode = session?.writingMode === CHAPTER_WRITING_MODE_AUTHOR
        ? CHAPTER_WRITING_MODE_AUTHOR
        : CHAPTER_WRITING_MODE_WRITING;

    const asOfChapter = Number.isFinite(session?.revealScope?.asOfChapter)
        ? Math.round(session.revealScope.asOfChapter)
        : (Number.isFinite(session?.chapterNumber) ? Math.round(session.chapterNumber) : null);

    return {
        mode: writingMode,
        asOfChapter
    };
}

function normalizeSelectedTypes(types) {
    if (!Array.isArray(types) || types.length === 0) return null;
    const set = new Set(types.map(type => String(type || '').trim()).filter(Boolean));
    return set.size ? set : null;
}

export function filterVisibleWorldItemsForSession(project, session, options = {}) {
    ensureProjectWorlds(project);
    ensureProjectBooks(project);

    const { world, book } = resolveWorldForSession(project, session);
    const access = resolveWorldAccessContext(session);

    if (!world) {
        return {
            world: null,
            book,
            access,
            visibleItems: [],
            hiddenItemCount: 0,
            totalItemCount: 0,
            reason: 'no_world'
        };
    }

    const selectedTypes = normalizeSelectedTypes(options.types);
    const allItems = Array.isArray(world.items) ? world.items : [];
    let hiddenItemCount = 0;

    const visibleItems = allItems.filter(item => {
        if (selectedTypes && !selectedTypes.has(item.type)) return false;
        const visible = isWorldItemVisibleForChapter(item, access);
        if (!visible) hiddenItemCount += 1;
        return visible;
    });

    return {
        world,
        book,
        access,
        visibleItems,
        hiddenItemCount,
        totalItemCount: allItems.length,
        reason: visibleItems.length ? 'ok' : 'no_visible_items'
    };
}

function selectRelevantWorldItems(items, queryText, options = {}) {
    const maxItems = Number.isFinite(options.maxItems)
        ? Math.max(1, Math.round(options.maxItems))
        : DEFAULT_MAX_ITEMS;
    const queryTokens = normalizeQueryTokens(queryText);

    const scored = (Array.isArray(items) ? items : [])
        .map(item => ({ ...item, _score: scoreWorldItem(item, queryTokens) }))
        .filter(item => item._score > 0)
        .sort(sortByScoreThenRecency)
        .slice(0, maxItems);

    return {
        items: scored.map(({ _score, ...rest }) => rest),
        scoredItems: scored,
        queryTokens
    };
}

function splitItemsByType(items) {
    const map = new Map();
    for (const item of (items || [])) {
        const type = item?.type || 'note';
        if (!map.has(type)) map.set(type, []);
        map.get(type).push(item);
    }
    return map;
}

function formatSessionContextLine(session, access, book, world) {
    const parts = [];
    if (book?.name) parts.push(`Book: ${book.name}`);
    if (world?.name) parts.push(`World: ${world.name}`);
    if (session?.actNumber) parts.push(`Act ${session.actNumber}`);
    if (session?.chapterNumber) parts.push(`Chapter ${session.chapterNumber}`);
    if (session?.chapterTitle) parts.push(`Chapter Title: ${session.chapterTitle}`);
    if (access?.asOfChapter) parts.push(`Reveal Scope (as-of chapter): ${access.asOfChapter}`);
    parts.push(`Mode: ${access?.mode === CHAPTER_WRITING_MODE_AUTHOR ? 'author' : 'writing'}`);
    return parts;
}

function formatBookConstraintLines(book) {
    const constraints = book?.constraints;
    if (!constraints || typeof constraints !== 'object') return [];

    const lines = [];
    for (const [key, value] of Object.entries(constraints)) {
        const text = asPlainText(value, 280);
        if (!text) continue;
        lines.push(`${key}: ${text}`);
    }
    return lines;
}

function formatWorldItemLine(item) {
    const title = item?.title || 'Untitled';
    const summary = asPlainText(item?.summary || item?.content, 220);
    const tagText = Array.isArray(item?.tags) && item.tags.length
        ? ` [tags: ${item.tags.slice(0, 5).join(', ')}]`
        : '';
    if (!summary) return `- ${title}${tagText}`;
    return `- ${title}: ${summary}${tagText}`;
}

function buildStructuredWorldContextText({ session, book, world, access, selectedItems, diagnostics }) {
    if (!world) return '';

    const lines = [];
    lines.push('World Context Pack (Structured, spoiler-safe):');
    lines.push('Use this as canonical context for consistency. Do not invent facts that contradict it.');

    const sessionLines = formatSessionContextLine(session, access, book, world);
    if (sessionLines.length > 0) {
        lines.push('');
        lines.push('Session Context:');
        sessionLines.forEach(line => lines.push(`- ${line}`));
    }

    const bookConstraintLines = formatBookConstraintLines(book);
    if (bookConstraintLines.length > 0) {
        lines.push('');
        lines.push('Book Constraints:');
        bookConstraintLines.forEach(line => lines.push(`- ${line}`));
    }

    const itemsByType = splitItemsByType(selectedItems);
    for (const type of SECTION_ORDER) {
        const bucket = itemsByType.get(type);
        if (!bucket || bucket.length === 0) continue;
        lines.push('');
        lines.push(`${TYPE_LABELS[type] || type}:`);
        bucket.forEach(item => lines.push(formatWorldItemLine(item)));
    }

    if ((selectedItems || []).length === 0) {
        lines.push('');
        lines.push('Relevant Canon Facts:');
        lines.push('- No visible world items matched the current query/scope.');
    }

    if (Number.isFinite(diagnostics?.hiddenItemCount) && diagnostics.hiddenItemCount > 0) {
        lines.push('');
        lines.push(`Spoiler Guard: ${diagnostics.hiddenItemCount} gated item(s) were excluded for this chapter scope.`);
    }

    return lines.join('\n');
}

function toContextPackItem(item) {
    return {
        id: item.id,
        type: item.type,
        title: item.title,
        summary: asPlainText(item.summary || item.content, 300),
        status: item.status,
        visibility: item.visibility,
        tags: Array.isArray(item.tags) ? [...item.tags] : [],
        sourceRefs: Array.isArray(item.sourceRefs) ? [...item.sourceRefs] : []
    };
}

export function buildWorldStructuredContextPack(project, session, options = {}) {
    ensureProjectWorlds(project);
    ensureProjectBooks(project);

    const queryText = String(options.queryText || '').trim();
    const maxItems = Number.isFinite(options.maxItems)
        ? Math.max(1, Math.round(options.maxItems))
        : DEFAULT_MAX_ITEMS;
    const types = Array.isArray(options.types) ? options.types : null;

    const visibleResult = filterVisibleWorldItemsForSession(project, session, { types });

    if (!visibleResult.world) {
        return {
            version: 1,
            kind: 'world_context_pack',
            enabled: false,
            reason: visibleResult.reason || 'no_world',
            diagnostics: {
                worldLinked: false,
                queryText,
                queryTokens: [],
                maxItems
            },
            sections: {
                sessionContext: [],
                bookConstraints: [],
                byType: {}
            },
            selectedItems: [],
            contextText: ''
        };
    }

    const selected = selectRelevantWorldItems(visibleResult.visibleItems, queryText, { maxItems });
    const selectedItems = selected.items;
    const selectedByTypeMap = splitItemsByType(selectedItems);
    const byType = {};
    for (const [type, items] of selectedByTypeMap.entries()) {
        byType[type] = items.map(toContextPackItem);
    }

    const access = visibleResult.access;
    const book = visibleResult.book;
    const world = visibleResult.world;
    const sessionContext = formatSessionContextLine(session, access, book, world);
    const bookConstraints = formatBookConstraintLines(book);

    const diagnostics = {
        worldLinked: true,
        worldId: world.id,
        worldName: world.name,
        bookId: book?.id || null,
        bookName: book?.name || null,
        mode: access.mode,
        asOfChapter: access.asOfChapter,
        totalItemCount: visibleResult.totalItemCount,
        visibleItemCount: visibleResult.visibleItems.length,
        hiddenItemCount: visibleResult.hiddenItemCount,
        selectedItemCount: selectedItems.length,
        queryText,
        queryTokens: selected.queryTokens,
        maxItems
    };

    const contextText = buildStructuredWorldContextText({
        session,
        book,
        world,
        access,
        selectedItems,
        diagnostics
    });

    return {
        version: 1,
        kind: 'world_context_pack',
        enabled: true,
        reason: 'ok',
        world: {
            id: world.id,
            name: world.name
        },
        book: book ? { id: book.id, name: book.name } : null,
        access: {
            mode: access.mode,
            asOfChapter: access.asOfChapter
        },
        diagnostics,
        sections: {
            sessionContext,
            bookConstraints,
            byType
        },
        selectedItems: selectedItems.map(toContextPackItem),
        contextText
    };
}
