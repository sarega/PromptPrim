// ===============================================
// FILE: src/js/modules/composer/composer.ui.js
// ===============================================
import { stateManager } from '../../core/core.state.js';
import { ReactBridge } from '../../react-entry.jsx'; 
import Composer from '../../react-components/Composer.jsx';
import * as ComposerHandlers from './composer.handlers.js';
import { initHorizontalResizer } from '../../core/core.layout.js';

// --- Element ที่จำเป็น ---
const composerPanelContainer = document.getElementById('composer-panel');
const resizerRow = document.getElementById('resizer-row');
const mainContentWrapper = document.querySelector('.main-content-wrapper');
const mainChatArea = document.querySelector('.main-chat-area');

// --- ตัวแปรสำหรับเก็บ instance ของ React Component ---
let activeComposerInstance = null;

function mountOrUpdateComposer(content, isMaximized) {
    if (!composerPanelContainer) return;

    const props = {
        initialContent: content,
        isMaximized,
        onContentChange: ComposerHandlers.updateComposerContent,
        onCollapse: () => setComposerState('collapsed'),
        onToggleMaximize: () => {
            const currentIsMaximized = mainContentWrapper.classList.contains('composer-maximized');
            setComposerState(currentIsMaximized ? 'normal' : 'maximized');
        },
        onExport: (payload) => {
            const html = typeof payload?.html === 'string' ? payload.html : '';
            const text = typeof payload?.text === 'string' ? payload.text : '';
            ComposerHandlers.exportComposerContent({ html, text });
            stateManager.bus.publish('composer:export');
        },
        onReady: (api) => {
            stateManager.setState('composerApi', api);
        }
    };

    ReactBridge.mount(Composer, props, composerPanelContainer);
    initHorizontalResizer(resizerRow, composerPanelContainer);
}

function unmountComposer() {
    ReactBridge.unmount(composerPanelContainer);
    stateManager.setState('composerApi', null); 
}


export function setComposerState(newState) {
    if (!composerPanelContainer || !mainContentWrapper || !mainChatArea) return;

    // --- Reset Class ทั้งหมดก่อน ---
   mainContentWrapper.classList.remove('composer-maximized');
    mainChatArea.classList.remove('composer-is-active');
    composerPanelContainer.classList.remove('collapsed');

    const project = stateManager.getProject();
    const session = project?.chatSessions.find(s => s.id === project.activeSessionId);
    const rawComposerContent = session?.composerContent || '';
    const composerContent = ComposerHandlers.normalizeComposerHtmlForStorage(rawComposerContent);
    if (session && rawComposerContent !== composerContent) {
        session.composerContent = composerContent;
        stateManager.updateAndPersistState();
    }

    switch (newState) {
        case 'collapsed':
            unmountComposer();
            composerPanelContainer.classList.add('collapsed');
            break;

        case 'normal':
        case 'maximized':
            mainChatArea.classList.add('composer-is-active');
            if (newState === 'maximized') {
                mainContentWrapper.classList.add('composer-maximized');
            }
            mountOrUpdateComposer(composerContent, newState === 'maximized');
            break;
    }
    
    localStorage.setItem('promptPrimComposerState', newState);
    stateManager.bus.publish('composer:visibilityChanged');
}

let composerApi = null;
// ฟังก์ชันสำหรับให้โลกภายนอกเรียกใช้ (เช่น การ append)
export function getComposerApi() {
    return composerApi;
}


// =================================================================================


// ดึง Element ที่ต้องใช้บ่อยๆ มาเก็บไว้ข้างนอก
const mobileToggleBtn = document.getElementById('mobile-composer-toggle');


// --- Helper Functions for Toolbar ---

function populateColorPalette() {
    const palette = document.getElementById('color-palette');
    if (!palette) return;
    const colors = [
        '#000000', '#E03131', '#C2255C', '#9C36B5', '#6741D9',
        '#3B5BDB', '#1971C2', '#0C8599', '#099268', '#2F9E44',
        '#66A80F', '#F08C00', '#E8590C', '#868E96', '#495057'
    ];
    palette.innerHTML = '';
    colors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        palette.appendChild(swatch);
    });
}

