// ===============================================
// FILE: src/js/modules/chat/chat.ui.js (DEFINITIVE CLEANUP)
// DESCRIPTION: A clean, non-redundant UI manager for the chat panel.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { getFullSystemPrompt, estimateTokens, getContextData }  from '../../modules/chat/chat.handlers.js'; // <--- แก้ไขบรรทัดนี้
import { debounce } from '../../core/core.utils.js'; 

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

/**
 * [NEW] ฟังก์ชันกลางสำหรับวาดเนื้อหาแบบ Lazy-Rendering
 * @param {string} textContent - เนื้อหาข้อความทั้งหมด
 * @param {HTMLElement} targetDiv - contentDiv ที่จะให้ใส่เนื้อหา
 */
function lazyRenderContent(textContent, targetContainer) {
    const chunks = textContent.split(/\n{2,}/); // แยกตามย่อหน้า
    let chunkIndex = 0;
    targetContainer.innerHTML = ''; // เคลียร์ของเก่า

    function renderNextChunk() {
        if (chunkIndex >= chunks.length) {
            // เมื่อวาดเสร็จทั้งหมดแล้ว ให้เรียก enhanceCodeBlocks อีกครั้ง
            // เพื่อใส่ปุ่ม Copy ให้กับโค้ดบล็อกที่เพิ่งวาดเสร็จ
            enhanceCodeBlocks(targetContainer.closest('.message-content'));
            scrollToBottom();
            return;
        }

        // ใช้ div เป็น container เพราะ chunk อาจเป็น list, table หรืออื่นๆ
        const chunkContainer = document.createElement('div');
        
        // [FIX] เปลี่ยนจาก .textContent เป็น .innerHTML + marked.parse()
        // เพื่อให้แปลง Markdown เป็น HTML ก่อนแสดงผล
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
function createMessageElement(message, index) {
    const { role, content, speaker, isLoading, isError, isSummary } = message;
    const project = stateManager.getProject();
    const LONG_TEXT_THRESHOLD = 2000;

    // --- 1. สร้าง Element หลัก ---
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
        speakerLabelWrapper.innerHTML = `<span class="speaker-label">${speakerIcon} ${speaker}</span>`;
        turnWrapper.appendChild(speakerLabelWrapper);
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    msgDiv.appendChild(contentDiv);

    // --- 2. Logic การวาดเนื้อหา ---

    if (isLoading) {
        contentDiv.innerHTML = `<span class="streaming-content"><div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div></span>`;
    } else {
        const streamingContentSpan = document.createElement('span');
        streamingContentSpan.className = 'streaming-content';
        contentDiv.appendChild(streamingContentSpan);

        let fullTextContent = '';
        let isLong = false;

        // --- [ROBUSTNESS FIX] ตรวจสอบความยาวให้รองรับทั้ง String และ Array ---
        if (isSummary) {
            isLong = true;
            fullTextContent = content;
        } else if (role === 'user') {
            if (Array.isArray(content)) { // รูปแบบใหม่
                fullTextContent = content.filter(p => p.type === 'text').map(p => p.text).join('\n');
            } else if (typeof content === 'string') { // รูปแบบเก่า (จาก Bug)
                fullTextContent = content;
            }
            isLong = fullTextContent.length > LONG_TEXT_THRESHOLD;
        } else if (role === 'assistant') { // Assistant เป็น String เสมอ
            fullTextContent = content || '';
            isLong = fullTextContent.length > LONG_TEXT_THRESHOLD;
        }

        // --- เลือกวิธีวาดหน้าจอ ---
        if (isLong) {
            // สำหรับข้อความยาว หรือ Summary
            streamingContentSpan.innerHTML = `<div class="loading-text">Loading large message...</div>`;
            setTimeout(() => lazyRenderContent(fullTextContent, streamingContentSpan), 0);
        } else {
            // สำหรับข้อความสั้น (ทำงานทันที)
            try {
                if (role === 'assistant') {
                    streamingContentSpan.innerHTML = marked.parse(content || '', { gfm: true, breaks: false });
                } else if (role === 'user') {
                    // [ROBUSTNESS FIX] วาดให้ถูกตามประเภทของ content
                    if (Array.isArray(content)) { // รูปแบบใหม่
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
                    } else if (typeof content === 'string') { // รูปแบบเก่า
                        const p = document.createElement('p');
                        p.textContent = content;
                        streamingContentSpan.appendChild(p);
                    }
                }
            } catch (e) {
                console.error("Content rendering failed:", e);
                streamingContentSpan.textContent = 'Error displaying content';
            }
            enhanceCodeBlocks(contentDiv);
        }
    }
    
    // --- 3. สร้าง Action Menu ---
    if (!isLoading && !isError && !isSummary) {
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
    
    // --- 4. ประกอบร่างสุดท้าย ---
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
    
    // [CRITICAL DEBUG] แสดงข้อมูลทั้งหมดที่จะนำมาวาด
    console.log("📜 [UI] History to be rendered:", JSON.parse(JSON.stringify(session.history)));

    container.innerHTML = '';

    if (session.history && session.history.length > 0) {
        session.history.forEach((msg, index) => {
            const messageElement = createMessageElement(msg, index);
            container.appendChild(messageElement);
        });
    } else {
    }

    // เลื่อนหน้าจอไปที่ข้อความล่าสุด
    scrollToBottom();
    if (window.hljs) {
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
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
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = '';
    updateChatTitle('AI Assistant'); // Reset title
}

/**
 * Updates the title in the chat header.
 * @param {string} title - The new title to display.
 */
export function updateChatTitle(title) {
    const chatTitleElement = document.getElementById('chat-title');
    if (chatTitleElement) {
        chatTitleElement.textContent = title || 'AI Assistant';
    }
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
    if (!container) return;

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

export function updateContextInspector() {
    // ดึงข้อมูลล่าสุดทั้งหมด
    const { totalTokens, agent, agentNameForDisplay } = getContextData();

    // อัปเดต Status Bar
    document.getElementById('active-agent-status').textContent = `Active: ${agent.icon || ''} ${agentNameForDisplay}`;
    document.getElementById('token-count-status').textContent = `~${totalTokens.toLocaleString()} Tokens`;
}


export function showContextInspector() {
    // ดึงข้อมูลล่าสุดทั้งหมด
    const { finalSystemPrompt, totalTokens, agentNameForDisplay, model } = getContextData();
    
    // บรรจุข้อมูลลง Modal และแสดงผลทันที
    document.getElementById('inspector-agent-name').textContent = agentNameForDisplay;
    document.getElementById('inspector-agent-model').textContent = model;
    document.getElementById('inspector-token-count').textContent = `~${totalTokens.toLocaleString()}`;
    document.getElementById('inspector-system-prompt').textContent = finalSystemPrompt || '(No system prompt or memories active)';
    
    document.getElementById('context-inspector-modal').style.display = 'flex';
}

// แก้ไขฟังก์ชัน hideContextInspector
export function hideContextInspector() {
    document.getElementById('context-inspector-modal').style.display = 'none';
}

function initChatActionMenu() {
    const container = document.getElementById('chat-actions-container');
    const button = document.getElementById('chat-actions-btn');
    const menu = document.getElementById('chat-actions-menu');

    if (!container || !button || !menu) return;

    // Listener สำหรับปุ่ม + เพื่อ "สร้างและเปิด" เมนู
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.innerHTML = ''; // เคลียร์เมนูเก่า

        // --- สร้างเมนูพื้นฐาน ---
        menu.innerHTML = `
            <a href="#" data-action="open-composer"><span class="material-symbols-outlined">edit_square</span> Composer</a>
            <a href="#" data-action="chat:summarize"><span class="material-symbols-outlined">psychology</span> Summarize</a>
            <a href="#" data-action="upload-file"><span class="material-symbols-outlined">attach_file</span> Upload files</a>
        `;
        // --- ตรวจสอบสถานะเพื่อสร้างเมนู "Clear Summary" ---
        const project = stateManager.getProject();
        const session = project.chatSessions.find(s => s.id === project.activeSessionId);
        console.log("Checking for active summary. ID:", session?.summaryState?.activeSummaryId);

        if (session && session.summaryState?.activeSummaryId) {
            console.log("✅ Active summary found. Creating 'Clear Summary' button.");

            menu.innerHTML += `
                <div class="dropdown-divider"></div>
                <a href="#" data-action="chat:clearSummary" class="is-destructive"><span class="material-symbols-outlined">layers_clear</span> Clear Summary Context</a>
            `;
        }
        container.classList.toggle('open');
    });

    // [FIX] Listener สำหรับจัดการเมื่อคลิกที่ตัวเลือกในเมนู
    menu.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (actionTarget) {
            e.preventDefault();
            const action = actionTarget.dataset.action;

            // --- นำ Logic การจัดการ Action กลับมาไว้ที่นี่ ---
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
                    stateManager.bus.publish('chat:clearSummary');
                    break;
            }
            // ---------------------------------------------
            
            // เมื่อคลิกแล้วให้ปิดเมนู
            container.classList.remove('open');
        }
    });

    // Listener สำหรับปิดเมนูเมื่อคลิกที่พื้นที่อื่น
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


// --- Main UI Initialization ---
export function initChatUI() {
    // --- 1. Get DOM Elements ---
    const chatInput = document.getElementById('chatInput');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('file-preview-container');

    // --- 2. Setup Event Listeners ---
    if (chatInput) {
        // Listener สำหรับส่งข้อความด้วย Enter
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                stateManager.bus.publish('chat:sendMessage');
            }
        });
        // Listener สำหรับปรับขนาด Textarea และอัปเดต Token Count
        const debouncedUpdate = debounce(() => {
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
            updateContextInspector();
        }, 500);
        chatInput.addEventListener('input', debouncedUpdate);
    }

    // [FIX] รวม Listener ทั้งหมดไว้ด้วยกัน และลบตัวที่ซ้ำซ้อนออก
    document.getElementById('sendBtn')?.addEventListener('click', () => stateManager.bus.publish('chat:sendMessage'));
    document.getElementById('stopBtn')?.addEventListener('click', () => stateManager.bus.publish('chat:stopGeneration'));
    document.getElementById('context-inspector-trigger-btn')?.addEventListener('click', showContextInspector);
    document.querySelector('#context-inspector-modal .btn-secondary')?.addEventListener('click', hideContextInspector);
    
    // Listener ของ File Input มีแค่ตัวนี้ตัวเดียว
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            stateManager.bus.publish('chat:fileUpload', e);
        });
    }

    // Delegated listener สำหรับปุ่มลบไฟล์ใน Preview
    if (previewContainer) {
        previewContainer.addEventListener('click', (e) => {
            if (e.target.matches('.remove-file-btn')) {
                const indexToRemove = parseInt(e.target.dataset.index, 10);
                // ส่ง Event ไปบอก handler ให้ลบไฟล์ออกจาก State
                stateManager.bus.publish('chat:removeFile', { index: indexToRemove });
            }
        });
    }
    // --- 3. Initialize Sub-modules ---
    initChatActionMenu();
    initMobileScrollBehavior();

    // --- 4. Subscribe to Global Events ---
    stateManager.bus.subscribe('session:loaded', () => updateContextInspector());
    stateManager.bus.subscribe('entity:selected', () => updateContextInspector());
    stateManager.bus.subscribe('composer:visibilityChanged', updateComposerToggleButton);
    stateManager.bus.subscribe('ui:renderMessages', renderMessages);
    stateManager.bus.subscribe('ui:renderFilePreviews', ({ files }) => renderFilePreviews(files));
    stateManager.bus.subscribe('ui:updateChatTitle', ({ title }) => updateChatTitle(title));
    stateManager.bus.subscribe('ui:toggleLoading', ({ isLoading }) => {
        document.getElementById('sendBtn')?.classList.toggle('hidden', isLoading);
        document.getElementById('stopBtn')?.classList.toggle('hidden', !isLoading);
    });

    // --- 5. Set Initial UI State ---
    updateComposerToggleButton();
    console.log("✅ Chat UI Initialized with a clean structure.");
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
