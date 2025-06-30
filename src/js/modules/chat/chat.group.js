// ===============================================
// FILE: src/js/modules/chat/chat.group.js (NEW)
// DESCRIPTION: Contains the core logic for handling group chat conversations.
// ===============================================
import { stateManager, SESSIONS_STORE_NAME } from '../../core/core.state.js';
import { streamLLMResponse, callLLM } from '../../core/core.api.js';
import { buildPayloadMessages } from './chat.handlers.js';
import { addMessageToUI } from '../chat/chat.ui.js';
import { dbRequest } from '../../core/core.db.js';
import { stopGeneration } from './chat.handlers.js';
import { showCustomAlert } from '../../core/core.ui.js';

/**
 * Handles the "Round Robin" group chat flow.
 * @param {object} project - The current project state.
 * @param {object} session - The active chat session.
 * @param {object} group - The active agent group.
 */
export async function handleGroupChatRoundRobin(project, session, group) {
    // 1. Set group chat state to running
    session.groupChatState = {
        isRunning: true,
        currentTurn: 0,
        nextMemberIndex: 0,
    };
    stateManager.setLoading(true);
    stateManager.bus.publish('ui:showLoadingIndicator');
    stateManager.newAbortController();

    try {
        // Loop through agents for the max number of turns
        for (let i = 0; i < group.maxTurns; i++) {
            if (stateManager.getState().abortController?.signal.aborted) {
                console.log('Group chat stopped by user.');
                break;
            }

            const currentAgentName = group.members[session.groupChatState.nextMemberIndex];
            const currentAgent = project.agentPresets[currentAgentName];

            if (!currentAgent || !currentAgent.model) {
                console.warn(`Skipping agent ${currentAgentName} due to missing model.`);
                // Move to the next agent without consuming a turn
                session.groupChatState.nextMemberIndex = (session.groupChatState.nextMemberIndex + 1) % group.members.length;
                continue;
            }

            // 2. Add a placeholder UI for the thinking agent
            const messageIndex = session.history.length;
            session.history.push({ role: 'assistant', content: '...', speaker: currentAgentName });
            const messageElement = addMessageToUI('assistant', '', messageIndex, currentAgentName, true);

            // 3. Prepare messages and call the LLM
            const requestMessages = buildPayloadMessages(session.history.slice(0, -1), currentAgentName, session);
            const assistantMsgDiv = messageElement.querySelector('.message-content');
            const responseText = await streamLLMResponse(assistantMsgDiv, currentAgent, requestMessages, currentAgentName);

            // 4. Update history with the actual response
            session.history[messageIndex] = { role: 'assistant', content: responseText, speaker: currentAgentName };
            session.updatedAt = Date.now();
            await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);

            // 5. Update for the next turn
            session.groupChatState.currentTurn++;
            session.groupChatState.nextMemberIndex = (session.groupChatState.nextMemberIndex + 1) % group.members.length;
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error during group chat:', error);
            const lastMessageIndex = session.history.length - 1;
            session.history[lastMessageIndex].content = `Error: ${error.message}`;
            stateManager.bus.publish('ui:renderChatMessages');
        }
    } finally {
        // 6. Clean up and stop loading indicators
        session.groupChatState.isRunning = false;
        stopGeneration(); // This will also set loading to false and handle other cleanup
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        stateManager.bus.publish('project:persistRequired');
    }
}

/**
 * Handles the "Automated Moderator" group chat flow.
 * @param {object} project - The current project state.
 * @param {object} session - The active chat session.
 * @param {object} group - The active agent group.
 */
