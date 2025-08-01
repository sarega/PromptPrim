// ===============================================
// FILE: src/js/modules/chat/chat.handlers.js (DEFINITIVE & COMPLETE)
// DESCRIPTION: Merges group chat logic to resolve a circular dependency.
// ===============================================

import { stateManager, SESSIONS_STORE_NAME, defaultSystemUtilityAgent } from '../../core/core.state.js';
import { dbRequest } from '../../core/core.db.js';
import { callLLM, streamLLMResponse, buildPayloadMessages, getFullSystemPrompt, generateAndRenameSession } from '../../core/core.api.js';
import { showCustomAlert, showContextMenu, updateAppStatus } from '../../core/core.ui.js';
import { LiveMarkdownRenderer } from '../../core/core.utils.js';
import * as ChatUI from './chat.ui.js';
import * as GroupChat from './chat.group.js';
import * as UserService from '../user/user.service.js'; 
import { calculateCost } from '../../core/core.api.js';

export let attachedFiles = [];
let turndownService = null; // [FIX 1] Declare here, but don't assign yet.

export function initMessageInteractions() {
    // [FIX] Initialize TurndownService here, after the page has loaded.
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
    });
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
    if (typeof text !== 'string' || !text) return 0;
    // A common approximation is that 1 token is roughly 4 characters.
    return Math.round(text.length / 4);
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

// --- Core Chat Logic ---

export async function sendMessage() {
    // 1. All initial validations are preserved
    if (stateManager.isLoading()) return;
    stateManager.newAbortController();

    const project = stateManager.getProject();
    const input = document.getElementById('chatInput');
    let textContent = input.value.trim(); // Use let to allow modification
    if (!textContent && attachedFiles.length === 0) return;

    // 2. User status and credit checks are preserved
    const profile = UserService.getCurrentUserProfile();
    if (profile.planStatus === 'expired') {
        showCustomAlert("Your account is suspended. Please refill your credits to continue.", "Account Suspended");
        return;
    }
    if (profile.credits.current <= 0 && (profile.plan === 'free' || (profile.plan === 'pro' && profile.planStatus === 'active'))) {
        if (profile.plan === 'pro') {
            UserService.downgradeToGracePeriod();
            return;
        } else {
            showCustomAlert("Your trial credits have run out.", "Credits Depleted");
            return;
        }
    }

    if (!project.activeEntity?.name) {
        showCustomAlert("Please select an Agent or Group.", "Error");
        return;
    }
    
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;

    // --- [FIXED LOGIC STARTS HERE] ---
    // แสดงสถานะกำลังโหลดทันที
    stateManager.bus.publish('ui:toggleLoading', { isLoading: true });
    stateManager.bus.publish('status:update', { message: 'Processing images...', state: 'loading' });

    try {
        const userMessageContent = [];
        const urlRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|bmp))/gi;
        const imageUrls = textContent.match(urlRegex) || [];
        
        const plainText = textContent.replace(urlRegex, '').trim();
        if (plainText) {
            userMessageContent.push({ type: 'text', text: plainText });
        }

        // [FIX] แปลง URL ทั้งหมด และถ้ามี Error จะเข้าไปที่ catch block ทันที
        const base64Urls = await Promise.all(
            imageUrls.map(url => convertImageUrlToBase64(encodeURI(url)))
        );

        base64Urls.forEach(b64url => {
            userMessageContent.push({ type: 'image_url', url: b64url });
        });
        
        if (attachedFiles.length > 0) {
            attachedFiles.forEach(file => {
                userMessageContent.push({ type: 'image_url', url: file.data });
            });
        }
        
        const hasImage = userMessageContent.some(p => p.type === 'image_url');
        const hasText = userMessageContent.some(p => p.type === 'text');
        if (hasImage && !hasText) {
            userMessageContent.unshift({ type: 'text', text: "" });
        }
        
        const userMessage = {
            role: 'user', content: userMessageContent,
            speaker: 'You', timestamp: Date.now()
        };

        session.history.push(userMessage);

        if (session.name === 'New Chat' && session.history.length === 1) {
            triggerAutoNameGeneration(session);
        }

        input.value = '';
        input.style.height = 'auto';
        attachedFiles = [];
        stateManager.bus.publish('ui:renderFilePreviews', { files: attachedFiles });
        stateManager.bus.publish('ui:renderMessages');
        stateManager.updateAndPersistState();

        if (project.activeEntity.type === 'agent') {
            await sendSingleAgentMessage();
        } else {
            const group = project.agentGroups[project.activeEntity.name];
            await GroupChat.handleGroupChatTurn(project, session, group);
        }

    } catch (error) {
        // [CRITICAL] เมื่อการแปลง URL ล้มเหลว โค้ดจะมาทำงานที่นี่
        console.error("Error during sendMessage (Image Processing):", error);
        // [FIX] สร้างข้อความแจ้งเตือนแบบมีโครงสร้างและเป็นมิตรกับผู้ใช้มากขึ้น
        const title = "Image Could Not Be Processed";
        const recommendation = "For best results, please save the image to your device and use the '+' button to upload it directly.";
        const technicalDetails = `Details: ${error.message}`;

        // รวมข้อความทั้งหมดเข้าด้วยกัน โดยเน้นคำแนะนำเป็นหลัก
        const fullMessage = `${recommendation}\n\n---\n${technicalDetails}`;

        showCustomAlert(fullMessage, title); // ส่ง Title และ Message ที่สร้างใหม่เข้าไป

        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        stateManager.bus.publish('status:update', { message: 'Image processing failed', state: 'error' });
    }
}

