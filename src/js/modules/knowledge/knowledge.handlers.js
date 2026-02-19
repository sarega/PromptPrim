import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';
import {
    ensureProjectFolders,
    getFolderById,
    normalizeFolderRagSettings,
    normalizeSessionRagSettings
} from '../session/session.folder-utils.js';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_STORED_TEXT_CHARS = 500000;
const MAX_EXCERPT_CHARS = 280;
const CHUNK_TARGET_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 180;
const MAX_CHUNKS_PER_FILE = 500;
const LOCAL_EMBEDDING_MODEL = 'local-hash-v1';
const LOCAL_EMBEDDING_DIMENSIONS = 128;

const TEXT_MIME_TYPES = new Set([
    'application/json',
    'application/xml',
    'application/yaml',
    'application/x-yaml'
]);

const TEXT_EXTENSIONS = new Set([
    'txt',
    'md',
    'markdown',
    'csv',
    'json',
    'log',
    'xml',
    'yaml',
    'yml'
]);

function getFileExtension(fileName = '') {
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex < 0) return '';
    return fileName.slice(dotIndex + 1).toLowerCase();
}

function isTextLikeFile(file) {
    const mime = (file.type || '').toLowerCase();
    if (mime.startsWith('text/')) return true;
    if (TEXT_MIME_TYPES.has(mime)) return true;
    return TEXT_EXTENSIONS.has(getFileExtension(file.name));
}

