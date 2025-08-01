// ===============================================
// FILE: src/js/core/core.api.js 
// DESCRIPTION: เปลี่ยน Model เริ่มต้นเป็น Gemma 3 27B
// ===============================================

import { stateManager } from './core.state.js';
import * as UserService from '../modules/user/user.service.js';
import { estimateTokens } from '../modules/chat/chat.handlers.js';

// import { recommendedModelIds } from './core.state.js';

const modelCapabilities = {
    // Perplexity ไม่ต้องการ params ส่วนใหญ่และไม่รู้จัก tools parameter
    'perplexity/sonar-small-online': { penalties: false, seed: false, top_k: false, tools: false },
    'perplexity/sonar-medium-online': { penalties: false, seed: false, top_k: false, tools: false },
    // Grok (xAI) ไม่รองรับ Penalties และ Seed
    'xai/grok-1.5': { penalties: false, seed: false },
};

/**
 * ฟังก์ชันตรวจสอบความสามารถของโมเดลแบบยืดหยุ่น
 * @param {string} modelId - ID ของโมเดล
 * @param {string} capability - ชื่อความสามารถที่ต้องการตรวจสอบ (e.g., 'penalties', 'seed', 'tools')
 * @returns {boolean} - คืนค่า true ถ้าโมเดลรองรับ, false ถ้าไม่รองรับ
 */
function getCapability(modelData, capability) {
    if (!modelData || !modelData.id) return false; // เพิ่มการป้องกัน

    const modelId = modelData.id;
    const specificCaps = modelCapabilities[modelId];
    if (specificCaps && specificCaps[capability] !== undefined) {
        return specificCaps[capability];
    }

    switch (capability) {
        case 'penalties':
        case 'seed':
            return !modelId.startsWith('xai/') && !modelId.startsWith('perplexity/');
        case 'tools':
            // [FIX] แก้ไข Logic นี้ให้ใช้ modelData ที่รับเข้ามา
            return !modelId.startsWith('perplexity/') && modelData.supports_tools;
        default:
            return true;
    }
}

// --- Helper sub-functions (not exported, private to this module) ---
async function fetchOpenRouterModels(apiKey) {
    const response = await fetch('https://openrouter.ai/api/v1/models', { 
        headers: { 'Authorization': `Bearer ${apiKey}` } 
    });
    if (!response.ok) throw new Error('Could not fetch models from OpenRouter');
    const data = await response.json();
    return data.data.map(m => ({ 
        id: m.id, 
        name: m.name || m.id, 
        provider: 'openrouter',
        description: m.description,
        context_length: m.context_length,
        pricing: {
            prompt: m.pricing?.prompt || '0',
            completion: m.pricing?.completion || '0'
        },
        supports_tools: m.architecture?.tool_use === true 
    }));
}

async function fetchOllamaModels(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) throw new Error(`Ollama connection failed (HTTP ${response.status})`);
        const data = await response.json();
        return data.models.map(m => ({ id: m.name, name: m.name, provider: 'ollama', supports_tools: false }));
    } catch (error) {
        throw new Error('Could not connect to Ollama. Check URL and CORS settings.');
    }
}

async function fetchWithTimeout(resource, options = {}, timeout = 120000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const signal = AbortSignal.any([options.signal, controller.signal].filter(Boolean));
    try {
        return await fetch(resource, { ...options, signal });
    } finally {
        clearTimeout(id);
    }
}

// --- Main Exported Functions ---
export async function loadAllProviderModels({ apiKey, isUserKey = false } = {}) {
    if (!apiKey) {
        console.warn("loadAllProviderModels called without an API key. Aborting.");
        // For user keys, we can clear the list
        if(isUserKey) stateManager.setUserModels([]);
        return;
    }

    stateManager.bus.publish('status:update', { message: 'Loading models...', state: 'loading' });
    
    let allModels = [];
    try {
        // We only support OpenRouter for this function now, Ollama is separate
        allModels = await fetchOpenRouterModels(apiKey);
    } catch (error) {
        stateManager.bus.publish('status:update', { message: `Error loading models: ${error.message}`, state: 'error' });
    }
    
    // [FIX] Save to the correct state based on the type of key used
    if (isUserKey) {
        stateManager.setUserModels(allModels);
        console.log(`Loaded ${allModels.length} models for the User.`);
    } else {
        stateManager.setSystemModels(allModels);
        console.log(`Loaded ${allModels.length} models for the System.`);
    }
}

