// src/js/modules/summary/summary.handlers.js
import { stateManager, defaultSummarizationPresets } from '../../core/core.state.js';
import { callLLM } from '../../core/core.api.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as SummaryUI from './summary.ui.js';

// --- ฟังก์ชันหลักในการสร้าง Summary ---
export async function generateNewSummary({ modelId, promptTemplate }) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) throw new Error("Active session not found.");

    if (!modelId) {
        showCustomAlert("Please select a model for summarization in the Settings tab.", "Error");
        throw new Error("Model for summarization not selected.");
    }
    
    const agentForSummary = { ...project.globalSettings.systemUtilityAgent, model: modelId };
    
    const historyToSummarize = session.history.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    if (historyToSummarize.length < 2) {
        showCustomAlert('Not enough new messages to summarize.', 'Info');
        throw new Error("Not enough messages.");
    }

    const newMessagesText = historyToSummarize.map(m => `${m.speaker || m.role}: ${Array.isArray(m.content) ? m.content.find(p => p.type === 'text')?.text || '[multimodal content]' : m.content}`).join('\n');
    const summaryPrompt = promptTemplate
        .replace(/\$\{previousSummary\}/g, "This is a full-history summary from the beginning.")
        .replace(/\$\{newMessages\}/g, newMessagesText);

    const response = await callLLM(agentForSummary, [{ role: 'user', content: summaryPrompt }]);
    
    if (!response || typeof response.content !== 'string') {
        throw new Error("Received an invalid or empty response from the AI summarizer.");
    }

    // [THE FIX] ส่งคืนค่า title และ content กลับไปให้ผู้เรียก
    return {
        title: `Summary of "${session.name}" at ${new Date().toLocaleTimeString()}`,
        content: response.content
    };
}

// --- ฟังก์ชันจัดการ Log (ที่ขาดไป) ---
// export function saveNewSummaryLog() {
//     const project = stateManager.getProject();
//     const session = project.chatSessions.find(s => s.id === project.activeSessionId);
//     const title = document.getElementById('summary-editor-title').value.trim();
//     const content = document.getElementById('summary-editor-content').value.trim();

//     if (!title || !content) {
//         showCustomAlert("Title and content cannot be empty.", "Error");
//         return;
//     }

//     const newLog = {
//         id: `sum_${Date.now()}`,
//         summary: title,
//         content: content,
//         timestamp: Date.now(),
//         sourceSessionId: session.id,
//     };

//     if (!project.summaryLogs) project.summaryLogs = [];
//     project.summaryLogs.push(newLog);
    
//     // --- [ส่วนที่เพิ่มเข้ามา] ---
//     // 1. สร้าง System Message ที่เป็น Marker
//     const markerMessage = {
//         role: 'system',
//         content: `[Conversation summarized: "${title}"]`,
//         isSummaryMarker: true, // Flag สำคัญสำหรับ UI
//         summaryLogId: newLog.id // ผูก ID ของ Log ไว้กับ Marker
//     };
//     // 2. เพิ่ม Marker เข้าไปในประวัติการแชท
//     session.history.push(markerMessage);
//     // -------------------------

//     stateManager.updateAndPersistState();
//     showCustomAlert("New summary log saved!", "Success");
    
//     // อัปเดต UI
//     SummaryUI.selectLog(newLog.id);
//     stateManager.bus.publish('ui:renderMessages'); // สั่งวาดหน้าแชทใหม่
// }

export function saveNewSummaryLog({ title, content }) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!project || !session || !title || !content) return;

    const newLog = {
        id: `sum_${Date.now()}`,
        summary: title,
        content: content,
        timestamp: Date.now(),
        sourceSessionId: session.id,
    };

    if (!project.summaryLogs) project.summaryLogs = [];
    project.summaryLogs.push(newLog);

    stateManager.updateAndPersistState();
    showCustomAlert("New summary log saved!", "Success");
    
    // สั่งให้ UI อัปเดตตัวเอง
    stateManager.bus.publish('summary:listChanged', { newlyCreatedId: newLog.id });
}

export function saveSummaryEdit({ logId, title, content }) {
    if (!logId || !title || !content) return;
    const project = stateManager.getProject();
    const log = project.summaryLogs.find(l => l.id === logId);
    if (log) {
        log.summary = title;
        log.content = content;
        stateManager.updateAndPersistState();
        showCustomAlert("Changes saved!", "Success");
        SummaryUI.renderLogList();
    }
}

export function deleteSummaryLog({ logId }) {
    if (!confirm("Are you sure you want to delete this summary log?")) return;
    
    const project = stateManager.getProject();
    project.summaryLogs = project.summaryLogs.filter(l => l.id !== logId);

    project.chatSessions.forEach(s => {
        if (s.summaryState?.activeSummaryId === logId) {
            s.summaryState.activeSummaryId = null;
        }
    });

    stateManager.updateAndPersistState();
    showCustomAlert("Log deleted.", "Success");
    SummaryUI.selectLog(null);
}

export function loadSummaryToContext({ logId }) {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    const log = project.summaryLogs.find(l => l.id === logId);
    if (!session || !log) return;

    session.summaryState = { activeSummaryId: log.id };
    
    const systemMessage = { 
        role: 'system', 
        content: `[System: Context loaded from summary: "${log.summary}"]`,
        isSummary: true 
    };
    session.history.push(systemMessage);
    
    stateManager.updateAndPersistState();
    stateManager.bus.publish('ui:renderMessages');
    SummaryUI.hideSummarizationCenter();
    showCustomAlert("Summary loaded into context!", "Success");
}

