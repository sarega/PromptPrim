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
        
        document.getElementById('app-version').textContent = APP_VERSION;
        
        initializeTheme();

        // [STABLE VERSION] Always start with a new project for stability.
        // User can open an existing project manually.
        await proceedWithCreatingNewProject();
        
        setupEventListeners();
        makeSidebarResizable();

    } catch (error) {
        console.error("Critical initialization failed:", error);
        // Display a clear error message if something unexpected happens.
        showCustomAlert(
            `An unexpected error occurred during startup: ${error.message}. Please try clearing your website data (F12 > Application > Storage > Clear site data) and reloading the page.`,
            "Fatal Error"
        );
    }
}



function setupEventListeners() {
    // This function's content from your uploaded file is correct and stable.
    // It sets up listeners for UI elements like inputs and buttons.
    // No changes are needed here for the rollback.
    const chatInput = document.getElementById('chatInput');

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            sendMessage();
        }
    });

    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        updateContextInspector();
    });

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

    document.getElementById('system-utility-model-select').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    document.getElementById('system-utility-prompt').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    document.getElementById('system-utility-summary-prompt').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    document.getElementById('system-utility-temperature').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    document.getElementById('system-utility-topP').addEventListener('change', (e) => saveSystemUtilityAgentSettings());
    document.getElementById('system-utility-summary-preset-select').addEventListener('change', handleSummarizationPresetChange);
    document.getElementById('save-summary-preset-btn').addEventListener('click', handleSaveSummarizationPreset);

    document.getElementById('entitySelector').addEventListener('change', loadSelectedEntity);

    document.getElementById('chat-actions-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('chat-actions-menu').classList.toggle('active');
    });

    document.getElementById('manual-summarize-btn').addEventListener('click', (e) => {
        e.preventDefault();
        handleManualSummarize();
        document.getElementById('chat-actions-menu').classList.remove('active');
    });

    document.getElementById('clear-summary-btn').addEventListener('click', (e) => {
        e.preventDefault();
        unloadSummaryFromActiveSession(e);
        document.getElementById('chat-actions-menu').classList.remove('active');
    });

    document.getElementById('menu-upload-file-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;
        fileInput.onchange = handleFileUpload;
        fileInput.click();
        document.getElementById('chat-actions-menu').classList.remove('active');
    });

    document.getElementById('generate-agent-profile-btn').addEventListener('click', generateAgentProfile);

    window.addEventListener('beforeunload', (event) => {
        if (isDirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.custom-select-wrapper')) {
            document.getElementById('custom-entity-selector-wrapper').classList.remove('open');
        }
        if (!event.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.open').forEach(d => { d.classList.remove('open'); });
            document.querySelectorAll('.item.z-index-front').forEach(i => { i.classList.remove('z-index-front'); });
        }
        if (!event.target.closest('#chat-actions-container')) {
            document.getElementById('chat-actions-menu').classList.remove('active');
        }
    });
}

// [ROLLBACK] This function is no longer used in the init() sequence for stability.
// It remains here in case we want to re-implement the auto-load feature later.
async function loadLastActiveProject() {
    const lastProjectId = localStorage.getItem('lastActiveProjectId');
    if (lastProjectId) {
         // In this stable version, we do nothing to avoid loading conflicts.
    }
    // The init() function will call proceedWithCreatingNewProject() directly.
}

// Theme Management Logic - This part is stable and correct.
const themeSwitcher = document.getElementById('theme-switcher');
const themeRadios = themeSwitcher.querySelectorAll('input[type="radio"]');

function applyTheme(theme) {
    if (theme === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('dark-mode', systemPrefersDark);
    } else {
        document.body.classList.toggle('dark-mode', theme === 'dark');
    }
}

function handleThemeChange(event) {
    const selectedTheme = event.target.value;
    localStorage.setItem('theme', selectedTheme);
    applyTheme(selectedTheme);
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'system';
    
    themeRadios.forEach(radio => {
        if (radio.value === savedTheme) {
            radio.checked = true;
        }
        radio.addEventListener('change', handleThemeChange);
    });

    applyTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const currentTheme = localStorage.getItem('theme') || 'system';
        if (currentTheme === 'system') {
            applyTheme('system');
        }
    });
}

// --- Start the application ---
init();
