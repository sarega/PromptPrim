// ===============================================
// FILE: src/js/core/core.ui.js
// DESCRIPTION: 
// ===============================================

import { stateManager } from './core.state.js';
import * as SettingsUI from '../modules/settings/settings.ui.js';
import * as UserService from '../modules/user/user.service.js';
import { getContextData } from '../modules/chat/chat.handlers.js';

export function updateAppStatus(statusUpdate = {}) {
    const { message, state } = statusUpdate;

    // --- Part 1: Update Left Side (Dot, Model Count, Text) ---
    const statusTextEl = document.getElementById('statusText');
    const statusDotEl = document.getElementById('statusDot');
    const modelStatusSpan = document.getElementById('model-count-status');
    
    if (statusTextEl && statusDotEl && modelStatusSpan) {
        // Update dot and text
        statusTextEl.textContent = message || 'Ready';
        statusDotEl.className = 'status-dot'; // Reset class
        
        const currentState = state || 'connected';
        if (currentState === 'connected') {
            statusDotEl.classList.add('connected');
        } else if (currentState === 'error') {
            statusDotEl.classList.add('error');
        } else if (currentState === 'loading') {
            statusDotEl.classList.add('warning');
        }

        // Update model count
        const allowedModels = UserService.getAllowedModelsForCurrentUser();
        modelStatusSpan.textContent = `${allowedModels.length} Models`;
    }

    // --- Part 2: Update Right Side (Agent, Tokens) ---
    const { totalTokens, agent, agentNameForDisplay } = getContextData();
    const agentStatusSpan = document.getElementById('active-agent-status');
    const tokenStatusSpan = document.getElementById('token-count-status');

    if (agentStatusSpan) agentStatusSpan.textContent = `Active: ${agent.icon || ''} ${agentNameForDisplay}`;
    if (tokenStatusSpan) tokenStatusSpan.textContent = `~${totalTokens.toLocaleString()} Tokens`;
}

export function updateStatus({ message, state }) {
    const statusTextEl = document.getElementById('statusText');
    const statusDotEl = document.getElementById('statusDot');

    if (statusTextEl && statusDotEl) {
        statusTextEl.textContent = message || 'Ready';
        statusDotEl.className = 'status-dot'; // Reset class
        
        const currentState = state || 'connected';
        if (currentState === 'connected') {
            statusDotEl.classList.add('connected');
        } else if (currentState === 'error') {
            statusDotEl.classList.add('error');
        } else if (currentState === 'loading') {
            statusDotEl.classList.add('warning');
        }
    }
}

/**
 * Creates a reusable dropdown menu component.
 * @param {Array<object>} options - An array of option objects.
 * Each object should have: { label: string, action: string, data?: object, isDestructive?: boolean }
 * @returns {HTMLElement} The created dropdown element.
 */
export function createDropdown(options) {
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown align-right';

    const button = document.createElement('button');
    button.className = 'btn-icon';
    button.innerHTML = '&#8942;';
    button.title = 'More options';
    // [CRITICAL FIX] เพิ่มบรรทัดนี้เพื่อให้ Event Listener รู้ว่าต้องทำอะไร
    button.dataset.action = 'toggle-menu';

    const content = document.createElement('div');
    content.className = 'dropdown-content';

    // ... โค้ดส่วนที่เหลือของฟังก์ชันเหมือนเดิมทุกประการ ...
    
    options.forEach(opt => {
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = opt.label;
        if (opt.isDestructive) {
            link.classList.add('is-destructive');
        }
        link.dataset.action = opt.action;
        if (opt.data) {
            link.dataset.data = JSON.stringify(opt.data);
        }
        content.appendChild(link);
    });

    dropdown.append(button, content);
    return dropdown;
}

// --- Exported UI Functions ---
export function showSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'flex';
}

export function hideSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
}

export function showSaveProjectModal() {
    const project = stateManager.getProject();
    document.getElementById('project-name-input').value = (project.name === "Untitled Project") ? "" : project.name;
    document.getElementById('save-project-modal').style.display = 'flex';
}

export function hideSaveProjectModal() { document.getElementById('save-project-modal').style.display = 'none'; }
export function showUnsavedChangesModal() { document.getElementById('unsaved-changes-modal').style.display = 'flex'; }
export function hideUnsavedChangesModal() { document.getElementById('unsaved-changes-modal').style.display = 'none'; }

export function showCustomAlert(message, title = 'Notification') {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-message').textContent = message;
    document.getElementById('alert-modal').style.display = 'flex';
}

export function hideCustomAlert() { document.getElementById('alert-modal').style.display = 'none'; }

export function toggleMobileSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('active');
}

