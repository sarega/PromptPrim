// ===============================================
// FILE: src/js/modules/chat/chat.handlers.js (DEFINITIVE & COMPLETE)
// DESCRIPTION: Merges group chat logic to resolve a circular dependency.
// ===============================================

import { stateManager, SESSIONS_STORE_NAME, defaultSystemUtilityAgent } from '../../core/core.state.js';
import { dbRequest } from '../../core/core.db.js';
import { callLLM, streamLLMResponse, generateAndRenameSession } from '../../core/core.api.js';
import { showCustomAlert, showContextMenu } from '../../core/core.ui.js';
import * as ChatUI from './chat.ui.js'; // <-- เพิ่มบรรทัดนี้
import * as GroupChat from './chat.group.js';

export let attachedFiles = [];

export function initMessageInteractions() {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    const sendToComposer = (target) => {
        const messageBubble = target.closest('.message.assistant');
        if (!messageBubble) return;

        const messageContent = messageBubble.querySelector('.message-content');
        if (messageContent) {
            stateManager.bus.publish('composer:append', { content: messageContent.innerHTML });
            messageBubble.classList.add('sent-to-composer-feedback');
            setTimeout(() => {
                messageBubble.classList.remove('sent-to-composer-feedback');
            }, 500);
        }
    };

    /**
     * A shared function to build and show the context menu.
     * It checks for selected text and adds the appropriate menu items.
     * @param {Event} event The event that triggered the menu (contextmenu or dblclick).
     * @param {HTMLElement} messageBubble The message element that was targeted.
     */
    const showMessageActions = (event, messageBubble) => {
        // We only prevent the default browser menu for right-clicks on desktop.
        if (event.type === 'contextmenu') {
            event.preventDefault();
        }

        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        // Ensure the selection is actually inside the bubble we interacted with.
        const isSelectionInBubble = selectedText && selection.containsNode(messageBubble, true);

        const menuOptions = [
            {
                label: 'Send to Composer',
                action: () => sendToComposer(event.target)
            }
        ];

        if (isSelectionInBubble) {
            menuOptions.push({
                label: 'Send Selection to Composer',
                action: () => {
                    stateManager.bus.publish('composer:append', { content: selectedText });
                }
            });
        }

        showContextMenu(menuOptions, event);
    };

    // For Desktop: Right-click
    messagesContainer.addEventListener('contextmenu', (e) => {
        const messageBubble = e.target.closest('.message.assistant');
        if (messageBubble) {
            showMessageActions(e, messageBubble);
        }
    });

    // For Mobile: Double-tap. This avoids interfering with long-press for text selection.
    messagesContainer.addEventListener('dblclick', (e) => {
        const messageBubble = e.target.closest('.message.assistant');
        if (messageBubble) {
            showMessageActions(e, messageBubble);
        }
    });
}

// --- Helper Functions ---
export function estimateTokens(text) {
    if (typeof text !== 'string' || !text) return 0; // [FIX] Guard clause
    return Math.round(text.length / 4);
}
export function getFullSystemPrompt(agentName) {
    const project = stateManager.getProject();
    if (!project) return "";

    // [FIX 1] แก้ไข Logic การหา Agent ให้ถูกต้องตาม context ที่ส่งมา หรือจาก activeEntity
    let entityAgent;
    const activeEntity = project.activeEntity;
    const targetName = agentName || activeEntity?.name;
    const targetType = agentName ? 'agent' : activeEntity?.type;

    if (!targetName) return "";

    if (targetType === 'agent') {
        entityAgent = project.agentPresets?.[targetName];
    } else if (targetType === 'group') {
        const group = project.agentGroups?.[targetName];
        entityAgent = project.agentPresets?.[group?.moderatorAgent];
    }
    
    if (!entityAgent) return "";

    let basePrompt = entityAgent.systemPrompt || "";

    // [FIX 2] แก้ไข Logic การดึง Active Memories ให้ถูกต้อง
    // โดยการอ่านจาก array `activeMemories` ของ Agent ที่ถูกเลือก
    const activeMemoryNames = entityAgent.activeMemories || [];
    
    if (activeMemoryNames.length === 0) {
        return basePrompt.trim(); // ไม่มี Memory ให้ใช้, ส่งคืน Prompt หลักอย่างเดียว
    }

    // [FIX 3] สร้างเนื้อหาของ Memory จากชื่อที่ Active อยู่
    const memoryContent = activeMemoryNames
        .map(name => {
            // หา object memory เต็มๆ จาก project.memories โดยใช้ชื่อ
            const memory = project.memories.find(m => m.name === name);
            return memory ? memory.content : ''; // ถ้าหาเจอให้ใช้ content, ถ้าไม่เจอก็เป็นค่าว่าง
        })
        .filter(content => content) // กรองอันที่หาไม่เจอหรือค่าว่างทิ้ง
        .join('\n\n'); // นำเนื้อหามาต่อกัน

    if (!memoryContent) {
        return basePrompt.trim();
    }

    // [FIX 4] จัดรูปแบบการแสดงผลให้เหมือนในรูปภาพ
    const finalPrompt = `${basePrompt.trim()}\n\n--- Active Memories ---\n${memoryContent}`;

    return finalPrompt;
}


