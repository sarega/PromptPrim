// ===============================================
// FILE: src/js/core/core.state.js (Complete)
// DESCRIPTION: Central state management as a true ES Module.
// ===============================================

// --- Global Constants are defined here and will be available to any file that imports them ---
export const APP_VERSION = 'v0.9-modular';
export const DB_NAME_PREFIX = 'AIChatbotDB_Project_';
export const SESSIONS_STORE_NAME = 'chatSessions';
export const METADATA_STORE_NAME = 'projectMetadata';
export const METADATA_KEY = 'projectInfo';

export const ALL_AGENT_SETTINGS_IDS = {
    'agent-name-input': 'name', 'agent-icon-input': 'icon', 'agent-model-select': 'model',
    'agent-system-prompt': 'systemPrompt', 'agent-use-markdown': 'useMarkdown',
    'agent-temperature': 'temperature', 'agent-topP': 'topP', 'agent-topK': 'topK',
    'agent-presence-penalty': 'presence_penalty', 'agent-frequency-penalty': 'frequency_penalty',
    'agent-max-tokens': 'max_tokens', 'agent-seed': 'seed', 'agent-stop-sequences': 'stop_sequences',
};

// Default values are also exported so other modules can use them.
export const defaultSummarizationPresets = {
    'Standard': `You are a professional summarizer...`, // (Content omitted for brevity)
    'Literary Analyst': `You are a meticulous literary analyst...`,
    'Continuity Editor': `You are a continuity editor...`
};
export const defaultSystemUtilityAgent = {
    model: 'openai/gpt-4o-mini',
    systemPrompt: 'You are a highly efficient assistant that processes user requests and responds in a structured JSON format when required. You are objective and precise.',
    summarizationPrompt: defaultSummarizationPresets['Standard'], 
    temperature: 0.2, topP: 1.0, topK: 0,
    presence_penalty: 0.0, frequency_penalty: 0.0,
    max_tokens: 2048, seed: -1, stop_sequences: ''
};
export const defaultMemories = [
    { name: "Code Assistant", content: "You are an expert programmer." },
    { name: "Creative Writer", content: "You are a creative writing assistant." }
];
export const defaultAgentSettings = {
    icon: '🤖', model: '', systemPrompt: 'You are a helpful assistant.', useMarkdown: true,
    temperature: 1.0, topP: 1.0, topK: 0, 
    presence_penalty: 0.0, frequency_penalty: 0.0,
    max_tokens: 4096, seed: -1, stop_sequences: ''
};

// --- Private State ---
const _appState = {
    currentProject: {},
    allProviderModels: [],
    isLoading: false,
    isDirty: false,
    abortController: null,
    editingAgentName: null,
    editingGroupName: null,
    pendingFileToOpen: null,
    pendingActionAfterSave: null
};

// --- Event Bus (Publisher/Subscriber) ---
const eventBus = {
    events: {},
    subscribe(eventName, fn) {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(fn);
        return () => {
            this.events[eventName] = this.events[eventName].filter(eventFn => fn !== eventFn);
        };
    },
    publish(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(fn => fn(data));
        }
    }
};

// --- Public State Manager ---
// This is the single exported object that the rest of the app will use.
export const stateManager = {
    // Getters
    getState: () => _appState,
    getProject: () => _appState.currentProject,
    isLoading: () => _appState.isLoading,
    isDirty: () => _appState.isDirty,

    // Setters
    setState: (key, value) => { _appState[key] = value; },
    setProject: (newProject) => {
        _appState.currentProject = newProject;
        eventBus.publish('project:stateChanged', _appState.currentProject);
    },
    setLoading: (status) => {
        if (_appState.isLoading === status) return;
        _appState.isLoading = status;
        eventBus.publish('loading:changed', status);
    },
    setDirty: (status) => {
        if (_appState.isDirty === status) return;
        _appState.isDirty = status;
        eventBus.publish('dirty:changed', status);
    },
    setAllModels: (models) => {
        _appState.allProviderModels = models.sort((a, b) => a.name.localeCompare(b.name));
        if (_appState.currentProject.globalSettings) {
            _appState.currentProject.globalSettings.allModels = _appState.allProviderModels;
        }
        eventBus.publish('models:loaded', _appState.allProviderModels);
    },

    // Abort Controller
    newAbortController: () => {
        _appState.abortController = new AbortController();
        return _appState.abortController;
    },
    abort: () => {
        if (_appState.abortController) {
            _appState.abortController.abort();
            _appState.abortController = null;
        }
    },

    // Direct access to Event Bus
    bus: eventBus
};
