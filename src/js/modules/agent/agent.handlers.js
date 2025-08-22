// ===============================================
// FILE: src/js/modules/agent/agent.handlers.js (Refactored)
// ===============================================

import { stateManager, ALL_AGENT_SETTINGS_IDS, defaultAgentSettings } from '../../core/core.state.js';
import { callLLM, callSystemLLM } from '../../core/core.api.js'; 
import { showCustomAlert } from '../../core/core.ui.js'
import { persistProjectMetadata } from '../project/project.handlers.js'; // [✅ Import]

export async function generateAgentProfile() {
    const enhancerPromptText = document.getElementById('enhancer-prompt-input').value.trim();
    if (!enhancerPromptText) {
        showCustomAlert('Please describe the agent you want to create or enhance.', 'Error');
        return;
    }

    const utilityAgent = stateManager.getProject().globalSettings.systemUtilityAgent;
    if (!utilityAgent || !utilityAgent.model) {
        showCustomAlert('System Utility Model not configured in Settings.', 'Error');
        return;
    }

    const generateBtn = document.getElementById('generate-agent-profile-btn');
    if (generateBtn) generateBtn.classList.add('is-loading');
    
    stateManager.bus.publish('agent:enhancerStatus', { text: 'Processing request...', color: 'var(--text-dark)' });

try {
        const isEnhanceMode = !!stateManager.getState().editingAgentName;
        let metaPrompt = '';

        if (isEnhanceMode) {
            // Enhance prompt (เหมือนเดิม)
            const currentSystemPrompt = document.getElementById('agent-system-prompt').value;
            metaPrompt = `You are an expert in refining LLM system prompts. Your task is to modify an existing system prompt based on a user's new request. Do not replace the original prompt, but integrate the new instruction into it cohesively. Respond ONLY with the new, complete, and modified system prompt as a single block of text.

            EXISTING PROMPT:
            ---
            ${currentSystemPrompt}
            ---

            USER'S MODIFICATION REQUEST:
            ---
            ${enhancerPromptText}
            ---

            NEW, MODIFIED SYSTEM PROMPT:`;
        } else {
            // [CRITICAL FIX] แก้ไข Prompt ให้ขอ Parameters ทั้งหมด
            metaPrompt = `You are an expert in designing LLM agent profiles. Based on the user's request, create a complete agent profile.
            Your response MUST be ONLY a single, valid JSON object with these exact keys:
            - "agent_name": string
            - "agent_icon": string (a single emoji)
            - "system_prompt": string
            - "temperature": number (between 0 and 2)
            - "top_p": number (between 0 and 1)
            - "top_k": integer (0 or higher)
            - "max_tokens": integer (e.g., 4096)
            - "frequency_penalty": number (between -2 and 2)
            - "presence_penalty": number (between -2 and 2)
            - "seed": integer (-1 for random)

            User's Request: "${enhancerPromptText}"`;
        }

        // [CRITICAL FIX] เปลี่ยนจากการเรียก callLLM มาเป็น callSystemLLM
        const response = await callSystemLLM(utilityAgent, [{ role: 'user', content: metaPrompt }]);
        if (!response || typeof response.content !== 'string') {
            throw new Error("Received an invalid or empty response from the AI.");
        }

        if (isEnhanceMode) {
            stateManager.bus.publish('agent:promptEnhanced', { newPrompt: response.content });
            stateManager.bus.publish('agent:enhancerStatus', { text: 'Prompt enhanced successfully!', color: 'var(--success-color)' });
        } else {
            const jsonMatch = response.content.match(/{.*}/s);
            if (!jsonMatch) throw new Error("LLM did not return a valid JSON object.");
            const parsedResponse = JSON.parse(jsonMatch[0]);
            stateManager.bus.publish('agent:profileGenerated', parsedResponse);
            stateManager.bus.publish('agent:enhancerStatus', { text: 'Profile generated successfully!', color: 'var(--success-color)' });
        }

    } catch (error) {
        console.error("Agent Profile Generation/Enhancement Error:", error);
        const errorMessage = `Error: ${error.message}`;
        stateManager.bus.publish('agent:enhancerStatus', { text: errorMessage, color: 'var(--error-color)' });
        
        // [CRITICAL FIX] แสดง Alert ให้ผู้ใช้เห็น Error ชัดเจน
        showCustomAlert(errorMessage, "Profile Generation Failed");

    } finally {
        if (generateBtn) generateBtn.classList.remove('is-loading');
        setTimeout(() => stateManager.bus.publish('agent:enhancerStatus', { text: '' }), 5000);
    }
}

