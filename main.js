// ในไฟล์ js/main.js
import './styles/main.css';
/**
 * ฟังก์ชันหลักในการเริ่มต้นการทำงานของแอปพลิเคชันทั้งหมด
 */
async function init() {
    try {
        // ... (ส่วนของการตั้งค่า marked และ UI เหมือนเดิม) ...
        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            gfm: true, breaks: true,
        });
        initCoreUI(); initProjectUI(); initSessionUI(); initAgentUI(); initGroupUI(); initMemoryUI(); initChatUI();
        
        // ... (ส่วนของการตั้งค่า Theme เหมือนเดิม) ...
        const savedTheme = localStorage.getItem('theme') || 'system';
        const themeRadio = document.querySelector(`#theme-switcher input[value="${savedTheme}"]`);
        if (themeRadio) themeRadio.checked = true;
        document.body.classList.toggle('dark-mode', savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
        document.querySelectorAll('#theme-switcher input[name="theme"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const newTheme = e.target.value;
                localStorage.setItem('theme', newTheme);
                 document.body.classList.toggle('dark-mode', newTheme === 'dark' || (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
            });
        });

        // --- START: [REVISED] Logic การโหลดโปรเจกต์ล่าสุด (ฉบับทนทาน) ---
        const lastProjectId = localStorage.getItem('lastActiveProjectId');
        
        if (lastProjectId) {
            console.log(`พบโปรเจกต์ล่าสุด: ${lastProjectId}, กำลังพยายามโหลด...`);
            try {
                await openDb(lastProjectId);
                
                // [FIX] ดึง Object ที่ครอบข้อมูลโปรเจกต์ไว้อีกที
                const storedObject = await dbRequest(METADATA_STORE_NAME, 'readonly', 'get', METADATA_KEY);
                const sessions = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'getAll');
                
                // [FIX] ตรวจสอบว่ามีข้อมูล และมี projectData อยู่ข้างในหรือไม่
                if (storedObject && storedObject.projectData && sessions) {
                    const metadata = storedObject.projectData; // ดึงข้อมูลโปรเจกต์จริงๆ ออกมา
                    
                    // [FIX] เพิ่มการตรวจสอบ ID เพื่อความปลอดภัย
                    if (metadata.id !== lastProjectId) {
                        throw new Error("Project ID mismatch between localStorage and IndexedDB.");
                    }

                    const lastProject = { ...metadata, chatSessions: sessions };
                    await loadProjectData(lastProject, false);
                    console.log("โหลดโปรเจกต์ล่าสุดสำเร็จ");

                } else {
                    throw new Error("ไม่พบข้อมูลโปรเจกต์ที่สมบูรณ์ใน IndexedDB");
                }
            } catch (error) {
                console.error("เกิดข้อผิดพลาดในการโหลดโปรเจกต์ล่าสุด:", error);
                // หากมีปัญหา ให้ล้าง ID ที่อาจไม่ถูกต้องทิ้ง แล้วเริ่มใหม่
                localStorage.removeItem('lastActiveProjectId');
                await proceedWithCreatingNewProject();
            }
        } else {
            console.log("ไม่พบโปรเจกต์ล่าสุด, กำลังสร้างโปรเจกต์ใหม่...");
            await proceedWithCreatingNewProject();
        }
        // --- END: [REVISED] Logic การโหลดโปรเจกต์ล่าสุด ---

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
