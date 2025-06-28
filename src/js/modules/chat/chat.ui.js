// ===============================================
// FILE: src/js/modules/chat/chat.ui.js (แก้ไขแล้ว)
// DESCRIPTION: เพิ่ม Logic สำหรับจัดการการซ่อน/แสดง Header และ Footer บนมือถือ
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { estimateTokens, getFullSystemPrompt } from './chat.handlers.js';

// --- Private Helper Functions ---

function enhanceCodeBlocks(messageElement) {
    const codeBlocks = messageElement.querySelectorAll('pre');
    codeBlocks.forEach(pre => {
        if (pre.parentNode.classList.contains('code-block-wrapper')) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-code-btn';
        copyButton.textContent = 'Copy';
        wrapper.appendChild(copyButton);
        copyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = pre.querySelector('code');
            if (code) {
                navigator.clipboard.writeText(code.textContent).then(() => {
                    copyButton.textContent = 'Copied!';
                    setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
                });
            }
        });
    });
}

/**
 * [NEW] Initializes behavior for hiding/showing header/footer on mobile scroll.
 * This creates a more immersive chat experience on small screens.
 */
function initMobileScrollBehavior() {
    const chatArea = document.querySelector('.main-chat-area');
    const messagesContainer = document.getElementById('chatMessages');

    if (!chatArea || !messagesContainer) {
        console.warn("Mobile scroll behavior cannot be initialized: Elements not found.");
        return;
    }

    messagesContainer.addEventListener('scroll', () => {
        // Only apply this dynamic layout on mobile-sized screens
        if (window.innerWidth > 768) {
            chatArea.classList.remove('is-scrolled');
            return;
        }

        const scrollTop = messagesContainer.scrollTop;

        // Add 'is-scrolled' class if user has scrolled down at all (e.g., more than 10px)
        // This class is used by CSS to hide the header and footer, reclaiming screen space.
        if (scrollTop > 10) {
            chatArea.classList.add('is-scrolled');
        } else {
            // Remove the class when scrolled back to the top
            chatArea.classList.remove('is-scrolled');
        }
    }, { passive: true }); // Use passive listener for better scroll performance
}


// --- Exported UI Functions ---

export function renderChatMessages(){
    const project = stateManager.getProject();
    if (!project || !project.chatSessions) return;

    const container = document.getElementById('chatMessages');
    container.innerHTML = ''; 
    const session = project.chatSessions.find(s => s.id === project.activeSessionId); 
    if(session) {
        session.history.forEach((m,i)=> addMessageToUI(m.role, m.content, i, m.speaker));
    }
    container.scrollTop = container.scrollHeight; 
    
    updateContextInspector();

    const clearBtn = document.getElementById('clear-summary-btn');
    if (clearBtn) {
        const isSummaryActive = session?.summaryState?.activeSummaryId;
        clearBtn.style.display = isSummaryActive ? 'block' : 'none';
    }
}

