// ===============================================
// FILE: src/js/modules/chat/chat.group.js (NEW)
// DESCRIPTION: Contains all logic for handling group chat conversations.
// ===============================================
import { stateManager, SESSIONS_STORE_NAME } from '../../core/core.state.js';
import { streamLLMResponse, callLLM, buildPayloadMessages } from '../../core/core.api.js'; // <-- import มาจากที่ใหม่
import { dbRequest } from '../../core/core.db.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as ChatUI from './chat.ui.js';
import { LiveMarkdownRenderer, generateUniqueMessageId } from '../../core/core.utils.js';

/**
 * ฟังก์ชันหลักที่ควบคุมการทำงานของ Group Chat แต่ละรอบ
 * @param {object} project The current project state.
 * @param {object} session The active chat session.
 * @param {object} group The active agent group.
 */
export async function handleGroupChatTurn(project, session, group) {
    session.groupChatState = { isRunning: true, awaitsUserInput: false, turnQueue: [], currentJob: null, error: null };
    stateManager.bus.publish('ui:toggleLoading', { isLoading: true });

    if (group.flowType !== 'manual') {
        populateInitialQueue(session, group);
        await processQueue(project, session, group);
    } else {
        session.groupChatState.awaitsUserInput = true;
        stateManager.bus.publish('ui:renderAgentSelector');
        stateManager.bus.publish('status:update', { message: 'Please select the next agent to speak.', state: 'connected' });
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
    }
}


function populateInitialQueue(session, group) {
    if (group.flowType === 'round-robin') {
        const members = (group.agents || []).filter(name => name !== group.moderatorAgent);
        for (let i = 0; i < (group.maxTurns || 1); i++) {
            members.forEach(agentName => session.groupChatState.turnQueue.push({ type: 'agent_turn', agentName }));
        }
    } else if (group.flowType === 'auto-moderator') {
        session.groupChatState.turnQueue.push({ type: 'moderator_turn', agentName: group.moderatorAgent, turnNumber: 1 });
    }
}

export async function processQueue(project, session, group) {
    session.groupChatState.isRunning = true;

    while (session.groupChatState.isRunning && session.groupChatState.turnQueue.length > 0) {
        const job = session.groupChatState.turnQueue.shift();
        session.groupChatState.currentJob = job;

        try {
            await executeJob(project, session, group, job);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Group chat job aborted.');
            } else {
                console.error("Error in group chat job:", error);
                session.groupChatState.error = error.message;
                showCustomAlert(`Group Chat Error: ${error.message}`, "Error");
            }
            session.groupChatState.isRunning = false; // Stop queue on any error
        } finally {
            session.groupChatState.currentJob = null;
        }
    }

    session.groupChatState.isRunning = false;
    if (group.flowType === 'manual') {
        session.groupChatState.awaitsUserInput = true;
        stateManager.bus.publish('ui:renderAgentSelector');
        stateManager.bus.publish('status:update', { message: 'Please select the next agent.', state: 'connected' });
    } else {
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        stateManager.bus.publish('status:update', { message: 'Group chat finished.', state: 'connected' });
    }
}

async function executeJob(project, session, group, job) {
    if (job.type === 'agent_turn') {
        await executeAgentTurn(project, session, job.agentName);
    } else if (job.type === 'moderator_turn') {
        const nextAgentName = await executeModeratorTurn(project, session, group, job);
        if (nextAgentName) {
            session.groupChatState.turnQueue.unshift({ type: 'agent_turn', agentName: nextAgentName });

            const maxTurns = group.maxTurns || 1;
            if (job.turnNumber < maxTurns) {
                session.groupChatState.turnQueue.push({ ...job, turnNumber: job.turnNumber + 1 });
            }
        }
    }
}


