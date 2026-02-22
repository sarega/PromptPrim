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
    DOM.rightSidebar = document.getElementById('studio-panel');
    DOM.rightSidebarResizer = document.getElementById('right-sidebar-resizer');
}

export function initRightSidebarResizer(resizer, sidebar) {
    if (!resizer || !sidebar) return;
    if (resizer.dataset.rightSidebarResizerBound === 'true') return;
    resizer.dataset.rightSidebarResizerBound = 'true';

    const STORAGE_KEY = 'promptPrimRightSidebarWidth';
    const MIN_WIDTH = 280;
    const MAX_WIDTH = 760;

    let dragPointerId = null;
    let initialPointerX = 0;
    let initialWidth = 0;
    let lastPointerX = 0;
    let rafId = null;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const getMaxWidth = () => {
        const wrapper = sidebar.parentElement;
        const wrapperWidth = wrapper?.getBoundingClientRect().width || window.innerWidth;
        return clamp(wrapperWidth * 0.55, MIN_WIDTH, MAX_WIDTH);
    };

    const applyWidth = (widthPx) => {
        const maxWidth = getMaxWidth();
        const clamped = clamp(Math.round(widthPx), MIN_WIDTH, maxWidth);
        document.documentElement.style.setProperty('--promptprim-right-sidebar-width', `${clamped}px`);
        sidebar.style.width = `${clamped}px`;
        sidebar.style.flexBasis = `${clamped}px`;
        return clamped;
    };

    const applySavedWidth = () => {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) {
            applyWidth(parsed);
        } else {
            applyWidth(sidebar.getBoundingClientRect().width || 380);
        }
    };

    const stopDragging = () => {
        if (dragPointerId === null) return;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        const finalWidth = sidebar.getBoundingClientRect().width || initialWidth;
        localStorage.setItem(STORAGE_KEY, String(Math.round(finalWidth)));
        try {
            resizer.releasePointerCapture(dragPointerId);
        } catch (_) {
            // ignore pointer capture release failures
        }
        resizer.classList.remove('active');
        sidebar.classList.remove('is-resizing');
        document.body.style.cursor = '';
        dragPointerId = null;
    };

    const onPointerMove = (e) => {
        if (dragPointerId === null || e.pointerId !== dragPointerId) return;
        lastPointerX = e.clientX;

        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            const deltaX = initialPointerX - lastPointerX;
            applyWidth(initialWidth + deltaX);
            rafId = null;
        });
    };

    const onPointerUp = (e) => {
        if (dragPointerId === null || e.pointerId !== dragPointerId) return;
        stopDragging();
    };

    const onPointerCancel = (e) => {
        if (dragPointerId === null || e.pointerId !== dragPointerId) return;
        stopDragging();
    };

    const onPointerDown = (e) => {
        if (window.innerWidth <= 900) return;
        if (sidebar.classList.contains('collapsed') || DOM.appWrapper?.classList.contains('with-right-collapsed')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        e.preventDefault();
        dragPointerId = e.pointerId;
        initialPointerX = e.clientX;
        initialWidth = sidebar.getBoundingClientRect().width || 380;
        lastPointerX = e.clientX;

        resizer.classList.add('active');
        sidebar.classList.add('is-resizing');
        document.body.style.cursor = 'col-resize';
        resizer.setPointerCapture(e.pointerId);
    };

    applySavedWidth();

    window.addEventListener('resize', () => {
        if (window.innerWidth <= 900) return;
        const current = sidebar.getBoundingClientRect().width || Number(localStorage.getItem(STORAGE_KEY)) || 380;
        applyWidth(current);
    });

    resizer.addEventListener('pointerdown', onPointerDown);
    resizer.addEventListener('pointermove', onPointerMove);
    resizer.addEventListener('pointerup', onPointerUp);
    resizer.addEventListener('pointercancel', onPointerCancel);
}

