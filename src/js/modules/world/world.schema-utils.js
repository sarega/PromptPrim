// ===============================================
// FILE: src/js/modules/world/world.schema-utils.js
// DESCRIPTION: Normalizers and schema helpers for World/Book data (MVP).
// ===============================================

export const WORLD_ITEM_STATUS_CANON = 'canon';
export const WORLD_ITEM_STATUS_DRAFT = 'draft';
export const WORLD_ITEM_STATUS_CONFLICT = 'conflict';
export const WORLD_ITEM_STATUS_DEPRECATED = 'deprecated';

export const WORLD_ITEM_VISIBILITY_REVEALED = 'revealed';
export const WORLD_ITEM_VISIBILITY_GATED = 'gated';
export const WORLD_SCOPE_BOOK = 'book';
export const WORLD_SCOPE_SHARED = 'shared';
export const WORLD_SCOPE_UNASSIGNED = 'unassigned';

export const REVEAL_GATE_KIND_CHAPTER_THRESHOLD = 'chapter_threshold';
export const REVEAL_GATE_KIND_MANUAL_UNLOCK = 'manual_unlock';

export const CHAPTER_WRITING_MODE_WRITING = 'writing';
export const CHAPTER_WRITING_MODE_AUTHOR = 'author';

export const CHAPTER_STATUS_OUTLINE = 'outline';
export const CHAPTER_STATUS_DRAFTING = 'drafting';
export const CHAPTER_STATUS_REVISING = 'revising';
export const CHAPTER_STATUS_DONE = 'done';
export const SESSION_KIND_CHAT = 'chat';
export const SESSION_KIND_CHAPTER = 'chapter';
export const SESSION_KIND_BOOK_AGENT = 'book_agent';

const ALLOWED_WORLD_ITEM_TYPES = new Set([
    'entity',
    'place',
    'rule',
    'event',
    'relationship',
    'note',
    'source'
]);

const ALLOWED_WORLD_ITEM_STATUSES = new Set([
    WORLD_ITEM_STATUS_CANON,
    WORLD_ITEM_STATUS_DRAFT,
    WORLD_ITEM_STATUS_CONFLICT,
    WORLD_ITEM_STATUS_DEPRECATED
]);

const ALLOWED_CHAPTER_STATUSES = new Set([
    CHAPTER_STATUS_OUTLINE,
    CHAPTER_STATUS_DRAFTING,
    CHAPTER_STATUS_REVISING,
    CHAPTER_STATUS_DONE
]);

const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneJsonish = (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return Array.isArray(value) ? [...value] : { ...value };
    }
};

const normalizeTimestamp = (value, fallback) => (Number.isFinite(value) ? value : fallback);

const normalizePositiveInteger = (value, fallback = null) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const normalized = Math.round(parsed);
    return normalized > 0 ? normalized : fallback;
};

const normalizeNullableString = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
};

const normalizeString = (value, fallback = '') => {
    if (typeof value !== 'string') return fallback;
    return value;
};

const uniqueStringArray = (value) => {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(item => typeof item === 'string' && item.trim()))];
};

function normalizeRevealGate(rawGate) {
    if (!isPlainObject(rawGate)) return null;

    if (rawGate.kind === REVEAL_GATE_KIND_MANUAL_UNLOCK) {
        return {
            kind: REVEAL_GATE_KIND_MANUAL_UNLOCK,
            unlocked: rawGate.unlocked === true || rawGate.value === true
        };
    }

    if (rawGate.kind === REVEAL_GATE_KIND_CHAPTER_THRESHOLD) {
        const threshold = normalizePositiveInteger(rawGate.value, null);
        if (!threshold) return null;
        return {
            kind: REVEAL_GATE_KIND_CHAPTER_THRESHOLD,
            value: threshold
        };
    }

    return null;
}

export function createWorldId() {
    return createId('wld');
}

export function createWorldItemId() {
    return createId('wi');
}

export function createBookId() {
    return createId('book');
}

export function createWorldChangeId() {
    return createId('wchg');
}

