// src/js/modules/summary/summary.handlers.js
import { stateManager, defaultSummarizationPresets } from '../../core/core.state.js';
import { callLLM } from '../../core/core.api.js';
import { showCustomAlert } from '../../core/core.ui.js';
import * as SummaryUI from './summary.ui.js';

// --- ฟังก์ชันหลักในการสร้าง Summary ---
export async function generateNewSummary() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;

    // [FIX] Read the model ID from the correct hidden input within the summary modal
    const selectedModelId = document.getElementById('summary-model-value').value;
    
    if (!selectedModelId) {
        showCustomAlert("Please select a model for summarization in the Settings tab.", "Error");
        return;
    }
    
    // สร้าง Agent ชั่วคราวสำหรับใช้ในการ Summarize
    const agentForSummary = {
        ...project.globalSettings.systemUtilityAgent, // ใช้ค่า Parameters (Temp, TopP) จาก Global
        model: selectedModelId                        // แต่ใช้ Model ที่เลือกใหม่จากหน้า Summary Center
    };
    
    const historyToSummarize = session.history.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    if (historyToSummarize.length === 0) {
        showCustomAlert('Not enough messages to summarize.', 'Info');
        return;
    }

    SummaryUI.setSummaryLoading(true);
    try {
        const newMessagesText = historyToSummarize.map(m => `${m.speaker || m.role}: ${Array.isArray(m.content) ? m.content.find(p => p.type === 'text')?.text || '[multimodal content]' : m.content}`).join('\n');
        const promptTemplate = document.getElementById('summary-modal-prompt-textarea').value;
        const summaryPrompt = promptTemplate
            .replace(/\$\{previousSummary\}/g, "This is a full-history summary from the beginning.")
            .replace(/\$\{newMessages\}/g, newMessagesText);

        // เรียกใช้ LLM ด้วย Agent ที่สร้างขึ้นมาอย่างถูกต้อง
        const summaryContent = await callLLM(agentForSummary, [{ role: 'user', content: summaryPrompt }]);
        
        document.getElementById('summary-editor-title').value = `Summary of "${session.name}" at ${new Date().toLocaleTimeString()}`;
        document.getElementById('summary-editor-content').value = summaryContent;
        SummaryUI.showEditorActions('new');

    } catch (error) {
        showCustomAlert(`Summarization Failed: ${error.message}`, "Error");
    } finally {
        SummaryUI.setSummaryLoading(false);
    }
}

