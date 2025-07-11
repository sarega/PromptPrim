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

    // [DEFINITIVE FIX] แก้ไขฟังก์ชัน sendToComposer ให้ clean HTML ก่อน
    const sendToComposer = (target) => {
        const messageBubble = target.closest('.message.assistant');
        if (!messageBubble) return;

        const messageContent = messageBubble.querySelector('.message-content');
        if (messageContent) {
            // 1. สร้าง Clone ของ Node ขึ้นมาทำงาน เพื่อไม่ให้กระทบของเดิมที่แสดงอยู่
            const clonedContent = messageContent.cloneNode(true);

            // 2. ค้นหาและลบปุ่ม Copy และ Wrapper ที่ไม่จำเป็นออก
            clonedContent.querySelectorAll('.code-block-wrapper').forEach(wrapper => {
                const preElement = wrapper.querySelector('pre');
                if (preElement) {
                    // นำ <pre> ออกมาแทนที่ตัว wrapper ทั้งหมด
                    wrapper.parentNode.replaceChild(preElement, wrapper);
                }
            });

            // 3. ส่ง HTML ที่สะอาดแล้ว (ไม่มีปุ่ม Copy) ไปยัง Composer
            stateManager.bus.publish('composer:append', { content: clonedContent.innerHTML });

            // ส่วนของ Feedback ยังคงเหมือนเดิม
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
        // 1. ถ้ามีการกดปุ่ม Shift ค้างไว้ ให้ "ไม่ทำอะไรเลย"
        // เพื่อปล่อยให้เมนูดั้งเดิมของเบราว์เซอร์ทำงานตามปกติ
        if (e.shiftKey) {
            return;
        }

        // 2. ถ้าไม่ได้กด Shift, ให้ทำงานตาม Logic เดิมของเรา
        const messageBubble = e.target.closest('.message.assistant');
        if (messageBubble) {
            e.preventDefault(); // ป้องกันเมนูของเบราว์เซอร์
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
    stateManager.newAbortController();

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
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session || project.activeEntity.type !== 'agent') return;

    const agentName = project.activeEntity.name;
    const agent = project.agentPresets[agentName];

    stateManager.bus.publish('ui:toggleLoading', { isLoading: true });

    const placeholderMessage = { role: 'assistant', content: '', speaker: agentName, isLoading: true };
    const assistantMsgIndex = session.history.length;
    session.history.push(placeholderMessage);
    const placeholderElement = ChatUI.addMessageToUI(placeholderMessage, assistantMsgIndex);
    const contentDiv = placeholderElement?.querySelector('.message-content .streaming-content');

    if (!contentDiv) {
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        stateManager.bus.publish('status:update', { message: 'UI Error', state: 'error' });
        return;
    }

    let accumulatedMarkdown = '';
    let lastUnclosedCodeBlock = false;
    let renderTimeout;

    const renderLivePreview = () => {
        try {
            const inUnclosedCodeBlock = (accumulatedMarkdown.match(/```/g) || []).length % 2 === 1;

            // ถ้า "เพิ่งเริ่มเข้า code block" (ครั้งแรกเท่านั้น) ให้ render <pre> และ "fix" ไปจนจบ code block (ไม่ต้อง render markdown สลับไปมา)
            if (inUnclosedCodeBlock || lastUnclosedCodeBlock) {
                // Render <pre> ทุก chunk จนปิด code block
                const escapedText = accumulatedMarkdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                contentDiv.innerHTML = `<pre class="streaming-code-preview">${escapedText}</pre>`;
            } else {
                // นอก code block = render markdown
                contentDiv.innerHTML = marked.parse(accumulatedMarkdown, { gfm: true, breaks: false });
            }
            lastUnclosedCodeBlock = inUnclosedCodeBlock;
        } catch (e) {
            contentDiv.textContent = accumulatedMarkdown;
        }
        ChatUI.scrollToBottom();
    };

    const onChunk = (chunk) => {
        accumulatedMarkdown += chunk;
        // debounce render 40ms
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(renderLivePreview, 40);
    };

    try {
        const messagesForLLM = buildPayloadMessages(session.history.slice(0, -1), agentName, session);
        const finalResponseText = await streamLLMResponse(agent, messagesForLLM, onChunk);

        session.history[assistantMsgIndex] = { 
            role: 'assistant', 
            content: finalResponseText,
            speaker: agentName, 
            isLoading: false 
        };

        console.log("🟢 assistant content (final markdown):", JSON.stringify(finalResponseText));
    } catch (error) {
        if (error.name !== 'AbortError') {
            session.history[assistantMsgIndex].content = `Error: ${error.message}`;
            stateManager.bus.publish('status:update', { message: 'An error occurred.', state: 'error' });
        } else {
            session.history.splice(assistantMsgIndex, 1);
        }
    } finally {
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        // หลังจบ stream ให้ render ใหม่ คราวนี้ markdown ครบ 100% (bubble สวย)
        ChatUI.renderMessages();
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);

        if (!stateManager.getState().abortController?.signal.aborted) {
            stateManager.bus.publish('status:update', { message: 'Ready', state: 'connected' });
        }
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

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});

export async function editMessage({ index, event }) {
    if (event) event.stopPropagation();

    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    
    const message = session.history[index];
    const turnWrapper = document.querySelector(`.message-turn-wrapper[data-index='${index}']`);
    if (!turnWrapper) return;
    
    const messageDiv = turnWrapper.querySelector('.message');
    const contentDiv = messageDiv.querySelector('.message-content');

    // =======================================================
    // --- Logic สำหรับ User Bubble ---
    // =======================================================
    if (message.role === 'user') {
        if (messageDiv.classList.contains('is-editing')) return;
        
        messageDiv.classList.add('is-editing');
        turnWrapper.classList.add('is-editing-child');
        if (contentDiv) contentDiv.style.display = 'none';
        
        const editContainer = document.createElement('div');
        editContainer.className = 'inline-edit-container';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-textarea';
        textarea.value = typeof message.content === 'string' ? message.content : (message.content.find(p => p.type === 'text')?.text || '');

        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
        });

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
            if (contentDiv) contentDiv.style.display = 'block';
            messageDiv.classList.remove('is-editing');
            turnWrapper.classList.remove('is-editing-child');
        };

        saveButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (textarea.value.trim()) {
                session.history.splice(index);
                session.history.push({ role: 'user', content: textarea.value.trim(), speaker: 'You' });
                stateManager.bus.publish('ui:renderMessages');
                await sendSingleAgentMessage();
            }
        });

        cancelButton.addEventListener('click', (e) => { e.stopPropagation(); cleanup(); });
        textarea.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); cancelButton.click(); } });

        actionsContainer.appendChild(cancelButton);
        actionsContainer.appendChild(saveButton);
        editContainer.appendChild(textarea);
        editContainer.appendChild(actionsContainer);
        messageDiv.appendChild(editContainer);
        
        textarea.focus();
        textarea.dispatchEvent(new Event('input'));
    } 
    // =================================================================
    // --- Logic สำหรับ Assistant Bubble (ที่ทำงานถูกต้อง) ---
    // =================================================================
    else if (message.role === 'assistant') {
        if (!contentDiv || messageDiv.classList.contains('is-editing')) return;
        
        messageDiv.classList.add('is-editing');
        turnWrapper.classList.add('is-editing-child');
        if (contentDiv) contentDiv.style.display = 'none';

        const editContainer = document.createElement('div');
        editContainer.className = 'inline-edit-container';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-textarea';
        textarea.value = message.content; // Content is already Markdown

        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
        });

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'inline-edit-actions';
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.className = 'btn btn-small';
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'btn btn-small btn-secondary';
        
        const cleanup = () => {
            editContainer.remove();
            if (contentDiv) contentDiv.style.display = 'block';
            messageDiv.classList.remove('is-editing');
            turnWrapper.classList.remove('is-editing-child');
        };

        saveButton.addEventListener('click', (e) => {
            e.stopPropagation();
            session.history[index].content = textarea.value;
            stateManager.updateAndPersistState();
            stateManager.bus.publish('ui:renderMessages');
        });

        cancelButton.addEventListener('click', (e) => { e.stopPropagation(); cleanup(); });
        textarea.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); cancelButton.click(); } });
        
        actionsContainer.appendChild(cancelButton);
        actionsContainer.appendChild(saveButton);
        editContainer.appendChild(textarea);
        editContainer.appendChild(actionsContainer);
        messageDiv.appendChild(editContainer);
        
        textarea.focus();
        textarea.dispatchEvent(new Event('input'));
    }
}
export async function regenerateMessage({ index }) {
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
    await sendSingleAgentMessage(); // <--- เรียกตรงนี้จบ!
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