export function normalizeWorldItem(item = {}) {
    const now = Date.now();
    const revealGate = normalizeRevealGate(item?.revealGate);
    const fallbackVisibility = revealGate ? WORLD_ITEM_VISIBILITY_GATED : WORLD_ITEM_VISIBILITY_REVEALED;
    const visibility = item?.visibility === WORLD_ITEM_VISIBILITY_GATED
        ? WORLD_ITEM_VISIBILITY_GATED
        : fallbackVisibility;

    return {
        id: normalizeNullableString(item?.id) || createWorldItemId(),
        type: ALLOWED_WORLD_ITEM_TYPES.has(item?.type) ? item.type : 'note',
        title: normalizeString(item?.title, 'Untitled'),
        summary: normalizeString(item?.summary, ''),
        content: cloneJsonish(item?.content ?? ''),
        status: ALLOWED_WORLD_ITEM_STATUSES.has(item?.status) ? item.status : WORLD_ITEM_STATUS_DRAFT,
        visibility,
        revealGate,
        tags: uniqueStringArray(item?.tags),
        sourceRefs: uniqueStringArray(item?.sourceRefs),
        createdBy: item?.createdBy === 'agent' ? 'agent' : 'user',
        updatedBy: item?.updatedBy === 'agent' ? 'agent' : 'user',
        approvedAt: Number.isFinite(item?.approvedAt) ? item.approvedAt : null,
        createdAt: normalizeTimestamp(item?.createdAt, now),
        updatedAt: normalizeTimestamp(item?.updatedAt, now),
        version: normalizePositiveInteger(item?.version, 1)
    };
}

export function normalizeWorld(world = {}) {
    const now = Date.now();
    const items = Array.isArray(world?.items) ? world.items.map(normalizeWorldItem) : [];
    const ownerBookId = normalizeNullableString(world?.ownerBookId);
    const sharedBookIds = uniqueStringArray(world?.sharedBookIds);
    const rawScope = String(world?.scope || '').trim().toLowerCase();
    const scope = rawScope === WORLD_SCOPE_SHARED
        ? WORLD_SCOPE_SHARED
        : (rawScope === WORLD_SCOPE_BOOK ? WORLD_SCOPE_BOOK : WORLD_SCOPE_UNASSIGNED);

    return {
        id: normalizeNullableString(world?.id) || createWorldId(),
        name: normalizeString(world?.name, 'New World'),
        description: normalizeString(world?.description, ''),
        scope,
        ownerBookId,
        sharedBookIds,
        version: normalizePositiveInteger(world?.version, 1),
        createdAt: normalizeTimestamp(world?.createdAt, now),
        updatedAt: normalizeTimestamp(world?.updatedAt, now),
        items
    };
}

function normalizeWorldChangeStatus(value) {
    switch (value) {
        case 'approved':
        case 'rejected':
        case 'edited':
            return value;
        default:
            return 'pending';
    }
}

function normalizeEvidenceRefs(value) {
    if (!Array.isArray(value)) return [];
    return value
        .filter(Boolean)
        .map(ref => cloneJsonish(ref))
        .filter(Boolean);
}

export function normalizeWorldChange(change = {}) {
    const now = Date.now();
    return {
        id: normalizeNullableString(change?.id) || createWorldChangeId(),
        worldId: normalizeNullableString(change?.worldId),
        bookId: normalizeNullableString(change?.bookId),
        chapterSessionId: normalizeNullableString(change?.chapterSessionId),
        proposalType: normalizeString(change?.proposalType, 'edit_item'),
        targetItemId: normalizeNullableString(change?.targetItemId),
        beforePayload: cloneJsonish(change?.beforePayload ?? null),
        afterPayload: cloneJsonish(change?.afterPayload ?? null),
        reason: normalizeString(change?.reason, ''),
        evidenceRefs: normalizeEvidenceRefs(change?.evidenceRefs),
        status: normalizeWorldChangeStatus(change?.status),
        createdByAgentId: normalizeNullableString(change?.createdByAgentId),
        reviewedBy: normalizeNullableString(change?.reviewedBy),
        reviewedAt: Number.isFinite(change?.reviewedAt) ? change.reviewedAt : null,
        createdAt: normalizeTimestamp(change?.createdAt, now),
        updatedAt: normalizeTimestamp(change?.updatedAt, now)
    };
}

function normalizeBookAct(act = {}, index = 0) {
    return {
        id: normalizeNullableString(act?.id) || createId('act'),
        title: normalizeString(act?.title, `Act ${index + 1}`),
        order: normalizePositiveInteger(act?.order, index + 1),
        summary: normalizeString(act?.summary, '')
    };
}

