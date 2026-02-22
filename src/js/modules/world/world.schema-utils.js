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

export const REVEAL_GATE_KIND_CHAPTER_THRESHOLD = 'chapter_threshold';
export const REVEAL_GATE_KIND_MANUAL_UNLOCK = 'manual_unlock';

export const CHAPTER_WRITING_MODE_WRITING = 'writing';
export const CHAPTER_WRITING_MODE_AUTHOR = 'author';

export const CHAPTER_STATUS_OUTLINE = 'outline';
export const CHAPTER_STATUS_DRAFTING = 'drafting';
export const CHAPTER_STATUS_REVISING = 'revising';
export const CHAPTER_STATUS_DONE = 'done';

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

    return {
        id: normalizeNullableString(world?.id) || createWorldId(),
        name: normalizeString(world?.name, 'New World'),
        description: normalizeString(world?.description, ''),
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

    return {
        id: normalizeNullableString(book?.id) || createBookId(),
        name: normalizeString(book?.name, 'New Book'),
        description: normalizeString(book?.description, ''),
        linkedWorldId,
        createdAt: normalizeTimestamp(book?.createdAt, now),
        updatedAt: normalizeTimestamp(book?.updatedAt, now),
        autoNumberChapters: book?.autoNumberChapters !== false,
        constraints: isPlainObject(book?.constraints) ? cloneJsonish(book.constraints) : {},
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
        chapterStatus: normalizeChapterStatus(session?.chapterStatus),
        revealScope: {
            asOfChapter
        },
        writingMode: session?.writingMode === CHAPTER_WRITING_MODE_AUTHOR
            ? CHAPTER_WRITING_MODE_AUTHOR
            : CHAPTER_WRITING_MODE_WRITING
    };
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