export function getContextData() {
    const project = stateManager.getProject();
    if (!project || !project.activeEntity) {
        return { finalSystemPrompt: '', totalTokens: 0, agent: {}, agentNameForDisplay: 'N/A' };
    }

    const finalSystemPrompt = getFullSystemPrompt();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    
    const historyTokens = session ? estimateTokens(JSON.stringify(session.history || [])) : 0;
    const inputTokens = estimateTokens(document.getElementById('chatInput')?.value || '');
    const systemTokens = estimateTokens(finalSystemPrompt);
    const totalTokens = systemTokens + historyTokens + inputTokens;

    const agent = project.agentPresets[project.activeEntity.name] || {};
    const agentNameForDisplay = project.activeEntity.name || 'N/A';
    
    return {
        finalSystemPrompt,
        totalTokens,
        agent,
        agentNameForDisplay,
        model: agent.model || 'N/A'
    };
}


// export function initChatHandlers() {
//     // Subscribe to the request for context data from the UI
//     console.log("✅ Chat Handlers Initialized.");
// }

export function buildPayloadMessages(history, targetAgentName, session) {
    const project = stateManager.getProject();
    const agent = project.agentPresets[targetAgentName];
    if (!agent) return [];
    
    const messages = [];
    const finalSystemPrompt = getFullSystemPrompt(targetAgentName);
    if (finalSystemPrompt) {
        messages.push({ role: 'system', content: finalSystemPrompt });
    }

    history.forEach(msg => {
        if (msg.isLoading || !msg.content) return;

        // [FIX] สร้าง Message สำหรับส่งไป API โดยจัดการ content ที่เป็น Array
        let apiMessage = { role: msg.role };

        if (typeof msg.content === 'string') {
            apiMessage.content = msg.content;
        } else if (Array.isArray(msg.content)) {
            // สำหรับ API ที่รองรับ Multi-part content (เช่น OpenAI)
            apiMessage.content = msg.content.map(part => {
                if (part.type === 'image_url') {
                    return { type: 'image_url', image_url: { url: part.url } };
                }
                return part; // คืนค่า text part ตามเดิม
            });
        }
        
        messages.push(apiMessage);
    });

    return messages;
}
// --- Core Chat Logic ---

export async function sendMessage() {
    // --- 1. Validation First ---
    if (stateManager.isLoading()) return;
    const project = stateManager.getProject();
    const input = document.getElementById('chatInput');
    const textContent = input.value.trim();
    if (!textContent && attachedFiles.length === 0) return;
    if (!project.activeEntity?.name) {
        showCustomAlert("Please select an Agent or Group.", "Error");
        return;
    }
    let agentToValidate;
    if (project.activeEntity.type === 'agent') {
        agentToValidate = project.agentPresets[project.activeEntity.name];
    } else {
        const group = project.agentGroups[project.activeEntity.name];
        agentToValidate = project.agentPresets[group?.moderatorAgent];
    }
    if (!agentToValidate || !agentToValidate.model) {
        showCustomAlert("The selected Agent/Moderator has no model configured.", "Error");
        return;
    }

    // --- 2. Assemble Content & Update State ---
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    
    let userMessageContent = [];
    if (textContent) {
        // [FIX] เพิ่ม Logic การตรวจจับ URL ของรูปภาพ
        const imageUrlRegex = /\.(jpeg|jpg|gif|png|webp|bmp|svg)(?:\?.*)?$/i;
        if (textContent.startsWith('http') && imageUrlRegex.test(textContent)) {
            userMessageContent.push({ type: 'image_url', url: textContent });
        } else {
            userMessageContent.push({ type: 'text', text: textContent });
        }
    }

    if (attachedFiles.length > 0) {
        attachedFiles.forEach(file => {
            userMessageContent.push({ type: 'image_url', url: file.data });
        });
    }

    stateManager.updateAndPersistState();
    
    // บังคับให้ content เป็น Array เสมอ
    session.history.push({ 
        role: 'user', 
        content: userMessageContent,
        speaker: 'You'
    });
    
    // --- 3. Clear Inputs & UI ---
    input.value = '';
    input.style.height = 'auto';
    attachedFiles = [];
    stateManager.bus.publish('ui:renderFilePreviews', { files: attachedFiles });
    console.log("🚀 [Handler] About to call renderMessages...");

    ChatUI.renderMessages();
    console.log("✅ [Handler] Finished calling renderMessages. Proceeding to AI turn...");

    // --- 4. Execute AI Turn ---
    if (project.activeEntity.type === 'agent') {
        await sendSingleAgentMessage();
    } else {
        const group = project.agentGroups[project.activeEntity.name];
        await GroupChat.handleGroupChatTurn(project, session, group);
    }
}