// --- ฟังก์ชันจัดการ Preset (โค้ดส่วนนี้ถูกต้องแล้ว) ---
export function handleSummarizationPresetChange() {
    const selector = document.getElementById('summary-modal-preset-select');
    const selectedName = selector.value;
    if (selectedName === 'custom') return;
    const project = stateManager.getProject();
    const presets = { ...defaultSummarizationPresets, ...project.globalSettings.summarizationPromptPresets };
    if (presets[selectedName]) {
        document.getElementById('summary-modal-prompt-textarea').value = presets[selectedName];
        stateManager.bus.publish('ui:renderSummarizationSelector');
        stateManager.bus.publish('ui:updateSummaryActionButtons');
    }
}
export async function handleSaveSummarizationPreset({ saveAs, presetName, content }) {
    const currentText = content.trim();
    if (!currentText) {
        showCustomAlert("Preset content cannot be empty.", "Error");
        return;
    }

    let finalName = presetName;
    const project = stateManager.getProject();
    const isFactory = defaultSummarizationPresets.hasOwnProperty(finalName);

    // Logic การถามชื่อสำหรับ Save As (เหมือนเดิม)
    if (saveAs || isFactory || !finalName) {
        const newPromptName = prompt('Enter a name for this new preset:', isFactory ? `${finalName} (Copy)` : 'My Custom Preset');
        if (!newPromptName || !newPromptName.trim()) return;
        finalName = newPromptName.trim();
    }
    
    if (project.globalSettings.summarizationPromptPresets[finalName] && finalName !== presetName) {
        if (!confirm(`A preset named '${finalName}' already exists. Overwrite?`)) return;
    }

    // Logic การบันทึก (เหมือนเดิม)
    project.globalSettings.summarizationPromptPresets[finalName] = currentText;
    project.globalSettings.activeSummarizationPreset = finalName; // ตั้งให้ Active อัตโนมัติ
    
    stateManager.setProject(project);
    await stateManager.updateAndPersistState();
    
    // ===== [หัวใจของการแก้ไขอยู่ตรงนี้] =====
    // ส่งสัญญาณกลับไปพร้อม "ชื่อใหม่" ที่ต้องเลือก
    stateManager.bus.publish('summary:presetsChanged', { newSelectedName: finalName });
    // =====================================

    showCustomAlert(`Preset '${finalName}' saved!`, 'Success');
}

export async function renameSummarizationPreset({ presetName: oldName }) {
    if (defaultSummarizationPresets.hasOwnProperty(oldName) || oldName === 'custom') return;

    const newName = prompt(`Enter new name for "${oldName}":`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    const project = stateManager.getProject();
    const trimmedNewName = newName.trim();
    if (project.globalSettings.summarizationPromptPresets[trimmedNewName]) {
        showCustomAlert(`A preset named '${trimmedNewName}' already exists.`, "Error");
        return;
    }
    
    project.globalSettings.summarizationPromptPresets[trimmedNewName] = project.globalSettings.summarizationPromptPresets[oldName];
    delete project.globalSettings.summarizationPromptPresets[oldName];
    
    // [THE FIX] 1. อัปเดต Active Preset ให้เป็นชื่อใหม่โดยอัตโนมัติ
    project.globalSettings.activeSummarizationPreset = trimmedNewName;
    
    stateManager.setProject(project);
    await stateManager.updateAndPersistState();
    
    // [THE FIX] 2. ส่งสัญญาณกลับไปพร้อม "ชื่อใหม่" ที่ต้องเลือก
    stateManager.bus.publish('summary:presetsChanged');
    showCustomAlert(`Preset renamed to '${trimmedNewName}'!`, 'Success');
}


export async function deleteSummarizationPreset({ presetName }) {
    if (defaultSummarizationPresets.hasOwnProperty(presetName)) return;

    if (confirm(`Delete user preset "${presetName}"?`)) {
        const project = stateManager.getProject();
        delete project.globalSettings.summarizationPromptPresets[presetName];
        
        if (project.globalSettings.activeSummarizationPreset === presetName) {
            project.globalSettings.activeSummarizationPreset = 'Standard';
        }
        
        stateManager.setProject(project);
        await stateManager.updateAndPersistState();
        
        stateManager.bus.publish('summary:presetsChanged');
        showCustomAlert(`Preset '${presetName}' deleted.`, 'Success');
    }
}

export function applySummarySettings({ model, templateName }) {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;

    if (model && project.globalSettings.systemUtilityAgent) {
        project.globalSettings.systemUtilityAgent.model = model;
    }
    
    // [THE FIX] บันทึกชื่อ Template ที่เลือกลง State หลัก
    project.globalSettings.activeSummarizationPreset = templateName;
    
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    showCustomAlert("Settings Applied!", "Success");
}

export function deleteSummaryFromChat({ logId }) {
    if (!confirm("Are you sure you want to delete this summary log and its marker from the chat?")) return;

    const project = stateManager.getProject();

    // 1. Delete the Log itself
    project.summaryLogs = project.summaryLogs.filter(l => l.id !== logId);

    // 2. Remove the marker message from the currently active session
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (session) {
        session.history = session.history.filter(msg => msg.summaryLogId !== logId);
    }

    // 3. Clear the active context if this log was being used in any session
    project.chatSessions.forEach(s => {
        if (s.summaryState?.activeSummaryId === logId) {
            s.summaryState.activeSummaryId = null;
        }
    });

    stateManager.updateAndPersistState();
    showCustomAlert("Summary log and chat marker have been deleted.", "Success");

    // Update all relevant UIs
    stateManager.bus.publish('ui:renderMessages');
    stateManager.bus.publish('summary:listChanged'); 
}