export async function handleGroupChatAutoModerator(project, session, group) {
    // 1. Initialization
    session.groupChatState = { isRunning: true, currentTurn: 0 };
    stateManager.setLoading(true);
    stateManager.bus.publish('ui:showLoadingIndicator');
    stateManager.newAbortController();

    const moderatorAgent = project.agentPresets[group.moderatorAgent];
    if (!moderatorAgent || !moderatorAgent.model) {
        showCustomAlert(`Moderator agent '${group.moderatorAgent}' is not configured correctly.`, 'Error');
        stopGeneration();
        return;
    }

    try {
        for (let i = 0; i < group.maxTurns; i++) {
            if (stateManager.getState().abortController?.signal.aborted) {
                console.log('Group chat stopped by user.');
                break;
            }

            // 2. Moderator's Turn
            stateManager.bus.publish('status:update', { message: `Moderator '${group.moderatorAgent}' is thinking...`, state: 'loading' });

            const conversationHistory = session.history
                .map(m => `${m.speaker || m.role}: ${typeof m.content === 'string' ? m.content : '[multimodal content]'}`)
                .join('\n');
            
            // [FIX] Provide the moderator with a list of members to choose from, excluding itself.
            const selectableAgents = group.members.filter(m => m !== group.moderatorAgent).join(', ');

            const moderatorPrompt = `You are the moderator of a group chat. Your role is to analyze the ongoing conversation and decide which agent should speak next to best advance the discussion towards the user's goal.

**Available Agents to choose from:**
${selectableAgents}

**Conversation History:**
${conversationHistory}

**Your Task:**
Based on the history, determine the most suitable agent to contribute next. Your response MUST be a valid JSON object containing a single key, "next_speaker", with the name of one of the available agents as the value.

Example Response:
{"next_speaker": "Creative Writer"}`;

            const moderatorRequestMessages = [{ role: 'user', content: moderatorPrompt }];
            const moderatorResponse = await callLLM(moderatorAgent, moderatorRequestMessages);

            let nextAgentName;
            try {
                const jsonResponse = JSON.parse(moderatorResponse.match(/{.*}/s)[0]);
                nextAgentName = jsonResponse.next_speaker;
                if (!group.members.includes(nextAgentName)) {
                    throw new Error(`Moderator selected an invalid agent: ${nextAgentName}`);
                }
            } catch (err) {
                console.error("Failed to parse moderator response:", err, "Falling back to random agent.");
                const otherMembers = group.members.filter(m => m !== group.moderatorAgent);
                nextAgentName = otherMembers[Math.floor(Math.random() * otherMembers.length)];
                if (!nextAgentName) {
                     showCustomAlert("Moderator failed to select a valid agent. Stopping chat.", "Error");
                     break;
                }
            }
            
            session.history.push({ role: 'system', content: `[Moderator selected ${nextAgentName} to speak.]` });
            stateManager.bus.publish('ui:renderChatMessages');

            // 3. Selected Agent's Turn
            const currentAgent = project.agentPresets[nextAgentName];
            if (!currentAgent || !currentAgent.model) {
                console.warn(`Skipping agent ${nextAgentName} due to missing model.`);
                continue;
            }

            stateManager.bus.publish('status:update', { message: `Agent '${nextAgentName}' is responding...`, state: 'loading' });

            const messageIndex = session.history.length;
            session.history.push({ role: 'assistant', content: '...', speaker: nextAgentName });
            const messageElement = addMessageToUI('assistant', '', messageIndex, nextAgentName, true);

            const requestMessages = buildPayloadMessages(session.history.slice(0, -1), nextAgentName, session);
            const assistantMsgDiv = messageElement.querySelector('.message-content');
            const responseText = await streamLLMResponse(assistantMsgDiv, currentAgent, requestMessages, nextAgentName);

            session.history[messageIndex] = { role: 'assistant', content: responseText, speaker: nextAgentName };
            session.updatedAt = Date.now();
            await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);

            session.groupChatState.currentTurn++;
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error during auto-moderator group chat:', error);
            showCustomAlert(`An error occurred in the group chat: ${error.message}`, "Error");
        }
    } finally {
        session.groupChatState.isRunning = false;
        stopGeneration();
        await dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', session);
        stateManager.bus.publish('project:persistRequired');
    }
}