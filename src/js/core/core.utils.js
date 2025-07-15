// ===============================================
// FILE: src/js/core/core.utils.js (New File)
// DESCRIPTION: A collection of reusable utility functions.
// ===============================================

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. This is useful for preventing expensive operations (like saving to a DB)
 * from running on every single keystroke.
 *
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} Returns the new debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
// ในไฟล์: src/js/core/core.utils.js

/**
 * Converts a numeric timestamp into a readable "YYYY-MM-DD HH:MM:SS" format.
 * @param {number} timestamp - The timestamp (e.g., from Date.now()).
 * @returns {string} The formatted date and time string.
 */
export function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}


/**
 * [FINAL VERSION] คลาสสำหรับจัดการการแสดงผล Markdown แบบสดๆ จาก Stream
 * เวอร์ชันนี้จะไม่มีการเรียกใช้ ChatUI หรือโมดูลภายนอกอื่นใดๆ
 */
export class LiveMarkdownRenderer {
    constructor(placeholderElement) {
        this.contentDiv = placeholderElement.querySelector('.message-content .streaming-content');
        this.accumulatedMarkdown = '';
        this.isInsideCodeBlock = false;
        this.renderTimeout = null;
        this.debounceDelay = 40; // ms
        
        if (!this.contentDiv) {
            throw new Error("Target content element for rendering not found.");
        }
    }

    /**
     * รับข้อมูล (chunk) ที่ stream มาและจัดคิวเพื่อ render
     * @param {string} chunk - ส่วนของข้อความที่ได้รับมา
     */
    streamChunk = (chunk) => {
        this.accumulatedMarkdown += chunk;
        clearTimeout(this.renderTimeout);
        this.renderTimeout = setTimeout(this.render, this.debounceDelay);
    };

    /**
     * ตรรกะการ render หลัก (ไม่มีการเรียก scrollToBottom)
     */
    render = () => {
        try {
            const inUnclosedCodeBlock = (this.accumulatedMarkdown.match(/```/g) || []).length % 2 === 1;

            if (inUnclosedCodeBlock || this.isInsideCodeBlock) {
                const escapedText = this.accumulatedMarkdown
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                this.contentDiv.innerHTML = `<pre class="streaming-code-preview">${escapedText}</pre>`;
            } else {
                this.contentDiv.innerHTML = marked.parse(this.accumulatedMarkdown, { gfm: true, breaks: false });
            }
            this.isInsideCodeBlock = inUnclosedCodeBlock;
        } catch (e) {
            this.contentDiv.textContent = this.accumulatedMarkdown;
        }
    };
    
    /**
     * @returns {string} ข้อความทั้งหมดที่สะสมไว้
     */
    getFinalContent() {
        clearTimeout(this.renderTimeout);
        return this.accumulatedMarkdown;
    }
}