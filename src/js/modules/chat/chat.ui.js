// ===============================================
// FILE: src/js/modules/chat/chat.ui.js (DEFINITIVE CLEANUP)
// DESCRIPTION: A clean, non-redundant UI manager for the chat panel.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { estimateTokens, getContextData }  from '../../modules/chat/chat.handlers.js'; // <--- แก้ไขบรรทัดนี้
import { debounce } from '../../core/core.utils.js'; 
import { buildPayloadMessages, getFullSystemPrompt } from '../../core/core.api.js';
import * as UserService from '../user/user.service.js'; // <-- Add this import
import * as ChatHandlers from './chat.handlers.js';
import { updateAppStatus } from '../../core/core.ui.js';

let latestContextDebuggerSnapshot = null;
let contextDebuggerSelectedTurn = null;

// --- Private Helper Functions (createMessageElement, enhanceCodeBlocks, etc. remain the same) ---
function enhanceCodeBlocks(messageElement) {
    messageElement.querySelectorAll('pre > code').forEach(block => {
        if (block.dataset.enhanced === 'true') return; // ป้องกันการทำงานซ้ำ

        const pre = block.parentNode;
        
        // 1. สร้าง Wrapper หลัก
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        pre.parentNode.replaceChild(wrapper, pre);

        // 2. สร้าง Header
        const header = document.createElement('div');
        header.className = 'code-block-header';

        // 3. ดึงชื่อภาษาจาก class ของ <code>
        const languageClass = Array.from(block.classList).find(cls => cls.startsWith('language-'));
        const languageName = languageClass ? languageClass.replace('language-', '') : 'text';
        
        const langSpan = document.createElement('span');
        langSpan.className = 'language-name';
        langSpan.textContent = languageName;
        header.appendChild(langSpan);

        // 4. สร้างปุ่ม Copy และใส่ใน Header
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-code-btn';
        copyButton.innerHTML = `<span class="material-symbols-outlined">content_copy</span> Copy`;
        header.appendChild(copyButton);

        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(block.textContent).then(() => {
                copyButton.innerHTML = `<span class="material-symbols-outlined">check</span> Copied!`;
                setTimeout(() => { 
                    copyButton.innerHTML = `<span class="material-symbols-outlined">content_copy</span> Copy`;
                }, 2000);
            });
        });

        // 5. ประกอบร่าง: ใส่ Header และ <pre> เข้าไปใน Wrapper
        wrapper.appendChild(header);
        wrapper.appendChild(pre);

        // 6. เรียกใช้ highlight.js เพื่อลงสี
        if (window.hljs) {
            hljs.highlightElement(block);
        }
        
        block.dataset.enhanced = 'true';
    });
}

function lazyRenderContent(textContent, targetContainer) {
    const chunks = textContent.split(/\n{2,}/);
    let chunkIndex = 0;
    targetContainer.innerHTML = '';

    function renderNextChunk() {
        if (chunkIndex >= chunks.length) {
            addCopyToCodeBlocks(targetContainer);
            scrollToBottom();
            return;
        }
        const chunkContainer = document.createElement('div');
        chunkContainer.innerHTML = marked.parse(chunks[chunkIndex] || '', { gfm: true, breaks: false });
        targetContainer.appendChild(chunkContainer);
        chunkIndex++;
        requestAnimationFrame(() => {
            scrollToBottom();
            renderNextChunk();
        });
    }
    renderNextChunk();
}

function formatRelativeTimestamp(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const messageDate = new Date(timestamp);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    if (messageDate >= startOfToday) {
        return messageDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (messageDate >= startOfYesterday) {
        return 'Yesterday';
    } else {
        return messageDate.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
}

function addCopyToCodeBlocks(contentElement) {
  const codeBlocks = contentElement.querySelectorAll('pre');
  codeBlocks.forEach(preElement => {
    if (preElement.querySelector('.code-block-copy-btn')) return; // ป้องกันการสร้างปุ่มซ้ำ
    preElement.style.position = 'relative';
    const button = document.createElement('button');
    button.className = 'code-block-copy-btn';
    button.textContent = 'Copy';
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = preElement.querySelector('code');
      const textToCopy = code ? code.innerText : preElement.innerText;
      navigator.clipboard.writeText(textToCopy).then(() => {
        button.textContent = 'Copied!';
        setTimeout(() => { button.textContent = 'Copy'; }, 1500);
      });
    });
    preElement.appendChild(button);
  });
}

function extractTextFromAnyContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => {
            if (part?.type === 'text') return part.text || '';
            if (part?.type === 'image_url') return '[image]';
            return '';
        }).filter(Boolean).join('\n');
    }
    if (content && typeof content === 'object' && typeof content.text === 'string') {
        return content.text;
    }
    return '';
}

function resolveDebuggerAgentName(project, session) {
    if (session?.groupChatState?.isRunning && session?.groupChatState?.currentJob?.agentName) {
        return session.groupChatState.currentJob.agentName;
    }

    const activeEntity = project?.activeEntity;
    if (activeEntity?.type === 'agent' && activeEntity.name) {
        return activeEntity.name;
    }
    if (activeEntity?.type === 'group' && activeEntity.name) {
        const group = project.agentGroups?.[activeEntity.name];
        if (group?.moderatorAgent) return group.moderatorAgent;
    }

    if (session?.linkedEntity?.type === 'agent' && session?.linkedEntity?.name) {
        return session.linkedEntity.name;
    }
    if (session?.linkedEntity?.type === 'group' && session?.linkedEntity?.name) {
        const group = project.agentGroups?.[session.linkedEntity.name];
        if (group?.moderatorAgent) return group.moderatorAgent;
    }

    return Object.keys(project?.agentPresets || {})[0] || '';
}

function buildContextDebuggerSnapshot() {
    const project = stateManager.getProject();
    if (!project) return null;

    const session = (project.chatSessions || []).find(item => item.id === project.activeSessionId);
    if (!session) return null;

    const folder = session.folderId
        ? (project.chatFolders || []).find(item => item.id === session.folderId) || null
        : null;

    const agentName = resolveDebuggerAgentName(project, session);
    const payloadMeta = { __collect: true };
    const payloadMessages = buildPayloadMessages(session.history || [], agentName, payloadMeta);
    const payloadTokenEstimate = estimateTokens(JSON.stringify(payloadMessages || []));
    const contextData = getContextData();

    const turns = (session.history || []).map((message, index) => {
        const text = extractTextFromAnyContent(message?.content || '');
        return {
            index,
            role: message?.role || 'unknown',
            speaker: message?.speaker || '',
            timestamp: message?.timestamp || null,
            text,
            tokenEstimate: estimateTokens(text || JSON.stringify(message?.content || '')),
            hasRag: Boolean(message?.rag),
            hasFolderContext: Boolean(message?.folderContext),
            rag: message?.rag || null,
            folderContext: message?.folderContext || null
        };
    });

    return {
        generatedAt: Date.now(),
        project,
        session,
        folder,
        payloadMessages,
        payloadMeta,
        payloadTokenEstimate,
        contextData,
        turns
    };
}

