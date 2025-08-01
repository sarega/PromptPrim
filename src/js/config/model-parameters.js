// src/js/config/model-parameters.js

/**
 * นี่คือ "พิมพ์เขียว" หรือ Source of Truth สำหรับ Advanced Parameters ทั้งหมด
 * provider: 'all' = ใช้ได้กับทุก Backend
 * provider: 'openrouter' = ใช้ได้เฉพาะ OpenRouter
 * provider: 'ollama' = ใช้ได้เฉพาะ Ollama
 * type: 'range' (slider+number), 'text', 'select'
 */
export const MODEL_PARAMETER_DEFINITIONS = {
    // --- Core Parameters ---
    temperature: { 
        label: 'Temperature', provider: 'all', type: 'range',
        min: 0, max: 2, step: 0.01, default: 1.0,
        tooltip: 'Controls randomness. Higher is more creative.' 
    },
    top_p: { 
        label: 'Top P', provider: 'all', type: 'range',
        min: 0, max: 1, step: 0.01, default: 1.0,
        tooltip: 'Controls diversity via nucleus sampling.' 
    },
    top_k: { 
        label: 'Top K', provider: 'all', type: 'range',
        min: 0, max: 100, step: 1, default: 0,
        tooltip: 'Limits sampling to the K most likely tokens.'
    },
    max_tokens: { 
        label: 'Max Tokens', provider: 'all', type: 'range',
        min: 1, max: 32768, step: 1, default: 4096,
        tooltip: 'The maximum number of tokens to generate.'
    },
    frequency_penalty: { 
        label: 'Frequency Penalty', provider: 'all', type: 'range',
        min: -2, max: 2, step: 0.01, default: 0,
        tooltip: 'Reduces the likelihood of repeating the same lines.'
    },
    presence_penalty: { 
        label: 'Presence Penalty', provider: 'all', type: 'range',
        min: -2, max: 2, step: 0.01, default: 0,
        tooltip: 'Reduces the likelihood of repeating existing topics.'
    },
    seed: {
        label: 'Seed', provider: 'all', type: 'number',
        default: -1,
        tooltip: 'Use -1 for random output, or a specific number for deterministic output.'
    },
    stop_sequences: {
        label: 'Stop Sequences', provider: 'all', type: 'text',
        default: '',
        tooltip: 'Comma-separated list of sequences to stop generation.'
    },

    // --- OpenRouter Only ---
    logit_bias: {
        label: 'Logit Bias', provider: 'openrouter', type: 'textarea',
        default: '',
        tooltip: 'Advanced: Enter "token:bias" pairs (e.g., "123:-1, 456:1.5").'
    },
    
    // --- Ollama Only ---
    mirostat: {
        label: 'Mirostat', provider: 'ollama', type: 'select', 
        options: [0, 1, 2], default: 0,
        tooltip: 'Enables Mirostat sampling (0 = disabled, 1 = v1, 2 = v2).'
    },
    mirostat_tau: {
        label: 'Mirostat Tau', provider: 'ollama', type: 'range',
        min: 0, max: 10, step: 0.1, default: 5.0,
        tooltip: 'Controls the balance between coherence and diversity for Mirostat.'
    },
    mirostat_eta: {
        label: 'Mirostat Eta', provider: 'ollama', type: 'range',
        min: 0, max: 1, step: 0.01, default: 0.1,
        tooltip: 'Controls the learning rate for Mirostat.'
    },
    repeat_penalty: {
        label: 'Repeat Penalty', provider: 'ollama', type: 'range',
        min: 0, max: 2, step: 0.01, default: 1.1,
        tooltip: 'Strongly penalizes repeating tokens. A higher value reduces repetition more.'
    },
};