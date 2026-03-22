// [REVISED & COMPLETE] src/admin.js

import './styles/main.css';
import './styles/admin.css';

import * as UserService from './js/modules/user/user.service.js';
import { loadAllProviderModels, loadAllSystemModels } from './js/core/core.api.js';
import { stateManager } from './js/core/core.state.js';
import { initThemeSwitcher } from './js/core/core.theme.js';
import  { initCoreUI } from './js/core/core.ui.js';
import * as ModelAccessService from './js/modules/models/model-access.service.js';
import { initAdminUI } from './js/modules/admin/admin.ui.js';
import * as AdminModelManagerUI from './js/modules/admin/admin-model-manager.ui.js';
import { initAdminUserManagerUI } from './js/modules/admin/admin-user-manager.ui.js';
import { initAccountLogUI } from './js/modules/admin/admin-account-log.ui.js'; 
import { initActivityLogUI } from './js/modules/admin/admin-activity-log.ui.js';
import { initAdminAuditLogUI } from './js/modules/admin/admin-audit-log.ui.js';
import { renderBillingInfo } from './js/modules/admin/admin.ui.js';
import { initAdminReportingUI } from './js/modules/admin/admin-reporting.ui.js';
import { ensurePageAccess } from './js/modules/auth/auth.guard.js';
import * as BackendBillingSettingsService from './js/modules/billing/backend-billing-settings.service.js';

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

    const authContext = await ensurePageAccess({ requireAdmin: true });
    if (authContext?.redirected) return;
    
    await UserService.initUserSettings();
    if (authContext?.mode === 'supabase' && authContext.user) {
        await UserService.activateExternalAuthUser(authContext.user);
        try {
            await BackendBillingSettingsService.syncBackendBillingSettingsToLocalCache();
        } catch (error) {
            console.error('Could not sync backend billing settings in admin mode. Keeping local billing cache for this session.', error);
        }
    }
    
    // [CRITICAL FIX] แก้ไขชื่อฟังก์ชันที่เรียกผิด
    const systemSettings = UserService.getSystemApiSettings(); 
    const providerEnabled = systemSettings.providerEnabled || {};
    
    // [CRITICAL FIX] ส่งค่าที่ถูกต้องเข้าไปในฟังก์ชันโหลดโมเดล
    await loadAllProviderModels({ 
        apiKey: providerEnabled.openrouter !== false ? systemSettings.openrouterKey : '',
        ollamaBaseUrl: providerEnabled.ollama !== false ? systemSettings.ollamaBaseUrl : '',
        isUserKey: false 
    });
    if (authContext?.mode === 'supabase') {
        try {
            await ModelAccessService.loadManagedPlanPresets();
            const currentSystemModels = stateManager.getState().systemProviderModels || [];
            if (currentSystemModels.length === 0) {
                await ModelAccessService.loadBackendModelCatalog({ hydrateState: true });
            }
        } catch (error) {
            console.error('Could not load backend model access in admin mode. Keeping legacy preset behavior for this session.', error);
        }
    }
    
    initCoreUI(); 
    initThemeSwitcher('admin-theme-switcher');
    initAdminUI();
    AdminModelManagerUI.initAdminModelManagerUI();
    await initAdminUserManagerUI();
    initActivityLogUI(); // This call will now work correctly
    initAccountLogUI();
    initAdminAuditLogUI();
    initAdminReportingUI(); // <-- [ADD THIS]
    initCrossTabSync();

    AdminModelManagerUI.renderAdminModelManager();
    
    console.log("🎉 Admin Panel Initialized Successfully.");
}

document.addEventListener('DOMContentLoaded', initializeAdminPanel);
