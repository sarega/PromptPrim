// js/main.js

/**
 * ฟังก์ชันหลักในการเริ่มต้นการทำงานของแอปพลิเคชันทั้งหมด
 */
async function init() {
    try {
        // --- 1. ตั้งค่าพื้นฐานสำหรับ Library ภายนอก ---
        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            gfm: true,
            breaks: true,
        });

        // --- 2. เริ่มต้น UI และ Event Listener ส่วนกลางและของแต่ละ Module ---
        // ส่วนนี้สำคัญมาก เพราะจะเป็นการนำ Event Listener ที่เราเตรียมไว้ไปผูกกับปุ่มต่างๆ
        initCoreUI();
        initProjectUI();
        initSessionUI();
        initAgentUI();
        initGroupUI();
        initMemoryUI();
        initChatUI();
        
        // --- 3. ตั้งค่า Theme เริ่มต้น ---
        const savedTheme = localStorage.getItem('theme') || 'system';
        document.querySelector(`#theme-switcher input[value="${savedTheme}"]`).checked = true;
        document.body.classList.toggle('dark-mode', savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
        document.querySelectorAll('#theme-switcher input[name="theme"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const newTheme = e.target.value;
                localStorage.setItem('theme', newTheme);
                 document.body.classList.toggle('dark-mode', newTheme === 'dark' || (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
            });
        });

        // --- 4. เริ่มต้นโปรเจกต์ใหม่เป็นค่าเริ่มต้น ---
        await proceedWithCreatingNewProject();

    } catch (error) {
        console.error("Critical initialization failed:", error);
        showCustomAlert(
            `An unexpected error occurred during startup: ${error.message}. Please try reloading the page.`,
            "Fatal Error"
        );
    }
}

// --- เริ่มต้นการทำงานของแอปพลิเคชันหลังจากที่ HTML โหลดเสร็จสมบูรณ์ ---
document.addEventListener('DOMContentLoaded', init);
// --- เริ่มต้นการทำงานของแอปพลิเคชัน ---
