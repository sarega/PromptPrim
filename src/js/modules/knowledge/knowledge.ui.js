import { stateManager } from '../../core/core.state.js';
import { createDropdown } from '../../core/core.ui.js';
import {
    ensureProjectFolders,
    getFolderById,
    normalizeFolderRagSettings,
    normalizeSessionRagSettings
} from '../session/session.folder-utils.js';

let lastHandledFocusRequestAt = 0;

function formatFileSize(size = 0) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getStatusLabel(status) {
    switch (status) {
        case 'uploaded':
            return 'Uploaded';
        case 'indexing':
            return 'Indexing';
        case 'indexed':
            return 'Indexed';
        case 'failed':
            return 'Failed';
        case 'ready':
            return 'Ready';
        case 'binary':
            return 'Binary';
        case 'error':
            return 'Error';
        default:
            return 'Uploaded';
    }
}

function getFileIcon(file) {
    const mime = (file.type || '').toLowerCase();
    if (mime.includes('json')) return '🧩';
    if (mime.includes('csv')) return '📊';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('word') || mime.includes('doc')) return '📝';
    if (mime.startsWith('text/')) return '📄';
    return '📁';
}

function resolveActiveRagUiState(project) {
    ensureProjectFolders(project);
    const session = project.chatSessions?.find(item => item.id === project.activeSessionId) || null;
    const sessionSettings = normalizeSessionRagSettings(session?.ragSettings, {
        scopeSource: session?.folderId ? 'folder' : 'session'
    });
    const folder = session?.folderId ? getFolderById(project, session.folderId) : null;
    const folderSettings = folder ? normalizeFolderRagSettings(folder.ragSettings) : null;
    const scopeSource = sessionSettings.scopeSource === 'folder' && folder ? 'folder' : 'session';
    const settings = scopeSource === 'folder' && folderSettings ? folderSettings : sessionSettings;

    return {
        session,
        folder,
        scopeSource,
        settings,
        sessionSettings,
        folderSettings
    };
}

function createRagControls(project, files) {
    const ragUiState = resolveActiveRagUiState(project);
    const { session, folder, scopeSource, settings } = ragUiState;
    const controls = document.createElement('div');
    controls.className = 'knowledge-rag-controls';

    const selectedCount = settings.selectedFileIds.filter(id => files.some(file => file.id === id)).length;

    if (session && folder) {
        const sourceWrapper = document.createElement('label');
        sourceWrapper.className = 'knowledge-control';
        sourceWrapper.innerHTML = '<span>RAG Source</span>';

        const sourceSelect = document.createElement('select');
        sourceSelect.innerHTML = `
            <option value="session">Session</option>
            <option value="folder">Folder</option>
        `;
        sourceSelect.value = scopeSource;
        sourceSelect.addEventListener('change', () => {
            stateManager.bus.publish('knowledge:setScopeSource', { scopeSource: sourceSelect.value });
        });
        sourceWrapper.appendChild(sourceSelect);
        controls.appendChild(sourceWrapper);
    }

    const scopeWrapper = document.createElement('label');
    scopeWrapper.className = 'knowledge-control';
    scopeWrapper.innerHTML = '<span>Scope</span>';
    const scopeSelect = document.createElement('select');
    scopeSelect.innerHTML = `
        <option value="all">All files</option>
        <option value="selected">Selected files only</option>
    `;
    scopeSelect.value = settings.scopeMode;
    scopeSelect.addEventListener('change', () => {
        stateManager.bus.publish('knowledge:updateSessionRagSettings', { scopeMode: scopeSelect.value });
    });
    scopeWrapper.appendChild(scopeSelect);

    const topKWrapper = document.createElement('label');
    topKWrapper.className = 'knowledge-control';
    topKWrapper.innerHTML = '<span>Top-K</span>';
    const topKInput = document.createElement('input');
    topKInput.type = 'number';
    topKInput.min = '1';
    topKInput.max = '12';
    topKInput.value = settings.retrievalTopK;
    topKInput.addEventListener('change', () => {
        stateManager.bus.publish('knowledge:updateSessionRagSettings', { retrievalTopK: Number(topKInput.value) });
    });
    topKWrapper.appendChild(topKInput);

    const tokenWrapper = document.createElement('label');
    tokenWrapper.className = 'knowledge-control';
    tokenWrapper.innerHTML = '<span>Token Budget</span>';
    const tokenInput = document.createElement('input');
    tokenInput.type = 'number';
    tokenInput.min = '200';
    tokenInput.max = '10000';
    tokenInput.step = '100';
    tokenInput.value = settings.maxContextTokens;
    tokenInput.addEventListener('change', () => {
        stateManager.bus.publish('knowledge:updateSessionRagSettings', { maxContextTokens: Number(tokenInput.value) });
    });
    tokenWrapper.appendChild(tokenInput);

    const selectedInfo = document.createElement('div');
    selectedInfo.className = 'knowledge-scope-info';
    if (scopeSource === 'folder' && folder) {
        selectedInfo.textContent = `Selected files: ${selectedCount} (using folder "${folder.name}")`;
    } else {
        selectedInfo.textContent = `Selected files: ${selectedCount} (using current session)`;
    }

    controls.append(scopeWrapper, topKWrapper, tokenWrapper, selectedInfo);
    return { controls, settings, scopeSource };
}

