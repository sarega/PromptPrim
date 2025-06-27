// ===============================================
// FILE: src/js/modules/chat/chat.handlers.js (Refactored)
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { dbRequest, SESSIONS_STORE_NAME } from '../../core/core.db.js';
import { callLLM, streamLLMResponse, generateAndRenameSession } from '../../core/core.api.js';
import { showCustomAlert } from '../../core/core.ui.js';

let attachedFiles = []; // Module-level variable for attached files

// --- Exported Functions ---

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
            messages.push({ role: 'system', content: `[CONTEXT SUMMARY: ${activeLog.content}]` });
            historyToSend = history.slice(session.summaryState.summarizedUntilIndex);
        }
    }

    const agent = project.agentPresets[targetAgentName];
    if (!agent) return messages;
    
    const modelData = allModels.find(m => m.id === agent.model);
    const provider = modelData ? modelData.provider : null;

    historyToSend.forEach(msg => {
        if(msg.role === 'system') return; 
        
        let apiMessage = { role: msg.role };
        if(msg.speaker && msg.role === 'assistant') apiMessage.name = msg.speaker.replace(/\s+/g, '_');
        
        if (typeof msg.content === 'string') {
            apiMessage.content = msg.content;
        } else if (Array.isArray(msg.content)) {
            if (provider === 'ollama') {
                const textPart = msg.content.find(p => p.type === 'text');
                const imagePart = msg.content.find(p => p.type === 'image_url');
                if (textPart) apiMessage.content = textPart.text;
                if (imagePart && imagePart.url) apiMessage.images = [imagePart.url.split(',')[1]]; // Get base64 data
            } else {
                apiMessage.content = msg.content.map(part => (part.type === 'image_url') ? { type: 'image_url', image_url: { url: part.url } } : part);
            }
        }
        messages.push(apiMessage);
    });
    return messages;
}

export async function sendMessage(isRegeneration = false) {
    const project = stateManager.getProject();
    const { type } = project.activeEntity;
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);

    if (!session) return;
    if (session.groupChatState?.isRunning) stopGeneration();

    if (type === 'group') {
        await runConversationTurn(isRegeneration);
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
    session.history.push({role: 'assistant', content: '...', speaker: agentName}); // Placeholder
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
            session.history[assistantMsgIndex].content = `Error: ${error.message}`;
        } else {
            session.history.splice(assistantMsgIndex, 1); // Remove placeholder if aborted
        }
    } finally {
        stopGeneration(); // This will set loading to false and update UI
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        stateManager.bus.publish('ui:renderChatMessages'); // Final render with correct content
    }
}

async function runConversationTurn(isRegeneration) {
    // This logic can be adapted in a similar way, using the event bus to update UI
    // ...
    // For now, let's keep it simple
    showCustomAlert("Group chat functionality is being refactored.", "Info");
}

async function createModeratorDefinedPlan(group, contextHistory, session) {
    // ADAPT: เปลี่ยน currentProject เป็น project
    const project = stateManager.getProject();
    const utilityAgent = project.globalSettings.systemUtilityAgent;
    if (!utilityAgent || !utilityAgent.model) {
        console.warn(`System Utility Model not configured. Falling back to Round Robin.`);
        return createRoundRobinPlan(group);
    }
    stateManager.bus.publish('status:update', { message: `Moderator (${utilityAgent.model}) is planning...`, state: 'loading' });
    
    const availableMembers = group.members.filter(name => name !== group.moderatorAgent);
    const agentDescriptions = availableMembers.map(name => { const agent = project.agentPresets[name]; return `- ${agent.icon || '🤖'} ${name}: ${agent?.systemPrompt.substring(0, 150)}...`; }).join('\\n');
    
    const lastUserMessage = contextHistory.findLast(m => m.role === 'user');
    let lastUserContent = '';
    if (typeof lastUserMessage?.content === 'string') {
        lastUserContent = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage?.content)) {
        lastUserContent = lastUserMessage.content.find(p => p.type === 'text')?.text || '[Image Content]';
    }
    
    const metaPrompt = `You are a conversation moderator. Your goal is to decide which agent(s) should speak next based on the last user message. User message: "${lastUserContent}". Agents available:\\n${agentDescriptions}\\nRespond with a JSON object like {"plan": ["AgentName1", "AgentName2"]}. Choose agents best suited to respond.`;
    
    try {
        const responseText = await callLLM(utilityAgent, [{role: 'user', content: metaPrompt}]);
        const parsed = JSON.parse(responseText.match(/{.*}/s)[0]);
        if (parsed.plan && Array.isArray(parsed.plan)) {
            const validPlan = parsed.plan.filter(name => availableMembers.includes(name));
            if (validPlan.length > 0) {
                stateManager.bus.publish('status:update', { message: 'Plan created. Starting conversation...', state: 'loading' });
                return validPlan;
            }
        }
        throw new Error("Invalid plan format from moderator.");
    } catch (error) {
        console.error("Moderator failed to create a plan:", error, "Falling back to Round Robin.");
        stateManager.bus.publish('status:update', { message: 'Moderator plan failed. Falling back...', state: 'warning' });
        return createRoundRobinPlan(group);
    }
}