function formatDebuggerNumber(value) {
    return Number.isFinite(value) ? value.toLocaleString() : '-';
}

function renderContextDebuggerSummary(snapshot) {
    const sessionNameEl = document.getElementById('context-debugger-session-name');
    const folderModeEl = document.getElementById('context-debugger-folder-mode');
    const folderBudgetEl = document.getElementById('context-debugger-folder-budget');
    const ragBudgetEl = document.getElementById('context-debugger-rag-budget');
    const payloadMetaEl = document.getElementById('context-debugger-payload-meta');

    if (!sessionNameEl || !folderModeEl || !folderBudgetEl || !ragBudgetEl || !payloadMetaEl) return;

    const contextMode = snapshot.session?.contextMode === 'session_only' ? 'Session only' : 'Folder aware';
    const folderName = snapshot.folder?.name || 'Main list';
    const folderMeta = snapshot.payloadMeta?.folderContext || null;
    const ragMeta = snapshot.payloadMeta?.rag || null;

    sessionNameEl.textContent = snapshot.session?.name || 'Untitled';
    folderModeEl.textContent = `${contextMode} • ${folderName}`;

    if (folderMeta) {
        if (folderMeta.enabled === false) {
            folderBudgetEl.textContent = `Disabled • ${normalizeFolderContextReason(folderMeta.reason)}`;
        } else {
            folderBudgetEl.textContent = `${formatDebuggerNumber(folderMeta.usedTokens)} / ${formatDebuggerNumber(folderMeta.budgetTokens)} tokens • ${formatDebuggerNumber(folderMeta.usedSessionCount)}/${formatDebuggerNumber(folderMeta.maxSharedSessions)} sessions`;
        }
    } else {
        folderBudgetEl.textContent = 'No folder context';
    }

    if (ragMeta) {
        if (ragMeta.enabled === false) {
            ragBudgetEl.textContent = `Disabled • ${normalizeRagDebugReason(ragMeta.reason)}`;
        } else {
            const settings = ragMeta.settings || {};
            ragBudgetEl.textContent = `${formatDebuggerNumber(ragMeta.totalUsedTokens)} / ${formatDebuggerNumber(settings.maxContextTokens)} tokens • ${formatDebuggerNumber(ragMeta.usedChunks?.length || 0)}/${formatDebuggerNumber(ragMeta.totalCandidateChunks)} chunks`;
        }
    } else {
        ragBudgetEl.textContent = 'No RAG metadata';
    }

    payloadMetaEl.textContent = `${formatDebuggerNumber(snapshot.payloadMessages?.length || 0)} messages • ~${formatDebuggerNumber(snapshot.payloadTokenEstimate)} tokens`;
}

function renderContextDebuggerTurns(snapshot) {
    const list = document.getElementById('context-debugger-turn-list');
    if (!list) return;

    list.innerHTML = '';

    if (!Array.isArray(snapshot.turns) || snapshot.turns.length === 0) {
        list.innerHTML = '<p class="no-items-message">No turns in this session.</p>';
        return;
    }

    snapshot.turns.forEach(turn => {
        const item = document.createElement('div');
        item.className = 'context-debugger-turn-item';
        if (turn.index === contextDebuggerSelectedTurn) {
            item.classList.add('active');
        }
        item.dataset.turnIndex = String(turn.index);

        const roleLabel = turn.role === 'assistant'
            ? (turn.speaker ? `assistant • ${turn.speaker}` : 'assistant')
            : turn.role;
        const titleText = (turn.text || '(no text)').replace(/\s+/g, ' ').slice(0, 120);
        const markers = [
            turn.hasFolderContext ? 'folder-context' : '',
            turn.hasRag ? 'rag' : ''
        ].filter(Boolean).join(', ');

        item.innerHTML = `
            <div class="context-debugger-turn-item-role">#${turn.index + 1} • ${roleLabel}</div>
            <div class="context-debugger-turn-item-title">${titleText}</div>
            <div class="context-debugger-turn-item-meta">~${formatDebuggerNumber(turn.tokenEstimate)} tokens${markers ? ` • ${markers}` : ''}</div>
        `;

        list.appendChild(item);
    });
}

