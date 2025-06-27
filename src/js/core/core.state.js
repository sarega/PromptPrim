// ===============================================
// FILE: src/js/core/core.state.js (Corrected Export)
// DESCRIPTION: Central state management as a true ES Module.
// ===============================================

// --- Global Constants & Defaults ---
// [FIX] All constants are now exported correctly.
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
    'Standard': `You are a professional summarizer. Your task is to create a dense, context-rich summary of a conversation. Include all key entities, character names, locations, critical events, and important emotional states. The summary should be detailed enough for another AI to pick up the conversation and understand all necessary context.\n\nHere is the summary of the conversation so far:\n--- PREVIOUS SUMMARY ---\n\${previousSummary}\n--- END PREVIOUS SUMMARY ---\n\nNow, here are the new messages that have occurred since that summary:\n--- NEW MESSAGES ---\n\${newMessages}\n--- END NEW MESSAGES ---\n\nPlease provide a new, single, cohesive summary that integrates the key points from the new messages into the previous one. Respond with ONLY the new, complete summary text.`,
    'Literary Analyst': `You are a meticulous literary analyst tasked with creating a detailed narrative digest. Your primary goal is to preserve the story's integrity, character development, and emotional nuances. Do NOT sacrifice important details for the sake of brevity.\n\nYour digest must include:\n- Plot Progression: Every significant event and the causal links between them.\n- Character Arcs: Any changes in a character's state of mind, motivation, decisions, or relationships.\n- Key Dialogue: Capture the essence and subtext of crucial conversations.\n- Atmosphere & Setting: Mention key descriptions of the environment if they contribute to the mood or plot.\n- New Elements: Note the introduction of any new characters, significant objects, or unresolved questions (foreshadowing).\n\nHere is the narrative digest so far:\n--- PREVIOUS DIGEST ---\n\${previousSummary}\n--- END PREVIOUS DIGEST ---\n\nNow, here are the new scenes and dialogues that have occurred:\n--- NEW MESSAGES ---\n\${newMessages}\n--- END NEW MESSAGES ---\n\nPlease provide a new, single, cohesive narrative digest that seamlessly integrates the key points from the new messages into the previous one. Write in a third-person, past-tense narrative style. Respond with ONLY the new, complete digest text.`,
    'Continuity Editor': `You are a continuity editor for a novel series. Your job is to create a 'Previously On...' document that ensures no plot points are ever lost. The output must be extremely detailed, acting as a perfect memory for another AI to continue the story without missing a single beat.\n\nThe document must retain:\n- All character actions and their immediate consequences.\n- The full names of any character or location mentioned.\n- The specifics of any plans made or secrets revealed.\n- Emotional state of each character at the end of the scene.\n- Any objects that were acquired, lost, or noted as important.\n\nThe goal is maximum information retention, not summarization. Think of this as expanding upon the previous summary with new, detailed information.\n\nHere is the continuity document so far:\n--- PREVIOUS SUMMARY ---\n\${previousSummary}\n--- END PREVIOUS SUMMARY ---\n\nNow, here are the new events to be added:\n--- NEW MESSAGES ---\n\${newMessages}\n--- END NEW MESSAGES ---\n\nPlease provide the updated, complete continuity document, integrating the new events chronologically. Your response should be a single block of text containing only the updated document.`
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

// --- Event Bus ---
const eventBus = {
    events: {},
    subscribe(eventName, fn) {
        this.events[eventName] = this.events[eventName] || [];
        this.events[eventName].push(fn);
        return () => { this.events[eventName] = this.events[eventName].filter(eventFn => fn !== eventFn); };
    },
    publish(eventName, data) {
        if (this.events[eventName]) {
            this.events[eventName].forEach(fn => fn(data));
        }
    }
};

// --- Public State Manager ---
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
        if (_appState.currentProject && _appState.currentProject.globalSettings) {
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
