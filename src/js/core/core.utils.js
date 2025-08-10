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

/**
 * [THE FIX] This function is now renamed and modified to always return a full,
 * detailed timestamp in the format "YYYY-MM-DD HH:MM:SS".
 * @param {number} timestamp - The timestamp (e.g., from Date.now()).
 * @returns {string} The formatted date and time string.
 */
export function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';

    const now = new Date();
    const messageDate = new Date(timestamp);
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    // [THE FIX] Change the locale from 'en-GB' to 'th-TH'
    const timeFormat = { hour: '2-digit', minute: '2-digit', hour12: false };
    const timeString = messageDate.toLocaleTimeString('th-TH', timeFormat);

    if (messageDate >= startOfToday) {
        // If the message is from today, show "Today" and the time.
        return `Today ${timeString}`;
    } else if (messageDate >= startOfYesterday) {
        // If the message is from yesterday, show "Yesterday" and the time.
        return `Yesterday ${timeString}`;
    } else {
        // For older messages, show the full date and time.
        const dateFormat = { day: '2-digit', month: '2-digit', year: 'numeric' };
        const dateString = messageDate.toLocaleDateString('th-TH', dateFormat);
        return `${dateString} ${timeString}`;
    }
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
        this.isFinished = false; // [ADD THIS] เพิ่ม "สวิตช์ปิด"
        
        if (!this.contentDiv) {
            throw new Error("Target content element for rendering not found.");
        }
    }

    streamChunk = (chunk) => {
        if (this.isFinished) return; // ถ้าจบแล้ว ไม่ต้องทำอะไรต่อ
        this.accumulatedMarkdown += chunk;
        clearTimeout(this.renderTimeout);
        this.renderTimeout = setTimeout(this.render, this.debounceDelay);
    };

    render = () => {
        if (this.isFinished) return;
        try {
            // นับจำนวน code block (```)
            const inUnclosedCodeBlock = (this.accumulatedMarkdown.match(/```/g) || []).length % 2 === 1;

            if (inUnclosedCodeBlock) {
                // ถ้าใช่ ให้แสดงเป็น Text ธรรมดาไปก่อนเพื่อป้องกัน HTML เสียหาย
                const escapedText = this.accumulatedMarkdown
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                this.contentDiv.innerHTML = `<pre class="streaming-code-preview">${escapedText}</pre>`;
            } else {
                // ถ้าไม่ใช่ (อยู่ข้างนอก Code Block) ให้แปลงเป็น Markdown ตามปกติ
                this.contentDiv.innerHTML = marked.parse(this.accumulatedMarkdown, { gfm: true, breaks: false });
            }
        } catch (e) {
            // Fallback: ถ้าเกิด Error ให้แสดงเป็น Text ธรรมดา
            this.contentDiv.textContent = this.accumulatedMarkdown;
        }
    };
    
    getFinalContent() {
        this.isFinished = true;
        clearTimeout(this.renderTimeout);
        return this.accumulatedMarkdown;
    }
}
