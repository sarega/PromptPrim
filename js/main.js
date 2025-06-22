// --- Core Initialization ---
async function init() {
    try {
        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            gfm: true, breaks: true,
        });
        
        document.getElementById('app-version').textContent = APP_VERSION; // [MODIFIED]
        
        await loadLastActiveProject();
        setupEventListeners();
        makeSidebarResizable();

    } catch (error) {
        console.error("Initialization failed:", error);
        await proceedWithCreatingNewProject();
    }
}

function setupEventListeners() {
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('chatInput').addEventListener('input', updateContextInspector);

    // --- Global Settings Listeners ---
    document.getElementById('apiKey').addEventListener('change', () => {
         currentProject.globalSettings.apiKey = document.getElementById('apiKey').value;
         updateAndPersistState();
    });
    document.getElementById('ollamaBaseUrl').addEventListener('change', () => {
         currentProject.globalSettings.ollamaBaseUrl = document.getElementById('ollamaBaseUrl').value;
         updateAndPersistState();
    });
    document.getElementById('fontFamilySelect').addEventListener('change', () => {
         currentProject.globalSettings.fontFamilySelect = document.getElementById('fontFamilySelect').value;
         applyFontSettings();
         updateAndPersistState();
    });

    // [NEW] Listeners for System Utility Agent Settings
    document.getElementById('system-utility-model-select').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    document.getElementById('system-utility-prompt').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    document.getElementById('system-utility-summary-prompt').addEventListener('change', (e) => saveSystemUtilityAgentSettings()); // [NEW]
    document.getElementById('system-utility-temperature').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    document.getElementById('system-utility-topP').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    
    document.getElementById('entitySelector').addEventListener('change', loadSelectedEntity);
    
    document.getElementById('chat-actions-btn').addEventListener('click', (e) => {
        e.stopPropagation(); document.getElementById('chat-actions-menu').classList.toggle('active');
    });

    document.getElementById('manual-summarize-btn').addEventListener('click', (e) => {
        e.preventDefault(); handleManualSummarize();
        document.getElementById('chat-actions-menu').classList.remove('active');
    });
    document.getElementById('clear-summary-btn').addEventListener('click', (e) => {
        e.preventDefault(); unloadSummaryFromActiveSession(e);
        document.getElementById('chat-actions-menu').classList.remove('active');
    });
    document.getElementById('menu-upload-file-btn').addEventListener('click', (e) => {
        e.preventDefault(); showImageUploadModal();
        document.getElementById('chat-actions-menu').classList.remove('active');
    });

    // [NEW] Listener for the new Generate Agent Profile button
    document.getElementById('generate-agent-profile-btn').addEventListener('click', generateAgentProfile);
    
    window.addEventListener('beforeunload', (event) => {
        if (isDirty) { event.preventDefault(); event.returnValue = ''; }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.open').forEach(d => { d.classList.remove('open'); });
            document.querySelectorAll('.item.z-index-front').forEach(i => { i.classList.remove('z-index-front'); });
        }
        if (!event.target.closest('#chat-actions-container')) {
            document.getElementById('chat-actions-menu').classList.remove('active');
        }
    });
}

async function loadLastActiveProject() {
    const lastProjectId = localStorage.getItem('lastActiveProjectId');
    if (lastProjectId) {
        try {
            await openDb(lastProjectId);
            const metadata = await dbRequest(METADATA_STORE_NAME, 'readonly', 'get', METADATA_KEY);
            const sessions = await dbRequest(SESSIONS_STORE_NAME, 'readonly', 'getAll');

            if (metadata && metadata.id === lastProjectId) {
                const projectToLoad = { ...metadata, chatSessions: Array.isArray(sessions) ? sessions : [] };
                await loadProjectData(projectToLoad, false);
                return;
            }
        } catch (err) {
            console.warn("Could not load last project, starting fresh.", err);
            localStorage.removeItem('lastActiveProjectId');
        }
    }
    await proceedWithCreatingNewProject();
}

// --- Start the application ---
init();