export async function loadAllSystemModels() {
    stateManager.bus.publish('status:update', { message: 'Loading all system models...', state: 'loading' });
    
    const settings = UserService.getSystemApiSettings();
    let allModels = [];

    // 1. พยายามดึงโมเดลจาก OpenRouter
    if (settings.openrouterKey) {
        try {
            console.log("Fetching models from OpenRouter...");
            const openRouterModels = await fetchOpenRouterModels(settings.openrouterKey);
            allModels.push(...openRouterModels);
        } catch (error) {
            console.error("Failed to fetch OpenRouter models:", error);
            showCustomAlert("Could not fetch models from OpenRouter. Check your API key and connection.", "Warning");
        }
    }

    // 2. พยายามดึงโมเดลจาก Ollama
    if (settings.ollamaBaseUrl) {
        try {
            console.log("Fetching models from Ollama...");
            const ollamaModels = await fetchOllamaModels(settings.ollamaBaseUrl);
            allModels.push(...ollamaModels);
        } catch (error) {
            console.error("Failed to fetch Ollama models:", error);
            showCustomAlert("Could not connect to Ollama. Check the Base URL and ensure Ollama is running.", "Warning");
        }
    }
    
    // 3. บันทึกโมเดลทั้งหมดที่หาเจอเข้าสู่ State
    stateManager.setSystemModels(allModels);
    
    console.log(`Loaded a total of ${allModels.length} system models.`);
    stateManager.bus.publish('status:update', { message: 'Models loaded', state: 'connected' });
}

export function getFullSystemPrompt(agentName) {
    const project = stateManager.getProject();
    if (!project) return "";
    let entityAgent;
    const activeEntity = project.activeEntity;
    const targetName = agentName || activeEntity?.name;
    const targetType = agentName ? 'agent' : activeEntity?.type;
    if (!targetName) return "";
    if (targetType === 'agent') {
        entityAgent = project.agentPresets?.[targetName];
    } else if (targetType === 'group') {
        const group = project.agentGroups?.[targetName];
        entityAgent = project.agentPresets?.[group?.moderatorAgent];
    }
    if (!entityAgent) return "";
    let basePrompt = entityAgent.systemPrompt || "";
    const activeMemoryNames = entityAgent.activeMemories || [];
    if (activeMemoryNames.length === 0) {
        return basePrompt.trim();
    }
    const memoryContent = activeMemoryNames
        .map(name => {
            const memory = project.memories.find(m => m.name === name);
            return memory ? memory.content : '';
        })
        .filter(content => content)
        .join('\n\n');
    if (!memoryContent) {
        return basePrompt.trim();
    }
    const finalPrompt = `${basePrompt.trim()}\n\n--- Active Memories ---\n${memoryContent}`;
    return finalPrompt;
}

export function buildPayloadMessages(history, targetAgentName) {
    const project = stateManager.getProject();
    const agent = project.agentPresets[targetAgentName];
    if (!agent) return [];
    
    // [FIX] ดึงข้อมูล modelData มาเพื่อตรวจสอบความสามารถ
    const allowedModels = UserService.getAllowedModelsForCurrentUser();
    const allModels = stateManager.getState().allProviderModels;
    const modelData = allowedModels.find(m => m.id === agent.model);
    
    const messages = [];
    const finalSystemPrompt = getFullSystemPrompt(targetAgentName);
    if (finalSystemPrompt) {
        messages.push({ role: 'system', content: finalSystemPrompt });
    }

    history.forEach(msg => {
        if (msg.isLoading || !msg.content) return;

        let apiMessageContent = msg.content;

        // --- Logic การแปลง Content ---
        // ถ้าเป็น Array (มีโอกาสเป็น multimodal)
        if (Array.isArray(apiMessageContent)) {
            // ตรวจสอบว่า Model นี้รองรับ Array content หรือไม่
            // (สมมติว่าเฉพาะ OpenRouter ที่รองรับ และ Ollama ไม่รองรับ)
            const supportsMultimodalArray = modelData?.provider === 'openrouter';

            if (supportsMultimodalArray) {
                // สำหรับ OpenRouter: แปลง image_url format ให้ถูกต้อง
                apiMessageContent = apiMessageContent.map(part => {
                    if (part.type === 'image_url') {
                        return { type: 'image_url', image_url: { url: part.url } };
                    }
                    return part;
                });
            } else {
                // สำหรับ Ollama: แปลง Array ให้เป็น String ล้วนๆ
                apiMessageContent = apiMessageContent
                    .filter(part => part.type === 'text' && part.text)
                    .map(part => part.text)
                    .join('\n');
            }
        }
        
        const apiMessage = {
            role: msg.role,
            content: apiMessageContent
        };
        
        messages.push(apiMessage);
    });

    return messages;
}

