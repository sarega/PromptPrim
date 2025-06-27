// ===============================================
// FILE: src/js/modules/summary/summary.ui.js (ไฟล์ใหม่)
// DESCRIPTION: UI Module สำหรับจัดการการแสดงผลของ Summary Logs
// ===============================================

import { stateManager } from '../../core/core.state.js';

// --- Private Helper Functions ---

function createSummaryLogElement(log) {
    const item = document.createElement('div');
    item.className = 'summary-log-item';
    item.dataset.logId = log.id;

    // Check if this log is the active one for the current session
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
                <button class="btn-icon btn-small" data-action="view" title="View Summary">&#128269;</button>
            </div>
        </div>
        <div class="summary-log-item-meta">
            <span>${timeString}</span>
        </div>
    `;

    // Add event listener to load the summary into context when clicked
    item.addEventListener('click', (e) => {
        if (!e.target.closest('[data-action="view"]')) {
             stateManager.bus.publish('summary:load', { logId: log.id });
        }
    });

    item.querySelector('[data-action="view"]').addEventListener('click', (e) => {
        e.stopPropagation();
        stateManager.bus.publish('summary:view', { logId: log.id });
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
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(log);
        return acc;
    }, {});

    const activeSessionId = project.activeSessionId;

    // Ensure the active session's logs are displayed, even if it has no logs yet
    if (activeSessionId && !logsBySession[activeSessionId]) {
        logsBySession[activeSessionId] = [];
    }
    
    for (const sessionId in logsBySession) {
        const session = project.chatSessions.find(s => s.id === sessionId);
        if (!session) continue; // Skip logs for deleted sessions

        const sessionLogs = logsBySession[sessionId].sort((a, b) => b.timestamp - a.timestamp);
        
        const details = document.createElement('details');
        details.className = 'summary-group';
        // Open the details for the currently active session
        if(sessionId === activeSessionId) {
            details.open = true;
        }

        const summary = document.createElement('summary');
        summary.textContent = `For: ${session.name}`;
        details.appendChild(summary);

        if (sessionLogs.length > 0) {
            sessionLogs.forEach(log => {
                details.appendChild(createSummaryLogElement(log));
            });
        } else {
            const noLogsEl = document.createElement('p');
            noLogsEl.className = 'no-logs-message';
            noLogsEl.textContent = 'No summaries yet.';
            details.appendChild(noLogsEl);
        }

        container.appendChild(details);
    }
}

export function showSummaryModal(logId) {
    const project = stateManager.getProject();
    const log = project.summaryLogs.find(l => l.id === logId);
    if (!log) return;

    document.getElementById('view-summary-title').textContent = `Summary from ${new Date(log.timestamp).toLocaleString()}`;
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