export function initHorizontalResizer(resizer, panelToResize) {
    if (!resizer || !panelToResize) return;

    // Guard against duplicate bindings from repeated init paths.
    if (resizer.dataset.horizontalResizerBound === 'true') return;
    resizer.dataset.horizontalResizerBound = 'true';

    const MIN_PANEL_HEIGHT = 140;
    const RESERVED_CHAT_HEIGHT = 140;
    const SNAP_RATIOS = [0.38, 0.55, 0.72];

    let dragPointerId = null;
    let initialPointerY = 0;
    let initialPanelHeight = 0;
    let lastPointerY = 0;
    let rafId = null;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const getHeightBounds = () => {
        const container = panelToResize.parentElement;
        const containerHeight = container?.getBoundingClientRect().height || window.innerHeight;
        const maxHeight = Math.max(MIN_PANEL_HEIGHT, containerHeight - RESERVED_CHAT_HEIGHT);
        return { containerHeight, maxHeight };
    };

    const applyPanelHeight = (height) => {
        panelToResize.style.flexBasis = `${Math.round(height)}px`;
    };

    const stopDragging = () => {
        if (dragPointerId === null) return;

        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }

        const currentHeight = panelToResize.getBoundingClientRect().height;
        const { containerHeight, maxHeight } = getHeightBounds();
        const snapPoints = SNAP_RATIOS
            .map((ratio) => clamp(containerHeight * ratio, MIN_PANEL_HEIGHT, maxHeight));

        const snappedHeight = snapPoints.reduce((nearest, point) => (
            Math.abs(point - currentHeight) < Math.abs(nearest - currentHeight) ? point : nearest
        ), snapPoints[0] || currentHeight);

        applyPanelHeight(snappedHeight);
        localStorage.setItem('promptPrimComposerHeight', String(Math.round(snappedHeight)));
        stateManager.bus.publish('composer:heightChanged', { height: Math.round(snappedHeight) });

        try {
            resizer.releasePointerCapture(dragPointerId);
        } catch (_) {
            // ignore capture release errors
        }

        resizer.classList.remove('active');
        panelToResize.classList.remove('is-resizing');
        document.body.style.cursor = '';
        dragPointerId = null;
    };

    const onPointerMove = (e) => {
        if (dragPointerId === null || e.pointerId !== dragPointerId) return;
        lastPointerY = e.clientY;

        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            const deltaY = lastPointerY - initialPointerY;
            const { maxHeight } = getHeightBounds();
            const nextHeight = clamp(initialPanelHeight - deltaY, MIN_PANEL_HEIGHT, maxHeight);
            applyPanelHeight(nextHeight);
            rafId = null;
        });
    };

    const onPointerUp = (e) => {
        if (dragPointerId === null || e.pointerId !== dragPointerId) return;
        stopDragging();
    };

    const onPointerCancel = (e) => {
        if (dragPointerId === null || e.pointerId !== dragPointerId) return;
        stopDragging();
    };

    const onPointerDown = (e) => {
        if (window.innerWidth <= 768) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        e.preventDefault();
        if (panelToResize.classList.contains('collapsed')) {
            stateManager.bus.publish('ui:requestComposerOpen');
        }

        dragPointerId = e.pointerId;
        initialPointerY = e.clientY;
        initialPanelHeight = panelToResize.getBoundingClientRect().height;
        lastPointerY = e.clientY;

        resizer.classList.add('active');
        panelToResize.classList.add('is-resizing');
        document.body.style.cursor = 'row-resize';
        resizer.setPointerCapture(e.pointerId);
    };

    resizer.addEventListener('pointerdown', onPointerDown);
    resizer.addEventListener('pointermove', onPointerMove);
    resizer.addEventListener('pointerup', onPointerUp);
    resizer.addEventListener('pointercancel', onPointerCancel);
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
            const shouldOpen = !DOM.sessionsPanel.classList.contains('is-open');
            DOM.sessionsPanel.classList.toggle('is-open', shouldOpen);
            DOM.mobileOverlay?.classList.toggle('active', shouldOpen);
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
    if (DOM.rightSidebarResizer && DOM.rightSidebar) {
        initRightSidebarResizer(DOM.rightSidebarResizer, DOM.rightSidebar);
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
