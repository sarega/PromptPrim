// ===============================================
// FILE: src/js/core/core.ui.js (แก้ไขแล้ว)
// DESCRIPTION: แก้ไขฟังก์ชัน makeSidebarResizable ให้ทำงานได้อย่างถูกต้อง
// ===============================================

import { stateManager } from './core.state.js';

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

export function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = event.currentTarget.closest('.dropdown');
    // This function can be called by elements not in an '.item' context
    const parentItem = event.currentTarget.closest('.item');
    const wasOpen = dropdown.classList.contains('open');
    
    // Close all other dropdowns first
    document.querySelectorAll('.dropdown.open').forEach(d => {
        d.classList.remove('open');
        const parent = d.closest('.item');
        if (parent) parent.classList.remove('z-index-front');
    });

    if (!wasOpen) {
        dropdown.classList.add('open');
        // Add z-index class only if the dropdown is inside an item
        if (parentItem) {
            parentItem.classList.add('z-index-front');
        }
    }
}

export function applyFontSettings() {
    const project = stateManager.getProject();
    if (project?.globalSettings?.fontFamilySelect) {
        document.documentElement.style.setProperty('--main-font-family', project.globalSettings.fontFamilySelect);
    }
}

export function updateStatus({ message, state }) {
    document.getElementById('statusText').textContent = message || 'Ready';
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot'; // Reset classes
    if (state === 'connected') dot.classList.add('connected');
    else if (state === 'error') dot.classList.add('error');
    else if (state === 'loading') { /* Let the loading animation handle it */ }
}

// [REIMPLEMENTED] The full, correct logic for the resizable sidebar.
export function makeSidebarResizable() {
    const verticalResizer = document.querySelector('.sidebar-resizer');
    const horizontalResizer = document.querySelector('.sidebar-horizontal-resizer');
    const sidebar = document.querySelector('.sidebar');
    const sessionsFrame = document.querySelector('.sessions-frame');
    const memoriesFrame = document.querySelector('.memories-frame');

    if (!verticalResizer || !horizontalResizer || !sidebar || !sessionsFrame || !memoriesFrame) {
        console.warn("Resizable sidebar elements not found. Resizing will be disabled.");
        return;
    }

    let isVerticalResizing = false;
    let isHorizontalResizing = false;

    // --- Vertical Resizing (between sessions and memories) ---
    const verticalMoveHandler = (e) => {
        if (!isVerticalResizing) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const sidebarContent = document.querySelector('.sidebar-content');
        if (!sidebarContent) return;

        const sidebarRect = sidebarContent.getBoundingClientRect();
        let newHeight = clientY - sidebarRect.top;
        const totalHeight = sidebarContent.offsetHeight;

        if (newHeight < 100) newHeight = 100;
        if (newHeight > totalHeight - 100) newHeight = totalHeight - 100;
        
        const resizerHeight = verticalResizer.offsetHeight;
        sessionsFrame.style.flex = `0 1 ${newHeight}px`;
        memoriesFrame.style.flex = `1 1 ${totalHeight - newHeight - resizerHeight}px`;
    };

    const startVerticalResizing = (e) => {
        e.preventDefault();
        isVerticalResizing = true;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', verticalMoveHandler);
        window.addEventListener('touchmove', verticalMoveHandler, { passive: false });
        window.addEventListener('mouseup', stopVerticalResizing);
        window.addEventListener('touchend', stopVerticalResizing);
    };

    const stopVerticalResizing = () => {
        isVerticalResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', verticalMoveHandler);
        window.removeEventListener('touchmove', verticalMoveHandler);
        window.removeEventListener('mouseup', stopVerticalResizing);
        window.removeEventListener('touchend', stopVerticalResizing);
        localStorage.setItem('sidebarSplitHeight', sessionsFrame.style.flex);
    };

    verticalResizer.addEventListener('mousedown', startVerticalResizing);
    verticalResizer.addEventListener('touchstart', startVerticalResizing, { passive: false });

    // --- Horizontal Resizing (the whole sidebar) ---
    const horizontalMoveHandler = (e) => {
        if (!isHorizontalResizing) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let newWidth = clientX;

        if (newWidth < 250) newWidth = 250;
        if (newWidth > 600) newWidth = 600;

        // THE FIX: Use flex-basis to work with the flexbox layout
        sidebar.style.flexBasis = `${newWidth}px`;
    };

    const startHorizontalResizing = (e) => {
        e.preventDefault();
        isHorizontalResizing = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', horizontalMoveHandler);
        window.addEventListener('touchmove', horizontalMoveHandler, { passive: false });
        window.addEventListener('mouseup', stopHorizontalResizing);
        window.addEventListener('touchend', stopHorizontalResizing);
    };

    const stopHorizontalResizing = () => {
        isHorizontalResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', horizontalMoveHandler);
        window.removeEventListener('touchmove', horizontalMoveHandler);
        window.removeEventListener('mouseup', stopHorizontalResizing);
        window.removeEventListener('touchend', stopHorizontalResizing);
        localStorage.setItem('sidebarWidth', sidebar.style.flexBasis);
    };

    horizontalResizer.addEventListener('mousedown', startHorizontalResizing);
    horizontalResizer.addEventListener('touchstart', startHorizontalResizing, { passive: false });

    // Load saved dimensions
    const savedHeight = localStorage.getItem('sidebarSplitHeight');
    if (savedHeight) {
        sessionsFrame.style.flex = savedHeight;
    }
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        sidebar.style.flexBasis = savedWidth;
    }
}


