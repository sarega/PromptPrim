import * as AdminAuditLogHandlers from './admin-audit-log.handlers.js';
import * as AdminUserDirectoryService from './admin-user-directory.service.js';
import * as AdminAuditLogService from './admin-audit-log.service.js';
import * as UserService from '../user/user.service.js';
import { formatTimestamp } from '../../core/core.utils.js';

const modal = document.getElementById('admin-audit-log-modal');
const modalBody = document.getElementById('admin-audit-log-body');
const modalTitle = document.getElementById('admin-audit-log-title');

let currentAuditTargetUserId = '';
let currentAuditTargetLabel = '';

function showModal() {
    if (modal) modal.style.display = 'flex';
}

function hideModal() {
    if (modal) modal.style.display = 'none';
}

function escapeHtml(value = '') {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatActionLabel(actionType = '') {
    const normalizedActionType = String(actionType || '').trim().toLowerCase();
    switch (normalizedActionType) {
        case 'user_account_updated':
            return 'Account Updated';
        case 'user_account_deleted':
            return 'User Deleted';
        case 'billing_settings_updated':
            return 'Billing Updated';
        default:
            return normalizedActionType
                .split('_')
                .filter(Boolean)
                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ') || 'Audit Event';
    }
}

function getActionTone(actionType = '') {
    const normalizedActionType = String(actionType || '').trim().toLowerCase();
    if (normalizedActionType.includes('deleted')) return 'is-danger';
    if (normalizedActionType.includes('billing')) return 'is-warning';
    return 'is-info';
}

function resolveUserLabel(userId = '') {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return '';
    const user = AdminUserDirectoryService.getAdminVisibleUserById(normalizedUserId)
        || UserService.getUserById(normalizedUserId)
        || AdminUserDirectoryService.getAdminVisibleUserById(`sb_${normalizedUserId}`)
        || UserService.getUserById(`sb_${normalizedUserId}`);
    return user?.userName || user?.email || '';
}

export async function showAdminAuditLogModal({ targetUserId = '', targetLabel = '' } = {}) {
    currentAuditTargetUserId = String(targetUserId || '').trim().replace(/^sb_/, '');
    currentAuditTargetLabel = String(
        targetLabel
        || resolveUserLabel(targetUserId)
        || ''
    ).trim();

    if (!modal || !modalBody || !modalTitle) return;

    modalTitle.textContent = currentAuditTargetLabel
        ? `Admin Audit for ${currentAuditTargetLabel}`
        : 'Admin Audit Trail';

    modalBody.innerHTML = '<p class="admin-inline-note is-loading">Loading audit entries...</p>';
    showModal();

    try {
        const auditPayload = await AdminAuditLogService.fetchAdminAuditLogs({
            limit: 100,
            targetUserId: currentAuditTargetUserId
        });
        const auditEntries = auditPayload.entries || [];
        const source = auditPayload.source || 'local';

        if (auditEntries.length === 0) {
            modalBody.innerHTML = currentAuditTargetLabel
                ? `<p>No admin audit entries found for ${escapeHtml(currentAuditTargetLabel)}.</p>`
                : '<p>No admin audit entries recorded yet.</p>';
            return;
        }

        const tableRows = auditEntries.map((entry) => {
            const targetLabel = [entry.targetDisplayName, entry.targetEmail].filter(Boolean).join(' ');
            return `
                <tr>
                    <td>${escapeHtml(formatTimestamp(entry.timestamp))}</td>
                    <td>${escapeHtml(entry.adminEmail || 'Admin')}</td>
                    <td>
                        <span class="audit-action-pill ${getActionTone(entry.actionType)}">
                            ${escapeHtml(formatActionLabel(entry.actionType))}
                        </span>
                    </td>
                    <td>${escapeHtml(targetLabel || 'System')}</td>
                    <td class="audit-summary-cell">${escapeHtml(entry.summary || '-')}</td>
                </tr>
            `;
        }).join('');

        modalBody.innerHTML = `
            <div class="admin-audit-toolbar">
                <p class="admin-inline-note">
                    ${currentAuditTargetLabel
                        ? `Showing admin actions for ${escapeHtml(currentAuditTargetLabel)}.`
                        : 'Showing the latest admin account and billing control changes.'}
                </p>
                <p class="admin-inline-note">
                    ${source === 'backend'
                        ? 'Source: Supabase audit log.'
                        : 'Source: local development audit log.'}
                </p>
            </div>
            <div class="item-list-scrollable" style="padding: 0; max-height: 60vh;">
                <table class="activity-log-table admin-audit-table">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Admin</th>
                            <th>Action</th>
                            <th>Target</th>
                            <th>Summary</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `;
    } catch (error) {
        modalBody.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : 'Could not load admin audit logs.')}</p>`;
    }
}

export function initAdminAuditLogUI() {
    document.getElementById('view-audit-log-btn')?.addEventListener('click', () => {
        showAdminAuditLogModal().catch((error) => {
            console.error('Could not load the admin audit log modal.', error);
        });
    });

    modal?.querySelectorAll('.modal-close-btn').forEach((button) => {
        button.addEventListener('click', hideModal);
    });

    document.getElementById('export-admin-audit-csv-btn')?.addEventListener('click', () => {
        AdminAuditLogHandlers.exportAdminAuditLogToCSV({
            targetUserId: currentAuditTargetUserId,
            targetLabel: currentAuditTargetLabel || 'all'
        }).catch((error) => {
            console.error('Could not export the admin audit log CSV.', error);
        });
    });
}
