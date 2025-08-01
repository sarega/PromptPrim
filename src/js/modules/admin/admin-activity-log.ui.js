// Create new file: src/js/modules/admin/admin-activity-log.ui.js

import * as UserService from '../user/user.service.js';
import * as ActivityLogHandlers from './admin-activity-log.handlers.js';
import { formatTimestamp } from '../../core/core.utils.js';

const modal = document.getElementById('activity-log-modal');
const modalBody = document.getElementById('activity-log-body');
const modalTitle = document.getElementById('activity-log-title');
let currentUserId = null;

function showModal() { modal.style.display = 'flex'; }
function hideModal() { modal.style.display = 'none'; }

export function showActivityLogModal(userId) {
    currentUserId = userId;
    const user = UserService.getUserById(userId);
    if (!user || !modalBody || !modalTitle) return;

    modalTitle.textContent = `Activity Log for ${user.userName}`;
    
    if (!user.activityLog || user.activityLog.length === 0) {
        modalBody.innerHTML = "<p>No activity recorded for this user.</p>";
        showModal();
        return;
    }

    const tableRows = user.activityLog.map(log => {
        const totalTokens = (log.promptTokens || 0) + (log.completionTokens || 0);
        const tps = (log.duration > 0) ? ((log.completionTokens || 0) / log.duration).toFixed(1) : 'N/A';
        
        // [NEW] จัดรูปแบบค่าใช้จ่าย
        const costDisplay = (log.costUSD || 0).toFixed(8);
        const estimateIndicator = log.usageIsEstimated 
            ? `<span class="estimate-indicator" title="This is an estimate.">*</span>` 
            : '';

        return `
            <tr>
                <td>${formatTimestamp(log.timestamp)}</td>
                <td>${log.model}</td>
                <td>${log.promptTokens}</td>
                <td>${log.completionTokens}</td>
                <td>${totalTokens}${estimateIndicator}</td>
                <td style="text-align: right;">$${costDisplay}</td> <td>${tps} tps</td>
            </tr>
        `
    }).reverse().join('');

    modalBody.innerHTML = `
        <div class="item-list-scrollable" style="padding: 0; max-height: 60vh;">
            <table class="activity-log-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Model</th>
                        <th>Prompt Tokens</th>
                        <th>Completion Tokens</th>
                        <th>Total Tokens</th>
                        <th style="text-align: right;">Cost (USD)</th> <th>Speed</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
    showModal();
}

export function initActivityLogUI() {
    const detailSection = document.getElementById('user-detail-section');
    
    // Use event delegation on a parent element
    if (detailSection) {
        detailSection.addEventListener('click', (e) => {
            if (e.target.id === 'view-activity-log-btn') {
                const userId = detailSection.dataset.userId;
                showActivityLogModal(userId);
            }
        });
    }

    // [FIX] Correctly add listeners to both close buttons
    modal?.querySelectorAll('.modal-close-btn')?.forEach(btn => {
        btn.addEventListener('click', hideModal);
    });

    modal?.querySelector('#export-activity-csv-btn')?.addEventListener('click', () => {
        if (currentUserId) {
            ActivityLogHandlers.exportActivityLogToCSV(currentUserId);
        }
    });
}