function renderContextDebuggerTurnDetail(snapshot) {
    const detailContainer = document.getElementById('context-debugger-turn-detail');
    const assemblyContainer = document.getElementById('context-debugger-assembly');
    if (!detailContainer || !assemblyContainer) return;

    const turn = snapshot.turns.find(item => item.index === contextDebuggerSelectedTurn) || null;
    if (!turn) {
        detailContainer.innerHTML = '<p class="context-debugger-empty">Select a turn to inspect detail.</p>';
    } else {
        const lines = [
            `Turn #${turn.index + 1}`,
            `Role: ${turn.role}${turn.speaker ? ` (${turn.speaker})` : ''}`,
            `Timestamp: ${turn.timestamp ? new Date(turn.timestamp).toLocaleString('th-TH') : '-'}`,
            `Approx tokens: ${formatDebuggerNumber(turn.tokenEstimate)}`,
            ''
        ];

        if (turn.folderContext) {
            lines.push('Folder Context (turn metadata):');
            lines.push(`- Reason: ${turn.folderContext.reason || '-'}`);
            lines.push(`- Budget: ${formatDebuggerNumber(turn.folderContext.usedTokens)} / ${formatDebuggerNumber(turn.folderContext.budgetTokens)} tokens`);
            lines.push(`- Sessions: ${formatDebuggerNumber(turn.folderContext.usedSessionCount)} / ${formatDebuggerNumber(turn.folderContext.maxSharedSessions)}`);
            lines.push('');
        }

        if (turn.rag) {
            const settings = turn.rag.settings || {};
            lines.push('RAG (turn metadata):');
            lines.push(`- Source: ${settings.scopeSource || '-'}`);
            lines.push(`- Scope: ${settings.scopeMode || '-'}`);
            lines.push(`- Reason: ${turn.rag.reason || '-'}`);
            lines.push(`- Budget: ${formatDebuggerNumber(turn.rag.totalUsedTokens)} / ${formatDebuggerNumber(settings.maxContextTokens)} tokens`);
            lines.push(`- Chunks: ${formatDebuggerNumber(turn.rag.usedChunks?.length || 0)} / ${formatDebuggerNumber(turn.rag.totalCandidateChunks)}`);
            if (Array.isArray(turn.rag.usedChunks) && turn.rag.usedChunks.length > 0) {
                lines.push('- Selected chunks:');
                turn.rag.usedChunks.forEach((chunk, idx) => {
                    lines.push(`  ${idx + 1}. ${chunk.fileName || 'Unknown'} #chunk${Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex + 1 : 1} • score ${chunk.score || 0}`);
                });
            }
            lines.push('');
        }

        lines.push('Turn content:');
        lines.push(turn.text || '(no text)');

        detailContainer.innerHTML = '';
        const detailPre = document.createElement('pre');
        detailPre.textContent = lines.join('\n');
        detailContainer.appendChild(detailPre);
    }

    const assemblyLines = [];
    assemblyLines.push(`Generated at: ${new Date(snapshot.generatedAt).toLocaleString('th-TH')}`);
    assemblyLines.push(`Agent: ${snapshot.contextData?.agentNameForDisplay || '-'}`);
    assemblyLines.push(`Model: ${snapshot.contextData?.model || '-'}`);
    assemblyLines.push(`System prompt tokens (approx): ${formatDebuggerNumber(estimateTokens(snapshot.contextData?.finalSystemPrompt || ''))}`);
    assemblyLines.push(`Payload messages: ${formatDebuggerNumber(snapshot.payloadMessages?.length || 0)} (~${formatDebuggerNumber(snapshot.payloadTokenEstimate)} tokens)`);
    assemblyLines.push('');

    if (snapshot.payloadMeta?.folderContext) {
        const folderCtx = snapshot.payloadMeta.folderContext;
        assemblyLines.push('Folder Context (current assembly):');
        assemblyLines.push(`- Reason: ${folderCtx.reason || '-'}`);
        assemblyLines.push(`- Folder: ${folderCtx.folderName || '-'}`);
        assemblyLines.push(`- Budget: ${formatDebuggerNumber(folderCtx.usedTokens)} / ${formatDebuggerNumber(folderCtx.budgetTokens)} tokens`);
        assemblyLines.push(`- Sessions: ${formatDebuggerNumber(folderCtx.usedSessionCount)} / ${formatDebuggerNumber(folderCtx.maxSharedSessions)}`);
        if (Array.isArray(folderCtx.usedSessions) && folderCtx.usedSessions.length > 0) {
            folderCtx.usedSessions.forEach((item, index) => {
                const relevanceLabel = Number.isFinite(Number(item.relevanceScore))
                    ? ` • rel ${Number(item.relevanceScore).toFixed(3)}`
                    : '';
                assemblyLines.push(`  ${index + 1}. ${item.sessionName || item.sessionId || '-'} • ${item.source || '-'}${relevanceLabel} • ~${formatDebuggerNumber(item.tokenEstimate)} tokens`);
            });
        }
        assemblyLines.push('');
    }

    if (snapshot.payloadMeta?.rag) {
        const rag = snapshot.payloadMeta.rag;
        const settings = rag.settings || {};
        assemblyLines.push('RAG (current assembly):');
        assemblyLines.push(`- Source: ${settings.scopeSource || '-'}`);
        assemblyLines.push(`- Scope: ${settings.scopeMode || '-'}`);
        assemblyLines.push(`- Reason: ${rag.reason || '-'}`);
        assemblyLines.push(`- Budget: ${formatDebuggerNumber(rag.totalUsedTokens)} / ${formatDebuggerNumber(settings.maxContextTokens)} tokens`);
        assemblyLines.push(`- Chunks: ${formatDebuggerNumber(rag.usedChunks?.length || 0)} / ${formatDebuggerNumber(rag.totalCandidateChunks)}`);
        if (Array.isArray(rag.usedChunks) && rag.usedChunks.length > 0) {
            rag.usedChunks.forEach((chunk, index) => {
                assemblyLines.push(`  ${index + 1}. ${chunk.fileName || 'Unknown'} #chunk${Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex + 1 : 1} • score ${chunk.score || 0}`);
            });
        }
        assemblyLines.push('');
    }

    assemblyLines.push('Payload roles:');
    (snapshot.payloadMessages || []).forEach((message, index) => {
        const text = extractTextFromAnyContent(message.content || '');
        const role = message.name ? `${message.role} (${message.name})` : message.role;
        assemblyLines.push(`- [${index + 1}] ${role} • ~${formatDebuggerNumber(estimateTokens(text || JSON.stringify(message.content || '')))} tokens`);
    });

    assemblyContainer.textContent = assemblyLines.join('\n');
}

function renderContextDebugger(snapshot) {
    if (!snapshot) {
        const sessionNameEl = document.getElementById('context-debugger-session-name');
        const folderModeEl = document.getElementById('context-debugger-folder-mode');
        const folderBudgetEl = document.getElementById('context-debugger-folder-budget');
        const ragBudgetEl = document.getElementById('context-debugger-rag-budget');
        const payloadMetaEl = document.getElementById('context-debugger-payload-meta');
        const turnList = document.getElementById('context-debugger-turn-list');
        const turnDetail = document.getElementById('context-debugger-turn-detail');
        const assembly = document.getElementById('context-debugger-assembly');
        sessionNameEl && (sessionNameEl.textContent = '-');
        folderModeEl && (folderModeEl.textContent = '-');
        folderBudgetEl && (folderBudgetEl.textContent = '-');
        ragBudgetEl && (ragBudgetEl.textContent = '-');
        payloadMetaEl && (payloadMetaEl.textContent = '-');
        turnList && (turnList.innerHTML = '<p class="no-items-message">No active session.</p>');
        turnDetail && (turnDetail.innerHTML = '<p class="context-debugger-empty">No active session.</p>');
        assembly && (assembly.textContent = 'No active session.');
        return;
    }
    if (!Number.isFinite(contextDebuggerSelectedTurn)) {
        contextDebuggerSelectedTurn = snapshot.turns.length > 0 ? snapshot.turns.length - 1 : null;
    }
    renderContextDebuggerSummary(snapshot);
    renderContextDebuggerTurns(snapshot);
    renderContextDebuggerTurnDetail(snapshot);
}

function isContextDebuggerVisible() {
    const page = document.getElementById('context-debugger-page');
    return Boolean(page && !page.classList.contains('hidden'));
}

function setContextDebuggerVisible(visible) {
    const page = document.getElementById('context-debugger-page');
    const contentColumns = document.getElementById('content-columns-wrapper');
    const statusPanel = document.getElementById('status-panel');
    if (!page || !contentColumns || !statusPanel) return;

    page.classList.toggle('hidden', !visible);
    contentColumns.classList.toggle('hidden', visible);
    statusPanel.classList.toggle('hidden', visible);
}

export function showContextDebugger() {
    const page = document.getElementById('context-debugger-page');
    if (!page) return;
    latestContextDebuggerSnapshot = buildContextDebuggerSnapshot();
    contextDebuggerSelectedTurn = null;
    renderContextDebugger(latestContextDebuggerSnapshot);
    setContextDebuggerVisible(true);
}

export function hideContextDebugger() {
    setContextDebuggerVisible(false);
}

function refreshContextDebugger() {
    if (!isContextDebuggerVisible()) {
        return;
    }
    latestContextDebuggerSnapshot = buildContextDebuggerSnapshot();
    renderContextDebugger(latestContextDebuggerSnapshot);
}