async function sendSingleAgentMessage() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session || project.activeEntity.type !== 'agent') return;

    const agentName = project.activeEntity.name;
    const agent = project.agentPresets[agentName];
    console.log("[CHAT-HANDLER] START of sendSingleAgentMessage. Publishing 'loading' status...");

    stateManager.bus.publish('status:update', { 
        message: `Responding with ${agent.model}...`, 
        state: 'loading' // 'loading' state will make the dot orange
    });

    stateManager.bus.publish('ui:toggleLoading', { isLoading: true });

    // Create a placeholder message in the session history
    const placeholderMessage = { role: 'assistant', content: '', speaker: agentName, isLoading: true };
    const assistantMsgIndex = session.history.length;
    session.history.push(placeholderMessage);
    
    // Immediately render the messages to show the placeholder
    ChatUI.renderMessages(); 
    
    // Find the newly created placeholder element in the DOM
    const placeholderElement = document.querySelector(`.message-turn-wrapper[data-index='${assistantMsgIndex}']`);
    let renderer;

    if (!placeholderElement) {
        console.error("Could not find placeholderElement in the DOM immediately after render.");
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        return;
    }

    try {
        renderer = new LiveMarkdownRenderer(placeholderElement);
    } catch (error) {
        console.error("UI Error creating LiveMarkdownRenderer:", error.message);
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        session.history.pop(); 
        return;
    }

    try {
        const messagesForLLM = buildPayloadMessages(session.history.slice(0, -1), agentName);
        const response = await streamLLMResponse(agent, messagesForLLM, renderer.streamChunk);
        const calculatedCost = calculateCost(agent.model, response.usage);

        const currentUser = UserService.getCurrentUserProfile();
        if (currentUser && currentUser.plan !== 'master') {
            const logEntry = {
                timestamp: Date.now(),
                model: agent.model,
                promptTokens: response.usage.prompt_tokens || 0,
                completionTokens: response.usage.completion_tokens || 0,
                costUSD: calculatedCost,
                duration: response.duration || 0,
                // [ADD THIS] Save the estimation status to the log
                usageIsEstimated: response.usageIsEstimated 
            };
            UserService.logUserActivity(currentUser.userId, logEntry);
        }
        
        UserService.logSystemApiCost(calculatedCost);
        UserService.burnCreditsForUsage(response.usage, agent.model, calculatedCost);
        
        const finalResponseText = renderer.getFinalContent();
        const assistantMessage = { 
            role: 'assistant', 
            content: finalResponseText,
            speaker: agentName, 
            isLoading: false,
            timestamp: Date.now(),
            stats: {
                ...response.usage,
                duration: response.duration,
                speed: response.usage.completion_tokens / (response.duration || 1)
            }
        };
        session.history[assistantMsgIndex] = assistantMessage;

    } catch (error) {
        // [DEFINITIVE FIX] This block now properly handles any error.
        if (error.name !== 'AbortError') {
            const errorMessage = `Error: ${error.message}`;
            console.error("LLM Stream Error:", error);
            // Replace the placeholder with a proper error message object
            session.history[assistantMsgIndex] = { 
                ...placeholderMessage, 
                content: errorMessage, 
                isLoading: false, 
                isError: true 
            };
            stateManager.bus.publish('status:update', { message: 'An error occurred.', state: 'error' });
        } else {
            // If the user aborted, just remove the placeholder
            session.history.splice(assistantMsgIndex, 1);
            console.log("Stream aborted by user.");
        }
    } finally {
        // This 'finally' block ensures the UI is always cleaned up and updated.
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        ChatUI.renderMessages(); // Re-render the entire chat to show the final message or the error.
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);

        if (!stateManager.getState().abortController?.signal.aborted) {
            console.log("[CHAT-HANDLER] END of sendSingleAgentMessage. Publishing 'connected' status...");
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

export function handleFileUpload(files) {
    if (!files) return;

    for (const file of files) {
        // จำกัดเฉพาะไฟล์รูปภาพเพื่อความปลอดภัยเบื้องต้น (คุณสามารถขยายประเภทไฟล์ได้ในอนาคต)
        if (!file.type.startsWith('image/')) {
            showCustomAlert(`File type not supported: ${file.type}. Please upload images only.`, "Unsupported File");
            continue; // ข้ามไปยังไฟล์ถัดไป
        }

        const fileId = `file_${Date.now()}_${Math.random()}`; 
        const newFile = { id: fileId, name: file.name, type: file.type, data: null };
        attachedFiles.push(newFile);
        
        const reader = new FileReader();
        reader.onload = e => {
            const fileIndex = attachedFiles.findIndex(f => f.id === fileId);
            if (fileIndex !== -1) {
                attachedFiles[fileIndex].data = e.target.result;
                stateManager.bus.publish('ui:renderFilePreviews', { files: attachedFiles });
            }
        };
        reader.readAsDataURL(file);
    }
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
    
    const systemMessage = { 
        role: 'system', 
        content: `[ System: Context loaded from summary: "${log.summary}" ]\n\n---\n\n${log.content}`,
        isSummary: true // <-- เพิ่ม Flag สำคัญตรงนี้
    };
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
    // 1. ดึงปุ่มที่ถูกคลิกมาจาก event object
    const copyButton = event.currentTarget;

    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    const message = session.history[index];
    if (!message) return;

    let plainTextContent = '';
    if (typeof message.content === 'string') {
        plainTextContent = message.content;
    } else if (Array.isArray(message.content)) {
        plainTextContent = message.content.find(p => p.type === 'text')?.text || '';
    }

    let htmlContent = '';
    if (message.role === 'assistant' && window.marked) {
        htmlContent = marked.parse(plainTextContent, { gfm: true, breaks: false });
    } else {
        htmlContent = `<p>${plainTextContent.replace(/\n/g, '<br>')}</p>`;
    }

    try {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainTextContent], { type: 'text/plain' });
        const clipboardItem = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
        });

        await navigator.clipboard.write([clipboardItem]);

        // --- 2. เปลี่ยน Feedback จาก Modal เป็นการเปลี่ยนไอคอน ---
        if (copyButton) {
            const iconSpan = copyButton.querySelector('.material-symbols-outlined');
            if (iconSpan) {
                const originalIcon = iconSpan.textContent; // เก็บไอคอนเดิมไว้ (content_copy)
                iconSpan.textContent = 'check'; // เปลี่ยนเป็นไอคอน check

                // ตั้งเวลา 1.5 วินาทีเพื่อเปลี่ยนไอคอนกลับเป็นเหมือนเดิม
                setTimeout(() => {
                    iconSpan.textContent = originalIcon;
                }, 1500);
            }
        }
        // showCustomAlert('Copied as rich text!'); // << ลบ Modal เดิมทิ้ง

    } catch (err) {
        console.error('Failed to copy rich text, falling back to plain text:', err);
        await navigator.clipboard.writeText(plainTextContent);
        // ยังคงแสดง Modal สำหรับกรณีที่เกิด Error หรือ Warning
        showCustomAlert('Failed to copy rich text, copied as plain text instead.', 'Warning');
    }
}


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

    // --- Logic สำหรับ User Bubble ---
    if (message.role === 'user') {
        if (messageDiv.classList.contains('is-editing')) return;
        
        messageDiv.classList.add('is-editing');
        turnWrapper.classList.add('is-editing-child');
        if (contentDiv) contentDiv.style.display = 'none';
        
        const editContainer = document.createElement('div');
        editContainer.className = 'inline-edit-container';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-textarea';
        
        const currentText = Array.isArray(message.content) 
            ? message.content.find(p => p.type === 'text')?.text || '' 
            : message.content;
        textarea.value = currentText;

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

        // [DEFINITIVE & ROBUST FIX] แก้ไข Logic การบันทึกให้รองรับทุกไฟล์
        saveButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newText = textarea.value.trim();

            // 1. ค้นหาส่วนที่ไม่ใช่ข้อความทั้งหมด (รูปภาพ, ไฟล์ text, etc.) เก็บไว้
            const originalFileParts = Array.isArray(message.content) 
                ? message.content.filter(part => part.type !== 'text') 
                : [];

            // 2. สร้าง content array ใหม่
            const newContent = [];
            if (newText) {
                newContent.push({ type: 'text', text: newText });
            }
            // 3. นำไฟล์เดิมทั้งหมดกลับมาต่อท้าย
            newContent.push(...originalFileParts);

            if (newContent.length === 0) {
                showCustomAlert("Cannot save an empty message.", "Warning");
                return;
            }

            // 4. อัปเดต History และ UI
            session.history[index].content = newContent;
            session.history.splice(index + 1);
            
            stateManager.updateAndPersistState();
            stateManager.bus.publish('ui:renderMessages');
            
            // 5. เรียก AI ให้ทำงานต่อ
            if (project.activeEntity.type === 'agent') {
                await sendSingleAgentMessage();
            } else if (project.activeEntity.type === 'group') {
                const group = project.agentGroups[project.activeEntity.name];
                await GroupChat.handleGroupChatTurn(project, session, group);
            }
            updateAppStatus(); // [ADD THIS] เรียกอัปเดต Status Panel
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

    updateAppStatus(); // [ADD THIS] เรียกอัปเดต Status Panel
}

