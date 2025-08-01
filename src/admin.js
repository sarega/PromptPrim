// [REVISED & COMPLETE] src/admin.js

import './styles/main.css';
import './styles/admin.css';

import * as UserService from './js/modules/user/user.service.js';
import { loadAllProviderModels, loadAllSystemModels } from './js/core/core.api.js';
import { stateManager } from './js/core/core.state.js';
import { initThemeSwitcher } from './js/core/core.theme.js';
import  { initCoreUI } from './js/core/core.ui.js';
import { initAdminUI } from './js/modules/admin/admin.ui.js';
import * as AdminModelManagerUI from './js/modules/admin/admin-model-manager.ui.js';
import { initAdminUserManagerUI } from './js/modules/admin/admin-user-manager.ui.js';
import { initAccountLogUI } from './js/modules/admin/admin-account-log.ui.js'; 
import { initActivityLogUI } from './js/modules/admin/admin-activity-log.ui.js';
import { renderBillingInfo } from './js/modules/admin/admin.ui.js';
import { initAdminReportingUI } from './js/modules/admin/admin-reporting.ui.js';

function initCrossTabSync() {
    window.addEventListener('storage', (event) => {
        // [FIX] Check for changes in EITHER the user database OR the billing database
        if (event.key === 'promptPrimUserDatabase_v1') {
            console.log("Admin cross-tab sync: User database updated. Reloading services...");
            UserService.reloadDatabaseFromStorage();
        }
        if (event.key === 'promptPrimAdminBilling_v1') {
            console.log("Admin cross-tab sync: Billing data updated. Re-rendering billing info...");
            // When billing data changes, just re-render the billing section
            renderBillingInfo();
        }
    });
}

async function initializeAdminPanel() {
    console.log("🚀 Admin Panel Initializing...");
    document.body.classList.add('admin-page');
    
    await UserService.initUserSettings();
    
    // [CRITICAL FIX] แก้ไขชื่อฟังก์ชันที่เรียกผิด
    const systemSettings = UserService.getSystemApiSettings(); 
    
    // [CRITICAL FIX] ส่งค่าที่ถูกต้องเข้าไปในฟังก์ชันโหลดโมเดล
    await loadAllProviderModels({ 
        apiKey: systemSettings.openrouterKey, 
        ollamaBaseUrl: systemSettings.ollamaBaseUrl,
        isUserKey: false 
    });
    
    initCoreUI(); 
    initThemeSwitcher('admin-theme-switcher');
    initAdminUI();
    AdminModelManagerUI.initAdminModelManagerUI();
    initAdminUserManagerUI();
    initActivityLogUI(); // This call will now work correctly
    initAccountLogUI();
    initAdminReportingUI(); // <-- [ADD THIS]
    initCrossTabSync();

    AdminModelManagerUI.renderAdminModelManager();
    
    console.log("🎉 Admin Panel Initialized Successfully.");
}

document.addEventListener('DOMContentLoaded', initializeAdminPanel);