export function addMessageToUI(role, content, index, speakerName = null, isLoading = false) {
    const project = stateManager.getProject();
    const container = document.getElementById('chatMessages');
    
    const turnWrapper = document.createElement('div');
    turnWrapper.className = `message-turn-wrapper ${role}-turn`;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.dataset.index = index;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const speakerAgent = project.agentPresets?.[speakerName];
    const speakerIcon = speakerAgent ? speakerAgent.icon : (role === 'user' ? '🧑' : '🤖');

    if (role === 'assistant' || (role === 'user' && speakerName)) {
        const speakerLabelWrapper = document.createElement('div');
        speakerLabelWrapper.className = 'speaker-label-wrapper';
        speakerLabelWrapper.innerHTML = `<span class="speaker-label">${speakerIcon} ${speakerName || 'User'}</span>`;
        turnWrapper.appendChild(speakerLabelWrapper);
    }
    
    const streamingContentSpan = document.createElement('span');
    streamingContentSpan.className = 'streaming-content';
    
    if (isLoading) {
        streamingContentSpan.innerHTML = `<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>`;
    } else {
        let agentForMarkdown = project.activeEntity.type === 'agent' 
            ? project.agentPresets[project.activeEntity.name]
            : project.agentPresets[speakerName] || {};
        const useMarkdown = agentForMarkdown?.useMarkdown !== false;
        const contentArray = Array.isArray(content) ? content : [{ type: 'text', text: content }];
        
        contentArray.forEach(part => {
            if (part.type === 'text') {
                if (role === 'assistant' && useMarkdown && window.marked) {
                     streamingContentSpan.innerHTML += marked.parse(part.text || '');
                } else {
                     const textNode = document.createTextNode(part.text || '');
                     streamingContentSpan.appendChild(textNode);
                }
            } else if (part.type === 'image_url' && part.url) {
                const img = document.createElement('img');
                img.src = part.url;
                img.className = 'multimodal-image';
                streamingContentSpan.appendChild(img);
            }
        });
    }
    
    contentDiv.appendChild(streamingContentSpan);
    if (!isLoading) {
        contentDiv.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
        enhanceCodeBlocks(contentDiv);
    }
    
    msgDiv.appendChild(contentDiv);
    
    if (!isLoading && role !== 'system') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        const createActionButton = (icon, title, eventName) => {
            const btn = document.createElement('button');
            btn.innerHTML = icon;
            btn.title = title;
            btn.addEventListener('click', (e) => {
                stateManager.bus.publish(eventName, { index: index, event: e });
            });
            return btn;
        };
        actionsDiv.appendChild(createActionButton('&#9998;', 'Edit', 'chat:editMessage'));
        actionsDiv.appendChild(createActionButton('&#128203;', 'Copy', 'chat:copyMessage'));
        if (role === 'assistant') {
            actionsDiv.appendChild(createActionButton('&#x21bb;', 'Regenerate', 'chat:regenerate'));
        }
        actionsDiv.appendChild(createActionButton('&#128465;', 'Delete', 'chat:deleteMessage'));
        msgDiv.appendChild(actionsDiv);
    }
    
    turnWrapper.appendChild(msgDiv);
    container.appendChild(turnWrapper);
    container.scrollTop = container.scrollHeight;
    return msgDiv;
}

export function renderFilePreviews(files) {
    const container = document.getElementById('file-preview-container');
    container.innerHTML = '';
    if (!files || files.length === 0) {
        container.style.display = 'none'; return;
    }
    container.style.display = 'grid';
    files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-preview-item';
        let previewContent = '';
        if (file.type.startsWith('image/')) {
            previewContent = `<img src="${file.data || ''}" class="file-preview-thumbnail" alt="${file.name}">`;
        } else {
            previewContent = `<div class="file-preview-thumbnail file-icon">📄</div>`;
        }
        item.innerHTML = `${previewContent}<span class="file-preview-name">${file.name}</span><button class="remove-file-btn">&times;</button>`;
        item.querySelector('.remove-file-btn').addEventListener('click', () => {
             stateManager.bus.publish('chat:removeFile', { index });
        });
        container.appendChild(item);
    });
}

export function updateContextInspector(isModal = false) {
    const project = stateManager.getProject();
    if (!project || !project.activeEntity) return;

    const { type, name } = project.activeEntity;
    let agent, agentNameForDisplay;

    if (type === 'agent') {
        agentNameForDisplay = name;
        agent = project.agentPresets[name];
    } else if (type === 'group') {
        agentNameForDisplay = name + ' (Group)';
        const group = project.agentGroups[name];
        agent = project.agentPresets[group?.moderatorAgent] || {};
    }
    if (!agent) return;

    const finalSystemPrompt = getFullSystemPrompt(type === 'agent' ? name : project.agentGroups[name]?.moderatorAgent);
    const systemTokens = estimateTokens(finalSystemPrompt);
    
    const session = project.chatSessions?.find(s => s.id === project.activeSessionId);
    let historyTokens = 0;
    if (session) historyTokens = estimateTokens(JSON.stringify(session.history));
    
    const inputTokens = estimateTokens(document.getElementById('chatInput').value);
    const totalTokens = systemTokens + historyTokens + inputTokens;
    
    document.getElementById('active-agent-status').textContent = `Active: ${agent.icon || ''} ${agentNameForDisplay}`;
    document.getElementById('token-count-status').textContent = `~${totalTokens.toLocaleString()} Tokens`;
    
    if (isModal) {
        document.getElementById('inspector-agent-name').textContent = agentNameForDisplay;
        document.getElementById('inspector-agent-model').textContent = agent.model || 'N/A';
        document.getElementById('inspector-token-count').textContent = `~${totalTokens.toLocaleString()}`;
        document.getElementById('inspector-system-prompt').textContent = finalSystemPrompt || '(No system prompt or memories active)';
    }
}

