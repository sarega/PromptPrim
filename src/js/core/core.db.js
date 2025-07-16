// ===============================================
// FILE: src/js/core/core.db.js
// DESCRIPTION: เพิ่มฟังก์ชัน getDb() เพื่อให้เข้าถึง instance ของ DB ได้
// ===============================================

import { DB_NAME_PREFIX, SESSIONS_STORE_NAME, METADATA_STORE_NAME } from './core.state.js';

let db; // This remains a private variable within this module.

/**
 * Returns the currently active database instance.
 * @returns {IDBDatabase | null} The database instance or null if not open.
 */
export function getDb() {
    return db;
}

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

/**
 * [NEW & SAFER] Deletes an entire IndexedDB database by its project ID.
 * This is safer than clearing stores on Safari.
 * @param {string} projectId - The ID of the project whose database should be deleted.
 * @returns {Promise<void>}
 */
export async function deleteDb(projectId) {
    const dbName = `${DB_NAME_PREFIX}${projectId}`;
    
    // ปิดการเชื่อมต่อปัจจุบันก่อน (ถ้ามี) เพื่อให้แน่ใจว่าลบได้
    const db = getDb(); // ใช้ getDb() ที่คุณมีอยู่แล้ว
    if (db && db.name === dbName) {
        db.close();
    }

    return new Promise((resolve, reject) => {
        console.log(`[DB] Attempting to delete database: ${dbName}`);
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        
        deleteRequest.onsuccess = () => {
            console.log(`[DB] Successfully deleted database.`);
            resolve();
        };
        deleteRequest.onerror = (e) => {
            console.error('[DB] Error deleting database:', e.target.error);
            reject(e.target.error);
        };
        deleteRequest.onblocked = () => {
            console.warn('[DB] Database delete was blocked. Please reload the application.');
            // บอกให้ผู้ใช้ reload หน้าเว็บ เพราะมี connection เก่าค้างอยู่
            showCustomAlert("Could not clear old project data because a connection is still open. Please reload the page and try again.", "Error");
            reject('Database blocked');
        };
    });
}