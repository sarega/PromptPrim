// ===============================================
// FILE: src/js/modules/composer/composer.handlers.js (Patched Version)
// ===============================================
import { showCustomAlert } from '../../core/core.ui.js';
import { stateManager } from '../../core/core.state.js';

// [HELPER] สร้างฟังก์ชันกลางเพื่อดึง Element ที่ถูกต้อง ป้องกันความผิดพลาด
const getEditableArea = () => document.querySelector('#composer-editor .composer-content-area');

const DEFAULT_BLACK_COLORS = new Set([
    'black',
    '#000',
    '#000000',
    'rgb(0,0,0)',
    'rgba(0,0,0,1)',
    'hsl(0,0%,0%)'
]);

const TRANSPARENT_BG_VALUES = new Set([
    'transparent',
    'rgba(0,0,0,0)',
    'initial',
    'inherit',
    'unset',
    'none'
]);

function normalizeCssColorValue(value = '') {
    return String(value).trim().toLowerCase().replace(/\s+/g, '');
}

function sanitizeInlineStylesForComposer(rawHtml = '', { forExport = false } = {}) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawHtml;

    tempDiv.querySelectorAll('*').forEach((el) => {
        const style = el.getAttribute('style');
        if (style) {
            const kept = [];
            style.split(';').forEach((part) => {
                const [rawKey, ...rawValParts] = part.split(':');
                const rawVal = rawValParts.join(':');
                if (!rawKey || !rawVal) return;
                const key = rawKey.trim().toLowerCase();
                const val = rawVal.trim();
                const normalizedVal = normalizeCssColorValue(val);

                if (forExport && (key === 'color' || key === 'background-color')) {
                    return;
                }

                if (!forExport && key === 'color' && DEFAULT_BLACK_COLORS.has(normalizedVal)) {
                    return;
                }

                if (!forExport && key === 'background-color' && TRANSPARENT_BG_VALUES.has(normalizedVal)) {
                    return;
                }

                kept.push(`${key}: ${val}`);
            });

            if (kept.length) {
                el.setAttribute('style', kept.join('; '));
            } else {
                el.removeAttribute('style');
            }
        }

        if (forExport) {
            el.removeAttribute('color');
            el.removeAttribute('bgcolor');
        }
    });

    return tempDiv.innerHTML;
}

export function normalizeComposerHtmlForStorage(rawHtml = '') {
    return sanitizeInlineStylesForComposer(rawHtml, { forExport: false });
}

