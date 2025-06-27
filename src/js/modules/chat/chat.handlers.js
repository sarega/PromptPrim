// ===============================================
// FILE: src/js/modules/chat/chat.handlers.js (Definitive Fix)
// DESCRIPTION: Ensures loading indicator events are published correctly.
// ===============================================

import { stateManager, SESSIONS_STORE_NAME, defaultSystemUtilityAgent } from '../../core/core.state.js';
import { dbRequest } from '../../core/core.db.js';
import { callLLM, streamLLMResponse, generateAndRenameSession } from '../../core/core.api.js';
import { showCustomAlert } from '../../core/core.ui.js';

export let attachedFiles = [];

// --- Helper Functions ---
export function estimateTokens(text) { return Math.ceil((text || "").length / 3); }

export function getFullSystemPrompt(agentName) {
    const project = stateManager.getProject();
    if (!project.agentPresets || !agentName) return "";
    const agent = project.agentPresets[agentName];
    if (!agent) return "";
    const systemPrompt = agent.systemPrompt || '';
    const activeMemoryNames = agent.activeMemories || [];
    const activeMemoriesContent = project.memories
        .filter(m => activeMemoryNames.includes(m.name))
        .map(m => m.content)
        .join('\n');
    let finalSystemContent = systemPrompt;
    if (activeMemoriesContent) {
        finalSystemContent += `\n\n--- Active Memories ---\n` + activeMemoriesContent;
    }
    return finalSystemContent.trim();
}

export function buildPayloadMessages(history, targetAgentName, session) {
    const messages = [];
    const project = stateManager.getProject();
    const allModels = stateManager.getState().allProviderModels;
    const finalSystemPrompt = getFullSystemPrompt(targetAgentName);
    if (finalSystemPrompt) {
        messages.push({ role: 'system', content: finalSystemPrompt });
    }
    let historyToSend = [...history];
    if (session?.summaryState?.activeSummaryId) {
        const activeLog = project.summaryLogs.find(log => log.id === session.summaryState.activeSummaryId);
        if (activeLog) {
            const summaryContext = `[This is a loaded summary to provide context for the following conversation. SUMMARY CONTENT: ${activeLog.content}]`;
            messages.push({ role: 'system', content: summaryContext });
            historyToSend = history.slice(session.summaryState.summarizedUntilIndex);
        }
    }
    const agent = project.agentPresets[targetAgentName];
    if (!agent) return messages;
    const modelData = allModels.find(m => m.id === agent.model);
    const provider = modelData ? modelData.provider : null;
    historyToSend.forEach(msg => {
        if (msg.role === 'system') return;
        let apiMessage = { role: msg.role };
        if (msg.speaker && msg.role === 'assistant') apiMessage.name = msg.speaker.replace(/\s+/g, '_');
        if (typeof msg.content === 'string') {
            apiMessage.content = msg.content;
        } else if (Array.isArray(msg.content)) {
            if (provider === 'ollama') {
                const textPart = msg.content.find(p => p.type === 'text');
                const imagePart = msg.content.find(p => p.type === 'image_url');
                if (textPart) apiMessage.content = textPart.text;
                if (imagePart && imagePart.url) apiMessage.images = [imagePart.url.split(',')[1]];
            } else {
                apiMessage.content = msg.content.map(part => (part.type === 'image_url') ? { type: 'image_url', image_url: { url: part.url } } : part);
            }
        }
        messages.push(apiMessage);
    });
    return messages;
}

// --- Core Chat Logic ---
export async function sendMessage(isRegeneration = false) {
    const project = stateManager.getProject();
    if (!project.activeEntity) {
        showCustomAlert("Please select an agent or group first.", "Error");
        return;
    }
    const { type } = project.activeEntity;
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);

    if (!session) return;
    if (session.groupChatState?.isRunning) {
        stopGeneration();
        return;
    }

    if (type === 'group') {
        showCustomAlert("Group chat functionality is being refactored.", "Info");
    } else {
        await sendSingleAgentMessage(isRegeneration);
    }
}

