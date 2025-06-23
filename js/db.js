// --- Global Constants ---
const DB_NAME_PREFIX = 'AIChatbotDB_Project_';
const SESSIONS_STORE_NAME = 'chatSessions';
const METADATA_STORE_NAME = 'projectMetadata';
const METADATA_KEY = 'projectInfo';

// --- IndexedDB ---
async function openDb(projectId) {
    return new Promise((resolve, reject) => {
        // [STABLE VERSION] ใช้ DB version ที่สูงและแน่นอน เพื่อให้เปิดได้ทุกฐานข้อมูลเก่า
        const request = indexedDB.open(`${DB_NAME_PREFIX}${projectId}`, 5); 
        request.onupgradeneeded = e => {
            const dbInstance = e.target.result;
            // สร้าง store สำหรับ session ถ้ายังไม่มี
            if (!dbInstance.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
                dbInstance.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' });
            }
            // [STABLE VERSION] กลับมาใช้ keyPath: 'id' สำหรับ Metadata Store เพื่อความเรียบง่ายและเสถียร
            if (!dbInstance.objectStoreNames.contains(METADATA_STORE_NAME)) {
                dbInstance.createObjectStore(METADATA_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = e => { db = e.target.result; resolve(db); };
        request.onerror = e => { console.error("IndexedDB error:", e.target.error); reject(e.target.error); };
    });
}

// [STABLE VERSION] กลับไปใช้ dbRequest เวอร์ชัน 4 อาร์กิวเมนต์ที่เรียบง่าย
async function dbRequest(storeName, mode, action, data) {
     return new Promise((resolve, reject) => {
        if (!db) return reject("Database is not open.");
        try {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = store[action](data);
            request.onsuccess = e => {
                if (action === 'getAll') {
                    resolve(e.target.result || []);
                } else {
                    resolve(e.target.result || null);
                }
            }; 
            request.onerror = e => reject(e.target.error);
        } catch (error) { reject(error); }
    });
}

async function clearObjectStores(storeNames) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database is not open.");
        try {
            const transaction = db.transaction(storeNames, 'readwrite');
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(transaction.error);
            storeNames.forEach(name => {
                if (db.objectStoreNames.contains(name)) transaction.objectStore(name).clear();
            });
        } catch(error) { reject(error); }
    });
}
