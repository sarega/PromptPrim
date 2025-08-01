// ===============================================
// FILE: src/js/modules/chat/chat.ui.js (DEFINITIVE CLEANUP)
// DESCRIPTION: A clean, non-redundant UI manager for the chat panel.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { estimateTokens, getContextData }  from '../../modules/chat/chat.handlers.js'; // <--- แก้ไขบรรทัดนี้
import { debounce } from '../../core/core.utils.js'; 
import { getFullSystemPrompt } from '../../core/core.api.js';
import * as UserService from '../user/user.service.js'; // <-- Add this import
import * as ChatHandlers from './chat.handlers.js';
import { updateAppStatus } from '../../core/core.ui.js';

// --- Private Helper Functions (createMessageElement, enhanceCodeBlocks, etc. remain the same) ---
function enhanceCodeBlocks(messageElement) {
    messageElement.querySelectorAll('pre > code').forEach(block => {
        // [FIX 1] ถ้าเคย highlight ไปแล้ว (มี data-highlighted) ให้ข้ามไปเลย
        if (block.dataset.highlighted === 'yes') {
            return;
        }

        const pre = block.parentNode;
        
        if (pre.parentNode.classList.contains('code-block-wrapper')) {
            return;
        }

        if (pre.parentNode.tagName === 'P') {
            const p = pre.parentNode;
            p.parentNode.insertBefore(pre, p);
            if (!p.textContent.trim()) {
                p.remove();
            }
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);

        const copyButton = document.createElement('button');
        copyButton.className = 'copy-code-btn';
        copyButton.textContent = 'Copy';
        wrapper.appendChild(copyButton);

        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(block.textContent).then(() => {
                copyButton.textContent = 'Copied!';
                setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
            });
        });

        if (window.hljs) {
            // [FIX 2] ตรวจสอบว่ามี "ชื่อภาษาจริงๆ" หรือไม่ ก่อนสั่ง highlight
            // โดยเช็คว่า class ต้องขึ้นต้นด้วย 'language-' แต่ต้องไม่ใช่ 'language-undefined'
            const hasRealLanguage = Array.from(block.classList)
                .some(cls => cls.startsWith('language-') && cls !== 'language-undefined');

            if (hasRealLanguage) {
                hljs.highlightElement(block);
            }
        }
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

function createMessageElement(message, index, session) {
    const { role, content, speaker, isLoading, isError, isSummary } = message;
    const project = stateManager.getProject();
    const LONG_TEXT_THRESHOLD = 2000;

    const turnWrapper = document.createElement('div');
    turnWrapper.className = `message-turn-wrapper ${role}-turn`;
    turnWrapper.dataset.index = index;

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

        if (isLoading) {
            contentDiv.innerHTML = `<span class="streaming-content"><div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div></span>`;
        } else {
            const streamingContentSpan = document.createElement('span');
            streamingContentSpan.className = 'streaming-content';
            contentDiv.appendChild(streamingContentSpan);
            let fullTextContent = '';
            let isLong = false;
            if (role === 'user') {
                fullTextContent = Array.isArray(content) ? content.filter(p => p.type === 'text').map(p => p.text).join('\n') : (content || '');
                isLong = fullTextContent.length > LONG_TEXT_THRESHOLD;
            } else if (role === 'assistant') {
                fullTextContent = content || '';
                isLong = fullTextContent.length > LONG_TEXT_THRESHOLD;
            }
            if (isLong) {
                streamingContentSpan.innerHTML = `<div class="loading-text">Loading large message...</div>`;
                setTimeout(() => lazyRenderContent(fullTextContent, streamingContentSpan), 0);
            } else {
                try {
                    if (role === 'assistant') {
                        streamingContentSpan.innerHTML = marked.parse(content || '', { gfm: true, breaks: false });
                        enhanceCodeBlocks(streamingContentSpan);
                    } else if (role === 'user') {
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
export function addMessageToUI(message, index) {
    const { role, content, speaker, isLoading, isError } = message;
    const project = stateManager.getProject();
    const container = document.getElementById('chatMessages');

    const turnWrapper = document.createElement('div');
    turnWrapper.className = `message-turn-wrapper ${role}-turn`;
    // [FIX] เพิ่ม data-index ที่ turnWrapper เพื่อให้ค้นหาง่าย
    turnWrapper.dataset.index = index;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (isError) msgDiv.classList.add('error');
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (role === 'assistant' && speaker) {
        const speakerAgent = project.agentPresets?.[speaker];
        const speakerIcon = speakerAgent ? speakerAgent.icon : '🤖';
        const speakerLabelWrapper = document.createElement('div');
        speakerLabelWrapper.className = 'speaker-label-wrapper';
        speakerLabelWrapper.innerHTML = `<span class="speaker-label">${speakerIcon} ${speaker}</span>`;
        turnWrapper.appendChild(speakerLabelWrapper);
    }
    
    const streamingContentSpan = document.createElement('span');
    streamingContentSpan.className = 'streaming-content';
    
    if (isLoading) {
        streamingContentSpan.innerHTML = `<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>`;
    } else {
        const agentForMarkdown = project.agentPresets?.[speaker] || {};
        const useMarkdown = agentForMarkdown.useMarkdown !== false;
        const textContent = (typeof content === 'string') ? content : (content?.find(p => p.type === 'text')?.text || '');
        
        streamingContentSpan.innerHTML = useMarkdown && window.marked ? marked.parse(textContent, { gfm: true, breaks: false }) : `<p>${textContent}</p>`;
        enhanceCodeBlocks(streamingContentSpan);
    }
    
    contentDiv.appendChild(streamingContentSpan);
    msgDiv.appendChild(contentDiv);
    turnWrapper.appendChild(msgDiv);
    container.appendChild(turnWrapper);
    
    container.scrollTop = container.scrollHeight;
    
    // คืนค่า Element ทั้งก้อนกลับไป
    return turnWrapper;
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
            <a href="#" data-action="chat:summarize"><span class="material-symbols-outlined">psychology</span> Summarize</a>
            <a href="#" data-action="upload-file"><span class="material-symbols-outlined">attach_file</span> Upload files</a>
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
                case 'upload-file':
                    document.getElementById('file-input')?.click();
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
    document.getElementById('context-inspector-trigger-btn')?.addEventListener('click', showContextInspector);
    document.querySelector('#context-inspector-modal .btn-secondary')?.addEventListener('click', hideContextInspector);
    
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