export function saveAgentPreset() {
    const project = stateManager.getProject();
    const oldName = stateManager.getState().editingAgentName;
    const newName = document.getElementById('agent-name-input').value.trim();

    if (!newName) {
        showCustomAlert("Please enter a name for the agent.", "Error");
        return;
    }
    if (oldName !== newName && project.agentPresets[newName]) {
        showCustomAlert(`An agent named '${newName}' already exists.`, "Error");
        return;
    }
    // [CRITICAL FIX] ตรวจสอบว่ามีการเลือก Model แล้วหรือยัง
    const modelId = document.getElementById('agent-model-select').value;
    if (!modelId) {
        showCustomAlert("You must select a model for the agent before saving.", "Model Required");
        
        // ทำให้ช่องเลือก Model กระพริบเพื่อดึงความสนใจ
        const modelWrapper = document.getElementById('agent-model-search-wrapper');
        if (modelWrapper) {
            modelWrapper.classList.add('has-warning');
            setTimeout(() => modelWrapper.classList.remove('has-warning'), 2000);
        }
        return; // หยุดการทำงานทันที
    }
    const settingsFromForm = {
        icon: document.getElementById('agent-icon-button').textContent,
        description: document.getElementById('agent-description').value,
        model: document.getElementById('agent-model-select').value,
        systemPrompt: document.getElementById('agent-system-prompt').value,
        useMarkdown: document.getElementById('agent-use-markdown').checked,
        enableWebSearch: document.getElementById('agent-enable-web-search').checked,
        profilePicture: document.getElementById('agent-profile-picture-preview').src,
        tags: Array.from(document.querySelectorAll('#agent-tags-container .tag-pill')).map(p => p.dataset.tag),
        activeMemories: Array.from(document.querySelectorAll('#agent-memory-list .item input:checked')).map(input => input.closest('.item').dataset.memoryName),
    };

    const parameterEditor = stateManager.getState().activeParameterEditor;
    const advancedParams = parameterEditor ? parameterEditor.getValues() : {};
    const finalAgentSettings = { ...settingsFromForm, ...advancedParams };

    const agentToUpdate = (oldName && project.agentPresets[oldName]) 
        ? { ...project.agentPresets[oldName] } // ถ้าเป็นการแก้ไข ให้ใช้ข้อมูลเก่าเป็นฐาน
        : { 
            ...defaultAgentSettings, // ถ้าสร้างใหม่ ให้ใช้ค่า Default เป็นฐาน
            id: `agent_${Date.now()}`,
            // แล้วกำหนดค่าเริ่มต้นที่นี่
            createdBy: UserService.getCurrentUserProfile().userName,
            createdAt: Date.now()
          };
    
    // [CRITICAL FIX] อัปเดตทุกครั้งที่ Save
    agentToUpdate.modifiedAt = Date.now();
    agentToUpdate.createdBy = document.getElementById('agent-created-by-input').value;
        
    Object.assign(agentToUpdate, finalAgentSettings);
    if (oldName && oldName !== newName) {
        delete project.agentPresets[oldName];
    }
    project.agentPresets[newName] = agentToUpdate;
    
    if (!oldName || (project.activeEntity && project.activeEntity.name === oldName)) {
         project.activeEntity = { type: 'agent', name: newName };
    }

    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    stateManager.bus.publish('studio:contentShouldRender');
    stateManager.bus.publish('agent:editorShouldClose');
}

export function deleteAgentPreset(agentNameToDelete) {
    const project = stateManager.getProject();
    if (!agentNameToDelete || Object.keys(project.agentPresets).length <= 1) {
        showCustomAlert("Cannot delete the last agent.", "Error"); return;
    }
    if (confirm(`Are you sure you want to delete the agent '${agentNameToDelete}'? This action cannot be undone.`)) {
        delete project.agentPresets[agentNameToDelete];
        
        // Clean up references
        Object.values(project.agentGroups).forEach(group => {
            group.agents = group.agents.filter(m => m !== agentNameToDelete);
            if (group.moderatorAgent === agentNameToDelete) group.moderatorAgent = group.agents[0] || '';
        });
        project.chatSessions.forEach(session => {
            if (session.linkedEntity?.type === 'agent' && session.linkedEntity.name === agentNameToDelete) {
                 // Fallback to the first available agent
                 session.linkedEntity = {type: 'agent', name: Object.keys(project.agentPresets)[0]};
            }
        });
        
        // If the deleted agent was active, switch to another one
        if (project.activeEntity.type === 'agent' && project.activeEntity.name === agentNameToDelete) {
            project.activeEntity = { type: 'agent', name: Object.keys(project.agentPresets)[0] };
        }
        
        stateManager.setProject(project);
        stateManager.updateAndPersistState();
        stateManager.bus.publish('agent:listChanged');
        stateManager.bus.publish('entity:selected', project.activeEntity);
    }
}

export async function saveInlineAgentConfig(configData) {
    const project = stateManager.getProject();
    if (!project) return;

    // เราจะเก็บ config ไว้ใน globalSettings เพื่อให้ใช้ได้ทั้งโปรเจกต์
    if (!project.globalSettings) {
        project.globalSettings = {};
    }
    project.globalSettings.inlineAgentConfig = configData;

    // สั่งบันทึกข้อมูล Metadata (ซึ่งรวม globalSettings) ลง DB ทันที
    await persistProjectMetadata(project);
    
    // ตั้งค่า 'dirty' สำหรับการ save file
    stateManager.updateAndPersistState();

    showCustomAlert('Inline Agent configuration saved!', 'Success');
    console.log('Saved Inline Agent Config:', configData);
}