// --- Global Variables, Constants & State ---
const DB_NAME_PREFIX = 'AIChatbotDB_Project_';
const SESSIONS_STORE_NAME = 'chatSessions';
const METADATA_STORE_NAME = 'projectMetadata';
const METADATA_KEY = 'projectInfo';
const ALL_AGENT_SETTINGS_IDS = {
    'agent-name-input': 'name',
    'agent-model-select': 'model',
    'agent-system-prompt': 'systemPrompt',
    'agent-use-markdown': 'useMarkdown',
    'agent-temperature': 'temperature',
    'agent-topP': 'topP',
    'agent-topK': 'topK',
    'agent-presence-penalty': 'presence_penalty',
    'agent-frequency-penalty': 'frequency_penalty',
    'agent-max-tokens': 'max_tokens',
    'agent-seed': 'seed',
    'agent-stop-sequences': 'stop_sequences',
};

const defaultMemories = [
    { name: "Code Assistant", content: "You are an expert programmer." },
    { name: "Creative Writer", content: "You are a creative writing assistant." }
];

const defaultAgentSettings = {
    model: '',
    systemPrompt: 'You are a helpful assistant.',
    useMarkdown: true,
    temperature: 1.0, topP: 1.0, topK: 0,
    presence_penalty: 0.0, frequency_penalty: 0.0,
    max_tokens: 4096, seed: -1, stop_sequences: ''
};

let db;
let currentProject = {};
let allProviderModels = [];
let isLoading = false;
let abortController = null;
let memorySortable = null;
let attachedFile = null;

let isDirty = false;
let pendingFileToOpen = null;
let pendingActionAfterSave = null; 
let editingAgentName = null;
let editingGroupName = null;

// --- Dirty Flag & State Persistence ---
function markAsDirty() {
    if (isDirty) return;
    isDirty = true;
    const projectTitleEl = document.getElementById('project-title');
    if (projectTitleEl && !projectTitleEl.textContent.endsWith('*')) {
        projectTitleEl.textContent += ' *';
    }
}

function markAsClean() {
    isDirty = false;
    const projectTitleEl = document.getElementById('project-title');
    if (projectTitleEl && projectTitleEl.textContent.endsWith(' *')) {
        projectTitleEl.textContent = projectTitleEl.textContent.slice(0, -2);
    }
}

async function updateAndPersistState() {
    markAsDirty();
    const metadata = { ...currentProject };
    delete metadata.chatSessions;
    await dbRequest(METADATA_STORE_NAME, 'readwrite', 'put', { id: METADATA_KEY, ...metadata });
    updateContextInspector();
}
