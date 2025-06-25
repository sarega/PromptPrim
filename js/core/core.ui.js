// js/core/core.ui.js

function toggleSettingsPanel() { document.getElementById('settings-panel').classList.toggle('open'); }
function showSaveProjectModal() {
    const project = stateManager.getProject();
    document.getElementById('project-name-input').value = (project.name === "Untitled Project") ? "" : project.name;
    document.getElementById('save-project-modal').style.display = 'flex';
}
function hideSaveProjectModal() { document.getElementById('save-project-modal').style.display = 'none'; }
function showUnsavedChangesModal() { document.getElementById('unsaved-changes-modal').style.display = 'flex'; }
function hideUnsavedChangesModal() { document.getElementById('unsaved-changes-modal').style.display = 'none'; }
function showCustomAlert(message, title = 'Notification') {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-message').textContent = message;
    document.getElementById('alert-modal').style.display = 'flex';
}
function hideCustomAlert() { document.getElementById('alert-modal').style.display = 'none'; }
function toggleMobileSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('active');
}
function toggleSidebarCollapse() { document.querySelector('.app-wrapper').classList.toggle('sidebar-collapsed'); }
function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = event.currentTarget.closest('.dropdown');
    const wasOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    if (!wasOpen) dropdown.classList.add('open');
}

function applyFontSettings() {
    const project = stateManager.getProject();
    if (project && project.globalSettings) {
        document.documentElement.style.setProperty('--main-font-family', project.globalSettings.fontFamilySelect);
    }
}

function updateStatus({ message, state }) {
    // FIX: เปลี่ยน selector ให้ตรงกับ class ที่เราเพิ่มใน HTML
    const statusText = document.querySelector('#statusText.status-text-content'); 
    const statusDot = document.getElementById('statusDot');
    
    if (!statusText || !statusDot) {
        // console.warn("Status UI elements not found.");
        return;
    }

    statusText.textContent = message || 'Ready';
    statusDot.className = 'status-dot'; // Reset class
    if (state === 'connected') {
        statusDot.classList.add('connected');
    } else if (state === 'error') {
        statusDot.classList.add('error');
    }
}


function makeSidebarResizable() {
    // This function for desktop resizing remains unchanged.
    const verticalResizer = document.querySelector('.sidebar-resizer');
    const horizontalResizer = document.querySelector('.sidebar-horizontal-resizer');
    if (!verticalResizer || !horizontalResizer) return; // Exit if not in desktop view

    const sidebar = document.querySelector('.sidebar');
    const sessionsFrame = document.querySelector('.sessions-frame');
    const memoriesFrame = document.querySelector('.memories-frame');
    let isVerticalResizing = false;
    let isHorizontalResizing = false;

    // Vertical resizing logic...
    const verticalMoveHandler = (e) => {
        if (!isVerticalResizing) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const sidebarContent = document.querySelector('.sidebar-content');
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
        e.preventDefault(); isVerticalResizing = true;
        document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', verticalMoveHandler); window.addEventListener('touchmove', verticalMoveHandler);
        window.addEventListener('mouseup', stopVerticalResizing); window.addEventListener('touchend', stopVerticalResizing);
    };
    const stopVerticalResizing = () => {
        isVerticalResizing = false; document.body.style.cursor = ''; document.body.style.userSelect = '';
        window.removeEventListener('mousemove', verticalMoveHandler); window.removeEventListener('touchmove', verticalMoveHandler);
        // ... (rest of stop logic)
    };
    verticalResizer.addEventListener('mousedown', startVerticalResizing);
    verticalResizer.addEventListener('touchstart', startVerticalResizing);

    // Horizontal resizing logic...
    const horizontalMoveHandler = (e) => {
        if (!isHorizontalResizing) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let newWidth = clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;
        sidebar.style.flexBasis = `${newWidth}px`;
    };
    const startHorizontalResizing = (e) => {
        e.preventDefault(); isHorizontalResizing = true;
        document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', horizontalMoveHandler); window.addEventListener('touchmove', horizontalMoveHandler);
        window.addEventListener('mouseup', stopHorizontalResizing); window.addEventListener('touchend', stopHorizontalResizing);
    };
    const stopHorizontalResizing = () => {
        isHorizontalResizing = false; document.body.style.cursor = ''; document.body.style.userSelect = '';
        window.removeEventListener('mousemove', horizontalMoveHandler); window.removeEventListener('touchmove', horizontalMoveHandler);
         // ... (rest of stop logic)
    };
    horizontalResizer.addEventListener('mousedown', startHorizontalResizing);
    horizontalResizer.addEventListener('touchstart', startHorizontalResizing);
}

// --- START: Mobile UX Improvement Logic ---
/**
 * Initializes all UI/UX enhancements specifically for mobile devices.
 */