async function executeModeratorTurn(project, session, group, job) {
    const moderator = project.agentPresets[job.agentName];
    if (!moderator) throw new Error(`Moderator agent '${job.agentName}' not found.`);

    stateManager.bus.publish('status:update', { message: `Moderator '${job.agentName}' is deciding...`, state: 'loading' });
    const conversationForModerator = session.history.map(m => `${m.speaker || m.role}: ${m.content}`).join('\n');
    const availableAgents = group.agents.filter(name => name !== group.moderatorAgent).join(', ');
    const moderatorPrompt = `Based on the conversation, choose the single best agent to speak next from this list: [${availableAgents}]. Respond with ONLY the agent's name. If no one needs to speak, respond with "DONE".\n\nConversation:\n${conversationForModerator}`;

    const response = await callLLM(moderator, [{ role: 'user', content: moderatorPrompt }]);
    const nextAgentName = group.agents.find(agent => response.content.includes(agent));

    if (nextAgentName) {
        session.history.push({ role: 'system', content: `[Moderator selected ${nextAgentName} to speak.]` });
        stateManager.bus.publish('ui:renderMessages');
    }
    return nextAgentName; // Return the name (or undefined if "DONE")
}

async function executeAgentTurn(project, session, agentName) {
    const agent = project.agentPresets[agentName];
    if (!agent || !agent.model) {
        throw new Error(`Agent '${agentName}' has no model configured.`);
    }

    stateManager.bus.publish('status:update', {
        message: `Thinking as ${agentName}...`,
        state: 'loading'
    });

    // 1. สร้าง Placeholder พร้อม ID ที่ไม่ซ้ำกัน และเพิ่มเข้าไปใน State (History)
    const placeholderMessage = {
        id: generateUniqueMessageId(),
        role: 'assistant',
        content: '',
        speaker: agentName,
        isLoading: true
    };
    session.history.push(placeholderMessage);
    const assistantMsgIndex = session.history.length - 1;

    // 2. วาดหน้าจอใหม่ทั้งหมด เพื่อให้ UI แสดง Placeholder
    ChatUI.renderMessages();

    // รอให้ DOM อัปเดตเล็กน้อยเพื่อให้แน่ใจว่าหา Element เจอ
    await new Promise(resolve => setTimeout(resolve, 50));

    const placeholderElement = document.querySelector(`.message-turn-wrapper[data-message-id='${placeholderMessage.id}']`);
    if (!placeholderElement) {
        session.history.pop(); // เอา State ที่ผิดพลาดออก
        throw new Error(`Could not find UI placeholder for agent ${agentName}.`);
    }

    const renderer = new LiveMarkdownRenderer(placeholderElement);
    const payloadMeta = { __collect: true };
    const messagesForLLM = buildPayloadMessages(session.history.slice(0, -1), agentName, payloadMeta);

    try {
        // ===== [หัวใจของการแก้ไข] =====
        // กลับมาใช้ streamLLMResponse เพื่อให้แสดงผลแบบ Real-time
        const response = await streamLLMResponse(agent, messagesForLLM, renderer.streamChunk);
        const finalResponseText = renderer.getFinalContent();
        // ============================

        const finalMessage = {
            ...placeholderMessage,
            content: finalResponseText,
            isLoading: false,
            timestamp: Date.now(),
            rag: payloadMeta.rag || null,
            folderContext: payloadMeta.folderContext || null
        };

        // อัปเดต State ด้วย Message ที่สมบูรณ์
        session.history[assistantMsgIndex] = finalMessage;
        // บันทึก State ที่อัปเดตแล้ว
        stateManager.updateAndPersistState();

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(`Error during ${agentName}'s turn:`, error);
            session.history[assistantMsgIndex] = {
                ...placeholderMessage,
                content: `Error: ${error.message}`,
                isLoading: false,
                isError: true
            };
        } else {
            session.history.splice(assistantMsgIndex, 1);
        }
        // บันทึก State แม้ว่าจะเกิด Error หรือ Abort
        stateManager.updateAndPersistState();
    } finally {
        // วาดหน้าจอใหม่ครั้งสุดท้ายเสมอ เพื่อแสดงผลลัพธ์สุดท้ายที่ถูกต้อง
        ChatUI.renderMessages();
    }
}
// async function executeAgentTurn(project, session, agentName) {
//     const agent = project.agentPresets[agentName];
//     // เพื่อตรวจสอบว่า Agent มีตัวตนและมี Model กำหนดไว้แล้วหรือยัง
//     if (!agent || !agent.model) {
//         console.warn(`Skipping turn for agent '${agentName}' because they have no model configured.`);
//         // เพิ่ม System Message เพื่อแจ้งให้ผู้ใช้ทราบในหน้าแชท
//         const skipMessage = { 
//             role: 'system', 
//             content: `[Skipping turn for ${agentName}: No model configured in Agent Studio.]` 
//         };
//         session.history.push(skipMessage);
//         stateManager.bus.publish('ui:renderMessages');
//         return; // หยุดการทำงานของ Agent คนนี้ทันที
//     }
    