async function sendSingleAgentMessage() {
    stateManager.bus.publish('ui:toggleLoading', { isLoading: true });

    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    const agentName = project.activeEntity.name;
    const agent = project.agentPresets[agentName];

    // 1. สร้าง Placeholder และรับ Element กลับมาโดยตรง
    const placeholderMessage = { role: 'assistant', content: '...', speaker: agentName, isLoading: true };
    const assistantMsgIndex = session.history.length;
    session.history.push(placeholderMessage);
    
    const placeholderElement = ChatUI.addMessageToUI(placeholderMessage, assistantMsgIndex);
    const contentDiv = placeholderElement?.querySelector('.message-content');

    // ตรวจสอบว่าได้ Element มาจริงหรือไม่
    if (!contentDiv) {
        console.error("Critical UI Error: Could not create or find the streaming target element.");
        showCustomAlert("A critical UI error occurred. Please refresh the page.", "Error");
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        return;
    }

    // 2. คุยกับ LLM และ Stream ผลลัพธ์
    try {
        const messages = buildPayloadMessages(session.history.slice(0, -1), agentName, session);
        const finalResponseText = await streamLLMResponse(contentDiv, agent, messages);
        
        session.history[assistantMsgIndex] = { role: 'assistant', content: finalResponseText, speaker: agentName, isLoading: false };

    } catch (error) {
        if (error.name !== 'AbortError') {
            session.history[assistantMsgIndex] = { role: 'assistant', content: `Error: ${error.message}`, speaker: agentName, isError: true, isLoading: false };
        } else {
            session.history.splice(assistantMsgIndex, 1); // ถ้ากดยกเลิก ให้ลบ placeholder ทิ้งไปเลย
        }
    } finally {
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        ChatUI.renderMessages(); // วาดสถานะสุดท้ายที่สมบูรณ์ทั้งหมด
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        stateManager.bus.publish('context:requestData');
    }
}

export function stopGeneration() {
    stateManager.abort();
    stateManager.setLoading(false);
    stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
}
window.ChatHandlers = {
    sendMessage,
    stopGeneration
};
// [NEW] เพิ่มฟังก์ชันสำหรับลบไฟล์ และทำการ export
export function removeAttachedFile({ index }) {
    if (attachedFiles && attachedFiles[index] !== undefined) {
        // ลบไฟล์ออกจาก array ตาม index
        attachedFiles.splice(index, 1);
        // ส่งสัญญาณบอก UI ให้วาด Preview ใหม่ด้วย array ที่อัปเดตแล้ว
        stateManager.bus.publish('ui:renderFilePreviews', { files: attachedFiles });
    }
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
                // [CRITICAL FIX] เพิ่มข้อมูล base64 ที่อ่านได้เข้าไปใน object
                attachedFiles[fileIndex].data = e.target.result;
                // จากนั้นค่อยส่ง Event ไปบอก UI ให้วาด
                stateManager.bus.publish('ui:renderFilePreviews', { files: attachedFiles });
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
    const lastIndex = session.summaryState?.summarizedUntilIndex ?? -1;
    const summarizedUntil = lastIndex < 0 ? 0 : lastIndex;
    
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
        
        stateManager.bus.publish('ui:renderMessages');
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
    console.log("✅ handleManualSummarize handler started. Checking for System Utility Agent...");

    const project = stateManager.getProject();
    const utilityAgent = project.globalSettings?.systemUtilityAgent;

    // [DEBUG 4] ตรวจสอบ Model ของ Agent
    console.log("Found Utility Agent:", utilityAgent);

    if (!utilityAgent || !utilityAgent.model) {
        showCustomAlert("The 'System Utility Agent' has no model configured.", "Configuration Required");
        return;
    }

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
    
    stateManager.bus.publish('ui:renderMessages');
    stateManager.bus.publish('summary:listChanged');
}

