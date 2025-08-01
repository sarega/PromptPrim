//file: src/js/modules/admin/admin-activity-log.handlers.js

import * as UserService from '../user/user.service.js';
import { formatTimestamp } from '../../core/core.utils.js';

function convertToCSV(data) {
    const headers = "Timestamp,Model,PromptTokens,CompletionTokens,TotalTokens,CostUSD,Speed(TPS)\n";
    const rows = data.map(row => {
        const totalTokens = (row.promptTokens || 0) + (row.completionTokens || 0);
        const tps = (row.duration > 0) ? ((row.completionTokens || 0) / row.duration).toFixed(1) : 'N/A';
        return [
            `"${formatTimestamp(row.timestamp)}"`,
            `"${row.model}"`,
            row.promptTokens || 0,
            row.completionTokens || 0,
            totalTokens,
            (row.costUSD || 0).toFixed(8), // [FIX] Use .toFixed(8) here as well
            tps
        ].join(',')
    }).join('\n');
    return headers + rows;
}

export function exportActivityLogToCSV(userId) {
    const user = UserService.getUserById(userId);
    if (!user || !user.activityLog || user.activityLog.length === 0) {
        alert("No activity to export.");
        return;
    }

    const csvData = convertToCSV(user.activityLog);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `activity_log_${user.userName}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}