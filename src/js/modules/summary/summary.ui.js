// ===============================================
// FILE: src/js/modules/summary/summary.ui.js (แก้ไขแล้ว)
// DESCRIPTION: แก้ไขการสร้าง UI ของ Summary Log ให้มีปุ่มควบคุมครบถ้วน
// ===============================================

import { stateManager } from '../../core/core.state.js';

// --- Private Helper Functions ---

// [MODIFIED] แก้ไขให้สร้างปุ่มควบคุม (Load, View, Delete) และผูก Event กับ Event Bus
function createSummaryLogElement(log) {
    const item = document.createElement('div');
    item.className = 'summary-log-item';
    item.dataset.logId = log.id;

    const project = stateManager.getProject();
    const activeSession = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (activeSession && activeSession.summaryState?.activeSummaryId === log.id) {
        item.classList.add('active');
    }

    const date = new Date(log.timestamp);
    const timeString = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    item.innerHTML = `
        <div class="summary-log-item-header">
            <span class="summary-log-item-title" title="${log.summary}">${log.summary}</span>
            <div class="summary-log-item-actions">
                <button class="btn-icon btn-small" data-action="load" title="Load as context">&#11139;</button>
                <button class="btn-icon btn-small" data-action="view" title="View content">&#128269;</button>
                <button class="btn-icon btn-small danger" data-action="delete" title="Delete summary">&#128465;</button>
            </div>
        </div>
        <div class="summary-log-item-meta">
            <span>${timeString}</span>
        </div>
    `;

    // ใช้ Event Bus แทน onclick โดยตรง
    item.querySelector('[data-action="load"]').addEventListener('click', (e) => {
        e.stopPropagation();
        stateManager.bus.publish('summary:load', { logId: log.id });
    });

    item.querySelector('[data-action="view"]').addEventListener('click', (e) => {
        e.stopPropagation();
        stateManager.bus.publish('summary:view', { logId: log.id });
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        stateManager.bus.publish('summary:delete', { logId: log.id });
    });

    return item;
}

// --- Exported UI Functions ---

export function renderSummaryLogs() {
    const project = stateManager.getProject();
    if (!project || !project.summaryLogs) return;

    const container = document.getElementById('summaryLogList');
    container.innerHTML = '';
    
    // Group logs by session ID to display them neatly
    const logsBySession = project.summaryLogs.reduce((acc, log) => {
        const key = log.sourceSessionId;
        const session = project.chatSessions.find(s => s.id === key);
        if (!acc[key]) {
            acc[key] = {
                name: session ? session.name : "Unknown Session",
                logs: []
            };
        }
        acc[key].logs.push(log);
        return acc;
    }, {});

    const activeSessionId = project.activeSessionId;

    if (Object.keys(logsBySession).length === 0) {
        container.innerHTML = `<p class="no-logs-message">No summaries yet.</p>`;
        return;
    }

    for (const sessionId in logsBySession) {
        const group = logsBySession[sessionId];
        const sessionLogs = group.logs.sort((a, b) => b.timestamp - a.timestamp);
        
        const details = document.createElement('details');
        details.className = 'summary-group';
        
        const summary = document.createElement('summary');
        summary.textContent = `For: ${group.name}`;
        details.appendChild(summary);

        sessionLogs.forEach(log => {
            details.appendChild(createSummaryLogElement(log));
        });

        // Auto-open the details for the currently active session if it has logs
        if(sessionId === activeSessionId && sessionLogs.length > 0) {
            details.open = true;
        }

        container.appendChild(details);
    }
}

export function showSummaryModal(logId) {
    const project = stateManager.getProject();
    const log = project.summaryLogs.find(l => l.id === logId);
    if (!log) return;

    document.getElementById('view-summary-title').textContent = log.summary;
    document.getElementById('view-summary-content').textContent = log.content;
    document.getElementById('view-summary-modal').style.display = 'flex';
}

export function hideSummaryModal() {
    document.getElementById('view-summary-modal').style.display = 'none';
}

export function initSummaryUI() {
    stateManager.bus.subscribe('project:loaded', renderSummaryLogs);
    stateManager.bus.subscribe('session:loaded', renderSummaryLogs);
    stateManager.bus.subscribe('summary:listChanged', renderSummaryLogs);

    document.querySelector('#view-summary-modal .btn-secondary').addEventListener('click', hideSummaryModal);

    console.log("Summary UI Initialized.");
}
