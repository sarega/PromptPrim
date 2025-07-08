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

/**
 * [REFACTORED] Loads composer content into the correct editable area.
 */
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
    const contentArea = getEditableArea();
    const composerPanel = document.getElementById('composer-panel');
    if (!contentArea || !composerPanel) return;

    // Open the panel if it's collapsed
    if (composerPanel.classList.contains('collapsed')) {
        composerPanel.classList.remove('collapsed');
        document.getElementById('resizer-row')?.classList.remove('collapsed');
        stateManager.bus.publish('composer:visibilityChanged');
    }

    if (contentArea.innerHTML.trim() !== '') {
        contentArea.innerHTML += '<br><hr><br>';
    }
    contentArea.innerHTML += content;
    contentArea.scrollTop = contentArea.scrollHeight;

    // Trigger auto-save
    updateComposerContent(contentArea.innerHTML);
}

function sanitizeHtmlForExport(rawHtml) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawHtml;
    tempDiv.querySelectorAll('*').forEach(el => {
        el.removeAttribute('style');
        el.removeAttribute('class');
    });
    return tempDiv.innerHTML;
}

/**
 * [REFACTORED] Exports the composer content from the correct editable area.
 */
export function exportComposerContent() {
    const contentArea = getEditableArea();
    if (!contentArea) return;

    const rawHtmlContent = contentArea.innerHTML;
    if (!rawHtmlContent.trim()) {
        showCustomAlert("Composer is empty. Nothing to export.", "Info");
        return;
    }

    const cleanHtmlContent = sanitizeHtmlForExport(rawHtmlContent);
    const fullHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Composer Export</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: auto; }
                h1, h2, h3 { margin-top: 1.2em; margin-bottom: 0.5em; }
                ul, ol { padding-left: 30px; }
            </style>
        </head>
        <body>
            ${cleanHtmlContent}
        </body>
        </html>
    `;

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