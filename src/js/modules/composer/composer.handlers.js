// ===============================================
// FILE: src/js/modules/composer/composer.handlers.js (Patched Version)
// ===============================================
import { showCustomAlert } from '../../core/core.ui.js';
import { stateManager } from '../../core/core.state.js';

// [HELPER] สร้างฟังก์ชันกลางเพื่อดึง Element ที่ถูกต้อง ป้องกันความผิดพลาด
const getEditableArea = () => document.querySelector('#composer-editor .composer-content-area');

/**
 * Updates the composer content in the currently active session's state.
 * @param {string} content - The HTML content from the composer editor.
 */
export function updateComposerContent(newContent) {
    const project = stateManager.getProject();
    const session = project?.chatSessions.find(s => s.id === project.activeSessionId);

    if (session && session.composerContent !== newContent) {
        session.composerContent = newContent;
        stateManager.updateAndPersistState();
    }
}

export function loadComposerContent() {
    const contentArea = getEditableArea();
    if (!contentArea) return;

    const project = stateManager.getProject();
    if (!project?.activeSessionId) {
        contentArea.innerHTML = '';
        return;
    }

    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    contentArea.innerHTML = session?.composerContent || '';
}

/**
 * [REFACTORED] Appends HTML content to the correct editable area.
 * @param {object} payload - The event payload.
 * @param {string} payload.content - The HTML content to append.
 */
export function appendToComposer({ content }) {
    const contentArea = getEditableArea(); // This gets .composer-content-area
    const composerPanel = document.getElementById('composer-panel');
    if (!contentArea || !composerPanel) return;

    // ... โค้ดส่วนเปิด panel ถ้ามันปิดอยู่ ...
    if (composerPanel.classList.contains('collapsed')) {
        composerPanel.classList.remove('collapsed');
        document.getElementById('resizer-row')?.classList.remove('collapsed');
        stateManager.bus.publish('composer:visibilityChanged');
    }

    // [DEFINITIVE FIX] เปลี่ยนจาก innerHTML มาเช็คที่ textContent แทน
    // เพื่อให้แน่ใจว่าเราจะเพิ่มเส้นคั่นก็ต่อเมื่อมี "ข้อความ" อยู่จริงๆ เท่านั้น
    if (contentArea.textContent.trim() !== '') {
        contentArea.innerHTML += '<br><hr><br>';
    }

    contentArea.innerHTML += content;
    contentArea.scrollTop = contentArea.scrollHeight;

    updateComposerContent(contentArea.innerHTML);
}

// [REVISED] ฟังก์ชันทำความสะอาด HTML ที่จะเก็บคลาสของ highlight.js ไว้
function sanitizeHtmlForExport(rawHtml) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawHtml;

    tempDiv.querySelectorAll('*').forEach(el => {
        // ลบ style attribute ที่ไม่จำเป็นออก
        el.removeAttribute('style');
        
        // ลบคลาสทั้งหมด ยกเว้นคลาสที่ขึ้นต้นด้วย 'hljs-'
        if (el.classList.length > 0) {
            const classesToRemove = [];
            for (let i = 0; i < el.classList.length; i++) {
                if (!el.classList[i].startsWith('hljs-')) {
                    classesToRemove.push(el.classList[i]);
                }
            }
            classesToRemove.forEach(cls => el.classList.remove(cls));
        }
    });

    return tempDiv.innerHTML;
}

export function exportComposerContent() {
    const contentArea = getEditableArea();
    if (!contentArea) return;

    const rawHtmlContent = contentArea.innerHTML;
    if (!rawHtmlContent.trim()) {
        showCustomAlert("Composer is empty. Nothing to export.", "Info");
        return;
    }

    // ฟังก์ชัน sanitizeHtmlForExport ยังคงเหมือนเดิม
    const cleanHtmlContent = sanitizeHtmlForExport(rawHtmlContent);
    
    // [DEFINITIVE FIX] สร้าง HTML ที่สมบูรณ์พร้อมกับ <link> ไปยัง stylesheet
    const fullHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Composer Export</title>
            
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
            
            <style>
                /* 2. สไตล์พื้นฐานของหน้าเว็บที่ Export */
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
                    line-height: 1.6; 
                    padding: 20px; 
                    max-width: 800px; 
                    margin: auto; 
                }
                pre {
                    background-color: #f6f8fa; /* สีพื้นหลัง Code Block สำหรับไฟล์ที่ Export */
                    padding: 16px;
                    border-radius: 6px;
                    overflow-x: auto;
                }
                code {
                    font-family: 'Fira Mono', 'Menlo', monospace;
                }
            </style>
        </head>
        <body>
            ${cleanHtmlContent}
        </body>
        </html>
    `;

    // ส่วนของการสร้าง Blob และการดาวน์โหลดยังคงเหมือนเดิม
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `composer-export-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}