function updateToolbarState() {
    const composerToolsArea = document.querySelector('.composer-tools-area');
    if (!composerToolsArea) return;

    let isHeadingActive = false;
    const activeBlock = document.queryCommandValue('formatBlock').toLowerCase();

    // Check headings and paragraph
    for (const value of ['H1', 'H2', 'H3', 'P']) {
        const button = composerToolsArea.querySelector(`button[data-value="${value}"]`);
        if (button) {
            if (activeBlock === `<${value.toLowerCase()}>`) {
                button.classList.add('is-active');
                if (value !== 'P') isHeadingActive = true;
            } else {
                button.classList.remove('is-active');
            }
        }
    }

    // Check other commands
    const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
    commands.forEach(command => {
        const button = composerToolsArea.querySelector(`button[data-command="${command}"]`);
        if (button) {
            const isActive = (command === 'bold' && isHeadingActive) ? false : document.queryCommandState(command);
            button.classList.toggle('is-active', isActive);
        }
    });
}

// =================================================================================
// Exported Functions
// =================================================================================

/**
 * ตั้งค่าเนื้อหาใน Composer Editor
 * @param {string} htmlContent - เนื้อหา HTML ที่จะนำไปใส่
 */
export function setContent(htmlContent) {
    const contentArea = document.querySelector('#composer-editor .composer-content-area');
    if (contentArea) {
        contentArea.innerHTML = htmlContent || '';
    }
}

/**
 * ฟังก์ชันหลักสำหรับเริ่มต้นการทำงานของ Composer UI ทั้งหมด
 */
export function initComposerUI() {
    // 1. Get DOM Elements (ดึง Element ทั้งหมดมาก่อน)
    const contentArea = document.querySelector('#composer-editor .composer-content-area');

    // --- ส่วนอื่นๆ ของฟังก์ชันยังคงเหมือนเดิม ---
    const composerEditorWrapper = document.getElementById('composer-editor');
    const composerToolsArea = document.querySelector('.composer-tools-area');
    const collapseBtn = document.getElementById('composer-collapse-btn');
    const expandBtn = document.getElementById('composer-expand-btn');

    // --- Logic ใหม่สำหรับปุ่มขยาย (Fullscreen) ---
    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            // ปุ่มนี้ทำหน้าที่สลับระหว่าง Normal <-> Maximized
            const isMaximized = mainContentWrapper.classList.contains('composer-maximized');
            setComposerState(isMaximized ? 'normal' : 'maximized');
        });
    }

    // --- Logic ใหม่สำหรับปุ่มย่อ (Collapse) ---
    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            // ปุ่มนี้ทำหน้าที่ "ปิด" สถานเดียว ไม่ว่าจะมาจาก State ไหนก็ตาม
            setComposerState('collapsed');
        });
    }
    // --- Logic สำหรับปุ่ม Mobile (ถ้ามี) ---
    if (mobileToggleBtn) {
        mobileToggleBtn.addEventListener('click', () => {
            const isCollapsed = composerPanel.classList.contains('collapsed');
            setComposerState(isCollapsed ? 'normal' : 'collapsed');
        });
    }

    const exportBtn = document.getElementById('export-composer-btn');

    if (!composerPanel || !contentArea) {
        console.error("Composer UI cannot initialize: Core elements not found.");
        return;
    }

    // 2. [สำคัญ] สร้างฟังก์ชัน "toggle" ไว้ "ข้างใน" initComposerUI
    // เพื่อให้มันเข้าถึง composerPanel และ mobileToggleBtn ได้
    const toggleComposerVisibility = () => {
        const isCurrentlyCollapsed = composerPanel.classList.contains('collapsed');
        composerPanel.classList.toggle('collapsed');

        // ตรวจสอบสถานะใหม่หลังจาก toggle แล้ว
        const isNowCollapsed = composerPanel.classList.contains('collapsed');

        // สั่งให้ปุ่มหมุนตามสถานะของ composer
        if (mobileToggleBtn) {
            mobileToggleBtn.classList.toggle('is-open', !isNowCollapsed);
        }

        // ประกาศ Event บอกส่วนอื่นๆ ของแอป
        stateManager.bus.publish('composer:visibilityChanged');
    };

    // 3. ผูก Event Listener
    if (mobileToggleBtn) {
        mobileToggleBtn.addEventListener('click', toggleComposerVisibility);
    }
    // --- [MODIFIED] แก้ไข Resizer ให้ไม่ทำงานบน Mobile ---
    const resizer = document.getElementById('resizer-row');
    if (resizer) {
        resizer.addEventListener('mousedown', (e) => {
            // ถ้าหน้าจอเป็นขนาดมือถือ ไม่ต้องทำอะไร
            if (window.innerWidth <= 768) {
                e.preventDefault();
                return;
            }
            // ถ้าไม่ใช่ ให้ทำงานตาม Logic เดิม (เรียก initHorizontalResizer)
            // Logic ของ initHorizontalResizer ของคุณถูกต้องแล้ว ไม่ต้องแก้ไข
        });
    }
    // 2. Setup Event Subscriptions
    stateManager.bus.subscribe('project:loaded', loadComposerContent);
    stateManager.bus.subscribe('session:loaded', loadComposerContent);
    stateManager.bus.subscribe('composer:append', appendToComposer);

    // 3. Setup Event Listeners
    // [FIX #2] ทำให้เมื่อคลิกที่ Composer จะเป็น Paragraph (<p>) โดยอัตโนมัติ
    contentArea.addEventListener('focus', () => {
        document.execCommand('formatBlock', false, 'p');
        updateToolbarState();
    });
    const toolbarUpdateEvents = ['click', 'keyup', 'focus'];
    toolbarUpdateEvents.forEach(evt => {
        contentArea.addEventListener(evt, () => {
            // ใช้ timeout เล็กน้อยเพื่อให้แน่ใจว่า browser อัปเดต selection เสร็จก่อน
            // เป็นเทคนิคมาตรฐานสำหรับจัดการกับ rich text editor
            setTimeout(updateToolbarState, 1);
        });
    });

