// js/modules/chat/ui.js

export function renderChatMessages(){
    const project = stateManager.getProject();
    const container = document.getElementById('chatMessages');
    container.innerHTML=''; 
    const session = project.chatSessions.find(s => s.id === project.activeSessionId); 
    if(session) {
        session.history.forEach((m,i)=>addMessageToUI(m.role, m.content, i, m.speaker));
    }
    container.scrollTop = container.scrollHeight; 
    updateContextInspector();
    const clearBtn = document.getElementById('clear-summary-btn');
    if (clearBtn) clearBtn.style.display = (session?.summaryState?.activeSummaryId) ? 'block' : 'none';
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

    const speakerAgent = project.agentPresets[speakerName];
    const speakerIcon = speakerAgent ? speakerAgent.icon : (role === 'user' ? '🧑' : '🤖');

    // [FIX] ย้ายการสร้าง Speaker Label ออกมาข้างนอกเพื่อให้ใช้ร่วมกัน
    if (role === 'assistant' || (role === 'user' && speakerName)) { // Show label for assistant or named user
        const speakerLabelWrapper = document.createElement('div');
        speakerLabelWrapper.className = 'speaker-label-wrapper';
        speakerLabelWrapper.innerHTML = `<span class="speaker-label">${speakerIcon} ${speakerName || 'User'}</span>`;
        turnWrapper.appendChild(speakerLabelWrapper);
    }
    
    // [FIX] ปรับโครงสร้างของ contentDiv ให้เหมือนกันทั้งสองกรณี
    const streamingContentSpan = document.createElement('span');
    streamingContentSpan.className = 'streaming-content';
    
    if (isLoading) {
        streamingContentSpan.innerHTML = `<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>`;
    } else {
        let agentForMarkdown = project.agentPresets[project.activeEntity.name];
        if (project.activeEntity.type === 'group') {
            agentForMarkdown = project.agentPresets[speakerName] || {};
        }

        const useMarkdown = agentForMarkdown?.useMarkdown !== false;
        const contentArray = Array.isArray(content) ? content : [{ type: 'text', text: content }];
        
        contentArray.forEach(part => {
            if (part.type === 'text') {
                const textSpan = document.createElement('span');
                if (role === 'assistant' && useMarkdown) {
                     textSpan.innerHTML = marked.parse(part.text || '');
                } else {
                     textSpan.textContent = part.text || '';
                }
                streamingContentSpan.appendChild(textSpan);
            } else if (part.type === 'image_url' && part.url) {
                const img = document.createElement('img');
                img.src = part.url;
                img.className = 'multimodal-image';
                streamingContentSpan.appendChild(img);
            }
        });
    }
    
    contentDiv.appendChild(streamingContentSpan);
    contentDiv.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    enhanceCodeBlocks(contentDiv);
    msgDiv.appendChild(contentDiv);
    
    if (!isLoading && role !== 'system') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const createActionButton = (icon, title, handler) => {
            const btn = document.createElement('button');
            btn.innerHTML = icon;
            btn.title = title;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handler(index, e);
            });
            return btn;
        };

        actionsDiv.appendChild(createActionButton('&#9998;', 'Edit', editMessage));
        actionsDiv.appendChild(createActionButton('&#128203;', 'Copy', copyMessageToClipboard));
        
        if (role === 'assistant') {
            actionsDiv.appendChild(createActionButton('&#x21bb;', 'Regenerate', regenerateMessage));
        }
        actionsDiv.appendChild(createActionButton('&#128465;', 'Delete', deleteMessage));
        
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
            if (typeof attachedFiles !== 'undefined') attachedFiles.splice(index, 1);
            renderFilePreviews(attachedFiles);
        });
        container.appendChild(item);
    });
}

export function enhanceCodeBlocks(messageElement) {
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

export function updateContextInspector(isModal = false) {
    const project = stateManager.getProject();
    if (!project.activeEntity) return;

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
    
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
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
    stateManager.bus.subscribe('session:loaded', (session) => {
        document.getElementById('chat-title').textContent = session.name;
        renderChatMessages();
    });
    stateManager.bus.subscribe('session:titleChanged', (newName) => { document.getElementById('chat-title').textContent = newName; });
    stateManager.bus.subscribe('ui:renderChatMessages', renderChatMessages);
    stateManager.bus.subscribe('ui:addMessage', (data) => addMessageToUI(data.role, data.content, data.index, data.speakerName, data.isLoading));
    stateManager.bus.subscribe('ui:renderFilePreviews', renderFilePreviews);
    stateManager.bus.subscribe('ui:showLoadingIndicator', () => {
        document.getElementById('sendBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'flex';
    });
    stateManager.bus.subscribe('ui:hideLoadingIndicator', () => {
        document.getElementById('sendBtn').style.display = 'flex';
        document.getElementById('stopBtn').style.display = 'none';
    });
    stateManager.bus.subscribe('entity:selected', () => updateContextInspector());

    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault(); sendMessage();
        }
    });
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        updateContextInspector();
    });
    document.getElementById('sendBtn').addEventListener('click', () => sendMessage());
    document.getElementById('stopBtn').addEventListener('click', stopGeneration);
    document.getElementById('context-inspector-trigger-btn').addEventListener('click', showContextInspector);
    document.querySelector('#context-inspector-modal .btn-secondary').addEventListener('click', hideContextInspector);
    
    const chatActionsBtn = document.getElementById('chat-actions-btn');
    const chatActionsMenu = document.getElementById('chat-actions-menu');
    chatActionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chatActionsMenu.classList.toggle('active');
    });
    document.addEventListener('click', () => chatActionsMenu.classList.remove('active'));

    document.getElementById('manual-summarize-btn').addEventListener('click', (e) => { e.preventDefault(); handleManualSummarize(); });
    document.getElementById('clear-summary-btn').addEventListener('click', (e) => { e.preventDefault(); unloadSummaryFromActiveSession(); });
    document.getElementById('menu-upload-file-btn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', handleFileUpload);
    
    console.log("Chat UI Initialized.");
}