function normalizeRagDebugReason(reason = '') {
    switch (reason) {
        case 'ok':
            return 'Retrieved context successfully.';
        case 'empty_query':
            return 'No suitable query text was found in recent history.';
        case 'no_index':
            return 'Knowledge index is empty.';
        case 'scope_has_no_chunks':
            return 'Current session scope has no indexed chunks.';
        case 'no_similarity_match':
            return 'No chunk matched the query similarity threshold.';
        case 'budget_limited':
            return 'Context budget prevented any chunk from being included.';
        case 'folder_rag_disabled':
            return 'Folder auto RAG is disabled in Folder Settings.';
        default:
            return reason || 'No retrieval diagnostics available.';
    }
}

function normalizeFolderContextReason(reason = '') {
    switch (reason) {
        case 'ok':
            return 'shared context included';
        case 'session_only':
            return 'session-only mode';
        case 'no_active_session':
            return 'no active session';
        case 'no_folder':
            return 'session has no folder';
        case 'missing_folder':
            return 'folder not found';
        case 'no_related_sessions':
            return 'no related sessions';
        case 'no_context_snippets':
            return 'no usable snippets';
        case 'budget_limited':
            return 'budget limited';
        case 'folder_auto_disabled':
            return 'auto shared context disabled in folder settings';
        default:
            return reason || 'not available';
    }
}

function openKnowledgeSidebar() {
    const rightSidebar = document.getElementById('studio-panel');
    const overlay = document.getElementById('right-sidebar-overlay');
    const appWrapper = document.querySelector('.app-wrapper');
    if (!rightSidebar) return;

    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
        rightSidebar.classList.add('open');
        overlay?.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        rightSidebar.classList.remove('collapsed');
        appWrapper?.classList.remove('with-right-collapsed');
        appWrapper?.classList.remove('right-sidebar-collapsed');
    }
}

function createRagDebugElements(ragData, folderContext = null) {
    if ((!ragData || typeof ragData !== 'object') && !folderContext) return null;

    const safeRagData = ragData && typeof ragData === 'object' ? ragData : {};
    const usedChunks = Array.isArray(safeRagData.usedChunks) ? safeRagData.usedChunks : [];

    const debugPanel = document.createElement('div');
    debugPanel.className = 'rag-debug-panel hidden';

    const summary = document.createElement('div');
    summary.className = 'rag-debug-summary';
    const query = safeRagData.queryText ? `"${safeRagData.queryText}"` : 'N/A';
    const scope = safeRagData.settings?.scopeMode || safeRagData.scopeMode || 'all';
    const topK = safeRagData.settings?.retrievalTopK || 0;
    const maxTokens = safeRagData.settings?.maxContextTokens || 0;
    const source = safeRagData.settings?.scopeSource || 'session';
    const used = usedChunks.length;
    const candidates = Number.isFinite(safeRagData.totalCandidateChunks) ? safeRagData.totalCandidateChunks : 0;
    const usedTokens = Number.isFinite(safeRagData.totalUsedTokens) ? safeRagData.totalUsedTokens : 0;
    summary.textContent = `Query: ${query} | Source: ${source} | Scope: ${scope} | Top-K: ${topK} | Budget: ${maxTokens} | Used: ${used}/${candidates} chunks (${usedTokens} tokens)`;

    const reason = document.createElement('div');
    reason.className = 'rag-debug-reason';
    reason.textContent = normalizeRagDebugReason(safeRagData.reason);

    debugPanel.append(summary, reason);

    if (folderContext && typeof folderContext === 'object') {
        const folderInfo = document.createElement('div');
        folderInfo.className = 'rag-debug-reason';
        const folderName = folderContext.folderName || 'N/A';
        const usedSessions = Number.isFinite(folderContext.usedSessionCount) ? folderContext.usedSessionCount : 0;
        const candidateSessions = Number.isFinite(folderContext.candidateCount) ? folderContext.candidateCount : 0;
        const budget = Number.isFinite(folderContext.budgetTokens) ? folderContext.budgetTokens : 0;
        const usedFolderTokens = Number.isFinite(folderContext.usedTokens) ? folderContext.usedTokens : 0;
        folderInfo.textContent = `Folder context: ${folderName} | Sessions: ${usedSessions}/${candidateSessions} | Budget: ${usedFolderTokens}/${budget} tokens (${normalizeFolderContextReason(folderContext.reason)})`;
        debugPanel.appendChild(folderInfo);
    }

    if (usedChunks.length > 0) {
        const list = document.createElement('div');
        list.className = 'rag-debug-list';

        usedChunks.forEach((chunk, index) => {
            const row = document.createElement('div');
            row.className = 'rag-debug-item';

            const fileName = chunk.fileName || 'Unknown file';
            const chunkNo = Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex + 1 : 1;
            const score = Number.isFinite(chunk.score) ? chunk.score.toFixed(3) : '0.000';
            const title = document.createElement('div');
            title.className = 'rag-debug-item-title';
            title.textContent = `[${index + 1}] ${fileName} #chunk${chunkNo} • score ${score}`;

            const excerpt = document.createElement('div');
            excerpt.className = 'rag-debug-item-excerpt';
            excerpt.textContent = chunk.excerpt || '';

            row.append(title, excerpt);
            list.appendChild(row);
        });

        debugPanel.appendChild(list);
    }

    if (usedChunks.length === 0) {
        return { sourceStrip: null, debugPanel };
    }

    const sourceStrip = document.createElement('div');
    sourceStrip.className = 'rag-source-strip';

    const sourceTitle = document.createElement('span');
    sourceTitle.className = 'rag-source-title';
    sourceTitle.textContent = 'Sources:';
    sourceStrip.appendChild(sourceTitle);

    const seen = new Set();
    usedChunks.forEach(chunk => {
        const fileName = chunk.fileName || 'Unknown file';
        const chunkNo = Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex + 1 : 1;
        const chunkIndex = Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex : 0;
        const label = `${fileName} #chunk${chunkNo}`;
        const uniqueKey = `${chunk.fileId || fileName}::${chunkIndex}`;
        if (seen.has(uniqueKey)) return;
        seen.add(uniqueKey);

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'rag-source-chip';
        chip.textContent = label;
        chip.title = 'Open source chunk in Knowledge Files';
        chip.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openKnowledgeSidebar();
            stateManager.bus.publish('knowledge:focusChunk', {
                fileId: chunk.fileId || '',
                fileName,
                chunkIndex: Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex : 0
            });
        });
        sourceStrip.appendChild(chip);
    });

    return { sourceStrip, debugPanel };
}

