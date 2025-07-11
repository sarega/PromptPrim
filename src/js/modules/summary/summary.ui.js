// ===============================================
// FILE: src/js/modules/summary/summary.ui.js (แก้ไขแล้ว)
// DESCRIPTION: แก้ไขการสร้าง UI ของ Summary Log ให้มีปุ่มควบคุมครบถ้วน
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { createDropdown } from '../../core/core.ui.js';

/**
 * [RESTORED] This is your original function to create a log element,
 * which correctly displays the timestamp.
 * @param {object} log - The summary log object.
 * @returns {HTMLElement} The created element.
 */
function createSummaryLogElement(log) {
    const item = document.createElement('div');
    item.className = 'item summary-log-item'; // ใช้ item class หลัก
    item.dataset.logId = log.id;

    const project = stateManager.getProject();
    const activeSession = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (activeSession && activeSession.summaryState?.activeSummaryId === log.id) {
        item.classList.add('active');
    }

    const timestamp = new Date(log.timestamp).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

    const dropdownOptions = [
        { label: 'View', action: 'summary:view' },
        { label: 'Load to Context', action: 'summary:load' }, // เดิมคือ Upload
        { label: 'Delete', action: 'summary:delete', isDestructive: true }
    ];
    const itemDropdown = createDropdown(dropdownOptions);
    
    // [FIX] แก้ไขโครงสร้าง HTML ให้เหมือนกับ item อื่นๆ (ใช้ item-header และ item-actions)
    const itemHeader = document.createElement('div');
    itemHeader.className = 'item-header';

    const itemName = document.createElement('span');
    itemName.className = 'item-name';
    itemName.innerHTML = `<span class="item-icon">💡</span> ${log.summary}`;
    itemName.title = `${log.summary}\nCreated: ${timestamp}`;

    const itemActions = document.createElement('div');
    itemActions.className = 'item-actions';
    itemActions.appendChild(itemDropdown);
    
    itemHeader.appendChild(itemName);
    itemHeader.appendChild(itemActions);
    item.appendChild(itemHeader);

    // Event listener จะถูกจัดการโดย studio.ui.js อยู่แล้ว
    return item;
}

/**
 * [REFACTORED] Renders the summary logs by grouping them by session
 * into a specific container.
 * @param {HTMLElement} assetsContainer - The main container for all studio assets.
 */
export function renderSummaryLogs(assetsContainer) {
    if (!assetsContainer || typeof assetsContainer.insertAdjacentHTML !== 'function') return;

    const project = stateManager.getProject();
    if (!project || !project.summaryLogs) return;

    const summarySectionHTML = `
        <details class="collapsible-section" open>
            <summary class="section-header">
                <h3>💡 Summary Logs</h3>
            </summary>
            <div class="section-box">
                <div id="summaryLogList" class="item-list"></div>
            </div>
        </details>
    `;
    assetsContainer.insertAdjacentHTML('beforeend', summarySectionHTML);

    const listContainer = assetsContainer.querySelector('#summaryLogList');
    if (!listContainer) return;

    // Group logs by session ID to display them neatly, preserving your original logic.
    const logsBySession = project.summaryLogs.reduce((acc, log) => {
        const key = log.sourceSessionId;
        if (key) {
            const session = project.chatSessions.find(s => s.id === key);
            if (!acc[key]) {
                acc[key] = {
                    name: session ? session.name : "Unknown Session",
                    logs: []
                };
            }
            acc[key].logs.push(log);
        }
        return acc;
    }, {});

    if (Object.keys(logsBySession).length === 0) {
        listContainer.innerHTML = `<p class="no-items-message">No summaries have been generated yet.</p>`;
        return;
    }

    for (const sessionId in logsBySession) {
        const group = logsBySession[sessionId];
        const sessionLogs = group.logs.sort((a, b) => b.timestamp - a.timestamp);
        
        const details = document.createElement('details');
        details.className = 'collapsible-section';
        
        const summary = document.createElement('summary');
        summary.textContent = `For: ${group.name}`;
        details.appendChild(summary);

        sessionLogs.forEach(log => {
            details.appendChild(createSummaryLogElement(log));
        });

        // Auto-open the details for the currently active session
        if (sessionId === project.activeSessionId && sessionLogs.length > 0) {
            details.open = true;
        }

        listContainer.appendChild(details);
    }
}


export function showSummaryModal(logId) {
    const project = stateManager.getProject();
    const log = project.summaryLogs.find(l => l.id === logId);
    if (!log) return;

    const modal = document.getElementById('view-summary-modal');
    if(modal) {
        modal.querySelector('#view-summary-title').textContent = log.summary;
        modal.querySelector('#view-summary-content').textContent = log.content;
        modal.style.display = 'flex';
    }
}

export function initSummaryUI() {
    // We remove the old subscribers that caused errors.
    // Event listeners for clicks on summary items should be handled
    // by a parent listener in the Studio modal to be robust.
    const studioPanel = document.getElementById('studio-panel');
        if (!studioPanel) return;

        studioPanel.addEventListener('click', (e) => {
            const target = e.target.closest('.summary-log-item a');
            if (!target) return;

            e.preventDefault();
            const logId = target.closest('.summary-log-item').dataset.logId;
            const action = target.dataset.action; // สมมติว่าใน a มี data-action="view" หรือ "load"

            if (action === 'view') {
                stateManager.bus.publish('summary:view', { logId });
            } else if (action === 'load') {
                stateManager.bus.publish('summary:load', { logId });
            } else if (action === 'delete') {
                stateManager.bus.publish('summary:delete', { logId });
            }
        });

    // const viewSummaryModal = document.getElementById('view-summary-modal');
    // viewSummaryModal?.querySelector('.btn-secondary')?.addEventListener('click', () => {
    //     viewSummaryModal.style.display = 'none';
    // });
        document.querySelector('#view-summary-modal .btn-secondary')?.addEventListener('click', () => {
        document.getElementById('view-summary-modal').style.display = 'none';
    });

    stateManager.bus.subscribe('summary:view', ({ logId }) => showSummaryModal(logId));
    
    console.log("Summary UI Initialized.");
}