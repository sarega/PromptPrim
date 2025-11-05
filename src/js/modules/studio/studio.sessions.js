// src/js/modules/studio/studio.sessions.js
// Utilities to persist and restore photo studio sessions for each project.

import { dbRequest } from '../../core/core.db.js';
import { SESSIONS_STORE_NAME } from '../../core/core.state.js';

// Prefix to namespace studio sessions within the chatSessions object store
function key(projectId) {
    return `studio:${projectId}`;
}

/**
 * Save a photo studio session to IndexedDB.
 * The session is stored in the `chatSessions` object store keyed by `studio:<projectId>`.
 *
 * @param {string} projectId - Current project ID
 * @param {object} data - Session data containing form, results and pending tasks
 * @returns {Promise<any>} A promise that resolves when the session is stored
 */
export async function saveStudioSession(projectId, data) {
    const item = {
        id: key(projectId),
        projectId,
        type: 'studio',
        updatedAt: Date.now(),
        ...data,
    };
    return dbRequest(SESSIONS_STORE_NAME, 'readwrite', 'put', item);
}

/**
 * Load a photo studio session from IndexedDB.
 *
 * @param {string} projectId - Project ID whose session should be loaded
 * @returns {Promise<object|null>} The saved session or null if none exists
 */
export async function loadStudioSession(projectId) {
    try {
        const result = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'get', key(projectId));
        return result || null;
    } catch (e) {
        console.warn('Failed to load studio session', e);
        return null;
    }
}