function buildChunksByFileId(project) {
    const chunkList = Array.isArray(project?.knowledgeIndex?.chunks) ? project.knowledgeIndex.chunks : [];
    const map = new Map();

    chunkList.forEach(chunk => {
        if (!chunk?.fileId) return;
        if (!map.has(chunk.fileId)) map.set(chunk.fileId, []);
        map.get(chunk.fileId).push(chunk);
    });

    map.forEach(chunks => {
        chunks.sort((a, b) => {
            const aIndex = Number.isFinite(a?.chunkIndex) ? a.chunkIndex : 0;
            const bIndex = Number.isFinite(b?.chunkIndex) ? b.chunkIndex : 0;
            return aIndex - bIndex;
        });
    });

    return map;
}

function createKnowledgeItemElement(file, {
    isSelected = false,
    isFocused = false,
    focusedChunk = null
} = {}) {
    const item = document.createElement('div');
    item.className = 'item knowledge-item';
    if (isSelected) item.classList.add('selected-for-rag');
    if (isFocused) item.classList.add('source-focused');
    item.dataset.fileId = file.id;

    const header = document.createElement('div');
    header.className = 'item-header';

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = `${getFileIcon(file)} ${file.name}`;

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    if (file.textContent) {
        const scopeBtn = document.createElement('button');
        scopeBtn.className = `btn-icon ${isSelected ? 'is-active' : ''}`;
        scopeBtn.title = isSelected ? 'Remove from selected scope' : 'Add to selected scope';
        scopeBtn.dataset.action = 'knowledge:toggleSelection';
        scopeBtn.innerHTML = `<span class="material-symbols-outlined">${isSelected ? 'check_circle' : 'radio_button_unchecked'}</span>`;
        actions.appendChild(scopeBtn);

        const reindexBtn = document.createElement('button');
        reindexBtn.className = 'btn-icon';
        reindexBtn.title = 'Re-index file';
        reindexBtn.dataset.action = 'knowledge:reindex';
        reindexBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span>';
        actions.appendChild(reindexBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon danger';
    deleteBtn.title = 'Delete file';
    deleteBtn.dataset.action = 'knowledge:delete';
    deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    actions.appendChild(deleteBtn);

    header.append(name, actions);

    const meta = document.createElement('div');
    meta.className = 'knowledge-file-meta';
    const chunksText = Number.isFinite(file.chunkCount) ? `${file.chunkCount} chunk(s)` : '0 chunk(s)';
    meta.textContent = `${formatFileSize(file.size || 0)} • ${getStatusLabel(file.status)} • ${chunksText} • ${new Date(file.uploadedAt).toLocaleString('th-TH')}`;

    const excerpt = document.createElement('div');
    excerpt.className = 'knowledge-file-excerpt';
    excerpt.textContent = file.excerpt || 'No preview available.';

    item.append(header, meta, excerpt);

    if (focusedChunk) {
        const preview = document.createElement('div');
        preview.className = 'knowledge-focus-preview';

        const previewHeader = document.createElement('div');
        previewHeader.className = 'knowledge-focus-preview-header';

        const previewTitle = document.createElement('span');
        previewTitle.className = 'knowledge-focus-preview-title';
        const chunkNo = Number.isFinite(focusedChunk.chunkIndex) ? focusedChunk.chunkIndex + 1 : 1;
        previewTitle.textContent = `Focused source: #chunk${chunkNo}`;

        const clearFocusBtn = document.createElement('button');
        clearFocusBtn.type = 'button';
        clearFocusBtn.className = 'btn-icon knowledge-focus-clear';
        clearFocusBtn.title = 'Clear focused source';
        clearFocusBtn.dataset.action = 'knowledge:clearFocus';
        clearFocusBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';

        const previewText = document.createElement('div');
        previewText.className = 'knowledge-focus-preview-text';
        previewText.textContent = focusedChunk.text || 'No text available for this chunk.';

        previewHeader.append(previewTitle, clearFocusBtn);
        preview.append(previewHeader, previewText);
        item.appendChild(preview);
    }

    if (file.note) {
        const note = document.createElement('div');
        note.className = 'knowledge-file-note';
        note.textContent = file.note;
        item.appendChild(note);
    }

    return item;
}

export function loadAndRenderKnowledgeFiles(assetsContainer) {
    if (!assetsContainer) return;

    const project = stateManager.getProject();
    if (!project) return;
    ensureProjectFolders(project);

    const section = document.createElement('details');
    section.className = 'collapsible-section knowledge-files-section';
    section.open = true;

    const summary = document.createElement('summary');
    summary.className = 'section-header';
    summary.innerHTML = '<h3>📚 Knowledge Files</h3>';

    const summaryDropdown = createDropdown([
        { label: 'Upload Files...', action: 'knowledge:upload' },
        { label: 'Re-index All', action: 'knowledge:reindexAll' },
        { label: 'Clear All', action: 'knowledge:clearAll', isDestructive: true }
    ]);
    summary.appendChild(summaryDropdown);

    const box = document.createElement('div');
    box.className = 'section-box';

    const files = Array.isArray(project.knowledgeFiles) ? project.knowledgeFiles : [];
    const chunksByFileId = buildChunksByFileId(project);
    const focusState = stateManager.getState().knowledgeFocus || null;
    const { controls, settings } = createRagControls(project, files);

    const list = document.createElement('div');
    list.className = 'item-list';
    const selectedSet = new Set(settings.selectedFileIds || []);

    if (files.length === 0) {
        list.innerHTML = '<p class="no-items-message">No knowledge files yet.</p>';
    } else {
        files.forEach(file => {
            const fileChunks = chunksByFileId.get(file.id) || [];
            const isFocused = Boolean(focusState?.fileId && focusState.fileId === file.id);
            const focusedChunk = isFocused
                ? (fileChunks.find(chunk => chunk.chunkIndex === focusState.chunkIndex) || fileChunks[0] || null)
                : null;

            list.appendChild(createKnowledgeItemElement(file, {
                isSelected: selectedSet.has(file.id),
                isFocused,
                focusedChunk
            }));
        });
    }

    box.append(controls, list);
    section.append(summary, box);
    assetsContainer.appendChild(section);

    const requestedAt = Number(focusState?.requestedAt) || 0;
    if (focusState?.fileId && requestedAt > lastHandledFocusRequestAt) {
        const focusedItem = Array.from(list.querySelectorAll('.knowledge-item'))
            .find(item => item.dataset.fileId === focusState.fileId);
        if (focusedItem) {
            lastHandledFocusRequestAt = requestedAt;
            requestAnimationFrame(() => {
                focusedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }
}