/**
 * [NEW] ทำงานในเบื้องหลังเพื่อตั้งชื่อ Session อัตโนมัติจากข้อความแรกของผู้ใช้
 * @param {object} session - The session object to be renamed.
 */
async function triggerAutoNameGeneration(session) {
    // A slight delay to ensure the main chat UI updates first
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
        const project = stateManager.getProject();
        const utilityAgent = project.globalSettings.systemUtilityAgent;
        if (!utilityAgent || !utilityAgent.model) {
            console.warn("Auto-naming skipped: System Utility Agent not configured.");
            return;
        }

        const firstUserMessage = session.history.find(m => m.role === 'user');
        const userContent = Array.isArray(firstUserMessage.content)
            ? firstUserMessage.content.find(p => p.type === 'text')?.text
            : firstUserMessage.content;
        
        if (!userContent) return;

        const titlePrompt = `Based on the user's initial query, create a concise title (3-5 words) and a single relevant emoji. Respond ONLY with a JSON object like {"title": "your title", "emoji": "👍"}.\n\nUser's Query: "${userContent}"`;

        // The callLLM function now returns an object: { content, usage }
        const response = await callLLM({ ...utilityAgent, temperature: 0.1 }, [{ role: 'user', content: titlePrompt }]);
        
        // Burn userCredits using the `usage` part of the response
        UserService.burnCreditsForUsage(response.usage, utilityAgent.model);
        
        let newTitleData = {};
        try {
            // [FIX] Use `response.content` instead of the undefined `responseText`
            const jsonMatch = response.content.match(/{.*}/s);
            newTitleData = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error("Failed to parse title JSON:", response.content);
            newTitleData = { title: userContent.substring(0, 30), emoji: '💬' };
        }
        
        const newName = `${newTitleData.emoji || '💬'} ${newTitleData.title || 'New Chat'}`;
        stateManager.bus.publish('session:autoRename', { sessionId: session.id, newName: newName });

    } catch (e) {
        console.error("Auto-rename process failed:", e);
    }
}
export function clearSummaryContext({ index }) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;

    // 1. ตรวจสอบว่า message ที่กำลังจะลบ คือตัวที่ให้ context อยู่หรือไม่
    const messageToDelete = session.history[index];
    const activeLogId = session.summaryState?.activeSummaryId;

    if (activeLogId && messageToDelete?.summaryLogId === activeLogId) {
        // 2. ถ้าใช่, ให้เคลียร์ active summary ออกจาก state ของ session
        session.summaryState.activeSummaryId = null;
        console.log(`Summary context for log ID ${activeLogId} has been cleared.`);
    }

    // 3. ลบ message (ที่เป็น marker หรือ bubble) ออกจาก history
    session.history.splice(index, 1);
    
    // 4. บันทึกและอัปเดต UI
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:renderMessages');
    showCustomAlert("Marker/Context has been removed from this chat.", "Info");
}

async function convertImageUrlToBase64(url) {
    try {
        // เราจะลองใช้ Proxy ต่อไป แต่ถ้าไม่สำเร็จจะจัดการ Error อย่างถูกต้อง
        const corsProxy = 'https://cors-anywhere.herokuapp.com/'; 
        const response = await fetch(corsProxy + url);

        if (!response.ok) {
            // โยน Error ที่มีข้อมูลชัดเจนออกไป
            throw new Error(`Server responded with status ${response.status} (${response.statusText})`);
        }

        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`Could not convert image URL "${url}" to Base64:`, error.message);
        // [CRITICAL] โยน Error ต่อเพื่อให้ฟังก์ชัน sendMessage รู้ว่าการแปลงล้มเหลว
        throw new Error(`Failed to process image from URL: ${url}. It might be protected (403 Forbidden).`);
    }
}

