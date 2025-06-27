// ===============================================
// FILE: src/main.js (Corrected Version)
// DESCRIPTION: Main application entry point.
// ===============================================

// 1. Import the entire CSS structure
import './styles/main.css';
// Ensure core state and global constants are initialised
import '../js/core/core.state.js';

// 2. Import necessary functions from all other modules
// Note: You must add 'export' to these functions in their original files.
import { openDb, dbRequest } from '../js/core/core.db.js';
import { loadAllProviderModels } from '../js/core/core.api.js';
import { initCoreUI } from '../js/core/core.ui.js';
import { initProjectUI } from '../js/modules/project/project.ui.js';
import { loadProjectData, proceedWithCreatingNewProject } from '../js/modules/project/project.handlers.js';
import { initSessionUI } from '../js/modules/session/session.ui.js';
import { initAgentUI } from '../js/modules/agent/agent.ui.js';
import { initGroupUI } from '../js/modules/group/group.ui.js';
import { initMemoryUI } from '../js/modules/memory/memory.ui.js';
import { initChatUI, showCustomAlert } from '../js/modules/chat/chat.ui.js'; // Assuming showCustomAlert is in chat.ui.js

/**
 * ฟังก์ชันหลักในการเริ่มต้นการทำงานของแอปพลิเคชันทั้งหมด
 */
export async function init() {
    try {
        // --- Library Setup ---
        if (window.marked) {
            marked.setOptions({
                highlight: function(code, lang) {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                },
                gfm: true,
                breaks: true,
            });
        }

        // --- Initialize All UI Modules ---
        initCoreUI();
        initProjectUI();
        initSessionUI();
        initAgentUI();
        initGroupUI();
        initMemoryUI();
        initChatUI();

        // --- Theme Initialization ---
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

        // --- Project Loading Logic ---
        const lastProjectId = localStorage.getItem('lastActiveProjectId');
        if (lastProjectId) {
            console.log(`Found last active project: ${lastProjectId}, attempting to load...`);
            try {
                await openDb(lastProjectId);
                const storedObject = await dbRequest('projectMetadata', 'readonly', 'get', 'projectInfo');
                
                if (storedObject && storedObject.projectData && storedObject.projectData.id === lastProjectId) {
                    const sessions = await dbRequest('chatSessions', 'readonly', 'getAll');
                    const lastProject = { ...storedObject.projectData, chatSessions: sessions };
                    await loadProjectData(lastProject, false);
                    console.log("Successfully loaded the last active project.");
                } else {
                    throw new Error("Project data in DB is invalid or mismatched.");
                }
            } catch (error) {
                console.error("Failed to load last project, creating a new one.", error);
                localStorage.removeItem('lastActiveProjectId');
                await proceedWithCreatingNewProject();
            }
        } else {
            console.log("No last active project found, creating a new one.");
            await proceedWithCreatingNewProject();
        }

    } catch (error) {
        console.error("Critical initialization failed:", error);
        if (typeof showCustomAlert === 'function') {
            showCustomAlert(
                `An unexpected error occurred during startup: ${error.message}. Please try reloading the page.`,
                "Fatal Error"
            );
        }
    }
}

// Start the application after the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', init);
