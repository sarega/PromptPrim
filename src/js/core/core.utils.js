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