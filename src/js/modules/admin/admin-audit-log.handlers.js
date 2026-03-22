import * as AdminAuditLogService from './admin-audit-log.service.js';
import { formatTimestamp } from '../../core/core.utils.js';

function convertAuditRowsToCSV(rows = []) {
    const headers = 'Timestamp,Admin,Action,Target,Summary,Metadata\n';
    const body = rows.map((row) => {
        const targetLabel = [
            row.targetDisplayName || '',
            row.targetEmail || ''
        ].filter(Boolean).join(' ');

        return [
            `"${formatTimestamp(row.timestamp)}"`,
            `"${String(row.adminEmail || '').replace(/"/g, '""')}"`,
            `"${String(row.actionType || '').replace(/"/g, '""')}"`,
            `"${String(targetLabel || '').replace(/"/g, '""')}"`,
            `"${String(row.summary || '').replace(/"/g, '""')}"`,
            `"${JSON.stringify(row.metadata || {}).replace(/"/g, '""')}"`
        ].join(',');
    }).join('\n');

    return headers + body;
}

export async function exportAdminAuditLogToCSV({ targetUserId = '', targetLabel = '' } = {}) {
    const auditPayload = await AdminAuditLogService.fetchAdminAuditLogs({
        limit: 500,
        targetUserId
    });
    const auditRows = auditPayload.entries || [];

    if (auditRows.length === 0) {
        alert('No audit entries to export.');
        return;
    }

    const csvData = convertAuditRowsToCSV(auditRows);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const suffix = String(targetLabel || '').trim().replace(/\s+/g, '_').toLowerCase() || 'all';
    link.setAttribute('href', url);
    link.setAttribute('download', `admin_audit_log_${suffix}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