export async function generateAndRenameSession(history){
     try{
        const project = stateManager.getProject();
        if(project.activeEntity.type !== 'agent') return;

        const agentName = project.activeEntity.name;
        const agent = project.agentPresets[agentName];
        if(!agent || !agent.model) return;
        
        const titlePrompt = `Based on the conversation, generate a concise title (3-5 words) and a single relevant emoji. Respond with a JSON object like {"title": "your title", "emoji": "👍"}.`;
        
        const messages = [{ role: "user", content: titlePrompt }];
        const responseText = await callLLM({ ...agent, temperature: 0.2 }, messages);
        
        let newTitleData = {};
        try { newTitleData = JSON.parse(responseText.match(/{.*}/s)[0]); } 
        catch(e) { 
            console.error("Failed to parse title JSON:", responseText); 
            const titlePart = responseText.replace(/"/g, '').substring(0, 30);
            newTitleData = { title: titlePart, emoji: '💬' };
        }
        
        const newTitle = `${newTitleData.emoji || '💬'} ${newTitleData.title || 'Untitled'}`;

        if (newTitle) {
            stateManager.bus.publish('session:autoRename', { 
                sessionId: project.activeSessionId, 
                newName: newTitle 
            });
        }
    } catch(e) {
        console.error("Auto-rename failed:", e);
    }
}

function constructApiCall(agent, messages, stream = false) {
    const project = stateManager.getProject();
    
    // [CRITICAL FIX] Check if this is a system-level call
    const isSystemAgentCall = (agent === project.globalSettings.systemUtilityAgent);

    // If it's a system call, use the full list of system models for the check.
    // Otherwise, use the current user's allowed models.
    const modelsToSearchFrom = isSystemAgentCall 
        ? (stateManager.getState().systemProviderModels || [])
        : UserService.getAllowedModelsForCurrentUser();

    const modelData = modelsToSearchFrom.find(m => m.id === agent.model);
    
    if (!modelData) {
        const reason = isSystemAgentCall ? "it might be missing from the system's model list" : "it's not allowed in your current plan";
        throw new Error(`Model '${agent.model}' not found or not allowed because ${reason}.`);
    }

    const provider = modelData.provider;
    let url, headers, body;

    const safeParams = {};
    const temp = parseFloat(agent.temperature);
    if (!isNaN(temp)) safeParams.temperature = temp;
    const topP = parseFloat(agent.topP);
    if (!isNaN(topP)) safeParams.top_p = topP;
    const maxTokens = parseInt(agent.max_tokens, 10);
    if (!isNaN(maxTokens) && maxTokens > 0) safeParams.max_tokens = maxTokens;

    if (getCapability(modelData, 'top_k')) {
        const topK = parseInt(agent.topK, 10);
        if (!isNaN(topK) && topK > 0) safeParams.top_k = topK;
    }
    if (getCapability(modelData, 'penalties')) {
        const presPenalty = parseFloat(agent.presence_penalty);
        if (!isNaN(presPenalty)) safeParams.presence_penalty = presPenalty;
        
        const freqPenalty = parseFloat(agent.frequency_penalty);
        if (!isNaN(freqPenalty)) safeParams.frequency_penalty = freqPenalty;
    }
    if (getCapability(modelData, 'seed')) {
        const seed = parseInt(agent.seed, 10);
        if (!isNaN(seed) && seed !== -1) safeParams.seed = seed;
    }

    const stopSequences = agent.stop_sequences ? agent.stop_sequences.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (stopSequences.length > 0) safeParams.stop = stopSequences;

    if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 
            'Authorization': `Bearer ${UserService.getApiKey()}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'HTTP-Referer': 'https://sarega.github.io/PromptPrim/',
            'X-Title': 'PromptPrim' 
        };
        body = { model: agent.model, messages, stream, ...safeParams };
        
        if (agent.enableWebSearch) {
            if (agent.model.startsWith('perplexity/')) {
            } else {
                body.plugins = [{ id: "web", max_results: 5 }];
            }
        }
        
    } else { // ollama
        url = `${UserService.getOllamaUrl()}/api/chat`;
        headers = { 'Content-Type': 'application/json' };
        body = { model: agent.model, messages, stream, options: safeParams };
    }

    return { url, headers, body, provider };
}

// =========================================================================
// == MAIN EXPORTED API FUNCTIONS (Unchanged, they use the new constructor)
// =========================================================================

export async function streamLLMResponse(agent, messages, onChunk) {
    const { url, headers, body, provider } = constructApiCall(agent, messages, true);
    try {
        stateManager.bus.publish('status:update', { message: `Responding with ${agent.model}...`, state: 'loading' });
        
        const startTime = performance.now();
        const response = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body), signal: stateManager.getState().abortController?.signal });
        
        if (!response.ok) { throw new Error(`API Error: ${response.status} ${response.statusText}`); }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = '';
        let fullResponseText = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); 
            for (const line of lines) {
                if (line.trim() === '' || line.startsWith(':')) continue;
                let token = '';
                try {
                    if (provider === 'openrouter') {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.replace(/^data: /, '').trim();
                            if (jsonStr === '[DONE]') break;
                            const data = JSON.parse(jsonStr);
                            token = data.choices?.[0]?.delta?.content || '';
                        }
                    } else { // ollama
                        const data = JSON.parse(line);
                        token = data.message?.content || '';
                    }
                } catch (e) { console.warn("Skipping malformed JSON chunk:", line); }
                if (token) {
                    fullResponseText += token;
                    onChunk(token);
                }
            }
        }
        
        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000; // Duration in seconds

        let usage = { prompt_tokens: 0, completion_tokens: 0 };
        let cost = 0;
        let usageIsEstimated = true; // Default to true

        if (provider === 'openrouter' && response.headers.get('x-openrouter-usage')) {
            try {
                const parsedUsage = JSON.parse(response.headers.get('x-openrouter-usage'));
                usage = {
                    prompt_tokens: parsedUsage.prompt_tokens || 0,
                    completion_tokens: parsedUsage.completion_tokens || 0
                };
                cost = parsedUsage.cost || 0;
                usageIsEstimated = false; // It's an exact count from the header
            } catch(e) { console.error("Could not parse usage header:", e); }
        }
        
        if (usageIsEstimated) {
            // Fallback for Ollama or if header is missing
            usage.prompt_tokens = estimateTokens(JSON.stringify(messages));
            usage.completion_tokens = estimateTokens(fullResponseText);
        }
        
        // Return the new flag along with other data
        return { content: fullResponseText, usage, duration, cost, usageIsEstimated };

    } catch (error) {
        if (error.name !== 'AbortError') {
             console.error("Streaming failed:", error);
             stateManager.bus.publish('status:update', { message: `Error: ${error.message}`, state: 'error' });
        }
        throw error;
    }
}

export async function callLLM(agent, messages) {
    console.log("📡 [callLLM] received:", { agent, messages });
    const { url, headers, body, provider } = constructApiCall(agent, messages, false);

    try {
        const response = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) { 
            const errorText = await response.text(); 
            throw new Error(`API Error: ${response.status} ${errorText}`); 
        }
        
        const data = await response.json();
        const content = (provider === 'openrouter' && data.choices?.length > 0) 
            ? data.choices[0].message.content 
            : data.message?.content;

        if (content === undefined) {
            throw new Error("Invalid API response structure.");
        }

        // [FIX] Extract usage and cost from headers for consistency
        let cost = 0;
        let usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
        let usageIsEstimated = true; // Default to true

        if (provider === 'openrouter' && response.headers.get('x-openrouter-usage')) {
             try {
                const parsedHeader = JSON.parse(response.headers.get('x-openrouter-usage'));
                cost = parsedHeader.cost || 0;
                usage.prompt_tokens = parsedHeader.prompt_tokens || usage.prompt_tokens;
                usage.completion_tokens = parsedHeader.completion_tokens || usage.completion_tokens;
                usageIsEstimated = false; // Exact count from header
             } catch(e) { console.error("Could not parse usage header in callLLM:", e); }
        }

        // Return the new flag
        return { content, usage, cost, usageIsEstimated };

    } catch (error) {
        console.error("callLLM failed:", error);
        throw error;
    }
}

/**
 * [NEW] Calculates the cost of an API call based on token usage and model pricing.
 * This is more reliable than reading the response header.
 * @param {string} modelId The ID of the model used.
 * @param {object} usage The usage object with { prompt_tokens, completion_tokens }.
 * @returns {number} The calculated cost in USD.
 */
export function calculateCost(modelId, usage) {
    // We check both system and user models to find the price data
    const allKnownModels = [
        ...(stateManager.getState().systemProviderModels || []),
        ...(stateManager.getState().userProviderModels || [])
    ];
    
    const modelData = allKnownModels.find(m => m.id === modelId);

    if (!modelData || !modelData.pricing) {
        console.warn(`Could not find pricing data for model: ${modelId}`);
        return 0;
    }

    const promptCost = (usage.prompt_tokens || 0) * parseFloat(modelData.pricing.prompt);
    const completionCost = (usage.completion_tokens || 0) * parseFloat(modelData.pricing.completion);

    // The prices are per token, not per million tokens, so we don't divide.
    // OpenRouter's pricing endpoint gives price per token.
    // Example: $0.000003 per prompt token
    
    return promptCost + completionCost;
}