function initMobileUX() {
    // Check if we are on a mobile-like screen
    if (window.innerWidth > 768) {
        return;
    }

    const chatHeader = document.querySelector('.chat-header');
    const statusPanel = document.getElementById('status-panel');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');

    if (!chatHeader || !statusPanel || !chatMessages || !chatInput) {
        console.warn("Mobile UX elements not found, aborting init.");
        return;
    }
    
    // --- 1. Auto-hide header/footer on scroll ---
    let lastScrollTop = 0;
    chatMessages.addEventListener('scroll', () => {
        let scrollTop = chatMessages.scrollTop;
        if (scrollTop > lastScrollTop && scrollTop > 50) { // Scrolling down
            chatHeader.classList.add('is-hidden');
            statusPanel.classList.add('is-hidden');
        } else { // Scrolling up
            chatHeader.classList.remove('is-hidden');
            statusPanel.classList.remove('is-hidden');
        }
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    }, { passive: true });

    // --- 2. Hide UI when keyboard is active ---
    chatInput.addEventListener('focus', () => {
        chatHeader.classList.add('is-hidden');
        statusPanel.classList.add('is-hidden');
    });

    chatInput.addEventListener('blur', () => {
        setTimeout(() => {
            chatHeader.classList.remove('is-hidden');
            statusPanel.classList.remove('is-hidden');
        }, 200);
    });

    // --- 3. Collapsible Status Bar Logic ---
    // Start collapsed by default on mobile
    statusPanel.classList.add('is-collapsed');
    statusPanel.addEventListener('click', (e) => {
        // Prevent toggling if a button inside the panel was clicked
        if (e.target.closest('button')) {
            return;
        }
        statusPanel.classList.toggle('is-collapsed');
    });
}
// --- END: Mobile UX Improvement Logic ---


function initCoreUI() {
    stateManager.bus.subscribe('ui:applyFontSettings', applyFontSettings);
    stateManager.bus.subscribe('status:update', updateStatus);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
        }
    });

    document.querySelector('#settings-btn').addEventListener('click', toggleSettingsPanel);
    document.querySelector('.close-settings-btn').addEventListener('click', toggleSettingsPanel);
    document.querySelector('#save-project-modal .btn-secondary').addEventListener('click', hideSaveProjectModal);
    document.getElementById('alert-modal').querySelector('.btn').addEventListener('click', hideCustomAlert);
    document.querySelector('#save-project-modal .btn:not(.btn-secondary)').addEventListener('click', () => handleProjectSaveConfirm());
    document.querySelector('#unsaved-changes-modal .btn-secondary').addEventListener('click', () => handleUnsavedChanges('cancel'));
    document.querySelector('#unsaved-changes-modal .btn-danger').addEventListener('click', () => handleUnsavedChanges('discard'));
    document.querySelector('#unsaved-changes-modal .btn:not(.btn-secondary):not(.btn-danger)').addEventListener('click', () => handleUnsavedChanges('save'));
    document.getElementById('hamburger-btn').addEventListener('click', toggleMobileSidebar);
    document.getElementById('mobile-overlay').addEventListener('click', toggleMobileSidebar);
    document.getElementById('collapse-sidebar-btn').addEventListener('click', toggleSidebarCollapse);
    document.getElementById('focus-mode-btn').addEventListener('click', () => { document.body.classList.toggle('focus-mode'); });
    document.getElementById('load-models-btn').addEventListener('click', loadAllProviderModels);
    
    document.getElementById('fontFamilySelect').addEventListener('change', (e) => {
        const project = stateManager.getProject();
        if (project?.globalSettings) {
            project.globalSettings.fontFamilySelect = e.target.value;
            stateManager.setProject(project);
            applyFontSettings();
            stateManager.updateAndPersistState();
        }
    });
    
    document.getElementById('apiKey').addEventListener('change', async (e) => { 
        const project = stateManager.getProject();
        if(project.globalSettings) { 
            project.globalSettings.apiKey = e.target.value; 
            await stateManager.updateAndPersistState();
            await loadAllProviderModels();
        } 
    });
    document.getElementById('ollamaBaseUrl').addEventListener('change', async (e) => { 
        const project = stateManager.getProject();
        if(project.globalSettings) { 
            project.globalSettings.ollamaBaseUrl = e.target.value; 
            await stateManager.updateAndPersistState();
            await loadAllProviderModels();
        } 
    });

    // Event listeners for system utility agent settings...
    document.getElementById('system-utility-model-select').addEventListener('change', saveSystemUtilityAgentSettings);
    document.getElementById('system-utility-prompt').addEventListener('change', saveSystemUtilityAgentSettings);
    document.getElementById('system-utility-summary-prompt').addEventListener('change', saveSystemUtilityAgentSettings);
    document.getElementById('system-utility-temperature').addEventListener('change', saveSystemUtilityAgentSettings);
    document.getElementById('system-utility-topP').addEventListener('change', saveSystemUtilityAgentSettings);
    document.getElementById('system-utility-summary-preset-select').addEventListener('change', handleSummarizationPresetChange);
    document.getElementById('save-summary-preset-btn').addEventListener('click', handleSaveSummarizationPreset);
    
    makeSidebarResizable();
    initMobileUX(); // <<< Initialize mobile-specific enhancements
    
    console.log("Core UI Initialized.");
}