function normalizeBookExportProfile(raw = {}, bookName = 'New Book') {
    const source = isPlainObject(raw) ? raw : {};
    const chapterTitleModeRaw = String(source.chapterTitleMode || '').trim().toLowerCase();
    const chapterTitleMode = chapterTitleModeRaw === 'title_only'
        ? 'title_only'
        : (chapterTitleModeRaw === 'number_and_title' ? 'number_and_title' : 'number_and_title');
    const sceneBreakMarkerRaw = String(source.sceneBreakMarker || '').trim();
    return {
        title: normalizeString(source.title, normalizeString(bookName, 'New Book')),
        subtitle: normalizeString(source.subtitle, ''),
        author: normalizeString(source.author, ''),
        chapterTitleMode,
        includeChapterSummaries: source.includeChapterSummaries === true,
        sceneBreakMarker: sceneBreakMarkerRaw || '***',
        frontMatterNotes: normalizeString(source.frontMatterNotes, '')
    };
}

function normalizeBookAgentAutomation(raw = {}) {
    const source = isPlainObject(raw) ? raw : {};
    const worldProposalsSource = isPlainObject(source.worldProposals)
        ? source.worldProposals
        : {};

    const lastScannedMessageCountRaw = Number(worldProposalsSource.lastScannedMessageCount);
    const lastScannedMessageCount = Number.isFinite(lastScannedMessageCountRaw)
        ? Math.max(0, Math.round(lastScannedMessageCountRaw))
        : 0;

    return {
        worldProposals: {
            autoProposeEnabled: worldProposalsSource.autoProposeEnabled === true,
            lastScannedMessageCount,
            lastScannedAt: Number.isFinite(worldProposalsSource.lastScannedAt)
                ? worldProposalsSource.lastScannedAt
                : null
        }
    };
}

function normalizeBookSurfaceAgentConfig(raw = {}, { defaults = {} } = {}) {
    const source = isPlainObject(raw) ? raw : {};
    return {
        agentPresetName: normalizeNullableString(source.agentPresetName ?? source.agentName) || null,
        systemPromptOverride: normalizeString(source.systemPromptOverride, normalizeString(defaults.systemPromptOverride, ''))
    };
}

function normalizeBookCodexAgentConfig(raw = {}) {
    const source = isPlainObject(raw) ? raw : {};
    const base = normalizeBookSurfaceAgentConfig(source, { defaults: { systemPromptOverride: '' } });
    return {
        ...base,
        useBookAgent: source.useBookAgent !== false
    };
}

export function normalizeBook(book = {}, options = {}) {
    const now = Date.now();
    const validWorldIds = options?.validWorldIds instanceof Set ? options.validWorldIds : null;
    const linkedWorldIdCandidate = normalizeNullableString(book?.linkedWorldId ?? book?.worldId);
    const linkedWorldId = linkedWorldIdCandidate && (!validWorldIds || validWorldIds.has(linkedWorldIdCandidate))
        ? linkedWorldIdCandidate
        : null;

    const structureSource = isPlainObject(book?.structure) ? book.structure : {};
    const acts = Array.isArray(structureSource.acts)
        ? structureSource.acts.map((act, index) => normalizeBookAct(act, index))
        : [];
    const chapterSessionIds = uniqueStringArray(
        structureSource.chapterSessionIds || book?.chapterSessionIds || []
    );
    const composerDocsSource = isPlainObject(book?.composerDocs) ? book.composerDocs : {};
    const composerDocs = {
        treatment: normalizeString(composerDocsSource.treatment, ''),
        synopsis: normalizeString(composerDocsSource.synopsis, ''),
        outline: normalizeString(composerDocsSource.outline, ''),
        sceneBeats: normalizeString(composerDocsSource.sceneBeats, '')
    };
    const bookAgentSessionId = normalizeNullableString(book?.bookAgentSessionId);
    const exportProfile = normalizeBookExportProfile(book?.exportProfile, book?.name);
    const agentAutomation = normalizeBookAgentAutomation(book?.agentAutomation);
    const bookAgentConfig = normalizeBookSurfaceAgentConfig(book?.bookAgentConfig);
    const codexAgentConfig = normalizeBookCodexAgentConfig(book?.codexAgentConfig);

    return {
        id: normalizeNullableString(book?.id) || createBookId(),
        name: normalizeString(book?.name, 'New Book'),
        description: normalizeString(book?.description, ''),
        linkedWorldId,
        bookAgentSessionId,
        createdAt: normalizeTimestamp(book?.createdAt, now),
        updatedAt: normalizeTimestamp(book?.updatedAt, now),
        autoNumberChapters: book?.autoNumberChapters !== false,
        constraints: isPlainObject(book?.constraints) ? cloneJsonish(book.constraints) : {},
        composerDocs,
        exportProfile,
        bookAgentConfig,
        codexAgentConfig,
        agentAutomation,
        structure: {
            acts,
            chapterSessionIds
        }
    };
}