function createMessageElement(message, index, session) {
    const { role, content, speaker, isLoading, isError, isSummary } = message;
    const project = stateManager.getProject();
    const LONG_TEXT_THRESHOLD = 2000;

    const turnWrapper = document.createElement('div');
    turnWrapper.className = `message-turn-wrapper ${role}-turn`;
    turnWrapper.dataset.index = index;
    turnWrapper.dataset.messageId = message.id || `msg_idx_${index}`; // <-- [ADD THIS] เพิ่ม message ID

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (isError) msgDiv.classList.add('error');
    if (isSummary) msgDiv.classList.add('system-summary-message');

    if (role === 'assistant' && speaker) {
        const speakerAgent = project.agentPresets?.[speaker];
        const speakerIcon = speakerAgent ? speakerAgent.icon : '🤖';
        const speakerLabelWrapper = document.createElement('div');
        speakerLabelWrapper.className = 'speaker-label-wrapper';
        const speakerLabel = document.createElement('span');
        speakerLabel.className = 'speaker-label';
        speakerLabel.innerHTML = `${speakerIcon} ${speaker}`;
        if (message.timestamp) {
            const timeEl = document.createElement('span');
            timeEl.className = 'message-timestamp';
            timeEl.innerHTML = `&nbsp;• ${formatRelativeTimestamp(message.timestamp)}`;
            speakerLabel.appendChild(timeEl);
        }
        speakerLabelWrapper.appendChild(speakerLabel);
        turnWrapper.appendChild(speakerLabelWrapper);
    } else if (role === 'user' && message.timestamp) {
        const timeEl = document.createElement('span');
        timeEl.className = 'message-timestamp';
        timeEl.textContent = formatRelativeTimestamp(message.timestamp);
        turnWrapper.appendChild(timeEl);
    }

    // --- Logic การสร้างเนื้อหาและปุ่ม ---
    if (message.isSummaryMarker || message.isSummary) {
        msgDiv.classList.add('summary-marker');
        const markerText = document.createElement('span');
        markerText.textContent = message.content;
        const markerActions = document.createElement('div');
        markerActions.className = 'summary-marker-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-icon small';
        editBtn.title = 'Edit this Summary';
        editBtn.innerHTML = `<span class="material-symbols-outlined">edit_note</span>`;
        
        // [แก้ไข] ตอนนี้เรามีตัวแปร session ที่ถูกต้องแล้ว
        const logIdForAction = message.summaryLogId || session.summaryState?.activeSummaryId;
        if (logIdForAction) {
            editBtn.onclick = () => stateManager.bus.publish('summary:editFromChat', { logId: logIdForAction });
        }
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon small danger';
        deleteBtn.title = 'Remove Marker from Chat';
        deleteBtn.innerHTML = `<span class="material-symbols-outlined">delete</span>`;
        deleteBtn.onclick = () => stateManager.bus.publish('chat:clearSummaryContext', { index });

        markerActions.append(editBtn, deleteBtn);
        msgDiv.append(markerText, markerActions);
        
    } else if (role === 'system') {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = message.content;
        msgDiv.appendChild(contentDiv);
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        const btnDelete = document.createElement('button');
        btnDelete.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">delete_forever</span>`;
        btnDelete.title = 'Delete';
        btnDelete.onclick = (event) => stateManager.bus.publish('chat:deleteMessage', { index, event });
        actions.appendChild(btnDelete);
        msgDiv.appendChild(actions);

    } else {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        msgDiv.appendChild(contentDiv);
        let ragUi = null;

        // ✅ [THE FIX - PART 1] สร้างเป้าหมายสำหรับ streaming เสมอ
        const streamingContentSpan = document.createElement('span');
        streamingContentSpan.className = 'streaming-content';

        if (isLoading) {
            // ถ้ากำลังโหลด ให้ใส่ spinner เข้าไปข้างใน
            streamingContentSpan.innerHTML = `<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>`;
        } else {
            // ถ้าโหลดเสร็จแล้ว ให้ render เนื้อหาจริงเข้าไป
            // (โค้ดส่วนนี้จะทำงานเมื่อ finalizeMessageBubble เรียกใช้)
            try {
                if (role === 'assistant') {
                    streamingContentSpan.innerHTML = marked.parse(content || '', { gfm: true, breaks: false });
                    enhanceCodeBlocks(streamingContentSpan);
                    ragUi = createRagDebugElements(message.rag, message.folderContext);
                } else if (role === 'user') {
                    // ... (Logic การ render ของ User bubble เหมือนเดิม)
                    if (Array.isArray(content)) {
                        content.forEach(part => {
                            if (part.type === 'text' && part.text) {
                                const p = document.createElement('p');
                                p.textContent = part.text;
                                streamingContentSpan.appendChild(p);
                            } else if (part.type === 'image_url' && part.url) {
                                const img = document.createElement('img');
                                img.src = part.url;
                                img.className = 'multimodal-image';
                                streamingContentSpan.appendChild(img);
                            }
                        });
                    } else if (typeof content === 'string') {
                        const p = document.createElement('p');
                        p.textContent = content;
                        streamingContentSpan.appendChild(p);
                    }
                }
            } catch (e) {
                console.error("Content rendering failed:", e);
                streamingContentSpan.textContent = 'Error displaying content';
            }
        }

        contentDiv.appendChild(streamingContentSpan);

        if (!isLoading && role === 'assistant' && ragUi?.sourceStrip) {
            msgDiv.appendChild(ragUi.sourceStrip);
        }

        if (!isLoading && role === 'assistant' && ragUi?.debugPanel) {
            msgDiv.appendChild(ragUi.debugPanel);
        }
        
        if (isLoading || isError) {
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            const iconStyle = 'style="font-size: 18px;"';
            
            const btnDelete = document.createElement('button');
            btnDelete.innerHTML = `<span class="material-symbols-outlined" ${iconStyle}>delete_forever</span>`;
            btnDelete.title = 'Delete Incomplete Message';
            btnDelete.onclick = (event) => stateManager.bus.publish('chat:deleteMessage', { index, event });
            
            actions.appendChild(btnDelete);
            msgDiv.appendChild(actions);
        } else if (!isLoading && !isError) {
            // This is the original logic for complete messages, which is correct.
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            const iconStyle = 'style="font-size: 18px;"';
            const btnEdit = document.createElement('button');
            btnEdit.innerHTML = `<span class="material-symbols-outlined" ${iconStyle}>edit</span>`;
            btnEdit.title = 'Edit';
            btnEdit.onclick = (event) => stateManager.bus.publish('chat:editMessage', { index, event });
            actions.appendChild(btnEdit);
            const btnCopy = document.createElement('button');
            btnCopy.innerHTML = `<span class="material-symbols-outlined" ${iconStyle}>content_copy</span>`;
            btnCopy.title = 'Copy';
            btnCopy.onclick = (event) => stateManager.bus.publish('chat:copyMessage', { index, event });
            actions.appendChild(btnCopy);
            if (role === 'assistant') {
                if (ragUi?.debugPanel) {
                    const btnRagDebug = document.createElement('button');
                    btnRagDebug.innerHTML = `<span class="material-symbols-outlined" ${iconStyle}>dataset</span>`;
                    btnRagDebug.title = 'RAG Debug';
                    btnRagDebug.onclick = (event) => {
                        event.stopPropagation();
                        ragUi.debugPanel.classList.toggle('hidden');
                        btnRagDebug.classList.toggle('active', !ragUi.debugPanel.classList.contains('hidden'));
                    };
                    actions.appendChild(btnRagDebug);
                }

                const btnRegenerate = document.createElement('button');
                btnRegenerate.innerHTML = `<span class="material-symbols-outlined" ${iconStyle}>refresh</span>`;
                btnRegenerate.title = 'Regenerate';
                btnRegenerate.onclick = (event) => stateManager.bus.publish('chat:regenerateMessage', { index, event });
                actions.appendChild(btnRegenerate);
            }
            const btnDelete = document.createElement('button');
            btnDelete.innerHTML = `<span class="material-symbols-outlined" ${iconStyle}>delete_forever</span>`;
            btnDelete.title = 'Delete';
            btnDelete.onclick = (event) => stateManager.bus.publish('chat:deleteMessage', { index, event });
            actions.appendChild(btnDelete);
            msgDiv.appendChild(actions);
        }
    }
    
    turnWrapper.appendChild(msgDiv);
    return turnWrapper;
}

