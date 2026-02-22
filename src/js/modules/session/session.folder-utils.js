export const SESSION_CONTEXT_MODE_SESSION_ONLY = 'session_only';
export const SESSION_CONTEXT_MODE_FOLDER_AWARE = 'folder_aware';
export const FOLDER_SESSION_SORT_MANUAL = 'manual';
export const FOLDER_SESSION_SORT_MODIFIED_DESC = 'modified-desc';
export const FOLDER_SESSION_SORT_MODIFIED_ASC = 'modified-asc';
export const FOLDER_SESSION_SORT_CREATED_DESC = 'created-desc';
export const FOLDER_SESSION_SORT_CREATED_ASC = 'created-asc';
export const FOLDER_SESSION_SORT_NAME_ASC = 'name-asc';
export const FOLDER_SESSION_SORT_NAME_DESC = 'name-desc';

export const DEFAULT_SESSION_CONTEXT_MODE = SESSION_CONTEXT_MODE_FOLDER_AWARE;

export const DEFAULT_SESSION_RAG_SETTINGS = {
    scopeSource: 'session',
    scopeMode: 'all',
    selectedFileIds: [],
    retrievalTopK: 6,
    maxContextTokens: 1800
};

export const DEFAULT_FOLDER_RAG_SETTINGS = {
    autoRetrieve: true,
    scopeMode: 'all',
    selectedFileIds: [],
    retrievalTopK: 6,
    maxContextTokens: 1800
};

export const DEFAULT_FOLDER_CONTEXT_POLICY = {
    autoSharedContext: true,
    sharedContextBudgetTokens: 900,
    maxSharedSessions: 4
};

const clampNumber = (value, min, max, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
};

const uniqueIds = (ids) => {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.filter(Boolean))];
};

const normalizeTimestamp = (value, fallback) => {
    return Number.isFinite(value) ? value : fallback;
};

export function normalizeSessionContextMode(mode) {
    return mode === SESSION_CONTEXT_MODE_SESSION_ONLY
        ? SESSION_CONTEXT_MODE_SESSION_ONLY
        : SESSION_CONTEXT_MODE_FOLDER_AWARE;
}

export function normalizeSessionRagSettings(rawSettings = {}, fallbackSettings = {}) {
    const source = {
        ...DEFAULT_SESSION_RAG_SETTINGS,
        ...(fallbackSettings || {}),
        ...(rawSettings || {})
    };
    const scopeSourceCandidate = source.scopeSource || source.scopeOwner || 'session';

    return {
        scopeSource: scopeSourceCandidate === 'folder' ? 'folder' : 'session',
        scopeMode: source.scopeMode === 'selected' ? 'selected' : 'all',
        selectedFileIds: uniqueIds(source.selectedFileIds),
        retrievalTopK: clampNumber(source.retrievalTopK, 1, 12, DEFAULT_SESSION_RAG_SETTINGS.retrievalTopK),
        maxContextTokens: clampNumber(source.maxContextTokens, 200, 10000, DEFAULT_SESSION_RAG_SETTINGS.maxContextTokens)
    };
}

export function normalizeFolderRagSettings(rawSettings = {}) {
    const source = {
        ...DEFAULT_FOLDER_RAG_SETTINGS,
        ...(rawSettings || {})
    };
    return {
        autoRetrieve: source.autoRetrieve !== false,
        scopeMode: source.scopeMode === 'selected' ? 'selected' : 'all',
        selectedFileIds: uniqueIds(source.selectedFileIds),
        retrievalTopK: clampNumber(source.retrievalTopK, 1, 12, DEFAULT_FOLDER_RAG_SETTINGS.retrievalTopK),
        maxContextTokens: clampNumber(source.maxContextTokens, 200, 10000, DEFAULT_FOLDER_RAG_SETTINGS.maxContextTokens)
    };
}

export function normalizeFolderContextPolicy(rawPolicy = {}) {
    const source = {
        ...DEFAULT_FOLDER_CONTEXT_POLICY,
        ...(rawPolicy || {})
    };
    return {
        autoSharedContext: source.autoSharedContext !== false,
        sharedContextBudgetTokens: clampNumber(
            source.sharedContextBudgetTokens,
            200,
            6000,
            DEFAULT_FOLDER_CONTEXT_POLICY.sharedContextBudgetTokens
        ),
        maxSharedSessions: clampNumber(
            source.maxSharedSessions,
            1,
            12,
            DEFAULT_FOLDER_CONTEXT_POLICY.maxSharedSessions
        )
    };
}

export function normalizeFolderSessionSortMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    switch (normalized) {
        case FOLDER_SESSION_SORT_MODIFIED_DESC:
        case FOLDER_SESSION_SORT_MODIFIED_ASC:
        case FOLDER_SESSION_SORT_CREATED_DESC:
        case FOLDER_SESSION_SORT_CREATED_ASC:
        case FOLDER_SESSION_SORT_NAME_ASC:
        case FOLDER_SESSION_SORT_NAME_DESC:
            return normalized;
        default:
            return FOLDER_SESSION_SORT_MANUAL;
    }
}

export function createFolderId() {
    return `fld_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createFolderName(existingFolders = [], baseName = 'New Folder') {
    const fallbackBase = String(baseName || '').trim() || 'New Folder';
    const existingNames = new Set(
        (existingFolders || [])
            .map(folder => String(folder?.name || '').trim().toLowerCase())
            .filter(Boolean)
    );
    if (!existingNames.has(fallbackBase.toLowerCase())) return fallbackBase;

    let counter = 2;
    let candidate = `${fallbackBase} ${counter}`;
    while (existingNames.has(candidate.toLowerCase())) {
        counter += 1;
        candidate = `${fallbackBase} ${counter}`;
    }
    return candidate;
}

export function normalizeFolder(folder = {}) {
    const now = Date.now();
    const resolvedName = String(folder?.name || '').trim() || 'Folder';
    return {
        id: String(folder?.id || '').trim() || createFolderId(),
        name: resolvedName,
        color: typeof folder?.color === 'string' ? folder.color : '',
        createdAt: normalizeTimestamp(folder?.createdAt, now),
        updatedAt: normalizeTimestamp(folder?.updatedAt, now),
        collapsed: Boolean(folder?.collapsed),
        sessionSortMode: normalizeFolderSessionSortMode(folder?.sessionSortMode),
        ragSettings: normalizeFolderRagSettings(folder?.ragSettings),
        contextPolicy: normalizeFolderContextPolicy(folder?.contextPolicy)
    };
}

export function ensureProjectFolders(project) {
    if (!project || typeof project !== 'object') return;

    if (!Array.isArray(project.chatFolders)) {
        project.chatFolders = [];
    }
    if (!Array.isArray(project.folderMemoryCards)) {
        project.folderMemoryCards = [];
    }
    if (!Array.isArray(project.chatSessions)) {
        project.chatSessions = [];
    }

    project.chatFolders = project.chatFolders.map(folder => normalizeFolder(folder));
    sanitizeSessionFolderReferences(project);

    const folderIdSet = new Set(project.chatFolders.map(folder => folder.id));
    if (!project.activeFolderId || !folderIdSet.has(project.activeFolderId)) {
        project.activeFolderId = null;
    }
}

export function sanitizeSessionFolderReferences(project) {
    if (!project || !Array.isArray(project.chatSessions)) return;
    const validFolderIds = new Set((project.chatFolders || []).map(folder => folder.id));

    project.chatSessions = project.chatSessions.map((session, index) => {
        const next = {
            ...session
        };

        if (next.pinned === undefined) {
            next.pinned = Boolean(next.isPinned);
        } else {
            next.pinned = Boolean(next.pinned);
        }

        const hasValidFolder = Boolean(next.folderId) && validFolderIds.has(next.folderId);
        next.folderId = hasValidFolder ? next.folderId : null;
        next.contextMode = normalizeSessionContextMode(next.contextMode);
        next.ragSettings = normalizeSessionRagSettings(next.ragSettings);
        const parsedSortIndex = Number(next.sortIndex);
        next.sortIndex = Number.isFinite(parsedSortIndex) ? Math.round(parsedSortIndex) : index;

        if (!next.folderId && next.ragSettings.scopeSource === 'folder') {
            next.ragSettings.scopeSource = 'session';
        }

        return next;
    });
}

export function getFolderById(project, folderId) {
    if (!project || !folderId) return null;
    return (project.chatFolders || []).find(folder => folder.id === folderId) || null;
}

export function getSessionFolder(project, session) {
    if (!session?.folderId) return null;
    return getFolderById(project, session.folderId);
}
