//file: src/js/modules/admin/admin-reporting.ui.js

import * as UserService from '../user/user.service.js';
import * as ReportingHandlers from './admin-reporting.handlers.js';

const modal = document.getElementById('financial-report-modal');
const modalBody = document.getElementById('financial-report-body');

function showModal() { modal.style.display = 'flex'; }
function hideModal() { modal.style.display = 'none'; }

function renderReport() {
    if (!modalBody) return;

    const summary = UserService.getFinancialSummary();
    const perUserData = UserService.getPerUserFinancials();

    const perUserRows = perUserData.map(user => `
        <tr>
            <td>${user.userName}</td>
            <td>${user.plan}</td>
            <td>$${user.totalRefilledUSD.toFixed(2)}</td>
            <td>$${user.totalUsageUSD.toFixed(6)}</td>
            <td>$${user.netValue.toFixed(2)}</td>
        </tr>
    `).join('');

    modalBody.innerHTML = `
        <h4>Overall Financial Summary</h4>
        <div class="admin-billing-grid" style="margin-bottom: 20px;">
            <div><strong>Gross Revenue:</strong> $${summary.grossRevenue.toFixed(2)}</div>
            <div><strong>Total Costs:</strong> $${summary.totalCosts.toFixed(6)}</div>
            <div><strong>Net Profit/Loss:</strong> $${summary.netProfit.toFixed(2)}</div>
            <div><strong>Active Users:</strong> ${summary.activeUsers}</div>
            <div><strong>Total API Calls:</strong> ${summary.totalApiCalls.toLocaleString()}</div>
            <div><strong>Total Tokens:</strong> ${summary.totalTokensProcessed.toLocaleString()}</div>
        </div>

        <h4>Per-User Breakdown</h4>
        <div class="item-list-scrollable" style="padding: 0; max-height: 40vh;">
            <table class="activity-log-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Plan</th>
                        <th>Total Refilled</th>
                        <th>Total Usage</th>
                        <th>Net Value</th>
                    </tr>
                </thead>
                <tbody>${perUserRows}</tbody>
            </table>
        </div>
    `;
    showModal();
}

export function initAdminReportingUI() {
    document.getElementById('generate-report-btn')?.addEventListener('click', renderReport);
    modal?.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', hideModal));
    document.getElementById('export-report-csv-btn')?.addEventListener('click', ReportingHandlers.exportReportToCSV);
}