//     // 1. สร้าง Placeholder ใน State
//     const placeholderMessage = { role: 'assistant', content: '...', speaker: agentName, isLoading: true };
//     session.history.push(placeholderMessage);
//     const assistantMsgIndex = session.history.length - 1;
    
//     // 2. สั่งให้ UI วาดหน้าจอใหม่ทั้งหมด (รวม Placeholder)
//     stateManager.bus.publish('ui:renderMessages');
    
//     // 3. หน่วงเวลาเล็กน้อยเพื่อให้ UI วาดเสร็จ แล้วค่อยหา Element
//     await new Promise(resolve => setTimeout(resolve, 50)); 

//     const placeholderElement = document.querySelector(`.message-turn-wrapper[data-index='${assistantMsgIndex}']`);
    
//     // [FIX] แก้ไขการหา contentDiv ให้ถูกต้อง
//     const contentDiv = placeholderElement?.querySelector('.message-content .streaming-content');
    
//     if (!placeholderElement || !contentDiv) {
//         console.error(`Could not find UI placeholder for agent ${agentName}.`);
//         session.history[assistantMsgIndex] = { ...placeholderMessage, content: 'UI Error', isLoading: false, isError: true };
//         stateManager.bus.publish('ui:renderMessages'); // วาดใหม่เพื่อแสดง Error
//         return;
//     }

//     // 4. คุยกับ LLM และ Stream ผลลัพธ์
//     try {
//         const messagesForLLM = buildPayloadMessages(session.history.slice(0, -1), agentName); // buildPayloadMessages มาจาก core.api.js
//         const renderer = new LiveMarkdownRenderer(placeholderElement);
//         await streamLLMResponse(agent, messagesForLLM, renderer.streamChunk);
        
//         const finalResponseText = renderer.getFinalContent();
//         session.history[assistantMsgIndex] = { role: 'assistant', content: finalResponseText, speaker: agentName, isLoading: false };

//     } catch(error) {
//         if (error.name !== 'AbortError') {
//             session.history[assistantMsgIndex] = { ...placeholderMessage, content: `Error: ${error.message}`, isLoading: false, isError: true };
//         } else {
//             session.history.splice(assistantMsgIndex, 1);
//         }
//     } finally {
//         stateManager.bus.publish('ui:renderMessages');
//     }
// }

/**
 * Logic สำหรับโหมด Round Robin
 */
async function runRoundRobin(project, session, group) {
    const maxTurns = group.maxTurns || 1;
    
    // [FIX] กรอง Moderator ออกจากรายชื่อสมาชิกก่อนเริ่มทำงาน
    const members = (group.agents || []).filter(agentName => agentName !== group.moderatorAgent);

    if (members.length === 0) {
        showCustomAlert("Round Robin mode requires at least one member who is not the moderator.", "Info");
        return;
    }

    for (let turn = 0; turn < maxTurns; turn++) {
        if (maxTurns > 1) {
            const turnMessage = { role: 'system', content: `--- Round ${turn + 1} of ${maxTurns} ---` };
            session.history.push(turnMessage);
            ChatUI.addMessageToUI(turnMessage, session.history.length - 1);
        }
        for (const agentName of members) {
            if (stateManager.getState().abortController?.signal.aborted) return;
            await executeAgentTurn(project, session, agentName);
        }
    }
}


async function runAutoModerator(project, session, group) {
    const maxTurns = group.maxTurns || 1;

    for (let turn = 0; turn < maxTurns; turn++) {
        // [FIX] ใช้ await เพื่อรอให้การทำงานของ Moderator แต่ละรอบเสร็จสิ้น
        const keepGoing = await executeModeratorTurn(project, session, group);
        
        // ถ้า Moderator ทำงานไม่สำเร็จ (เช่น หา agent ไม่เจอ) ให้หยุด loop
        if (!keepGoing || stateManager.getState().abortController?.signal.aborted) {
            console.log("Auto-moderator turn ended or was aborted.");
            break; 
        }
    }
}
