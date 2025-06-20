// --- Core Initialization ---
async function init() {
    try {
        // Configure marked library for markdown parsing
        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            gfm: true,
            breaks: true,
        });
        
        // Load the last active project or create a new one
        await loadLastActiveProject();
        
        // Set up all necessary event listeners
        setupEventListeners();
        
        // Initialize the resizable sidebar functionality
        makeSidebarResizable();

    } catch (error) {
        console.error("Initialization failed:", error);
        // If anything goes wrong, start with a fresh project
        await proceedWithCreatingNewProject();
    }
}

function setupEventListeners() {
    // Send message on Enter key press (but not with Shift)
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            sendMessage(); 
        }
    });

    // Update context inspector on input change
    document.getElementById('chatInput').addEventListener('input', updateContextInspector);

    // Save API settings on change
    document.getElementById('apiKey').addEventListener('change', () => {
         currentProject.globalSettings.apiKey = document.getElementById('apiKey').value;
         updateAndPersistState();
     });
    document.getElementById('ollamaBaseUrl').addEventListener('change', () => {
         currentProject.globalSettings.ollamaBaseUrl = document.getElementById('ollamaBaseUrl').value;
         updateAndPersistState();
     });

    // Save font settings on change
    document.getElementById('fontFamilySelect').addEventListener('change', () => {
         currentProject.globalSettings.fontFamilySelect = document.getElementById('fontFamilySelect').value;
         applyFontSettings();
         updateAndPersistState();
     });

    // Handle active entity selection change
    document.getElementById('entitySelector').addEventListener('change', loadSelectedEntity);
    
    // [NEW] Event listeners for the new chat actions menu
    document.getElementById('chat-actions-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('chat-actions-menu').classList.toggle('active');
    });

    document.getElementById('manual-summarize-btn').addEventListener('click', (e) => {
        e.preventDefault();
        handleManualSummarize();
        document.getElementById('chat-actions-menu').classList.remove('active');
    });

    document.getElementById('menu-upload-file-btn').addEventListener('click', (e) => {
        e.preventDefault();
        showImageUploadModal();
        document.getElementById('chat-actions-menu').classList.remove('active');
    });
    
    // Warn user about unsaved changes before leaving the page
    window.addEventListener('beforeunload', (event) => {
        if (isDirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    // Close dropdowns and menus when clicking outside
    document.addEventListener('click', (event) => {
        // Close sidebar dropdowns
        if (!event.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.open').forEach(d => {
                d.classList.remove('open');
            });
        }
        // Close chat actions menu
        if (!event.target.closest('#chat-actions-container')) {
            document.getElementById('chat-actions-menu').classList.remove('active');
        }
    });
}

async function loadLastActiveProject() {
    const lastProjectId = localStorage.getItem('lastActiveProjectId');
    if (lastProjectId) {
        await openDb(lastProjectId);
        const metadata = await dbRequest(METADATA_STORE_NAME, 'readonly', 'get', METADATA_KEY);
        const sessions = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'getAll');

        if (metadata && metadata.id === lastProjectId) {
            const projectToLoad = { ...metadata, chatSessions: Array.isArray(sessions) ? sessions : [] };
            await loadProjectData(projectToLoad, false);
            return;
        }
    }
    // If no valid last project is found, create a new one
    await proceedWithCreatingNewProject();
}

// --- Start the application ---
init();