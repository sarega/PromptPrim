// ===============================================
// FILE: src/js/core/core.db.js (Complete)
// DESCRIPTION: IndexedDB wrapper functions.
// ===============================================

import { DB_NAME_PREFIX } from './core.state.js';

let db; // This remains a private variable within this module.

export async function openDb(projectId) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(`${DB_NAME_PREFIX}${projectId}`, 5);
        request.onupgradeneeded = e => {
            const dbInstance = e.target.result;
            if (!dbInstance.objectStoreNames.contains('chatSessions')) {
                dbInstance.createObjectStore('chatSessions', { keyPath: 'id' });
            }
            if (!dbInstance.objectStoreNames.contains('projectMetadata')) {
                dbInstance.createObjectStore('projectMetadata', { keyPath: 'id' });
            }
        };
        request.onsuccess = e => {
            db = e.target.result; // Assign to the private 'db' variable
            resolve(db);
        };
        request.onerror = e => {
            console.error("IndexedDB error:", e.target.error);
            reject(e.target.error);
        };
    });
}

export async function dbRequest(storeName, mode, action, data) {
     return new Promise((resolve, reject) => {
        if (!db) {
            console.error("dbRequest called before DB was opened.");
            return reject("Database is not open.");
        }
        try {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = store[action](data);
            request.onsuccess = e => resolve(e.target.result || (action === 'getAll' ? [] : null));
            request.onerror = e => reject(e.target.error);
        } catch (error) {
            reject(error);
        }
    });
}

export async function clearObjectStores(storeNames) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database is not open.");
        try {
            const transaction = db.transaction(storeNames, 'readwrite');
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(transaction.error);
            storeNames.forEach(name => {
                if (db.objectStoreNames.contains(name)) {
                    transaction.objectStore(name).clear();
                }
            });
        } catch(error) {
            reject(error);
        }
    });
}