export function ensureProjectWorlds(project) {
    if (!project || typeof project !== 'object') return;

    project.worlds = Array.isArray(project.worlds)
        ? project.worlds.map(normalizeWorld)
        : [];

    const validWorldIds = new Set(project.worlds.map(world => world.id));
    const requestedActiveWorldId = normalizeNullableString(project.activeWorldId);
    project.activeWorldId = requestedActiveWorldId && validWorldIds.has(requestedActiveWorldId)
        ? requestedActiveWorldId
        : (project.worlds[0]?.id || null);
}

export function ensureProjectWorldBookOwnership(project) {
    if (!project || typeof project !== 'object') return;
    const worlds = Array.isArray(project.worlds) ? project.worlds : [];
    const books = Array.isArray(project.books) ? project.books : [];
    const validBookIds = new Set(books.map(book => normalizeNullableString(book?.id)).filter(Boolean));
    const worldToLinkedBooks = new Map();

    books.forEach((book) => {
        const bookId = normalizeNullableString(book?.id);
        const worldId = normalizeNullableString(book?.linkedWorldId);
        if (!bookId || !worldId) return;
        if (!worldToLinkedBooks.has(worldId)) {
            worldToLinkedBooks.set(worldId, []);
        }
        const list = worldToLinkedBooks.get(worldId);
        if (!list.includes(bookId)) list.push(bookId);
    });

    worlds.forEach((world) => {
        const linkedBookIds = uniqueStringArray(worldToLinkedBooks.get(world.id) || []);
        let ownerBookId = normalizeNullableString(world?.ownerBookId);
        if (ownerBookId && !validBookIds.has(ownerBookId)) ownerBookId = null;

        let sharedBookIds = uniqueStringArray(world?.sharedBookIds).filter(bookId => validBookIds.has(bookId));
        linkedBookIds.forEach((bookId) => {
            if (!sharedBookIds.includes(bookId)) sharedBookIds.push(bookId);
        });

        if (linkedBookIds.length === 0) {
            sharedBookIds = [];
            world.scope = ownerBookId ? WORLD_SCOPE_BOOK : WORLD_SCOPE_UNASSIGNED;
            world.ownerBookId = ownerBookId;
            world.sharedBookIds = sharedBookIds;
            return;
        }

        if (linkedBookIds.length === 1) {
            const onlyBookId = linkedBookIds[0];
            world.ownerBookId = ownerBookId || onlyBookId;
            world.sharedBookIds = [world.ownerBookId];
            world.scope = WORLD_SCOPE_BOOK;
            return;
        }

        const preferredOwner = ownerBookId && linkedBookIds.includes(ownerBookId)
            ? ownerBookId
            : linkedBookIds[0];
        world.ownerBookId = preferredOwner || null;
        world.sharedBookIds = linkedBookIds;
        world.scope = WORLD_SCOPE_SHARED;
    });
}

export function ensureProjectWorldChanges(project) {
    if (!project || typeof project !== 'object') return;
    project.worldChanges = Array.isArray(project.worldChanges)
        ? project.worldChanges.map(normalizeWorldChange)
        : [];
}

export function ensureProjectBooks(project) {
    if (!project || typeof project !== 'object') return;

    const validWorldIds = new Set((project.worlds || []).map(world => world.id));
    project.books = Array.isArray(project.books)
        ? project.books.map(book => normalizeBook(book, { validWorldIds }))
        : [];

    const validBookIds = new Set(project.books.map(book => book.id));
    const requestedActiveBookId = normalizeNullableString(project.activeBookId);
    project.activeBookId = requestedActiveBookId && validBookIds.has(requestedActiveBookId)
        ? requestedActiveBookId
        : (project.books[0]?.id || null);

    ensureProjectWorldBookOwnership(project);
}

function normalizeChapterStatus(value) {
    return ALLOWED_CHAPTER_STATUSES.has(value) ? value : CHAPTER_STATUS_DRAFTING;
}