function createKnowledgeFileId() {
    return `kf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeFileSize(size = 0) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function buildExcerpt(text = '') {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!trimmed) return 'No text preview available.';
    if (trimmed.length <= MAX_EXCERPT_CHARS) return trimmed;
    return `${trimmed.slice(0, MAX_EXCERPT_CHARS)}...`;
}

function ensureKnowledgeFiles(project) {
    if (!Array.isArray(project.knowledgeFiles)) {
        project.knowledgeFiles = [];
    }
}

function ensureKnowledgeIndex(project) {
    if (!project.knowledgeIndex || typeof project.knowledgeIndex !== 'object') {
        project.knowledgeIndex = {};
    }

    if (!Array.isArray(project.knowledgeIndex.chunks)) {
        project.knowledgeIndex.chunks = [];
    }

    if (!Number.isFinite(project.knowledgeIndex.version)) {
        project.knowledgeIndex.version = 1;
    }

    if (!Number.isFinite(project.knowledgeIndex.dimensions)) {
        project.knowledgeIndex.dimensions = LOCAL_EMBEDDING_DIMENSIONS;
    }

    if (!project.knowledgeIndex.embeddingModel) {
        project.knowledgeIndex.embeddingModel = LOCAL_EMBEDDING_MODEL;
    }

    if (!Number.isFinite(project.knowledgeIndex.updatedAt)) {
        project.knowledgeIndex.updatedAt = Date.now();
    }
}

function ensureSessionRagSettings(session) {
    if (!session) return;
    session.ragSettings = normalizeSessionRagSettings(session.ragSettings, {
        scopeSource: session.folderId ? 'folder' : 'session'
    });
}

function ensureFolderRagSettings(folder) {
    if (!folder) return;
    folder.ragSettings = normalizeFolderRagSettings(folder.ragSettings);
}

function removeFileIdFromSessionScopes(project, fileId) {
    if (!project?.chatSessions || !fileId) return;
    project.chatSessions.forEach(session => {
        ensureSessionRagSettings(session);
        session.ragSettings.selectedFileIds = session.ragSettings.selectedFileIds.filter(id => id !== fileId);
    });
}

function removeFileIdFromFolderScopes(project, fileId) {
    if (!project?.chatFolders || !fileId) return;
    project.chatFolders.forEach(folder => {
        ensureFolderRagSettings(folder);
        folder.ragSettings.selectedFileIds = folder.ragSettings.selectedFileIds.filter(id => id !== fileId);
    });
}

function fnv1a32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function tokenizeForEmbedding(text = '') {
    const normalized = text.toLowerCase();
    const tokens = normalized.match(/[\p{L}\p{N}_-]{2,}/gu);
    return tokens || [];
}

function createLocalEmbeddingVector(text, dimensions = LOCAL_EMBEDDING_DIMENSIONS) {
    const vector = Array.from({ length: dimensions }, () => 0);
    const tokens = tokenizeForEmbedding(text);

    if (tokens.length === 0) {
        return vector;
    }

    for (const token of tokens) {
        const index = fnv1a32(token) % dimensions;
        vector[index] += 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
    if (!magnitude) return vector;

    return vector.map(value => Number((value / magnitude).toFixed(6)));
}

function estimateTokens(text = '') {
    if (!text) return 0;
    return Math.max(1, Math.round(text.length / 4));
}

function findChunkEnd(text, startIndex, maxChars) {
    const idealEnd = Math.min(text.length, startIndex + maxChars);
    if (idealEnd >= text.length) return text.length;

    const floor = startIndex + Math.floor(maxChars * 0.6);
    const search = text.slice(floor, idealEnd);

    const newlineIndex = search.lastIndexOf('\n');
    if (newlineIndex >= 0) return floor + newlineIndex + 1;

    const sentenceIndex = Math.max(
        search.lastIndexOf('. '),
        search.lastIndexOf('! '),
        search.lastIndexOf('? ')
    );
    if (sentenceIndex >= 0) return floor + sentenceIndex + 2;

    const spaceIndex = search.lastIndexOf(' ');
    if (spaceIndex >= 0) return floor + spaceIndex + 1;

    return idealEnd;
}

function splitTextIntoChunks(text, {
    targetChars = CHUNK_TARGET_CHARS,
    overlapChars = CHUNK_OVERLAP_CHARS,
    maxChunks = MAX_CHUNKS_PER_FILE
} = {}) {
    const cleanText = (text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\u0000/g, '')
        .trim();

    if (!cleanText) return [];

    const chunks = [];
    let start = 0;
    let guard = 0;
    const guardLimit = maxChunks * 5;

    while (start < cleanText.length && chunks.length < maxChunks && guard < guardLimit) {
        guard += 1;
        const end = findChunkEnd(cleanText, start, targetChars);
        const chunkText = cleanText.slice(start, end).trim();

        if (chunkText) {
            chunks.push(chunkText);
        }

        if (end >= cleanText.length) break;

        const nextStart = Math.max(end - overlapChars, start + 1);
        start = nextStart;
    }

    return chunks;
}

function removeFileChunks(project, fileId) {
    ensureKnowledgeIndex(project);
    project.knowledgeIndex.chunks = project.knowledgeIndex.chunks.filter(chunk => chunk.fileId !== fileId);
}

function indexKnowledgeFileRecord(project, fileRecord) {
    ensureKnowledgeIndex(project);

    if (!fileRecord?.textContent?.trim()) {
        fileRecord.status = 'failed';
        fileRecord.chunkCount = 0;
        fileRecord.note = 'No text content available for indexing.';
        removeFileChunks(project, fileRecord.id);
        return 0;
    }

    fileRecord.status = 'indexing';
    removeFileChunks(project, fileRecord.id);

    const chunks = splitTextIntoChunks(fileRecord.textContent);
    const now = Date.now();

    const indexedChunks = chunks.map((chunkText, index) => ({
        id: `kc_${fileRecord.id}_${index}_${now}`,
        fileId: fileRecord.id,
        fileName: fileRecord.name,
        chunkIndex: index,
        text: chunkText,
        charCount: chunkText.length,
        tokenEstimate: estimateTokens(chunkText),
        vector: createLocalEmbeddingVector(chunkText, project.knowledgeIndex.dimensions || LOCAL_EMBEDDING_DIMENSIONS),
        embeddingModel: project.knowledgeIndex.embeddingModel,
        createdAt: now
    }));

    project.knowledgeIndex.chunks.push(...indexedChunks);
    project.knowledgeIndex.updatedAt = now;

    fileRecord.status = indexedChunks.length > 0 ? 'indexed' : 'failed';
    fileRecord.chunkCount = indexedChunks.length;
    fileRecord.indexedAt = now;
    fileRecord.embeddingModel = project.knowledgeIndex.embeddingModel;

    return indexedChunks.length;
}

function makeDuplicateKey(file) {
    return `${file.name}__${file.size}__${file.lastModified || 0}`;
}

function createBinaryRecord(file) {
    return {
        id: createKnowledgeFileId(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size || 0,
        uploadedAt: Date.now(),
        source: 'upload',
        status: 'binary',
        chunkCount: 0,
        indexedAt: null,
        embeddingModel: '',
        textContent: '',
        excerpt: 'Preview not available for this file type yet.'
    };
}

async function createTextRecord(file) {
    const text = await file.text();
    const wasTrimmed = text.length > MAX_STORED_TEXT_CHARS;
    const storedText = wasTrimmed ? text.slice(0, MAX_STORED_TEXT_CHARS) : text;
    const note = wasTrimmed ? `Text was truncated at ${MAX_STORED_TEXT_CHARS.toLocaleString()} characters.` : '';

    return {
        id: createKnowledgeFileId(),
        name: file.name,
        type: file.type || 'text/plain',
        size: file.size || 0,
        uploadedAt: Date.now(),
        source: 'upload',
        status: 'uploaded',
        chunkCount: 0,
        indexedAt: null,
        embeddingModel: '',
        textContent: storedText,
        excerpt: buildExcerpt(storedText),
        note
    };
}

function createErrorRecord(file, error) {
    return {
        id: createKnowledgeFileId(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size || 0,
        uploadedAt: Date.now(),
        source: 'upload',
        status: 'failed',
        chunkCount: 0,
        indexedAt: null,
        embeddingModel: '',
        textContent: '',
        excerpt: `Could not read file: ${error.message || 'Unknown error'}`
    };
}

export function openKnowledgeFilePicker() {
    document.getElementById('knowledge-file-input')?.click();
}

export async function handleKnowledgeFilesSelected(files) {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;

    const project = stateManager.getProject();
    if (!project) return;

    ensureProjectFolders(project);
    ensureKnowledgeFiles(project);
    ensureKnowledgeIndex(project);

    const duplicateKeys = new Set(
        project.knowledgeFiles.map(f => `${f.name}__${f.size}__${f.lastModified || 0}`)
    );

    let addedCount = 0;
    let duplicateCount = 0;
    let tooLargeCount = 0;
    let errorCount = 0;
    let indexedFileCount = 0;
    let indexedChunkCount = 0;

    for (const file of selectedFiles) {
        const duplicateKey = makeDuplicateKey(file);
        if (duplicateKeys.has(duplicateKey)) {
            duplicateCount += 1;
            continue;
        }

        if ((file.size || 0) > MAX_FILE_SIZE_BYTES) {
            tooLargeCount += 1;
            continue;
        }

        let record;
        if (isTextLikeFile(file)) {
            try {
                record = await createTextRecord(file);
            } catch (error) {
                record = createErrorRecord(file, error);
                errorCount += 1;
            }
        } else {
            record = createBinaryRecord(file);
        }

        record.lastModified = file.lastModified || 0;
        record.sizeLabel = normalizeFileSize(record.size);

        if (record.textContent) {
            try {
                const chunkCount = indexKnowledgeFileRecord(project, record);
                indexedChunkCount += chunkCount;
                if (chunkCount > 0) indexedFileCount += 1;
            } catch (error) {
                record.status = 'failed';
                record.note = `Indexing failed: ${error.message || 'Unknown error'}`;
                record.chunkCount = 0;
                removeFileChunks(project, record.id);
                errorCount += 1;
            }
        }

        project.knowledgeFiles.unshift(record);
        duplicateKeys.add(duplicateKey);
        addedCount += 1;
    }

    if (addedCount > 0) {
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        stateManager.bus.publish('studio:contentShouldRender');
    }

    const notices = [];
    if (addedCount > 0) notices.push(`Added ${addedCount} file(s).`);
    if (indexedFileCount > 0) notices.push(`Indexed ${indexedFileCount} file(s) into ${indexedChunkCount} chunk(s).`);
    if (duplicateCount > 0) notices.push(`Skipped ${duplicateCount} duplicate file(s).`);
    if (tooLargeCount > 0) notices.push(`Skipped ${tooLargeCount} file(s) larger than 25 MB.`);
    if (errorCount > 0) notices.push(`${errorCount} file(s) were added with read errors.`);

    if (notices.length > 0) {
        showCustomAlert(notices.join('\n'), 'Knowledge Files');
    }
}

export function deleteKnowledgeFile({ fileId }) {
    if (!fileId) return;

    const project = stateManager.getProject();
    if (!project || !Array.isArray(project.knowledgeFiles)) return;
    ensureProjectFolders(project);

    const file = project.knowledgeFiles.find(item => item.id === fileId);
    if (!file) return;

    const shouldDelete = confirm(`Delete "${file.name}" from Knowledge Files?`);
    if (!shouldDelete) return;

    project.knowledgeFiles = project.knowledgeFiles.filter(item => item.id !== fileId);
    removeFileIdFromSessionScopes(project, fileId);
    removeFileIdFromFolderScopes(project, fileId);
    removeFileChunks(project, fileId);

    const focused = stateManager.getState().knowledgeFocus;
    if (focused?.fileId === fileId) {
        stateManager.setState('knowledgeFocus', null);
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
}

export function clearKnowledgeFiles() {
    const project = stateManager.getProject();
    if (!project || !Array.isArray(project.knowledgeFiles) || project.knowledgeFiles.length === 0) return;
    ensureProjectFolders(project);

    const shouldClear = confirm('Delete all knowledge files in this project?');
    if (!shouldClear) return;

    const existingFileIds = project.knowledgeFiles.map(file => file.id);
    project.knowledgeFiles = [];
    ensureKnowledgeIndex(project);
    project.knowledgeIndex.chunks = [];
    project.knowledgeIndex.updatedAt = Date.now();
    existingFileIds.forEach(fileId => {
        removeFileIdFromSessionScopes(project, fileId);
        removeFileIdFromFolderScopes(project, fileId);
    });
    stateManager.setState('knowledgeFocus', null);
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
}

export function reindexKnowledgeFile({ fileId }) {
    if (!fileId) return;

    const project = stateManager.getProject();
    if (!project || !Array.isArray(project.knowledgeFiles)) return;
    ensureProjectFolders(project);

    ensureKnowledgeIndex(project);
    const file = project.knowledgeFiles.find(item => item.id === fileId);
    if (!file) return;

    if (!file.textContent) {
        showCustomAlert('This file has no text content to index.', 'Knowledge Files');
        return;
    }

    try {
        const chunkCount = indexKnowledgeFileRecord(project, file);
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        stateManager.bus.publish('studio:contentShouldRender');
        showCustomAlert(`Re-indexed "${file.name}" (${chunkCount} chunk(s)).`, 'Knowledge Files');
    } catch (error) {
        file.status = 'failed';
        file.note = `Indexing failed: ${error.message || 'Unknown error'}`;
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        stateManager.bus.publish('studio:contentShouldRender');
        showCustomAlert(`Could not re-index "${file.name}".`, 'Knowledge Files');
    }
}

export function reindexAllKnowledgeFiles() {
    const project = stateManager.getProject();
    if (!project || !Array.isArray(project.knowledgeFiles)) return;
    ensureProjectFolders(project);

    ensureKnowledgeIndex(project);

    let fileCount = 0;
    let chunkCount = 0;
    for (const file of project.knowledgeFiles) {
        if (!file.textContent) continue;
        const chunks = indexKnowledgeFileRecord(project, file);
        chunkCount += chunks;
        fileCount += 1;
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
    showCustomAlert(`Re-indexed ${fileCount} file(s) into ${chunkCount} chunk(s).`, 'Knowledge Files');
}

export function focusKnowledgeChunk({ fileId, chunkIndex, fileName } = {}) {
    const project = stateManager.getProject();
    if (!project) return;

    ensureProjectFolders(project);
    ensureKnowledgeFiles(project);
    ensureKnowledgeIndex(project);

    let resolvedFileId = fileId || '';
    if (!resolvedFileId && fileName) {
        const matchedFile = project.knowledgeFiles.find(file => file.name === fileName);
        resolvedFileId = matchedFile?.id || '';
    }

    if (!resolvedFileId) {
        showCustomAlert('Could not locate source file for this citation.', 'Knowledge Files');
        return;
    }

    const normalizedChunkIndex = Number.isFinite(Number(chunkIndex))
        ? Math.max(0, Math.round(Number(chunkIndex)))
        : 0;

    const directChunk = project.knowledgeIndex.chunks.find(chunk =>
        chunk.fileId === resolvedFileId && chunk.chunkIndex === normalizedChunkIndex
    );
    const fallbackChunk = project.knowledgeIndex.chunks.find(chunk => chunk.fileId === resolvedFileId);
    const finalChunk = directChunk || fallbackChunk;

    stateManager.setState('knowledgeFocus', {
        fileId: resolvedFileId,
        chunkIndex: Number.isFinite(finalChunk?.chunkIndex) ? finalChunk.chunkIndex : 0,
        requestedAt: Date.now()
    });
    stateManager.bus.publish('studio:contentShouldRender');
}

export function clearKnowledgeFocus() {
    stateManager.setState('knowledgeFocus', null);
    stateManager.bus.publish('studio:contentShouldRender');
}

function getActiveSession(project) {
    return project?.chatSessions?.find(item => item.id === project.activeSessionId) || null;
}

function resolveActiveRagTarget(project, session) {
    ensureSessionRagSettings(session);
    const wantsFolderScope = session.ragSettings.scopeSource === 'folder';
    const folder = session.folderId ? getFolderById(project, session.folderId) : null;

    if (wantsFolderScope && folder) {
        ensureFolderRagSettings(folder);
        return {
            target: 'folder',
            settings: folder.ragSettings,
            folder
        };
    }

    if (session.ragSettings.scopeSource === 'folder' && !folder) {
        session.ragSettings.scopeSource = 'session';
    }

    return {
        target: 'session',
        settings: session.ragSettings,
        folder: null
    };
}

export function setActiveSessionRagScopeSource({ scopeSource } = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = getActiveSession(project);
    if (!session) return;

    ensureSessionRagSettings(session);
    const requested = scopeSource === 'folder' ? 'folder' : 'session';

    if (requested === 'folder' && !getFolderById(project, session.folderId)) {
        showCustomAlert('This session is not in a folder. Move the session into a folder first.', 'Knowledge Files');
        session.ragSettings.scopeSource = 'session';
    } else {
        session.ragSettings.scopeSource = requested;
    }

    session.updatedAt = Date.now();
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
}

export function updateActiveSessionRagSettings(payload = {}) {
    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = getActiveSession(project);
    if (!session) return;

    const { target, settings, folder } = resolveActiveRagTarget(project, session);
    const next = { ...settings };

    if (payload.scopeMode !== undefined) {
        next.scopeMode = payload.scopeMode === 'selected' ? 'selected' : 'all';
    }

    if (payload.retrievalTopK !== undefined) {
        const parsed = Number(payload.retrievalTopK);
        if (Number.isFinite(parsed)) {
            next.retrievalTopK = Math.min(12, Math.max(1, Math.round(parsed)));
        }
    }

    if (payload.maxContextTokens !== undefined) {
        const parsed = Number(payload.maxContextTokens);
        if (Number.isFinite(parsed)) {
            next.maxContextTokens = Math.min(10000, Math.max(200, Math.round(parsed)));
        }
    }

    if (target === 'folder' && folder) {
        folder.ragSettings = normalizeFolderRagSettings(next);
        folder.updatedAt = Date.now();
    } else {
        session.ragSettings = normalizeSessionRagSettings(next, {
            scopeSource: 'session'
        });
        session.ragSettings.scopeSource = 'session';
    }

    session.updatedAt = Date.now();
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
}

export function toggleFileInActiveSessionScope({ fileId }) {
    if (!fileId) return;

    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const session = getActiveSession(project);
    if (!session) return;

    const { target, settings, folder } = resolveActiveRagTarget(project, session);
    const selected = new Set(settings.selectedFileIds || []);
    if (selected.has(fileId)) {
        selected.delete(fileId);
    } else {
        selected.add(fileId);
    }

    const selectedFileIds = Array.from(selected);
    if (target === 'folder' && folder) {
        folder.ragSettings = normalizeFolderRagSettings({
            ...folder.ragSettings,
            selectedFileIds
        });
        folder.updatedAt = Date.now();
    } else {
        session.ragSettings = normalizeSessionRagSettings({
            ...session.ragSettings,
            selectedFileIds,
            scopeSource: 'session'
        });
        session.ragSettings.scopeSource = 'session';
    }

    session.updatedAt = Date.now();
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
}