export function unloadSummaryFromActiveSession() {
        console.log("🚀 unloadSummaryFromActiveSession handler called!");
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session || !session.summaryState?.activeSummaryId) return;

    console.log(`Clearing summary context for session: ${session.name}`);

    // [FIX] เพิ่มการอัปเดต UI และ State ทั้งหมดที่นี่
    
    // 1. เปลี่ยนสถานะใน State
    session.summaryState.activeSummaryId = null;
    
    // 2. เพิ่มข้อความ System ลงในประวัติการแชท
    session.history.push({
        role: 'system',
        content: '[Summary context has been cleared. The full conversation history is now active.]'
    });

    // 3. บันทึกการเปลี่ยนแปลง
    stateManager.updateAndPersistState();

    // 4. สั่งให้วาดหน้าจอแชทใหม่เพื่อแสดงข้อความ System
    ChatUI.renderMessages();

    // 5. อัปเดต Status Bar และแสดง Alert
    stateManager.bus.publish('status:update', { message: 'Summary context cleared.', state: 'connected' });
    showCustomAlert('Summary context cleared successfully.', 'Success');
    
    // 6. สั่งให้คำนวณ Token ใหม่
    stateManager.bus.publish('context:requestData');
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
                     stateManager.bus.publish('ui:renderMessages');
                }
            }
        });
        stateManager.setProject(project);
        await stateManager.updateAndPersistState();
        stateManager.bus.publish('summary:listChanged');
    }
}

// --- Message Action Handlers ---
export async function copyMessageToClipboard({ index, event }) {
    if (event) event.stopPropagation();
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

export async function editMessage({ index }) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    const message = session.history[index];
    const messageDiv = document.querySelector(`.message[data-index='${index}']`);
    if (!messageDiv) return;

    const contentDiv = messageDiv.querySelector('.message-content');
    
    // --- Logic for User's Prompt ---
    if (message.role === 'user') {
        if (messageDiv.classList.contains('is-editing')) return;
        messageDiv.classList.add('is-editing');
        if(contentDiv) contentDiv.style.display = 'none';

        const editContainer = document.createElement('div');
        editContainer.className = 'inline-edit-container';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-textarea';
        textarea.value = (typeof message.content === 'string') ? message.content : (message.content.find(p => p.type === 'text')?.text || '');

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'inline-edit-actions';
        
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save & Regenerate';
        saveButton.className = 'btn btn-small';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'btn btn-small btn-secondary';

        const cleanup = () => {
            editContainer.remove();
            if(contentDiv) contentDiv.style.display = 'block';
            messageDiv.classList.remove('is-editing');
        };

        saveButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const newContent = textarea.value.trim();
            if (newContent) {
                // 1. Truncate history at the edit point
                session.history.splice(index);
                // 2. Create the updated user message
                const updatedMessage = { role: 'user', content: newContent };
                session.history.push(updatedMessage);
                // 3. Re-render the UI immediately
                stateManager.bus.publish('ui:renderMessages', { messages: session.history });
                // 4. Call sendMessage to get a new response
                sendMessage(true);
            }
            cleanup();
        });

        cancelButton.addEventListener('click', (e) => {
            e.stopPropagation();
            cleanup();
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveButton.click(); } 
            else if (e.key === 'Escape') { cancelButton.click(); }
        });

        actionsContainer.appendChild(cancelButton);
        actionsContainer.appendChild(saveButton);
        editContainer.appendChild(textarea);
        editContainer.appendChild(actionsContainer);
        messageDiv.appendChild(editContainer);
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';

    // --- [KEPT] Logic for Assistant's Response ---
    } else if (message.role === 'assistant') {
        // This is your original, correct logic for inline editing, preserved exactly.
        if (!contentDiv) return;
        const actionsDiv = messageDiv.querySelector('.message-actions');
        const editButton = actionsDiv ? actionsDiv.querySelector('button[title="Edit"], button[title="Save Changes"]') : null;
        const isCurrentlyEditing = contentDiv.isContentEditable;

        if (isCurrentlyEditing) {
            contentDiv.contentEditable = false;
            messageDiv.classList.remove('is-editing');
            if (editButton) {
                editButton.innerHTML = '&#9998;'; // Pencil icon
                editButton.title = 'Edit';
            }
            session.history[index].content = contentDiv.innerText;
            stateManager.updateAndPersistState(); // Use central state update
            stateManager.bus.publish('ui:renderMessages', { messages: session.history });
        } else {
            if (messageDiv.classList.contains('is-editing')) return;
            messageDiv.classList.add('is-editing');
            contentDiv.contentEditable = true;
            if (editButton) {
                editButton.innerHTML = '&#10003;'; // Checkmark icon
                editButton.title = 'Save Changes';
            }
            contentDiv.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(contentDiv);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);

            contentDiv.onkeydown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    contentDiv.contentEditable = false;
                    // Revert changes by re-rendering the original state
                    stateManager.bus.publish('ui:renderMessages', { messages: session.history });
                }
            };
        }
    }
}

export function regenerateMessage({ index }) {
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
    stateManager.bus.publish('ui:renderMessages');
    sendMessage(true);
}

export function deleteMessage({ index }) {
    if (!confirm("Are you sure you want to delete this single message? This action cannot be undone.")) return;
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    
    session.history.splice(index, 1); // Correctly removes only one message
    
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:renderMessages');
}
