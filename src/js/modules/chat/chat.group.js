// ===============================================
// FILE: src/js/modules/chat/chat.group.js (NEW)
// DESCRIPTION: Contains all logic for handling group chat conversations.
// ===============================================
import { stateManager, SESSIONS_STORE_NAME } from '../../core/core.state.js';
import { streamLLMResponse, callLLM } from '../../core/core.api.js';
import { dbRequest } from '../../core/core.db.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as ChatUI from './chat.ui.js';
import * as ChatHandlers from './chat.handlers.js';


/**
 * ฟังก์ชันหลักที่ควบคุมการทำงานของ Group Chat แต่ละรอบ
 * @param {object} project The current project state.
 * @param {object} session The active chat session.
 * @param {object} group The active agent group.
 */
export async function handleGroupChatTurn(project, session, group) {
    stateManager.bus.publish('ui:toggleLoading', { isLoading: true });

    try {
        if (group.flowType === 'round-robin') {
            await runRoundRobin(project, session, group);
        } else if (group.flowType === 'auto-moderator') {
            await runAutoModerator(project, session, group);
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Error during group chat turn:", error);
            showCustomAlert(`An error occurred in the group chat: ${error.message}`, "Error");
        }
    } finally {
        stateManager.bus.publish('ui:toggleLoading', { isLoading: false });
        // [FIX] เพิ่มการคืนค่าสถานะกลับเป็นปกติเมื่อ Group Chat ทำงานเสร็จ
        stateManager.bus.publish('status:update', { message: 'Ready', state: 'connected' });
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        stateManager.bus.publish('context:requestData');
    }
}


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

/**
 * Logic สำหรับโหมด Automated Moderator
 */
// async function runAutoModerator(project, session, group) {
//     const maxTurns = group.maxTurns || 1;
//     const moderator = project.agentPresets[group.moderatorAgent];

//     if (!moderator) {
//         throw new Error(`Moderator agent '${group.moderatorAgent}' not found.`);
//     }

//     for (let turn = 0; turn < maxTurns; turn++) {
//         if (stateManager.getState().abortController?.signal.aborted) {
//             console.log("Group chat (Auto-Moderator) stopped by user.");
//             return;
//         }
//         stateManager.bus.publish('status:update', { 
//             message: `Moderator '${group.moderatorAgent}' is deciding...`, 
//             state: 'loading' 
//         });

//         // [Logic] ให้ Moderator ตัดสินใจ
//         const conversationForModerator = session.history.map(m => `${m.speaker || m.role}: ${m.content}`).join('\n');
//         const availableAgents = group.agents.join(', ');
//         const moderatorPrompt = `Based on the following conversation, choose the single most appropriate agent to speak next from this list: [${availableAgents}]. Respond with ONLY the agent's name.\n\nConversation:\n${conversationForModerator}`;
        
//         let nextAgentName;
//         try {
//             const response = await callLLM(moderator, [{ role: 'user', content: moderatorPrompt }]);
//             // พยายามหาชื่อที่ตรงที่สุดจาก response ของ moderator
//             nextAgentName = group.agents.find(agent => response.includes(agent));
//             if (!nextAgentName) throw new Error("Moderator did not return a valid agent name.");
//         } catch(err) {
//             showCustomAlert(`Moderator failed: ${err.message}. Stopping turn.`, "Error");
//             break; // หยุด Loop ถ้า Moderator ทำงานผิดพลาด
//         }

//         // [Logic] แสดงผลการตัดสินใจของ Moderator และให้ Agent ที่ถูกเลือกตอบ
//         const moderatorDecisionMessage = { role: 'system', content: `[Moderator selected ${nextAgentName} to speak.]` };
//         session.history.push(moderatorDecisionMessage);
//         ChatUI.addMessageToUI(moderatorDecisionMessage, session.history.length - 1);

//         await executeAgentTurn(project, session, nextAgentName);
//     }
// }

// [REVISED] แก้ไข runAutoModerator ให้รับรู้เรื่อง Timer
async function runAutoModerator(project, session, group) {
    const timerDuration = (group.timerInSeconds || 0) * 1000; // แปลงเป็น ms

    // ทำงานรอบแรกทันที
    const keepGoing = await executeModeratorTurn(project, session, group);

    // ถ้าตั้งเวลาไว้ และรอบแรกสำเร็จ ให้เริ่ม Loop
    if (timerDuration > 0 && keepGoing) {
        session.groupChatState.timerId = setTimeout(() => {
            // เรียกตัวเองซ้ำเพื่อทำงานรอบถัดไป
            // (เป็นการวางโครงสร้างไว้ ยังต้องปรับปรุงเพิ่มเติมเพื่อให้สมบูรณ์)
            if (session.groupChatState.isRunning) {
                 runAutoModerator(project, session, group);
            }
        }, timerDuration);
    }
}



// [NEW] แยก Logic การทำงานของ Moderator ออกมาเป็นฟังก์ชันย่อย
async function executeModeratorTurn(project, session, group) {
    const moderator = project.agentPresets[group.moderatorAgent];
    if (!moderator) throw new Error("Moderator agent not found");

    // ... โค้ดการเรียก LLM ของ Moderator ทั้งหมด ...
    // ... ตั้งแต่ stateManager.bus.publish... จนถึง ... if (!nextAgentName) ...
    // ...

    await executeAgentTurn(project, session, nextAgentName);
    return true; // คืนค่าว่าทำงานสำเร็จ
}



/**
 * ฟังก์ชันย่อยสำหรับให้ Agent 1 คนทำงาน (สร้าง placeholder, คุยกับ LLM, อัปเดต UI)
 * @param {string} agentName - ชื่อของ Agent ที่จะให้ทำงาน
 */
async function executeAgentTurn(project, session, agentName) {
    const agent = project.agentPresets[agentName];
    if (!agent || !agent.model) {
        console.warn(`Skipping turn for agent '${agentName}' because they have no model configured.`);
        return;
    }

    // 1. สร้าง Placeholder ใน State และ UI
    const placeholderMessage = { role: 'assistant', content: '...', speaker: agentName, isLoading: true };
    session.history.push(placeholderMessage);
    const assistantMsgIndex = session.history.length - 1;
    const placeholderElement = ChatUI.addMessageToUI(placeholderMessage, assistantMsgIndex);
    const contentDiv = placeholderElement?.querySelector('.message-content');
    
    if (!contentDiv) {
        console.error(`Could not create UI placeholder for agent ${agentName}.`);
        session.history[assistantMsgIndex] = { ...placeholderMessage, content: 'UI Error', isLoading: false, isError: true };
        return;
    }

    // 2. คุยกับ LLM และ Stream ผลลัพธ์
    const messagesForLLM = ChatHandlers.buildPayloadMessages(session.history.slice(0, -1), agentName, session);
    const finalResponseText = await streamLLMResponse(contentDiv, agent, messagesForLLM);
    
    // 3. อัปเดต History ด้วยคำตอบที่สมบูรณ์
    session.history[assistantMsgIndex] = { role: 'assistant', content: finalResponseText, speaker: agentName, isLoading: false };
    
    // 4. วาด UI ใหม่อีกครั้งเพื่อแสดงผลลัพธ์สุดท้ายที่สวยงาม (ลบ loading, จัด format code)
    ChatUI.renderMessages();
}