// [REVISED & COMPLETE] src/admin.js

import './styles/main.css';
import './styles/admin.css';

import * as UserService from './js/modules/user/user.service.js';
import { loadAllProviderModels } from './js/core/core.api.js';
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
import { loadAllSystemModels } from './js/core/core.api.js'; // <-- Import ฟังก์ชันใหม่

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
    await loadAllSystemModels();

    const systemApiKey = UserService.getSystemApiSettings().openrouterKey;
    if (systemApiKey) {
        await loadAllProviderModels({ apiKey: systemApiKey, isUserKey: false });
    } else {
        console.warn("Admin startup: No system API key found.");
    }
    
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


