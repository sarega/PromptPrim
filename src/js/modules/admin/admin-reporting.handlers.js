// file: src/js/modules/admin/admin-reporting.handlers.js

import * as UserService from '../user/user.service.js';
import * as BackendAccountDataService from '../billing/backend-account-data.service.js';

function convertToCSV(summary, perUserData) {
    let csv = "Metric,Value\n";
    csv += `Subscription Revenue,$${summary.subscriptionRevenue.toFixed(2)}\n`;
    csv += `Top-up Revenue,$${summary.topupRevenue.toFixed(2)}\n`;
    csv += `Gross Revenue,$${summary.grossRevenue.toFixed(2)}\n`;
    csv += `Total API Costs,$${summary.totalCosts.toFixed(6)}\n`;
    csv += `Net Profit/Loss,$${summary.netProfit.toFixed(2)}\n`;
    csv += `Active Users,${summary.activeUsers}\n`;
    csv += `Total API Calls,${summary.totalApiCalls}\n`;
    csv += `Total Tokens Processed,${summary.totalTokensProcessed.toLocaleString()}\n\n`;

    csv += "User,Plan,Subscription Revenue (USD),Top-up Revenue (USD),Total Revenue (USD),Total Usage (USD),Net Value (USD)\n";
    perUserData.forEach(user => {
        csv += `"${user.userName}",${user.plan},${user.subscriptionRevenueUSD.toFixed(2)},${user.topupRevenueUSD.toFixed(2)},${user.totalRevenueUSD.toFixed(2)},${user.totalUsageUSD.toFixed(6)},${user.netValue.toFixed(2)}\n`;
    });

    return csv;
}

export async function exportReportToCSV() {
    let summary;
    let perUserData;

    if (BackendAccountDataService.isBackendAccountDataAvailable()) {
        try {
            const reportData = await BackendAccountDataService.fetchBackendFinancialReport();
            summary = reportData.summary;
            perUserData = reportData.perUser;
        } catch (error) {
            console.error('Could not load backend report export. Falling back to local report.', error);
        }
    }

    if (!summary || !perUserData) {
        summary = UserService.getFinancialSummary();
        perUserData = UserService.getPerUserFinancials();
    }
    
    const csvData = convertToCSV(summary, perUserData);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `financial_report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