export function createRoundRobinPlan(group) {
    const members = group.members.filter(name => name !== group.moderatorAgent);
    const maxTurns = group.maxTurns || members.length;
    const plan = [];
    if (!members || members.length === 0) return [];
    for (let i = 0; i < maxTurns; i++) {
        plan.push(members[i % members.length]);
    }
    return plan;
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
        // ... file validation logic ...
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

export async function handleManualSummarize() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) { showCustomAlert("No active session found."); return; }
    if (confirm(`คุณต้องการให้ System Utility Agent สรุปบทสนทนาหรือไม่?`)) {
        console.log("Summarization requested for session:", session.id);
        showCustomAlert("Summarization not fully implemented in this version yet.");
    }
}

export async function unloadSummaryFromActiveSession() {
    document.getElementById('chat-actions-menu').classList.remove('active');
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session || !session.summaryState?.activeSummaryId) return;
    session.summaryState = { activeSummaryId: null, summarizedUntilIndex: session.history.length };
    const systemMessage = { role: 'system', content: `[ ระบบได้ล้างบริบทจากบทสรุปแล้ว การสนทนาจะใช้ประวัติล่าสุดตามปกติ ]` };
    session.history.push(systemMessage);
    await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
    stateManager.setProject(project);
    await stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:renderChatMessages');
}

// [FIXED] เพิ่มฟังก์ชันที่จำเป็นสำหรับการทำงานของ Chat Bubble Actions
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

/**
 * Handles editing of a message in the chat history.
 * This function is now complete and supports editing for both 'user' and 'assistant' roles.
 *
 * @param {number} index The index of the message in the session's history array.
 */
export async function editMessage(index) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;

    const message = session.history[index];
    const messageDiv = document.querySelector(`.message[data-index='${index}']`);
    if (!messageDiv) return;

    // Prevent re-entering edit mode if already editing (except for assistant save logic)
    if (message.role === 'user' && messageDiv.classList.contains('is-editing')) return;

    const contentDiv = messageDiv.querySelector('.message-content');
    const actionsDiv = messageDiv.querySelector('.message-actions');
    const editButton = actionsDiv ? actionsDiv.querySelector('button[title="Edit"], button[title="Save Changes"]') : null;


    // --- Logic for User Messages ---
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
            // This logic correctly truncates history and resends.
            session.history.splice(index);
            document.getElementById('chatInput').value = newContent;
            
            // Re-render chat and send the message
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
    // --- START: Fixed Logic for Assistant Messages ---
    else if (message.role === 'assistant') {
        const isCurrentlyEditing = contentDiv.isContentEditable;

        if (isCurrentlyEditing) {
            // --- SAVE LOGIC ---
            // If we are currently editing, save the changes.
            contentDiv.contentEditable = false;
            
            // Update the message content in the state from the edited div
            const newContent = contentDiv.innerHTML; // Use innerHTML to preserve formatting (e.g., code blocks)
            session.history[index].content = newContent;
            
            try {
                // Persist the changes to IndexedDB
                await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
                // Re-render the chat to ensure everything is up-to-date and buttons are reset
                stateManager.bus.publish('ui:renderChatMessages');

            } catch (error) {
                console.error("Failed to save assistant message:", error);
                showCustomAlert("Error saving changes. Please try again.", "Save Failed");
                // If saving fails, revert UI state to allow user to try again
                contentDiv.contentEditable = true; 
            }

        } else {
            // --- ENTER EDIT MODE LOGIC ---
            // If not editing, enable editing mode.
            messageDiv.classList.add('is-editing');
            contentDiv.contentEditable = true;
            contentDiv.style.border = '1px solid var(--primary-color)';
            contentDiv.style.padding = '5px';
            contentDiv.style.borderRadius = '5px';
            contentDiv.focus();
            
            // Change the edit button to a save button
            if (editButton) {
                editButton.innerHTML = '&#10003;'; // Checkmark icon
                editButton.title = 'Save Changes';
            }

            // Add a keydown listener to exit edit mode on Escape
            contentDiv.onkeydown = async (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    contentDiv.contentEditable = false;
                    // Simply re-render from original state to discard changes
                    stateManager.bus.publish('ui:renderChatMessages'); 
                }
            };
        }
    }
    // --- END: Fixed Logic for Assistant Messages ---
}

export function regenerateMessage(index) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session || index >= session.history.length) return;
    stopGeneration();
    let lastUserIndex = -1;
    for (let i = index - 1; i >= 0; i--) { 
        if (session.history[i].role === 'user') { 
            lastUserIndex = i; 
            break; 
        } 
    }
    if (lastUserIndex === -1) return;
    session.history.splice(lastUserIndex + 1);
    stateManager.bus.publish('ui:renderChatMessages');
    sendMessage(true); // Call with regeneration flag
}

export function deleteMessage(index) {
    if (!confirm("Are you sure? This will delete this message and all subsequent messages in this chat.")) return;
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    session.history.splice(index); // Delete this message and all after it
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:renderChatMessages');
}
