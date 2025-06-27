// ===============================================
// FILE: src/js/core/core.db.js (Corrected)
// DESCRIPTION: IndexedDB wrapper functions with correct imports.
// ===============================================

// [FIX] Importing all necessary constants from the central state file.
import { DB_NAME_PREFIX, SESSIONS_STORE_NAME, METADATA_STORE_NAME } from './core.state.js';

let db; // This remains a private variable within this module.

export async function openDb(projectId) {
    if (db && db.name === `${DB_NAME_PREFIX}${projectId}`) {
        return Promise.resolve(db);
    }
    if (db) {
        db.close();
        db = null;
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(`${DB_NAME_PREFIX}${projectId}`, 5);

        request.onupgradeneeded = e => {
            const dbInstance = e.target.result;
            if (!dbInstance.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
                dbInstance.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' });
            }
            if (!dbInstance.objectStoreNames.contains(METADATA_STORE_NAME)) {
                dbInstance.createObjectStore(METADATA_STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = e => {
            db = e.target.result;
            console.log(`IndexedDB '${db.name}' opened successfully.`);
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
            console.error(`Error performing dbRequest (${action} on ${storeName}):`, error);
            reject(error);
        }
    });
}

export async function clearObjectStores(storeNames) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database is not open.");
        try {
            const transaction = db.transaction(storeNames, 'readwrite');
            transaction.oncomplete = () => {
                console.log(`Stores cleared: ${storeNames.join(', ')}`);
                resolve();
            };
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