export function toggleSidebarCollapse() { document.querySelector('.app-wrapper').classList.toggle('sidebar-collapsed'); }
// -- simplify
export function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = event.target.closest('.dropdown');
    if (!dropdown) return;

    const content = dropdown.querySelector('.dropdown-content');
    const wasOpen = dropdown.classList.contains('open');

    // ปิด Dropdown อื่นๆ ทั้งหมดก่อนเสมอ
    document.querySelectorAll('.dropdown.open').forEach(d => {
        if (d !== dropdown) {
            d.classList.remove('open');
        }
    });

    // [REVERT] ถ้าเมนูกำลังจะถูกเปิด ให้คำนวณทิศทาง
    if (!wasOpen) {
        // ทำให้เมนูมองเห็นได้ชั่วคราวเพื่อวัดขนาดที่แท้จริง
        content.style.visibility = 'hidden';
        content.style.display = 'block';
        const menuHeight = content.offsetHeight;
        // คืนค่าการแสดงผลกลับไปเหมือนเดิม
        content.style.visibility = '';
        content.style.display = '';

        const buttonRect = event.target.closest('button').getBoundingClientRect();
        const spaceBelow = window.innerHeight - buttonRect.bottom;

        // ถ้าพื้นที่ด้านล่างไม่พอ และพื้นที่ด้านบนมีมากกว่า ให้เพิ่มคลาส .opens-up
        if (spaceBelow < menuHeight && buttonRect.top > menuHeight) {
            content.classList.add('opens-up');
        } else {
            // ถ้าพื้นที่พอ ให้ลบคลาสออกเสมอ
            content.classList.remove('opens-up');
        }
    }

    // สลับการแสดงผลของเมนูที่ถูกคลิก
    dropdown.classList.toggle('open');
}

// [NEW] เพิ่ม Listener กลางสำหรับปิด Dropdown เมื่อคลิกนอกพื้นที่
// เราจะเรียกใช้ฟังก์ชันนี้เพียงครั้งเดียวใน main.js
export function initGlobalDropdownListener() {
    document.addEventListener('click', (e) => {
        // --- Part 1: Handle old-style dropdowns with .open class ---
        const openDropdown = document.querySelector('.dropdown.open');
        if (openDropdown && !openDropdown.contains(e.target)) {
            openDropdown.classList.remove('open');
        }

        // --- Part 2: Handle new searchable selectors ---
        // Find any searchable select that is currently showing its options
        const activeSearchableSelect = document.querySelector('.searchable-select-wrapper .searchable-select-options:not(.hidden)');
        if (activeSearchableSelect) {
            // Find the parent wrapper of this specific options container
            const wrapper = activeSearchableSelect.closest('.searchable-select-wrapper');
            // If the click was outside of its parent wrapper, hide the options
            if (wrapper && !wrapper.contains(e.target)) {
                activeSearchableSelect.classList.add('hidden');
            }
        }
    });
}

export function applyFontSettings() {
    const project = stateManager.getProject();
    if (project?.globalSettings?.fontFamilySelect) {
        document.documentElement.style.setProperty('--main-font-family', project.globalSettings.fontFamilySelect);
    }
}

export function initCoreUI() {
    const versionSpan = document.getElementById('app-version');
    if (versionSpan) {
        versionSpan.textContent = import.meta.env.VITE_APP_VERSION || 'N/A';
    }

    stateManager.bus.subscribe('ui:applyFontSettings', applyFontSettings);
    // [FIX] All status-related events are now subscribed here to the single update function.
    // stateManager.bus.subscribe('status:update', (data) => updateAppStatus(data));
    stateManager.bus.subscribe('session:loaded', () => updateAppStatus());
    stateManager.bus.subscribe('entity:selected', () => updateAppStatus());
    stateManager.bus.subscribe('user:settingsUpdated', () => updateAppStatus());
    stateManager.bus.subscribe('user:modelsLoaded', () => updateAppStatus());
    stateManager.bus.subscribe('status:update', updateStatus);
    updateStatus({});

    const settingsBtn = document.querySelector('#settings-btn');
    if (settingsBtn) {
        // [FIX] Force a re-render every time the settings button is clicked
        settingsBtn.addEventListener('click', () => {
            console.log("Settings button clicked. Re-rendering panel before showing.");
            // This ensures the settings panel always has the latest user data and model lists.
            SettingsUI.renderAndShowSettings();
        });
    }

    const mobileOverlay = document.getElementById('mobile-overlay');
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', toggleMobileSidebar);
    }

    const alertCloseBtn = document.querySelector('#alert-modal .btn');
    if(alertCloseBtn) {
        alertCloseBtn.addEventListener('click', hideCustomAlert);
    }

    const unsavedModal = document.getElementById('unsaved-changes-modal');
    if (unsavedModal) {
        const saveBtn = unsavedModal.querySelector('.btn:not(.btn-secondary):not(.btn-danger)');
        if(saveBtn) saveBtn.addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'save'));

        const discardBtn = unsavedModal.querySelector('.btn-danger');
        if(discardBtn) discardBtn.addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'discard'));

        const cancelBtn = unsavedModal.querySelector('.btn-secondary');
        if(cancelBtn) cancelBtn.addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'cancel'));
    }

    console.log("Core UI Initialized and Listeners Attached.");
}