function initMobileScrollBehavior() {
    const chatArea = document.querySelector('.main-chat-area');
    const messagesContainer = document.getElementById('chatMessages');
    const statusPanel = document.getElementById('status-panel');

    if (!chatArea || !messagesContainer || !statusPanel) return;
    if (messagesContainer.dataset.scrollListenerAttached) return;
    messagesContainer.dataset.scrollListenerAttached = 'true';

    let lastScrollTop = 0;
    const scrollThreshold = 10;
    const deadZone = 40;

    messagesContainer.addEventListener('scroll', () => {
        if (chatArea.classList.contains('no-autohide') || window.innerWidth > 768) {
            return;
        }

        let st = messagesContainer.scrollTop;
        const isAtBottom = messagesContainer.scrollHeight - st - messagesContainer.clientHeight < deadZone;

        if (isAtBottom) {
            chatArea.classList.remove('header-visible');
            statusPanel.classList.add('is-collapsed');
            lastScrollTop = st;
            return;
        }

        if (Math.abs(st - lastScrollTop) <= scrollThreshold) return;

        if (st > lastScrollTop) {
            chatArea.classList.remove('header-visible');
            statusPanel.classList.add('is-collapsed');
        } else {
            chatArea.classList.add('header-visible');
            statusPanel.classList.remove('is-collapsed');
        }
        lastScrollTop = st <= 0 ? 0 : st;
    }, { passive: true });
}
// --- Exported UI Functions ---
export function addMessageToUI(message, index, session) {
    const container = document.getElementById('chatMessages');
    if (!container) return null;

    // 1. เรียกใช้ createMessageElement ซึ่งสร้าง Bubble ที่สมบูรณ์เสมอ
    const messageElement = createMessageElement(message, index, session);

    // 2. นำ Element ที่สมบูรณ์นั้นไปต่อท้ายในหน้าจอ
    container.appendChild(messageElement);

    // 3. เลื่อนหน้าจอลงล่างสุด
    scrollToBottom();

    // 4. คืนค่า Element ที่ถูกต้องกลับไปให้ระบบทำงานต่อ
    return messageElement;
}

export function renderMessages() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) {
        console.error("[UI] renderMessages: No active session found!");
        return;
    }

    const container = document.getElementById('chatMessages');
    if (!container) {
        console.error("[UI] renderMessages: Chat container not found!");
        return;
    }
    
    container.innerHTML = '';

    if (session.history && session.history.length > 0) {
        session.history.forEach((msg, index) => {
            // [แก้ไข] ส่ง session เข้าไปเป็นพารามิเตอร์ตัวที่สาม
            const messageElement = createMessageElement(msg, index, session); 
            container.appendChild(messageElement);
        });
    }

    scrollToBottom();
    refreshContextDebugger();
}

export function showStreamingTarget(index) {
    const el = document.querySelector(`.message[data-index='${index}'] .message-content`);
    if (el) el.classList.add('content-streaming');
    return el;
}

export function updateMessageContent(index, container) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;

    const messageData = session.history[index];
    const contentEl = container.querySelector('.content');
    if (contentEl && messageData) {
        contentEl.innerHTML = messageData.content;
    }
}

export function scrollToBottom() {
    const container = document.getElementById('chatMessages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

export function clearChat() {
    document.getElementById('chatMessages').innerHTML = '';
    updateChatTitle('AI Assistant');
}

export function updateChatTitle(title) {
    document.getElementById('chat-title').textContent = title || 'AI Assistant';
}

/**
 * Checks if the chat container is scrollable and applies/removes classes
 * for the "Smart UI" auto-hiding header/footer on mobile.
 */
function checkScrollabilityForSmartUI() {
    const container = document.getElementById('chatMessages');
    const chatArea = document.querySelector('.main-chat-area');
    const statusPanel = document.getElementById('status-panel');
    if (!container || !chatArea || !statusPanel) return;

    const isScrollable = container.scrollHeight > container.clientHeight;

    if (isScrollable) {
        chatArea.classList.remove('no-autohide');
        if (container.scrollTop < 10) {
             chatArea.classList.add('header-visible');
             statusPanel.classList.remove('is-collapsed');
        } else {
             chatArea.classList.remove('header-visible');
             statusPanel.classList.add('is-collapsed');
        }
    } else {
        chatArea.classList.add('no-autohide', 'header-visible');
        statusPanel.classList.remove('is-collapsed');
    }
}

export function renderFilePreviews(files) {
    const container = document.getElementById('file-preview-container');
    container.classList.toggle('hidden', !files || files.length === 0);
    container.innerHTML = '';
    if (!files || files.length === 0) return;
    files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-preview-item';
        let previewContent = '';
        if (file.type.startsWith('image/')) {
            previewContent = `<img src="${file.data || ''}" class="file-preview-thumbnail" alt="${file.name}">`;
        } else {
            previewContent = `<div class="file-preview-thumbnail file-icon">📄</div>`;
        }
        item.innerHTML = `${previewContent}<span class="file-preview-name">${file.name}</span><button class="remove-file-btn" data-action="chat:removeFile" data-index="${index}">&times;</button>`;
        container.appendChild(item);
    });
}

export function showContextInspector() {
    const { finalSystemPrompt, totalTokens, agentNameForDisplay, model } = getContextData();
    document.getElementById('inspector-agent-name').textContent = agentNameForDisplay;
    document.getElementById('inspector-agent-model').textContent = model;
    document.getElementById('inspector-token-count').textContent = `~${totalTokens.toLocaleString()}`;
    document.getElementById('inspector-system-prompt').textContent = finalSystemPrompt || '(No system prompt or memories active)';
    document.getElementById('context-inspector-modal').style.display = 'flex';
}

export function hideContextInspector() {
    document.getElementById('context-inspector-modal').style.display = 'none';
}