export function showContextInspector() {
    updateContextInspector(true);
    document.getElementById('context-inspector-modal').style.display = 'flex';
}

export function hideContextInspector() {
    document.getElementById('context-inspector-modal').style.display = 'none';
}

export function initChatUI() {
    // --- Subscribe to Events ---
    stateManager.bus.subscribe('session:loaded', (session) => {
        document.getElementById('chat-title').textContent = session.name;
        renderChatMessages();
    });
    stateManager.bus.subscribe('session:titleChanged', (newName) => { document.getElementById('chat-title').textContent = newName; });
    stateManager.bus.subscribe('ui:renderChatMessages', renderChatMessages);
    stateManager.bus.subscribe('ui:addMessage', (data) => addMessageToUI(data.role, data.content, data.index, data.speakerName, data.isLoading));
    stateManager.bus.subscribe('ui:renderFilePreviews', renderFilePreviews);
    
    stateManager.bus.subscribe('ui:showLoadingIndicator', () => {
        document.getElementById('sendBtn').classList.add('hidden');
        document.getElementById('stopBtn').classList.remove('hidden');
    });
    stateManager.bus.subscribe('ui:hideLoadingIndicator', () => {
        document.getElementById('sendBtn').classList.remove('hidden');
        document.getElementById('stopBtn').classList.add('hidden');
    });
    
    stateManager.bus.subscribe('entity:selected', () => updateContextInspector());
    stateManager.bus.subscribe('ui:enhanceCodeBlocks', enhanceCodeBlocks);

    // --- Setup Event Listeners ---
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
            e.preventDefault(); 
            stateManager.bus.publish('chat:sendMessage');
        }
    });
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        updateContextInspector();
    });
    document.getElementById('sendBtn').addEventListener('click', () => stateManager.bus.publish('chat:sendMessage'));
    document.getElementById('stopBtn').addEventListener('click', () => stateManager.bus.publish('chat:stopGeneration'));
    
    document.getElementById('context-inspector-trigger-btn').addEventListener('click', showContextInspector);
    document.querySelector('#context-inspector-modal .btn-secondary').addEventListener('click', hideContextInspector);
    
    const chatActionsContainer = document.getElementById('chat-actions-container');
    const chatActionsBtn = document.getElementById('chat-actions-btn');
    
    chatActionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chatActionsContainer.classList.toggle('open');
    });

    const handleMenuAction = (selector, callback) => {
        const element = document.getElementById(selector);
        if (element) {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                callback(e);
                chatActionsContainer.classList.remove('open');
            });
        }
    };

    handleMenuAction('manual-summarize-btn', () => stateManager.bus.publish('chat:summarize'));
    handleMenuAction('clear-summary-btn', () => stateManager.bus.publish('chat:clearSummary'));
    handleMenuAction('menu-upload-file-btn', () => document.getElementById('file-input').click());

    document.getElementById('file-input').addEventListener('change', (e) => stateManager.bus.publish('chat:fileUpload', e));
    
    // [NEW] Activate the mobile scrolling behavior
    initMobileScrollBehavior();

    console.log("Chat UI Initialized.");
}