export function normalizeChapterSessionMetadata(session = {}, options = {}) {
    const validBookIds = options?.validBookIds instanceof Set ? options.validBookIds : null;
    const bookIdCandidate = normalizeNullableString(session?.bookId);
    const bookId = bookIdCandidate && (!validBookIds || validBookIds.has(bookIdCandidate))
        ? bookIdCandidate
        : null;

    const actNumber = normalizePositiveInteger(session?.actNumber, null);
    const chapterNumber = normalizePositiveInteger(session?.chapterNumber, null);
    const rawRevealScope = isPlainObject(session?.revealScope) ? session.revealScope : {};
    const asOfChapterFallback = chapterNumber || null;
    const asOfChapter = normalizePositiveInteger(
        rawRevealScope.asOfChapter ?? session?.asOfChapter,
        asOfChapterFallback
    );

    return {
        bookId,
        actNumber,
        chapterNumber,
        chapterTitle: normalizeString(session?.chapterTitle, ''),
        chapterSummary: normalizeString(session?.chapterSummary, ''),
        chapterStatus: normalizeChapterStatus(session?.chapterStatus),
        revealScope: {
            asOfChapter
        },
        writingMode: session?.writingMode === CHAPTER_WRITING_MODE_AUTHOR
            ? CHAPTER_WRITING_MODE_AUTHOR
            : CHAPTER_WRITING_MODE_WRITING
    };
}

export function normalizeSessionKind(session = {}) {
    const raw = String(session?.kind || '').trim().toLowerCase();
    if (raw === SESSION_KIND_CHAPTER) return SESSION_KIND_CHAPTER;
    if (raw === SESSION_KIND_BOOK_AGENT) return SESSION_KIND_BOOK_AGENT;
    if (raw === SESSION_KIND_CHAT) return SESSION_KIND_CHAT;
    if (normalizeNullableString(session?.bookAgentBookId)) return SESSION_KIND_BOOK_AGENT;
    return session?.bookId ? SESSION_KIND_CHAPTER : SESSION_KIND_CHAT;
}

export function isChapterSession(session = {}) {
    return normalizeSessionKind(session) === SESSION_KIND_CHAPTER;
}

export function isBookAgentSession(session = {}) {
    return normalizeSessionKind(session) === SESSION_KIND_BOOK_AGENT;
}

export function isRegularChatSession(session = {}) {
    return normalizeSessionKind(session) === SESSION_KIND_CHAT;
}

export function getBookLinkedSessionDisplayTitle(session = {}, options = {}) {
    const fallback = typeof options?.fallback === 'string' && options.fallback
        ? options.fallback
        : 'New Chat';
    if (!session || typeof session !== 'object') return fallback;

    const isBookLinked = Boolean(session.bookId);
    const actNumber = Number.isFinite(Number(session?.actNumber)) ? Math.round(Number(session.actNumber)) : null;
    const chapterNumber = Number.isFinite(Number(session?.chapterNumber)) ? Math.round(Number(session.chapterNumber)) : null;
    const chapterTitle = String(session?.chapterTitle || '').trim();
    const includeAct = options?.includeAct === true;

    if (!isBookLinked) {
        return String(session?.name || '').trim() || fallback;
    }

    let chapterLabel = '';
    if (chapterNumber && chapterTitle) {
        chapterLabel = `Chapter ${chapterNumber}: ${chapterTitle}`;
    } else if (chapterNumber) {
        chapterLabel = `Chapter ${chapterNumber}`;
    } else if (chapterTitle) {
        chapterLabel = `Chapter: ${chapterTitle}`;
    } else if (actNumber) {
        chapterLabel = `Act ${actNumber} Chapter`;
    } else {
        chapterLabel = 'Chapter';
    }

    if (includeAct && actNumber) {
        const actPrefix = `Act ${actNumber}`;
        if (!chapterLabel.toLowerCase().startsWith(actPrefix.toLowerCase())) {
            return `${actPrefix} • ${chapterLabel}`;
        }
    }

    return chapterLabel;
}

export function isWorldItemVisibleForChapter(item, context = {}) {
    if (!item) return false;

    const mode = context?.mode === CHAPTER_WRITING_MODE_AUTHOR
        ? CHAPTER_WRITING_MODE_AUTHOR
        : CHAPTER_WRITING_MODE_WRITING;
    if (mode === CHAPTER_WRITING_MODE_AUTHOR) return true;

    const revealGate = normalizeRevealGate(item?.revealGate);
    if (!revealGate) {
        return item?.visibility !== WORLD_ITEM_VISIBILITY_GATED;
    }

    if (revealGate.kind === REVEAL_GATE_KIND_MANUAL_UNLOCK) {
        return revealGate.unlocked === true;
    }

    if (revealGate.kind === REVEAL_GATE_KIND_CHAPTER_THRESHOLD) {
        const asOfChapter = normalizePositiveInteger(
            context?.asOfChapter ?? context?.revealScope?.asOfChapter,
            null
        );
        if (!asOfChapter) return false;
        return asOfChapter >= revealGate.value;
    }

    return false;
}