async function sendSingleAgentMessage(isRegeneration = false) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;

    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!isRegeneration) {
        if (!message && attachedFiles.length === 0) return;
        let userMessageContent = [];
        if (message) userMessageContent.push({ type: 'text', text: message });
        attachedFiles.forEach(file => userMessageContent.push({ type: 'image_url', url: file.data }));

        session.history.push({
            role: 'user',
            content: (userMessageContent.length === 1 && userMessageContent[0].type === 'text')
                     ? userMessageContent[0].text
                     : userMessageContent
        });
        input.value = '';
        input.style.height = 'auto';
        attachedFiles = [];
        stateManager.bus.publish('ui:renderFilePreviews', attachedFiles);
    }

    stateManager.bus.publish('ui:renderChatMessages');

    const agentName = project.activeEntity.name;
    const agent = project.agentPresets[agentName];
    if (!agent || !agent.model) {
        showCustomAlert('Please select an agent with a configured model.', 'Error');
        return;
    }

    stateManager.setLoading(true);
    stateManager.bus.publish('ui:showLoadingIndicator');
    stateManager.newAbortController();

    const assistantMsgIndex = session.history.length;
    session.history.push({role: 'assistant', content: '...', speaker: agentName});
    stateManager.bus.publish('ui:addMessage', { role: 'assistant', content: '', index: assistantMsgIndex, speakerName: agentName, isLoading: true });

    try {
        const messages = buildPayloadMessages(session.history.slice(0, -1), agentName, session);
        const assistantMsgDiv = document.querySelector(`.message[data-index='${assistantMsgIndex}'] .message-content`);
        const finalResponseText = await streamLLMResponse(assistantMsgDiv, agent, messages, agentName);

        session.history[assistantMsgIndex] = { role: 'assistant', content: finalResponseText, speaker: agentName };

        if (session.name === 'New Chat' && session.history.length <= 2 && !isRegeneration) {
            await generateAndRenameSession(session.history);
        }

    } catch (error) {
        if (error.name !== 'AbortError') {
             const errorMsg = `Error: ${error.message}`;
             session.history[assistantMsgIndex].content = errorMsg;
             showCustomAlert(errorMsg, "API Error");
        } else {
            session.history.splice(assistantMsgIndex, 1);
        }
    } finally {
        stopGeneration();
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        stateManager.bus.publish('ui:renderChatMessages');
        stateManager.bus.publish('project:persistRequired');
    }
}

export function stopGeneration(){
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (session?.groupChatState) session.groupChatState.isRunning = false;

    stateManager.abort();
    stateManager.setLoading(false);
    stateManager.bus.publish('ui:hideLoadingIndicator');
    stateManager.bus.publish('status:update', { message: 'Ready', state: 'connected' });
}

export function handleFileUpload(event) {
    const files = event.target.files;
    if (!files) return;

    for (const file of files) {
        const fileId = `file_${Date.now()}_${Math.random()}`;
        const newFile = { id: fileId, name: file.name, type: file.type, data: null };
        attachedFiles.push(newFile);
        const reader = new FileReader();
        reader.onload = e => {
            const fileIndex = attachedFiles.findIndex(f => f.id === fileId);
            if (fileIndex !== -1) {
                attachedFiles[fileIndex].data = e.target.result;
                stateManager.bus.publish('ui:renderFilePreviews', attachedFiles);
            }
        };
        reader.readAsDataURL(file);
    }
    event.target.value = '';
}

// --- Summarization Handlers ---