/**
 * Creates and displays a custom context menu at the specified coordinates.
 * @param {Array<object>} options - Array of menu item objects. e.g., [{ label: 'Copy', action: () => {} }]
 * @param {MouseEvent|TouchEvent} event - The event that triggered the menu.
 */
export function showContextMenu(options, event) {
    // Remove any existing context menus to prevent duplicates
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    event.preventDefault();
    event.stopPropagation();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const list = document.createElement('ul');

    options.forEach(option => {
        const item = document.createElement('li');
        item.textContent = option.label;
        if (option.isDestructive) {
            item.classList.add('destructive');
        }
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            option.action();
            // The menu will be closed by the global listener
        });
        list.appendChild(item);
    });

    menu.appendChild(list);
    document.body.appendChild(menu);

    // Position the menu carefully, ensuring it doesn't go off-screen
    const { clientX, clientY } = (event.touches) ? event.touches[0] : event;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let top = clientY;
    let left = clientX;

    if (clientX + menuWidth > screenWidth) {
        left = screenWidth - menuWidth - 10; // Adjust to not touch the edge
    }
    if (clientY + menuHeight > screenHeight) {
        top = screenHeight - menuHeight - 10; // Adjust to not touch the edge
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    // By wrapping the style change that triggers the transition in a
    // requestAnimationFrame, we ensure the browser has processed the
    // initial state (opacity: 0 from CSS) before transitioning to the final state.
    requestAnimationFrame(() => {
        menu.style.opacity = '1';
        menu.style.transform = 'scale(1)';
    });
    // Close menu when clicking anywhere else on the page
    const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu, true);
    };
    
    // Use a timeout to allow the current event to finish before attaching the listener
    setTimeout(() => {
        document.addEventListener('click', closeMenu, true);
    }, 0);
}

/**
 * [NEW & REUSABLE] Creates a searchable model selector component.
 * @param {string} wrapperId - The ID of the main container div for the selector.
 * @param {string} initialModelId - The ID of the model that should be selected initially.
 * @param {function(string):void} onSelect - The callback function to run when a model is selected. It receives the model ID.
 */
export function createSearchableModelSelector(wrapperId, initialModelId, modelsToShow) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    // [FIX] ใช้ modelsToShow (ลิสต์ที่กรองแล้ว) ที่รับเข้ามาเป็นแหล่งข้อมูลหลัก
    // ถ้าไม่ได้รับมา (เป็น undefined) ให้ใช้ allProviderModels จาก State เป็น Fallback
    const allModels = modelsToShow !== undefined ? modelsToShow : (stateManager.getState().allProviderModels || []);

    const searchInput = wrapper.querySelector('input[type="text"]');
    const valueInput = wrapper.querySelector('input[type="hidden"]');
    const optionsContainer = wrapper.querySelector('.searchable-select-options');
    if (!searchInput || !valueInput || !optionsContainer) return;
    
    const renderOptions = (modelsToRender) => {
        optionsContainer.innerHTML = '';
        if (modelsToRender.length === 0) {
            optionsContainer.innerHTML = `<div class="searchable-option-item">No models found for this preset.</div>`;
            return;
        }
        modelsToRender.forEach(model => {
            const item = document.createElement('div');
            item.className = 'searchable-option-item';
            item.dataset.value = model.id;
            item.innerHTML = `${model.name} &nbsp;•&nbsp; <small>${model.id}</small>`;
            item.addEventListener('click', () => {
                searchInput.value = model.name;
                valueInput.value = model.id;
                optionsContainer.classList.add('hidden');
                // ส่ง 'change' event เพื่อให้ handler ของ settings บันทึกค่าได้
                valueInput.dispatchEvent(new Event('change', { bubbles: true }));
            });
            optionsContainer.appendChild(item);
        });
    };

    // --- Event Listeners and Initial Setup (Logic remains the same but uses the correct `allModels` list) ---

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = allModels.filter(m => m.name.toLowerCase().includes(searchTerm) || m.id.toLowerCase().includes(searchTerm));
        renderOptions(filtered);
    });

    searchInput.addEventListener('focus', () => {
        renderOptions(allModels);
        optionsContainer.classList.remove('hidden');
    });

    const currentModel = allModels.find(m => m.id === initialModelId);
    if (currentModel) {
        searchInput.value = currentModel.name;
        valueInput.value = currentModel.id;
    } else {
        searchInput.value = '';
        valueInput.value = '';
    }
    
    // ตั้งค่า listener เพียงครั้งเดียว
    if (!wrapper.dataset.initialized) {
        wrapper.dataset.initialized = 'true';
    }
}