// --- ฟังก์ชันจัดการ Log (ที่ขาดไป) ---
export function saveNewSummaryLog() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    const title = document.getElementById('summary-editor-title').value.trim();
    const content = document.getElementById('summary-editor-content').value.trim();

    if (!title || !content) {
        showCustomAlert("Title and content cannot be empty.", "Error");
        return;
    }

    const newLog = {
        id: `sum_${Date.now()}`,
        summary: title,
        content: content,
        timestamp: Date.now(),
        sourceSessionId: session.id,
    };

    if (!project.summaryLogs) project.summaryLogs = [];
    project.summaryLogs.push(newLog);
    
    // --- [ส่วนที่เพิ่มเข้ามา] ---
    // 1. สร้าง System Message ที่เป็น Marker
    const markerMessage = {
        role: 'system',
        content: `[Conversation summarized: "${title}"]`,
        isSummaryMarker: true, // Flag สำคัญสำหรับ UI
        summaryLogId: newLog.id // ผูก ID ของ Log ไว้กับ Marker
    };
    // 2. เพิ่ม Marker เข้าไปในประวัติการแชท
    session.history.push(markerMessage);
    // -------------------------

    stateManager.updateAndPersistState();
    showCustomAlert("New summary log saved!", "Success");
    
    // อัปเดต UI
    SummaryUI.selectLog(newLog.id);
    stateManager.bus.publish('ui:renderMessages'); // สั่งวาดหน้าแชทใหม่
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
//... (ฟังก์ชัน save, delete, rename preset อื่นๆ ที่มีอยู่แล้ว)
export async function handleSaveSummarizationPreset({ saveAs }) {
    const selector = document.getElementById('summary-modal-preset-select');
    const currentText = document.getElementById('summary-modal-prompt-textarea').value.trim();
    if (!currentText) return;

    let presetName = selector.value;
    const isFactory = defaultSummarizationPresets.hasOwnProperty(presetName);

    if (saveAs || isFactory || presetName === 'custom') {
        presetName = prompt('Enter a name for this preset:', isFactory ? `${presetName} (Copy)` : 'My Custom Prompt');
        if (!presetName || !presetName.trim()) return;
    }

    const project = stateManager.getProject();
    const trimmedName = presetName.trim();

    if (project.globalSettings.summarizationPromptPresets[trimmedName] && trimmedName !== selector.value) {
        if (!confirm(`A preset named '${trimmedName}' already exists. Overwrite?`)) return;
    }

    project.globalSettings.summarizationPromptPresets[trimmedName] = currentText;
    stateManager.setProject(project);

    await stateManager.updateAndPersistState();
    
    stateManager.bus.publish('ui:renderSummarizationSelector');
    setTimeout(() => {
        const newSelector = document.getElementById('summary-modal-preset-select');
        if (newSelector) newSelector.value = trimmedName;
        stateManager.bus.publish('ui:updateSummaryActionButtons');
    }, 50);
    showCustomAlert(`Preset '${trimmedName}' saved!`, 'Success');
}

export async function deleteSummarizationPreset() {
    const selector = document.getElementById('summary-modal-preset-select');
    const presetNameToDelete = selector.value;
    
    if (defaultSummarizationPresets.hasOwnProperty(presetNameToDelete)) return;

    if (confirm(`Delete user preset "${presetNameToDelete}"?`)) {
        const project = stateManager.getProject();
        delete project.globalSettings.summarizationPromptPresets[presetNameToDelete];
        
        document.getElementById('summary-modal-prompt-textarea').value = defaultSummarizationPresets['Standard'];
        stateManager.setProject(project);
        await stateManager.updateAndPersistState();
        
        stateManager.bus.publish('ui:renderSummarizationSelector');
        showCustomAlert(`Preset '${presetNameToDelete}' deleted.`, 'Success');
    }
}

export async function renameSummarizationPreset() {
    const selector = document.getElementById('summary-modal-preset-select');
    const oldName = selector.value;
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
    
    stateManager.setProject(project);
    await stateManager.updateAndPersistState();
    
    stateManager.bus.publish('ui:renderSummarizationSelector');
    setTimeout(() => {
        document.getElementById('summary-modal-preset-select').value = trimmedNewName;
        stateManager.bus.publish('ui:updateSummaryActionButtons');
    }, 50);
    showCustomAlert(`Preset renamed to '${trimmedNewName}'!`, 'Success');
}

export function deleteSummaryFromChat({ logId, messageIndex }) {
    if (!confirm("Are you sure you want to delete this summary log? This will also remove the marker from the chat.")) return;
    
    const project = stateManager.getProject();
    
    // ลบ Log
    project.summaryLogs = project.summaryLogs.filter(l => l.id !== logId);

    // ลบ Marker ออกจาก History
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (session) {
        session.history = session.history.filter(msg => msg.summaryLogId !== logId);
    }
    
    // เคลียร์ Context ถ้าจำเป็น
    project.chatSessions.forEach(s => {
        if (s.summaryState?.activeSummaryId === logId) {
            s.summaryState.activeSummaryId = null;
        }
    });

    stateManager.updateAndPersistState();
    showCustomAlert("Log deleted.", "Success");
    
    // อัปเดต UI ทั้งหมด
    stateManager.bus.publish('ui:renderMessages');
    SummaryUI.selectLog(null); // เคลียร์ editor ใน modal
}