function initChatActionMenu() {
    const container = document.getElementById('chat-actions-container');
    const button = document.getElementById('chat-actions-btn');
    const menu = document.getElementById('chat-actions-menu');
    if (!container || !button || !menu) return;

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.innerHTML = '';
        menu.innerHTML = `
            <a href="#" data-action="open-composer"><span class="material-symbols-outlined">edit_square</span> Composer</a>
            <a href="#" data-action="chat:contextDebugger"><span class="material-symbols-outlined">dataset</span> Context Debugger</a>
            <a href="#" data-action="chat:summarize"><span class="material-symbols-outlined">psychology</span> Summarize</a>
            <a href="#" data-action="upload-file"><span class="material-symbols-outlined">attach_file</span> Upload files</a>
            <a href="#" data-action="knowledge:upload"><span class="material-symbols-outlined">library_books</span> Upload to Knowledge</a>
        `;
        const project = stateManager.getProject();
        const session = project.chatSessions.find(s => s.id === project.activeSessionId);
        if (session && session.summaryState?.activeSummaryId) {
            menu.innerHTML += `
                <div class="dropdown-divider"></div>
                <a href="#" data-action="chat:clearSummary" class="is-destructive"><span class="material-symbols-outlined">layers_clear</span> Clear Summary Context</a>
            `;
        }
        container.classList.toggle('open');
    });

    menu.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (actionTarget) {
            e.preventDefault();
            const action = actionTarget.dataset.action;
            switch (action) {
                case 'open-composer':
                    stateManager.bus.publish('ui:toggleComposer');
                    break;
                case 'chat:summarize':
                    stateManager.bus.publish('chat:summarize');
                    break;
                case 'chat:contextDebugger':
                    showContextDebugger();
                    break;
                case 'upload-file':
                    document.getElementById('file-input')?.click();
                    break;
                case 'knowledge:upload':
                    stateManager.bus.publish('knowledge:upload');
                    break;
                case 'chat:clearSummary':
                    stateManager.bus.publish('chat:clearSummaryContext', { index: -1 }); // Special index
                    break;
            }
            container.classList.remove('open');
        }
    });

    document.addEventListener('click', (e) => {
        if (container.classList.contains('open') && !container.contains(e.target)) {
            container.classList.remove('open');
        }
    });
}

function updateComposerToggleButton() {
    const openComposerLink = document.querySelector('[data-action="open-composer"]');
    if (!openComposerLink) return;

    const composerPanel = document.getElementById('composer-panel');
    const isCollapsed = composerPanel?.classList.contains('collapsed');

    if (isCollapsed) {
        openComposerLink.innerHTML = `
            <span class="material-symbols-outlined">edit_square</span> Open Composer
        `;
    } else {
        openComposerLink.innerHTML = `
            <span class="material-symbols-outlined">visibility_off</span> Hide Composer
        `;
    }
}

export async function proceedWithStreaming(streamingSpan) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    const agentName = project.activeEntity.name;
    const agent = project.agentPresets[agentName];
    const assistantMsgIndex = session.history.length - 1;

    try {
        const messages = buildPayloadMessages(session.history.slice(0, -1), agentName, session);
        const finalResponseText = await streamLLMResponse(streamingSpan, agent, messages);

        session.history[assistantMsgIndex] = {
            role: 'assistant',
            content: finalResponseText,
            speaker: agentName
        };

    } catch (error) {
        if (error.name !== 'AbortError') {
            session.history[assistantMsgIndex] = {
                role: 'assistant',
                content: `Error: ${error.message}`,
                speaker: agentName,
                isError: true
            };
        } else {
            session.history.pop();
        }
    } finally {
        renderMessages();
        stopGeneration();
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    }
}

function renderSummaryBubble(summaryText, targetContainer) {
    const chunks = summaryText.split(/\n{2,}/);
    let chunkIndex = 0;
    
    targetContainer.innerHTML = '';

    function renderNextChunk() {
        if (chunkIndex >= chunks.length) {
            scrollToBottom(); // <-- [FIX] แก้ไขการเรียกใช้ให้ถูกต้อง
            return;
        }

        const p = document.createElement('div');
        p.innerHTML = marked.parse(chunks[chunkIndex], { gfm: true, breaks: false });
        targetContainer.appendChild(p);
        scrollToBottom(); // <-- [FIX] แก้ไขการเรียกใช้ให้ถูกต้อง
        chunkIndex++;
        requestAnimationFrame(renderNextChunk);
    }

    renderNextChunk();
}

function updateStatusMetrics() {
    const { totalTokens, agent, agentNameForDisplay } = getContextData();
    const allowedModels = UserService.getAllowedModelsForCurrentUser();

    const modelStatusSpan = document.getElementById('model-count-status');
    const agentStatusSpan = document.getElementById('active-agent-status');
    const tokenStatusSpan = document.getElementById('token-count-status');

    if (modelStatusSpan) modelStatusSpan.textContent = `${allowedModels.length} Models`;
    if (agentStatusSpan) agentStatusSpan.textContent = `Active: ${agent.icon || ''} ${agentNameForDisplay}`;
    if (tokenStatusSpan) tokenStatusSpan.textContent = `~${totalTokens.toLocaleString()} Tokens`;
}

function initDragAndDrop() {
    const dropzoneOverlay = document.getElementById('dropzone-overlay');
    if (!dropzoneOverlay) return;

    let dragCounter = 0; // ใช้นับเพื่อจัดการ dragleave ที่ซับซ้อน

    // ทำให้หน้าต่างโปรแกรมทั้งหมดเป็นพื้นที่รับไฟล์
    const dropTarget = window; 

    const showDropzone = () => {
        dropzoneOverlay.classList.add('active');
    };
    const hideDropzone = () => {
        dropzoneOverlay.classList.remove('active');
    };

    dropTarget.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // แสดง Overlay เมื่อลากไฟล์เข้ามาในหน้าต่างครั้งแรก
        if (dragCounter === 0) {
            showDropzone();
        }
        dragCounter++;
    });

    dropTarget.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation(); // สำคัญมาก: ป้องกันไม่ให้เบราว์เซอร์เปิดไฟล์เอง
    });

    dropTarget.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        // ซ่อน Overlay เมื่อลากไฟล์ออกจากหน้าต่างโปรแกรม
        if (dragCounter === 0) {
            hideDropzone();
        }
    });

    dropTarget.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // รีเซ็ตและซ่อน Overlay ทันที
        dragCounter = 0;
        hideDropzone();

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            // ส่ง event พร้อมกับ FileList ไปให้ handler จัดการ
            stateManager.bus.publish('chat:filesSelected', files);
        }
    });
}

