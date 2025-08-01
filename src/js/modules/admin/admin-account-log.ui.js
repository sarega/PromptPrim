// File: src/js/modules/admin/admin-account-log.ui.js
// (Definitive Corrected Version)

import * as UserService from '../user/user.service.js';
import { formatTimestamp } from '../../core/core.utils.js';

// --- Module-Level Variables ---
const modal = document.getElementById('account-log-modal');
const modalBody = document.getElementById('account-log-body');
const modalTitle = document.getElementById('account-log-title');
let accountLogCurrentUserId = null; // Using one consistent name for the user ID

// --- Helper Functions ---
function showModal() {
    if (modal) modal.style.display = 'flex';
}

function hideModal() {
    if (modal) modal.style.display = 'none';
}

function exportAccountLogToCSV() {
    // [FIX] Use the consistent variable name: accountLogCurrentUserId
    const user = UserService.getUserById(accountLogCurrentUserId);
    if (!user || !user.logs) return;

    const headers = "Timestamp,Event,Details,Amount (USD),Balance After (USD)\n";
    const rows = [...user.logs].reverse().map(log => {
        let rowData;
        if (typeof log.event === 'string') {
            rowData = [
                `"${formatTimestamp(log.timestamp)}"`,
                `"${log.event}"`,
                `"${log.details}"`,
                log.amountUSD || 0,
                log.balanceAfterUSD || 0
            ];
        } else { // Fallback for old string-based logs
            rowData = [`"${formatTimestamp(log.timestamp)}"`, `"${log.action}"`, "", "", ""];
        }
        return rowData.join(',');
    }).join('\n');

    const csvData = headers + rows;
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `account_log_${user.userName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Main Exported Functions ---
export function showAccountLogModal(userId) {
    // [FIX] Use the consistent variable name: accountLogCurrentUserId
    accountLogCurrentUserId = userId; 
    const user = UserService.getUserById(userId);
    
    if (!user || !modal || !modalTitle || !modalBody) return;

    modalTitle.textContent = `Account Log for ${user.userName}`;
    
    if (!user.logs || user.logs.length === 0) {
        modalBody.innerHTML = "<p>No account activity recorded.</p>";
    } else {
        const tableRows = [...user.logs].reverse().map(log => {
            if (typeof log.event === 'string') {
                const amount = parseFloat(log.amountUSD) || 0;
                const balance = parseFloat(log.balanceAfterUSD).toFixed(6);
                const amountStyle = amount >= 0 ? 'color: var(--success-color);' : 'color: var(--error-color);';
                const amountFormatted = `${amount >= 0 ? '+' : ''}${amount.toFixed(amount >= 0 ? 2 : 8)}`;
                return `
                    <tr>
                        <td>${formatTimestamp(log.timestamp)}</td>
                        <td>${log.details}</td>
                        <td style="text-align: right; ${amountStyle}">${amountFormatted}</td>
                        <td style="text-align: right;">$${balance}</td>
                    </tr>
                `;
            } else {
                return `
                    <tr>
                        <td>${formatTimestamp(log.timestamp)}</td>
                        <td>${log.action}</td>
                        <td style="text-align: right;">-</td>
                        <td style="text-align: right;">-</td>
                    </tr>
                `;
            }
        }).join('');

        modalBody.innerHTML = `
            <div class="item-list-scrollable" style="padding: 0; max-height: 60vh;">
                <table class="activity-log-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Details</th>
                            <th style="text-align: right;">Amount (USD)</th>
                            <th style="text-align: right;">Balance (USD)</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `;
    }
    
    showModal();
}

export function initAccountLogUI() {
    const detailSection = document.getElementById('user-detail-section');
    
    detailSection?.addEventListener('click', (e) => {
        if (e.target.id === 'view-account-log-btn') {
            const userId = e.currentTarget.dataset.userId;
            if (userId) showAccountLogModal(userId);
        }
    });

    modal?.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', hideModal));
    modal?.querySelector('#export-account-log-csv-btn')?.addEventListener('click', exportAccountLogToCSV);
}