function hasMeaningfulComposerContent(html = '', text = '') {
    const normalizedText = String(text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
    if (normalizedText) return true;

    if (!html || typeof html !== 'string') return false;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const domText = String(tempDiv.textContent || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
    if (domText) return true;

    return Boolean(
        tempDiv.querySelector('img,video,audio,iframe,canvas,svg,math,hr,table,pre,code,blockquote,ul,ol,li')
    );
}

/**
 * Updates the composer content in the currently active session's state.
 * @param {string} content - The HTML content from the composer editor.
 */
export function updateComposerContent(newContent) {
    const project = stateManager.getProject();
    const session = project?.chatSessions.find(s => s.id === project.activeSessionId);
    const normalizedContent = normalizeComposerHtmlForStorage(newContent);

    if (session && session.composerContent !== normalizedContent) {
        session.composerContent = normalizedContent;
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
    contentArea.innerHTML = normalizeComposerHtmlForStorage(session?.composerContent || '');
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
  tempDiv.innerHTML = sanitizeInlineStylesForComposer(rawHtml || '', { forExport: true });

  const ALLOWED_STYLE_PROPS = new Set([
    'font-size',
    'text-align',
  ]);

  tempDiv.querySelectorAll('*').forEach((el) => {
    // --- Keep only allowed inline styles ---
    const style = el.getAttribute('style')
    if (style) {
      const kept = []
      style.split(';').forEach((part) => {
        const [rawKey, rawVal] = part.split(':');
        if (!rawKey || !rawVal) return;
        const key = rawKey.trim().toLowerCase();
        const val = rawVal.trim();
        if (ALLOWED_STYLE_PROPS.has(key) && val) {
          kept.push(`${key}: ${val}`);
        }
      });
      if (kept.length) el.setAttribute('style', kept.join('; '));
      else el.removeAttribute('style');
    }

    // --- Keep only highlight-related classes (optional hardening) ---
    if (el.classList && el.classList.length > 0) {
      const toKeep = []
      el.classList.forEach((cls) => {
        if (cls.startsWith('hljs') || cls.startsWith('language-')) {
          toKeep.push(cls)
        }
      })
      el.className = toKeep.join(' ')
    }
  })

  return tempDiv.innerHTML
}

/**
 * สร้างไฟล์ HTML (ครบโครง) สำหรับดาวน์โหลด โดยรับ html/text จาก Composer
 * การใช้งาน:
 *   onExport={() => exportComposerContent({ html: editor.getHTML(), text: editor.getText() })}
 */
export function exportComposerContent({ html = '', text = '' } = {}) {
  try {
    const providedHtml = typeof html === 'string' ? html : '';
    const providedText = typeof text === 'string' ? text : '';

    // 1. ดึงข้อมูล Session ปัจจุบันจาก stateManager
    const project = stateManager.getProject();
    const session = project?.chatSessions.find(s => s.id === project.activeSessionId);
    const sessionName = session?.name || 'Untitled Composer';
    const sessionHtml = typeof session?.composerContent === 'string' ? session.composerContent : '';

    // Guard: บางครั้ง onExport ถูกเรียกซ้ำด้วย payload ว่าง
    if (!hasMeaningfulComposerContent(providedHtml, providedText)) {
      if (!hasMeaningfulComposerContent(sessionHtml, '')) {
        showCustomAlert('Composer is empty. Nothing to export.', 'Export Composer');
      }
      return;
    }

    const rawHtmlContent = providedHtml.trim();

    // 2. สร้าง Timestamp ที่อ่านง่าย
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    
    // 3. สร้างชื่อไฟล์ที่ปลอดภัยและมีความหมาย
    const safeFileName = sessionName.replace(/[^a-z0-9\u0E00-\u0E7F]/gi, '_').toLowerCase();
    const finalFileName = `${safeFileName}_${timestamp}.html`;
    // -------------------------

    const cleanHtmlContent = sanitizeHtmlForExport(rawHtmlContent)

    const fullHtml = `<!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <title>Composer Export</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.65;
            padding: 24px;
            max-width: 860px;
            margin: auto;
            background: #ffffff;
            color: #111827;
        }
            .composer-export-content {
                background: #ffffff;
                color: #111827;
            }
            h1,h2,h3 { line-height: 1.25; margin: 1.2em 0 0.6em; }
            p { margin: 0.6em 0; }
            blockquote { margin: 1em 0; padding-left: 0.9rem; border-left: 3px solid #999; font-style: italic; opacity: .95; }
            ul,ol { padding-left: 1.2em; margin: 0.6em 0; }
            pre {
                background-color: #f6f8fa;
                padding: 16px;
                border-radius: 6px;
                overflow-x: auto;
            }
            code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
            mark { background-color: #ffeb3b; padding: 0 2px; border-radius: 2px; }
    </style>
        </head>
        <body>
        <article class="composer-export-content">${cleanHtmlContent}</article>

            <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
            <script>
            if (window.hljs && typeof window.hljs.highlightAll === 'function') {
                window.hljs.highlightAll();
            }
            </script>
        </body>
    </html>`

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFileName; // [✅ แก้ไข] ใช้ชื่อไฟล์ใหม่ที่เราสร้างขึ้น
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('exportComposerContent error:', err);
    showCustomAlert('Export failed. See console for details.', 'Error');
  }
}