export function initCoreUI() {
    // --- Subscribe to events from the stateManager to update UI ---
    stateManager.bus.subscribe('ui:applyFontSettings', applyFontSettings);
    stateManager.bus.subscribe('status:update', updateStatus);
    stateManager.bus.subscribe('dirty:changed', (isDirty) => {
        const projectTitleEl = document.getElementById('project-title');
        if (projectTitleEl) {
            const baseName = projectTitleEl.textContent.replace(' *', '');
            projectTitleEl.textContent = isDirty ? `${baseName} *` : baseName;
        }
    });

    // --- Assign Event Listeners that PUBLISH events ---
    document.querySelector('#settings-btn').addEventListener('click', toggleSettingsPanel);
    document.querySelector('.close-settings-btn').addEventListener('click', toggleSettingsPanel);
    
    // Global click listener to close dropdowns
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.open').forEach(d => {
                d.classList.remove('open');
                const parentItem = d.closest('.item');
                if (parentItem) parentItem.classList.remove('z-index-front');
            });
        }
    });

    document.querySelector('#save-project-modal .btn-secondary').addEventListener('click', hideSaveProjectModal);
    document.getElementById('alert-modal').querySelector('.btn').addEventListener('click', hideCustomAlert);

    document.querySelector('#save-project-modal .btn:not(.btn-secondary)').addEventListener('click', () => {
        const projectName = document.getElementById('project-name-input').value;
        stateManager.bus.publish('project:saveConfirm', { projectName });
    });
    
    document.querySelector('#unsaved-changes-modal .btn-secondary').addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'cancel'));
    document.querySelector('#unsaved-changes-modal .btn-danger').addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'discard'));
    document.querySelector('#unsaved-changes-modal .btn:not(.btn-secondary):not(.btn-danger)').addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'save'));

    document.getElementById('hamburger-btn').addEventListener('click', toggleMobileSidebar);
    document.getElementById('mobile-overlay').addEventListener('click', toggleMobileSidebar);
    document.getElementById('collapse-sidebar-btn').addEventListener('click', toggleSidebarCollapse);
    
    document.getElementById('load-models-btn').addEventListener('click', () => stateManager.bus.publish('api:loadModels'));
    document.getElementById('fontFamilySelect').addEventListener('change', (e) => stateManager.bus.publish('settings:fontChanged', e.target.value));
    document.getElementById('apiKey').addEventListener('change', (e) => stateManager.bus.publish('settings:apiKeyChanged', e.target.value));
    document.getElementById('ollamaBaseUrl').addEventListener('change', (e) => stateManager.bus.publish('settings:ollamaUrlChanged', e.target.value));
    
    document.getElementById('system-utility-model-select').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-prompt').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-summary-prompt').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-temperature').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    document.getElementById('system-utility-topP').addEventListener('change', () => stateManager.bus.publish('settings:systemAgentChanged'));
    
    // Connect summarization preset events
    document.getElementById('system-utility-summary-preset-select').addEventListener('change', () => stateManager.bus.publish('settings:summaryPresetChanged'));
    
    // [MODIFIED] Correctly connect the new menu buttons
    const summaryMenuBtn = document.getElementById('summary-preset-menu-btn');
    if (summaryMenuBtn) {
        summaryMenuBtn.addEventListener('click', toggleDropdown);
    }
    
    makeSidebarResizable();
    
    console.log("Core UI Initialized and Listeners Attached.");
}
