// ===============================================
// FILE: src/js/core/core.layout.js 
// ===============================================
/**
 * @module core.layout
 * @description Manages all primary layout functionalities including panel resizing
 * and responsive sidebar toggling.
 */
import { stateManager } from './core.state.js';

const DOM = {};

export function initMobileGestures() {
    if (!('ontouchstart' in window)) return;

    const sessionsPanel = document.querySelector('.sessions-panel');
    if (!sessionsPanel) return;

    const swipeZoneWidth = 60; // Area on the left edge where the swipe must start
    const swipeThreshold = 80; // Minimum distance for the swipe to be recognized

    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    document.body.addEventListener('touchstart', (e) => {
        if (!sessionsPanel.classList.contains('visible') &&
            e.touches.length === 2 &&
            e.touches[0].clientX < swipeZoneWidth) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }
    }, { passive: true });

    document.body.addEventListener('touchmove', (e) => {
        if (!isSwiping || e.touches.length !== 2) {
            isSwiping = false;
            return;
        }
        const touchCurrentX = e.touches[0].clientX;
        const touchCurrentY = e.touches[0].clientY;
        if (Math.abs(touchCurrentY - touchStartY) > Math.abs(touchCurrentX - touchStartX)) {
            isSwiping = false; // Cancel if swipe is more vertical
        }
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        const touchEndX = e.changedTouches[0].clientX;
        isSwiping = false;

        if (touchEndX - touchStartX > swipeThreshold) {
            document.getElementById('hamburger-btn')?.click();
        }
    });
}

function cacheDOMElements() {
    DOM.appWrapper = document.querySelector('.app-wrapper');
    DOM.toggleRightSidebarBtn = document.getElementById('toggle-right-sidebar-btn');
    DOM.sessionsPanel = document.querySelector('.sessions-panel');
    DOM.hamburgerBtn = document.getElementById('hamburger-btn');
    DOM.closeSidebarBtn = document.querySelector('.sessions-panel .mobile-only[title="Close Sidebar"]');
    DOM.mobileOverlay = document.getElementById('mobile-overlay');
    DOM.composerPanel = document.querySelector('.composer-panel');
    DOM.resizerRow = document.getElementById('resizer-row');
}

export function initHorizontalResizer(resizer, panelToResize) {
    if (!resizer || !panelToResize) return;
    
    let initialMouseY = 0, initialPanelHeight = 0;
    let lastMouseY = 0; // << เพิ่มตัวแปรเก็บตำแหน่งล่าสุด
    let ticking = false; // << เพิ่ม "ธง" เพื่อเช็คสถานะ

    const onMouseDown = (e) => {
        e.preventDefault();
        resizer.classList.add('active');
        document.body.style.cursor = 'row-resize';

        panelToResize.classList.add('is-resizing'); 

        if (panelToResize.classList.contains('collapsed')) {
            // panelToResize.classList.remove('collapsed');
            // resizer.classList.remove('collapsed');
            stateManager.bus.publish('ui:requestComposerOpen');
        }

        initialMouseY = e.clientY;
        initialPanelHeight = panelToResize.getBoundingClientRect().height;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // แก้ไขฟังก์ชัน onMouseMove ใหม่
    const onMouseMove = (e) => {
        lastMouseY = e.clientY;
        
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const deltaY = lastMouseY - initialMouseY;
                let newHeight = initialPanelHeight - deltaY;
                const minHeight = 100; // ความสูงน้อยสุดที่ยอมรับได้
                if (newHeight < minHeight) newHeight = minHeight;
                
                // 1. สั่งปรับขนาด Panel หลัก (เหมือนเดิม)
                panelToResize.style.flexBasis = `${newHeight}px`;

                // 2. [คำสั่งใหม่] หา .composer-editor ที่อยู่ข้างในแล้วสั่งปรับความสูงด้วย!
                const editorDiv = panelToResize.querySelector('.composer-editor');
                if (editorDiv) {
                    // เราอาจจะต้องเผื่อความสูงของ Header ของ Composer ไว้ด้วย
                    const headerHeight = 50; // ประมาณความสูงของ Toolbar
                    editorDiv.style.height = `${newHeight - headerHeight}px`;
                }

                ticking = false;
            });
            ticking = true;
        }
    };

    const onMouseUp = () => {
        resizer.classList.remove('active');
        document.body.style.cursor = '';
        panelToResize.classList.remove('is-resizing');

        const currentHeight = panelToResize.getBoundingClientRect().height;
        localStorage.setItem('promptPrimComposerHeight', currentHeight);

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    
    resizer.addEventListener('mousedown', onMouseDown);
}

function initializePanelControls() {
    if (!DOM.sessionsPanel) return;

    // --- Helper function to close the mobile sidebar ---
    const closeMobileSidebar = (e) => {
        // [FIX 2] Stop the event from propagating to other elements
        e.stopPropagation();
        e.preventDefault();
        
        DOM.sessionsPanel.classList.remove('is-open');
        DOM.mobileOverlay?.classList.remove('active');
    };

    // --- Hamburger Button to OPEN the sidebar ---
    DOM.hamburgerBtn?.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024) { 
            DOM.sessionsPanel.classList.add('is-open');
            DOM.mobileOverlay?.classList.add('active');
        } else {
            DOM.appWrapper?.classList.toggle('sidebar-collapsed');
        }
    });
    
    // --- Listeners to CLOSE the sidebar ---
    // [FIX 1] Listen during the "capturing" phase (by adding `true`) to ensure this fires first.
    DOM.mobileOverlay?.addEventListener('click', closeMobileSidebar, true);
    DOM.closeSidebarBtn?.addEventListener('click', closeMobileSidebar, true);
}

export function setupLayout() {
    cacheDOMElements();
    
    if (DOM.resizerRow && DOM.composerPanel) {
        initHorizontalResizer(DOM.resizerRow, DOM.composerPanel);
    }
    
    initializePanelControls();
    initRightSidebarToggle(); // ฟังก์ชันใหม่

    console.log("Core layout manager initialized.");
}
// [NEW] ฟังก์ชันใหม่สำหรับควบคุม Sidebar ขวา
function initRightSidebarToggle() {
    if (!DOM.toggleRightSidebarBtn || !DOM.appWrapper) return;

    DOM.toggleRightSidebarBtn.addEventListener('click', () => {
        DOM.appWrapper.classList.toggle('right-sidebar-collapsed');
        
        // ถ้า Sidebar ถูกเปิด, ให้ประกาศ Event เพื่อวาดเนื้อหา
        if (!DOM.appWrapper.classList.contains('right-sidebar-collapsed')) {
            stateManager.bus.publish('studio:rendered');
        }
    });
}