// `selectionchange` เป็น event ที่ดีที่สุดสำหรับการลากเมาส์เลือกข้อความ
    document.addEventListener('selectionchange', () => {
    if (document.activeElement === contentArea) {
        updateToolbarState();
    }
});

    // Auto-save listener ทำงานกับ contentArea โดยตรง
    const debouncedSave = debounce(() => updateComposerContent(contentArea.innerHTML), 500);
    contentArea.addEventListener('input', debouncedSave);

    // Toolbar และ Selection listeners
    const selectionEvents = ['keyup', 'mouseup'];
    selectionEvents.forEach(evt => contentArea.addEventListener(evt, updateToolbarState));
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === contentArea) {
            updateToolbarState();
        }
    });

    // Toolbar click logic
    if (composerToolsArea) {
        populateColorPalette(); // <-- เรียกใช้ฟังก์ชันที่อยู่ข้างนอก
        composerToolsArea.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const target = e.target.closest('button, .color-swatch');
            if (!target) return;
            
            contentArea.focus();

            // [FIX #3] Logic สำหรับเปิด/ปิด Color Palette
            if (target.id === 'color-picker-btn') {
                target.parentElement.classList.toggle('open');
                return;
            }
            if (target.classList.contains('color-swatch')) {
                document.execCommand('foreColor', false, target.dataset.color);
                target.closest('.dropdown')?.classList.remove('open');
            } else {
                const command = target.dataset.command;
                if (command) {
                    let value = target.dataset.value || null;
                    if (command === 'formatBlock' && value) value = `<${value}>`;
                    document.execCommand(command, false, value); // <-- มันทำงานให้เราตรงนี้!
                }
            }
            updateToolbarState();
        });
    }

    // Action buttons
    // if (exportBtn) exportBtn.addEventListener('click', exportComposerContent);
    // if (collapseBtn) collapseBtn.addEventListener('click', toggleComposerVisibility);
    // if (expandBtn) expandBtn.addEventListener('click', () => {
    //     const isMaximized = composerPanel.style.flexBasis && parseInt(composerPanel.style.flexBasis, 10) > window.innerHeight * 0.5;
    //     composerPanel.style.flexBasis = isMaximized ? '35vh' : '90vh';
    // });
    
    console.log("✅ Composer UI Initialized with definitive patches.");
}