async function summarizeHistoryAndCreateLog(session) {
    stateManager.bus.publish('status:update', { message: 'Summarizing...', state: 'loading' });
    const project = stateManager.getProject();
    const utilityAgent = project.globalSettings.systemUtilityAgent;

    if (!utilityAgent || !utilityAgent.model) {
        showCustomAlert('System Utility Model for summarization is not configured in settings.', 'Error');
        stateManager.bus.publish('status:update', { message: 'Summarization failed', state: 'error' });
        return;
    }

    const summarizedUntil = session.summaryState?.summarizedUntilIndex || 0;
    const historyToSummarize = session.history.slice(summarizedUntil);

    if (historyToSummarize.length < 2) {
        showCustomAlert('Not enough new messages to create a meaningful summary.', 'Info');
        stateManager.bus.publish('status:update', { message: 'Ready', state: 'connected' });
        return;
    }

    try {
        stateManager.bus.publish('status:update', { message: 'Generating summary title...', state: 'loading' });
        const titlePrompt = `Based on the following conversation, create a very short, descriptive title (5-7 words). Respond with ONLY the title text, nothing else.\n\nCONVERSATION:\n${historyToSummarize.map(m=>`${m.speaker||m.role}: ${typeof m.content==='string'?m.content:'[multimodal content]'}`).join('\n')}`;
        const generatedTitle = await callLLM(utilityAgent, [{ role: 'user', content: titlePrompt }]);

        stateManager.bus.publish('status:update', { message: 'Generating summary content...', state: 'loading' });
        
        const previousSummary = session.summaryState?.activeSummaryId ? (project.summaryLogs.find(l => l.id === session.summaryState.activeSummaryId)?.content || "This is the beginning of the conversation.") : "This is the beginning of the conversation.";
        
        const summaryPromptTemplate = utilityAgent.summarizationPrompt || defaultSystemUtilityAgent.summarizationPrompt;
        const newMessages = historyToSummarize.map(m=>`${m.speaker||m.role}: ${typeof m.content==='string'?m.content:'[multimodal content]'}`).join('\n');
        const summaryPrompt = summaryPromptTemplate
                                .replace(/\$\{previousSummary\}/g, previousSummary)
                                .replace(/\$\{newMessages\}/g, newMessages);

        const summaryContent = await callLLM(utilityAgent, [{ role: 'user', content: summaryPrompt }]);
        
        const newLog = {
            id: `sum_${Date.now()}`,
            summary: generatedTitle.trim().replace(/"/g, ''),
            content: summaryContent,
            timestamp: Date.now(),
            sourceSessionId: session.id,
            summarizedUntilIndex: session.history.length
        };
        
        if (!project.summaryLogs) project.summaryLogs = [];
        project.summaryLogs.push(newLog);
        session.summaryState = { activeSummaryId: newLog.id, summarizedUntilIndex: newLog.summarizedUntilIndex };
        session.history.push({ role: 'system', content: `[ System: Conversation summarized under the title: "${newLog.summary}" ]` });
        
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        
        stateManager.bus.publish('ui:renderChatMessages');
        stateManager.bus.publish('summary:listChanged'); 
        showCustomAlert("Conversation summarized successfully!", "Success");

    } catch (error) {
        console.error("Failed to summarize history:", error);
        showCustomAlert(`Summarization Failed: ${error.message}`, "Error");
    } finally {
         stateManager.bus.publish('status:update', { message: 'Ready', state: 'connected' });
    }
}

export async function handleManualSummarize() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) {
        showCustomAlert("No active session found.", "Error");
        return;
    }
    if (confirm(`Do you want to use the System Utility Agent to summarize this conversation?`)) {
        await summarizeHistoryAndCreateLog(session);
    }
}

export async function loadSummaryIntoContext(logId) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    const log = project.summaryLogs.find(l => l.id === logId);
    if (!session || !log) return;
    session.summaryState.activeSummaryId = log.id;
    session.summaryState.summarizedUntilIndex = session.history.length;
    
    const systemMessage = { role: 'system', content: `[ System: Context loaded from summary: "${log.summary}" ]` };
    session.history.push(systemMessage);
    
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    
    stateManager.bus.publish('ui:renderChatMessages');
    stateManager.bus.publish('summary:listChanged');
}

export async function unloadSummaryFromActiveSession() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session || !session.summaryState?.activeSummaryId) return;
    session.summaryState.activeSummaryId = null;
    const systemMessage = { role: 'system', content: `[ System: Summary context cleared. Conversation will now proceed using full history. ]` };
    session.history.push(systemMessage);
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:renderChatMessages');
    stateManager.bus.publish('summary:listChanged'); 
}

export async function deleteSummary(logId) {
    if (!confirm("Are you sure you want to permanently delete this summary log? This cannot be undone.")) return;
    const project = stateManager.getProject();
    const logIndex = project.summaryLogs.findIndex(l => l.id === logId);
    if (logIndex > -1) {
        project.summaryLogs.splice(logIndex, 1);
        project.chatSessions.forEach(session => {
            if (session.summaryState?.activeSummaryId === logId) {
                session.summaryState.activeSummaryId = null;
                if (session.id === project.activeSessionId) {
                     const systemMessage = { role: 'system', content: `[ System: The active summary was deleted. Context has been cleared. ]` };
                     session.history.push(systemMessage);
                     stateManager.bus.publish('ui:renderChatMessages');
                }
            }
        });
        stateManager.setProject(project);
        await stateManager.updateAndPersistState();
        stateManager.bus.publish('summary:listChanged');
    }
}

