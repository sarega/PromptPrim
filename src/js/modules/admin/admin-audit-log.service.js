import * as UserService from '../user/user.service.js';
import * as BackendAccountDataService from '../billing/backend-account-data.service.js';

const ADMIN_AUDIT_DB_KEY = 'promptPrimAdminAuditLogs_v1';
const MAX_LOCAL_AUDIT_ENTRIES = 500;

function getDefaultLocalAuditEntries() {
    return [];
}

function normalizeTargetUserId(value = '') {
    return String(value || '').trim().replace(/^sb_/, '');
}

function getCurrentAdminSnapshot() {
    const profile = UserService.getCurrentUserProfile();
    return {
        userId: String(profile?.backendAccount?.userId || profile?.externalAuthUserId || profile?.userId || '').trim().replace(/^sb_/, ''),
        email: String(profile?.email || '').trim(),
        displayName: String(profile?.userName || profile?.displayName || profile?.email || 'Admin').trim()
    };
}

function readLocalAuditEntries() {
    try {
        const storedValue = localStorage.getItem(ADMIN_AUDIT_DB_KEY);
        const parsedValue = storedValue ? JSON.parse(storedValue) : getDefaultLocalAuditEntries();
        return Array.isArray(parsedValue) ? parsedValue : getDefaultLocalAuditEntries();
    } catch (_) {
        return getDefaultLocalAuditEntries();
    }
}

function writeLocalAuditEntries(entries = []) {
    localStorage.setItem(ADMIN_AUDIT_DB_KEY, JSON.stringify(entries));
}

function buildLocalAuditEntry({
    actionType = '',
    summary = '',
    targetUserId = '',
    targetEmail = '',
    targetDisplayName = '',
    metadata = {}
} = {}) {
    const adminSnapshot = getCurrentAdminSnapshot();
    return {
        id: `local_audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        timestamp: new Date().toISOString(),
        adminUserId: adminSnapshot.userId,
        adminEmail: adminSnapshot.email,
        adminDisplayName: adminSnapshot.displayName,
        actionType: String(actionType || '').trim().toLowerCase(),
        summary: String(summary || '').trim(),
        targetUserId: normalizeTargetUserId(targetUserId),
        targetEmail: String(targetEmail || '').trim(),
        targetDisplayName: String(targetDisplayName || '').trim(),
        metadata: metadata && typeof metadata === 'object' ? metadata : {}
    };
}

export function isBackendAdminAuditActive() {
    return BackendAccountDataService.isBackendAdminAuditAvailable();
}

export function recordLocalAdminAuditLog(entry = {}) {
    if (isBackendAdminAuditActive()) {
        return null;
    }

    const normalizedEntry = buildLocalAuditEntry(entry);
    if (!normalizedEntry.actionType || !normalizedEntry.summary) {
        return null;
    }

    const existingEntries = readLocalAuditEntries();
    const nextEntries = [normalizedEntry, ...existingEntries].slice(0, MAX_LOCAL_AUDIT_ENTRIES);
    writeLocalAuditEntries(nextEntries);
    return normalizedEntry;
}

export async function fetchAdminAuditLogs({ limit = 100, targetUserId = '' } = {}) {
    const normalizedTargetUserId = normalizeTargetUserId(targetUserId);

    if (isBackendAdminAuditActive()) {
        const entries = await BackendAccountDataService.fetchBackendAdminAuditLogs({
            limit,
            targetUserId: normalizedTargetUserId
        });
        return {
            source: 'backend',
            entries
        };
    }

    const filteredEntries = readLocalAuditEntries().filter((entry) => {
        if (!normalizedTargetUserId) return true;
        return normalizeTargetUserId(entry?.targetUserId) === normalizedTargetUserId;
    });

    return {
        source: 'local',
        entries: filteredEntries.slice(0, limit)
    };
}
