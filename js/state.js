// --- Global Variables, Constants & State ---
const APP_VERSION = 'v0.6-enhancer';
const DB_NAME_PREFIX = 'AIChatbotDB_Project_';
const SESSIONS_STORE_NAME = 'chatSessions';
const METADATA_STORE_NAME = 'projectMetadata';
const METADATA_KEY = 'projectInfo';

const RANDOMLY_ASSIGNED_ICONS = ['🧑‍💻', '✍️', '🎨', '🕵️‍♂️', '👨‍🔬', '🚀', '💡', '📈', '💬', '🧠', '💼', '📊'];

const ALL_AGENT_SETTINGS_IDS = {
    'agent-name-input': 'name',
    'agent-icon-input': 'icon',
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

// [NEW] เพิ่มค่าเริ่มต้นสำหรับ Summarization Presets
const defaultSummarizationPresets = {
    'Standard': `You are a professional summarizer. Your task is to create a dense, context-rich summary of a conversation.
Include all key entities, character names, locations, critical events, and important emotional states.
The summary should be detailed enough for another AI to pick up the conversation and understand all necessary context.

Here is the summary of the conversation so far:
--- PREVIOUS SUMMARY ---
\${previousSummary}
--- END PREVIOUS SUMMARY ---

Now, here are the new messages that have occurred since that summary:
--- NEW MESSAGES ---
\${newMessages}
--- END NEW MESSAGES ---

Please provide a new, single, cohesive summary that integrates the key points from the new messages into the previous one. Respond with ONLY the new, complete summary text.`,
    'Literary Analyst': `You are a meticulous literary analyst tasked with creating a detailed narrative digest. Your primary goal is to preserve the story's integrity, character development, and emotional nuances. Do NOT sacrifice important details for the sake of brevity.

Your digest must include:
- Plot Progression: Every significant event and the causal links between them.
- Character Arcs: Any changes in a character's state of mind, motivation, decisions, or relationships.
- Key Dialogue: Capture the essence and subtext of crucial conversations.
- Atmosphere & Setting: Mention key descriptions of the environment if they contribute to the mood or plot.
- New Elements: Note the introduction of any new characters, significant objects, or unresolved questions (foreshadowing).

Here is the narrative digest so far:
--- PREVIOUS DIGEST ---
\${previousSummary}
--- END PREVIOUS DIGEST ---

Now, here are the new scenes and dialogues that have occurred:
--- NEW MESSAGES ---
\${newMessages}
--- END NEW MESSAGES ---

Please provide a new, single, cohesive narrative digest that seamlessly integrates the key points from the new messages into the previous one. Write in a third-person, past-tense narrative style. Respond with ONLY the new, complete digest text.`,
    'Continuity Editor': `You are a continuity editor for a novel series. Your job is to create a 'Previously On...' document that ensures no plot points are ever lost. The output must be extremely detailed, acting as a perfect memory for another AI to continue the story without missing a single beat.

The document must retain:
- All character actions and their immediate consequences.
- The full names of any character or location mentioned.
- The specifics of any plans made or secrets revealed.
- Emotional state of each character at the end of the scene.
- Any objects that were acquired, lost, or noted as important.

The goal is maximum information retention, not summarization. Think of this as expanding upon the previous summary with new, detailed information.

Here is the continuity document so far:
--- PREVIOUS SUMMARY ---
\${previousSummary}
--- END PREVIOUS SUMMARY ---

Now, here are the new events to be added:
--- NEW MESSAGES ---
\${newMessages}
--- END NEW MESSAGES ---

Please provide the updated, complete continuity document, integrating the new events chronologically. Your response should be a single block of text containing only the updated document.`
};


// [MODIFIED] ใน defaultSystemUtilityAgent, แก้ไข summarizationPrompt ให้ใช้ค่า default จาก preset
const defaultSystemUtilityAgent = {
    model: 'openai/gpt-4o-mini',
    systemPrompt: 'You are a highly efficient assistant that processes user requests and responds in a structured JSON format when required. You are objective and precise.',
    summarizationPrompt: defaultSummarizationPresets['Standard'], // [MODIFIED]
    temperature: 0.2, topP: 1.0, topK: 0,
    presence_penalty: 0.0, frequency_penalty: 0.0,
    max_tokens: 2048, seed: -1, stop_sequences: ''
};

const defaultMemories = [
    { name: "Code Assistant", content: "You are an expert programmer." },
    { name: "Creative Writer", content: "You are a creative writing assistant." }
];

const defaultAgentSettings = {
    icon: '🤖', model: '', systemPrompt: 'You are a helpful assistant.', useMarkdown: true,
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