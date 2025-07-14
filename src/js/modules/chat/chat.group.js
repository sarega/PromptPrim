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
import { LiveMarkdownRenderer } from '../../core/core.utils.js';

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


async function executeModeratorTurn(project, session, group) {
    const moderator = project.agentPresets[group.moderatorAgent];
    if (!moderator) {
        throw new Error(`Moderator agent '${group.moderatorAgent}' not found.`);
    }

    stateManager.bus.publish('status:update', { 
        message: `Moderator '${group.moderatorAgent}' is deciding...`, 
        state: 'loading' 
    });

    // 1. สร้าง Prompt สำหรับให้ Moderator ตัดสินใจ
    const conversationForModerator = session.history.map(m => `${m.speaker || m.role}: ${m.content}`).join('\n');
    const availableAgents = group.agents.filter(agentName => agentName !== group.moderatorAgent).join(', ');
    const moderatorPrompt = `Based on the following conversation, choose the single most appropriate agent to speak next from this list: [${availableAgents}]. Respond with ONLY the agent's name.\n\nConversation:\n${conversationForModerator}`;
    
    // 2. เรียก LLM ของ Moderator เพื่อหา nextAgentName
    let nextAgentName; // ประกาศตัวแปรไว้ก่อน
    try {
        const response = await callLLM(moderator, [{ role: 'user', content: moderatorPrompt }]);
        // หาชื่อ agent ที่ตรงที่สุดจากคำตอบของ moderator
        nextAgentName = group.agents.find(agent => response.includes(agent));

        if (!nextAgentName) {
            throw new Error("Moderator did not return a valid agent name from the list.");
        }
    } catch(err) {
        showCustomAlert(`Moderator failed: ${err.message}. Stopping this turn.`, "Error");
        return false; // คืนค่า false เพื่อบอกให้ loop หยุดทำงาน
    }

    // 3. ประกาศผลการตัดสินใจของ Moderator
    const moderatorDecisionMessage = { role: 'system', content: `[Moderator selected ${nextAgentName} to speak.]` };
    session.history.push(moderatorDecisionMessage);
    ChatUI.addMessageToUI(moderatorDecisionMessage, session.history.length - 1);

    // 4. สั่งให้ Agent ที่ถูกเลือกทำงาน
    await executeAgentTurn(project, session, nextAgentName);
    
    return true; // คืนค่า true เพื่อบอกว่าทำงานสำเร็จ
}


/**
 * ฟังก์ชันย่อยสำหรับให้ Agent 1 คนทำงาน (สร้าง placeholder, คุยกับ LLM, อัปเดต UI)
 * @param {string} agentName - ชื่อของ Agent ที่จะให้ทำงาน
 */
async function executeAgentTurn(project, session, agentName) {
    const agent = project.agentPresets[agentName];

    // [CRITICAL FIX] เพิ่ม Safety Check ตรงนี้
    // เพื่อตรวจสอบว่า Agent มีตัวตนและมี Model กำหนดไว้แล้วหรือยัง
    if (!agent || !agent.model) {
        console.warn(`Skipping turn for agent '${agentName}' because they have no model configured.`);
        // เพิ่ม System Message เพื่อแจ้งให้ผู้ใช้ทราบในหน้าแชท
        const skipMessage = { 
            role: 'system', 
            content: `[Skipping turn for ${agentName}: No model configured in Agent Studio.]` 
        };
        session.history.push(skipMessage);
        ChatUI.addMessageToUI(skipMessage, session.history.length - 1);
        return; // หยุดการทำงานของ Agent คนนี้ทันที
    }

    // 1. สร้าง Placeholder ใน State และ UI
    const placeholderMessage = { role: 'assistant', content: '...', speaker: agentName, isLoading: true };
    session.history.push(placeholderMessage);
    const assistantMsgIndex = session.history.length - 1;
    const placeholderElement = ChatUI.addMessageToUI(placeholderMessage, assistantMsgIndex);
    const contentDiv = placeholderElement?.querySelector('.message-content .streaming-content'); // <-- แก้ไข selector ให้ถูกต้อง
    
    if (!contentDiv) {
        console.error(`Could not create UI placeholder for agent ${agentName}.`);
        session.history[assistantMsgIndex] = { ...placeholderMessage, content: 'UI Error', isLoading: false, isError: true };
        return;
    }

    // 2. คุยกับ LLM และ Stream ผลลัพธ์
    try {
        const messagesForLLM = ChatHandlers.buildPayloadMessages(session.history.slice(0, -1), agentName, session);
        const renderer = new LiveMarkdownRenderer(placeholderElement); // <-- ใช้ LiveMarkdownRenderer ที่เราเคยสร้าง
        await streamLLMResponse(agent, messagesForLLM, renderer.streamChunk);
        
        const finalResponseText = renderer.getFinalContent();
        // 3. อัปเดต History ด้วยคำตอบที่สมบูรณ์
        session.history[assistantMsgIndex] = { role: 'assistant', content: finalResponseText, speaker: agentName, isLoading: false };

    } catch(error) {
        // จัดการ Error ที่อาจเกิดขึ้นระหว่าง Stream
        if (error.name !== 'AbortError') {
            session.history[assistantMsgIndex] = { ...placeholderMessage, content: `Error: ${error.message}`, isLoading: false, isError: true };
        } else {
            session.history.splice(assistantMsgIndex, 1); // ลบ Placeholder ถ้ากดยกเลิก
        }
    } finally {
        // 4. วาด UI ใหม่อีกครั้งเพื่อแสดงผลลัพธ์สุดท้ายที่สวยงาม
        ChatUI.renderMessages();
    }
}