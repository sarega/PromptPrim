// ===============================================
// FILE: src/js/core/core.ui.js (แก้ไขสมบูรณ์)
// DESCRIPTION: เรียกใช้ makeSidebarResizable() เพื่อให้ resizer กลับมาทำงาน
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
    const parentItem = event.currentTarget.closest('.item');
    const wasOpen = dropdown.classList.contains('open');
    
    document.querySelectorAll('.dropdown.open').forEach(d => {
        d.classList.remove('open');
        const parent = d.closest('.item');
        if (parent) parent.classList.remove('z-index-front');
    });

    if (!wasOpen) {
        dropdown.classList.add('open');
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
    dot.className = 'status-dot';
    if (state === 'connected') dot.classList.add('connected');
    else if (state === 'error') dot.classList.add('error');
}

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

    const horizontalMoveHandler = (e) => {
        if (!isHorizontalResizing) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let newWidth = clientX;

        if (newWidth < 250) newWidth = 250;
        if (newWidth > 600) newWidth = 600;

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
    // Subscriptions
    stateManager.bus.subscribe('ui:applyFontSettings', applyFontSettings);
    stateManager.bus.subscribe('status:update', updateStatus);

    // Core Event Listeners
    document.querySelector('#settings-btn').addEventListener('click', toggleSettingsPanel);
    document.querySelector('.close-settings-btn').addEventListener('click', toggleSettingsPanel);
    document.getElementById('collapse-sidebar-btn').addEventListener('click', toggleSidebarCollapse);
    
    // Mobile UI Listeners
    const hamburgerBtn = document.getElementById('hamburger-btn');
    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', toggleMobileSidebar);
    }
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
    
    // [FIX] Call the resizer setup function
    makeSidebarResizable();
    
    console.log("Core UI Initialized and Listeners Attached.");
}