// --- Main UI Initialization ---
export function initChatUI() {
    const chatInput = document.getElementById('chatInput');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('file-preview-container');

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                stateManager.bus.publish('chat:sendMessage');
            }
        });
        
        const debouncedUpdate = debounce(() => {
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
            // This call will now work correctly because of the import above.
            updateAppStatus(); 
        }, 500);
        chatInput.addEventListener('input', debouncedUpdate);
    }
            // หน้าที่ของมันคือการ "ยกเลิก" พฤติกรรมพื้นฐานของเบราว์เซอร์เท่านั้น
        chatInput.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        chatInput.addEventListener('drop', (e) => {
            e.preventDefault(); 
            // เราไม่ต้องเขียน Logic รับไฟล์ที่นี่ เพราะ Listener หลักที่ window จะจัดการต่อเอง
        });


    document.getElementById('sendBtn')?.addEventListener('click', () => stateManager.bus.publish('chat:sendMessage'));
    document.getElementById('stopBtn')?.addEventListener('click', () => stateManager.bus.publish('chat:stopGeneration'));
    document.getElementById('context-inspector-trigger-btn')?.addEventListener('click', showContextDebugger);
    document.querySelector('#context-inspector-modal .btn-secondary')?.addEventListener('click', hideContextInspector);
    document.getElementById('context-debugger-back-btn')?.addEventListener('click', hideContextDebugger);
    document.getElementById('context-debugger-refresh-btn')?.addEventListener('click', refreshContextDebugger);
    document.getElementById('context-debugger-turn-list')?.addEventListener('click', (event) => {
        const item = event.target.closest('.context-debugger-turn-item[data-turn-index]');
        if (!item || !latestContextDebuggerSnapshot) return;
        contextDebuggerSelectedTurn = Number(item.dataset.turnIndex);
        renderContextDebugger(latestContextDebuggerSnapshot);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isContextDebuggerVisible()) {
            hideContextDebugger();
        }
    });
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            // ส่ง event ใหม่พร้อมกับ FileList
            stateManager.bus.publish('chat:filesSelected', e.target.files);
        });
    }

    if (previewContainer) {
        previewContainer.addEventListener('click', (e) => {
            if (e.target.matches('.remove-file-btn')) {
                const indexToRemove = parseInt(e.target.dataset.index, 10);
                stateManager.bus.publish('chat:removeFile', { index: indexToRemove });
            }
        });
    }
    
    initChatActionMenu();

    // // [REVISED] Subscribe events to the new, comprehensive update function
    stateManager.bus.subscribe('session:loaded', updateStatusMetrics);
    stateManager.bus.subscribe('entity:selected', updateStatusMetrics);
    stateManager.bus.subscribe('user:settingsUpdated', updateStatusMetrics);
    stateManager.bus.subscribe('user:modelsLoaded', updateStatusMetrics);

    // Initial call to set the metrics correctly on page load.
    updateStatusMetrics();

    stateManager.bus.subscribe('ui:renderMessages', renderMessages);
    stateManager.bus.subscribe('ui:renderFilePreviews', ({ files }) => renderFilePreviews(files));
    stateManager.bus.subscribe('ui:updateChatTitle', ({ title }) => updateChatTitle(title));
    stateManager.bus.subscribe('ui:toggleLoading', ({ isLoading }) => {
        document.getElementById('sendBtn')?.classList.toggle('hidden', isLoading);
        document.getElementById('stopBtn')?.classList.toggle('hidden', !isLoading);
    });
    
    const agentSelectorBar = document.getElementById('agent-selector-bar');
    agentSelectorBar?.addEventListener('click', (e) => {
        const btn = e.target.closest('.agent-select-btn');
        if (btn) {
            stateManager.bus.publish('group:manualSelectAgent', { agentName: btn.dataset.agentName });
        }
    });
    stateManager.bus.subscribe('entity:selected', renderAgentSelectorBar);
    stateManager.bus.subscribe('ui:renderAgentSelector', renderAgentSelectorBar);

    initDragAndDrop();

    console.log("✅ Chat UI Initialized.");
}

export function initRightSidebarToggle() {
    const toggleBtn = document.getElementById('toggle-right-sidebar-btn');
    const rightSidebar = document.getElementById('studio-panel');
    const overlay = document.getElementById('right-sidebar-overlay');
    const appWrapper = document.querySelector('.app-wrapper');
    if (!toggleBtn || !rightSidebar) return;

    toggleBtn.addEventListener('click', () => {
        const isMobile = window.innerWidth <= 900;

        if (isMobile) {
            // เปิด overlay และ sidebar ขวา
            rightSidebar.classList.add('open');
            overlay?.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            // Toggle collapse (desktop)
            rightSidebar.classList.toggle('collapsed');
            appWrapper?.classList.toggle('with-right-collapsed', rightSidebar.classList.contains('collapsed'));
        }
    });

    // Listener ปิด overlay (mobile เท่านั้น)
    overlay?.addEventListener('click', () => {
        rightSidebar.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    });

    // ปิดเมื่อ resize จาก mobile → desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) {
            rightSidebar.classList.remove('open');
            overlay?.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

// [ADD THIS] เพิ่มฟังก์ชันใหม่นี้ใน src/js/modules/chat/chat.ui.js

/**
 * ทำการ Render Bubble สุดท้ายให้สมบูรณ์หลังจาก Stream จบลง
 * @param {number} index - Index ของ message ใน history
 * @param {object} message - Message object ที่สมบูรณ์
 */
export function finalizeMessageBubble(message) {
    const bubbleWrapper = document.querySelector(`.message-turn-wrapper[data-message-id='${message.id}']`);
    if (!bubbleWrapper) {
        console.warn(`finalizeMessageBubble: Could not find bubble with ID ${message.id}. Forcing a full re-render.`);
        renderMessages();
        return;
    }

    const newBubble = createMessageElement(message, parseInt(bubbleWrapper.dataset.index), null);
    
    bubbleWrapper.parentNode.replaceChild(newBubble, bubbleWrapper);
}

// เพิ่มฟังก์ชันนี้เข้าไปในไฟล์ chat.ui.js
export function renderAgentSelectorBar() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    const bar = document.getElementById('agent-selector-bar');
    if (!bar) return;

    // --- Logic การตรวจสอบที่รัดกุม ---
    // 1. ถ้าไม่มี session, ไม่มี active entity, หรือ entity ที่ active ไม่ใช่ group ให้ซ่อนทันที
    if (!session || !project.activeEntity || project.activeEntity.type !== 'group') {
        bar.classList.add('hidden');
        return;
    }

    const group = project.agentGroups[project.activeEntity.name];
    
    // 2. ตรวจสอบเงื่อนไขเฉพาะสำหรับ Manual Mode
    const shouldShow = (
        group?.flowType === 'manual' &&
        session.groupChatState?.awaitsUserInput === true
    );

    bar.innerHTML = ''; // เคลียร์ปุ่มเก่าทิ้งเสมอ
    bar.classList.toggle('hidden', !shouldShow); // ซ่อน/แสดงตามเงื่อนไข

    if (shouldShow) {
        const members = (group.agents || []).filter(name => name !== group.moderatorAgent);
        members.forEach(agentName => {
            const agentPreset = project.agentPresets[agentName];
            const btn = document.createElement('button');
            btn.className = 'agent-select-btn';
            btn.innerHTML = `${agentPreset?.icon || '🤖'}`;
            btn.title = agentName;
            btn.dataset.agentName = agentName;
            bar.appendChild(btn);
        });
    }
}
