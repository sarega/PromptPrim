// ===============================================
// FILE: src/js/core/core.ui.js
// DESCRIPTION: 
// ===============================================

import { stateManager } from './core.state.js';


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
export function toggleSettingsPanel() { document.getElementById('settings-panel').classList.toggle('open'); }

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

export function updateStatus({ message, state }) {
    const statusText = document.getElementById('statusText');
    const dot = document.getElementById('statusDot');
    if (!statusText || !dot) return;

    statusText.textContent = message || 'Ready';
    dot.className = 'status-dot'; // รีเซ็ตคลาสสีทั้งหมด

    if (state === 'connected') {
        dot.classList.add('connected'); // สีเขียว
    } else if (state === 'error') {
        dot.classList.add('error'); // สีแดง
    } else if (state === 'loading') {
        // [FIX] เพิ่ม state 'loading' เพื่อแสดงผลเป็นสีส้ม
        dot.classList.add('warning');
    }
}

export function initCoreUI() {
    // Display the app version from environment variables provided by Vite.
    const versionSpan = document.getElementById('app-version');
    if (versionSpan) {
        versionSpan.textContent = import.meta.env.VITE_APP_VERSION || 'N/A';
    }

    // Subscriptions
    stateManager.bus.subscribe('ui:applyFontSettings', applyFontSettings);
    stateManager.bus.subscribe('status:update', updateStatus);

    // Core Event Listeners
    document.querySelector('#settings-btn').addEventListener('click', toggleSettingsPanel);
    document.querySelector('.close-settings-btn').addEventListener('click', toggleSettingsPanel);
    // document.getElementById('collapse-sidebar-btn').addEventListener('click', toggleSidebarCollapse);
    
    // Mobile UI Listeners

    const mobileOverlay = document.getElementById('mobile-overlay');
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', toggleMobileSidebar);
    }
    
    // Modal Close Buttons
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
export function createSearchableModelSelector(wrapperId, initialModelId, onSelect) {
    const wrapper = document.getElementById(wrapperId);
    // [FIX] เพิ่มการตรวจสอบว่า wrapper มีจริงหรือไม่ ก่อนจะทำงานต่อ
    if (!wrapper) {
        console.error(`Searchable selector wrapper with ID "${wrapperId}" not found.`);
        return;
    }

    // ป้องกันการ attach listener ซ้ำซ้อน
    if (wrapper.dataset.initialized) return;

    const searchInput = wrapper.querySelector('input[type="text"]');
    const valueInput = wrapper.querySelector('input[type="hidden"]');
    const optionsContainer = wrapper.querySelector('.searchable-select-options');
    if (!searchInput || !valueInput || !optionsContainer) return;

    const allModels = stateManager.getState().allProviderModels || [];

    const renderOptions = (modelsToRender) => {
        optionsContainer.innerHTML = '';
        if (modelsToRender.length === 0) {
            optionsContainer.innerHTML = `<div class="searchable-option-item">No models found.</div>`;
            return;
        }
        modelsToRender.forEach(model => {
            const item = document.createElement('div');
            item.className = 'searchable-option-item';
            item.dataset.value = model.id;
            item.innerHTML = `${model.name} <small>${model.id}</small>`;
            item.addEventListener('click', () => {
                searchInput.value = model.name;
                valueInput.value = model.id;
                optionsContainer.classList.add('hidden');
                if(onSelect) onSelect(model.id); // Call the provided callback
            });
            optionsContainer.appendChild(item);
        });
    };

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filtered = allModels.filter(m => m.name.toLowerCase().includes(searchTerm) || m.id.toLowerCase().includes(searchTerm));
        renderOptions(filtered);

        // [CRITICAL FIX] ถ้าช่องค้นหาว่าง ให้แสดงรายการทั้งหมดอีกครั้ง
        if (searchTerm === '') {
            renderOptions(allModels);
        }
    });

    searchInput.addEventListener('focus', () => {
        renderOptions(allModels);
        optionsContainer.classList.remove('hidden');
    });

    // ตั้งค่าเริ่มต้น
    const currentModel = allModels.find(m => m.id === initialModelId);
    if (currentModel) {
        searchInput.value = currentModel.name;
        valueInput.value = currentModel.id;
    } else {
        searchInput.value = '';
        valueInput.value = '';
    }

    wrapper.dataset.initialized = 'true';
}