// --- Message Action Handlers ---
export async function copyMessageToClipboard(index, event) {
    if(event) event.stopPropagation();
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    const message = session.history[index];
    if (!message) return;
    let textToCopy = '';
    if (typeof message.content === 'string') {
        textToCopy = message.content;
    } else if (Array.isArray(message.content)) {
        textToCopy = message.content.find(p => p.type === 'text')?.text || '';
    }
    try {
        await navigator.clipboard.writeText(textToCopy);
        showCustomAlert('Copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy message:', err);
        showCustomAlert('Failed to copy message.', 'Error');
    }
}

export async function editMessage(index) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    const message = session.history[index];
    const messageDiv = document.querySelector(`.message[data-index='${index}']`);
    if (!messageDiv) return;
    if (message.role === 'user' && messageDiv.classList.contains('is-editing')) return;
    const contentDiv = messageDiv.querySelector('.message-content');
    const actionsDiv = messageDiv.querySelector('.message-actions');
    const editButton = actionsDiv ? actionsDiv.querySelector('button[title="Edit"], button[title="Save Changes"]') : null;
    if (message.role === 'user') {
        contentDiv.style.display = 'none';
        messageDiv.classList.add('is-editing');
        const editContainer = document.createElement('div');
        editContainer.className = 'inline-edit-container';
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-textarea';
        textarea.value = (typeof message.content === 'string') ? message.content : (message.content.find(p => p.type === 'text')?.text || '');
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'inline-edit-actions';
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save & Submit';
        saveButton.className = 'btn btn-small';
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'btn btn-small btn-secondary';
        actionsContainer.appendChild(cancelButton);
        actionsContainer.appendChild(saveButton);
        editContainer.appendChild(textarea);
        editContainer.appendChild(actionsContainer);
        messageDiv.appendChild(editContainer);
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
        const cancelEdit = () => {
            editContainer.remove();
            contentDiv.style.display = 'block';
            messageDiv.classList.remove('is-editing');
        };
        const saveChanges = () => {
            const newContent = textarea.value.trim();
            session.history.splice(index);
            document.getElementById('chatInput').value = newContent;
            stateManager.bus.publish('ui:renderChatMessages');
            sendMessage();
        };
        saveButton.onclick = saveChanges;
        cancelButton.onclick = cancelEdit;
        textarea.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveChanges(); }
            else if (e.key === 'Escape') { cancelEdit(); }
        };
    }
    else if (message.role === 'assistant') {
        const isCurrentlyEditing = contentDiv.isContentEditable;
        if (isCurrentlyEditing) {
            contentDiv.contentEditable = false;
            const newContent = contentDiv.innerHTML;
            session.history[index].content = newContent;
            try {
                await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
                stateManager.bus.publish('ui:renderChatMessages');
            } catch (error) {
                console.error("Failed to save assistant message:", error);
                showCustomAlert("Error saving changes. Please try again.", "Save Failed");
                contentDiv.contentEditable = true;
            }
        } else {
            messageDiv.classList.add('is-editing');
            contentDiv.contentEditable = true;
            contentDiv.style.border = '1px solid var(--primary-color)';
            contentDiv.style.padding = '5px';
            contentDiv.style.borderRadius = '5px';
            contentDiv.focus();
            if (editButton) {
                editButton.innerHTML = '&#10003;';
                editButton.title = 'Save Changes';
            }
            contentDiv.onkeydown = async (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    contentDiv.contentEditable = false;
                    stateManager.bus.publish('ui:renderChatMessages');
                }
            };
        }
    }
}

export function regenerateMessage(index) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session || index >= session.history.length) return;
    stopGeneration();
    let lastUserIndex = -1;
    for (let i = index; i >= 0; i--) {
        if (session.history[i].role === 'user') {
            lastUserIndex = i;
            break;
        }
    }
    if (lastUserIndex === -1) return;
    session.history.splice(lastUserIndex + 1);
    stateManager.bus.publish('ui:renderChatMessages');
    sendMessage(true);
}

export function deleteMessage(index) {
    if (!confirm("Are you sure? This will delete this message and all subsequent messages in this chat.")) return;
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    session.history.splice(index);
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:renderChatMessages');
}
