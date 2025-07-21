// ===============================================
// FILE: src/js/core/core.api.js 
// DESCRIPTION: เปลี่ยน Model เริ่มต้นเป็น Gemma 3 27B
// ===============================================

import { stateManager } from './core.state.js';
import * as UserService from '../modules/user/user.service.js'; // <-- ตรวจสอบว่ามี import นี้
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
// [REVISED & COMPLETE] src/js/core/core.api.js

export async function loadAllProviderModels() {
    stateManager.bus.publish('status:update', { message: 'Loading models...', state: 'loading' });

    const apiKey = UserService.getApiKey();
    const baseUrl = UserService.getOllamaUrl();
    
    let allModels = [];
    try {
        const fetchPromises = [];
        if (apiKey) {
            fetchPromises.push(fetchOpenRouterModels(apiKey).catch(e => { console.error("OpenRouter fetch failed:", e); return []; }));
        }
        if (baseUrl) {
            fetchPromises.push(fetchOllamaModels(baseUrl).catch(e => { console.error("Ollama fetch failed:", e); return []; }));
        }
        const results = await Promise.all(fetchPromises);
        allModels = results.flat();
    } catch (error) {
        stateManager.bus.publish('status:update', { message: `Error loading models: ${error.message}`, state: 'error' });
        return;
    }
    
    // [FIX START] แก้ไข Logic การอัปเดต State
    
    // 1. บันทึกรายชื่อ Model ทั้งหมดที่โหลดมาลง State ก่อน
    stateManager.setAllModels(allModels);

    // 2. ดึงข้อมูลโปรเจกต์เวอร์ชันล่าสุด (ที่มี Model ทั้งหมดแล้ว) ออกมาทำงาน
    const project = stateManager.getProject();
    let projectWasChanged = false;

    if (allModels.length > 0 && project) {
        const systemAgent = project.globalSettings.systemUtilityAgent;
        const defaultAgent = project.agentPresets['Default Agent'];
        
        if (systemAgent && (!systemAgent.model || !allModels.some(m => m.id === systemAgent.model))) {
            const preferredDefaults = ['google/gemma-3-27b-it', 'openai/gpt-4o-mini'];
            const availableDefaultModel = preferredDefaults.find(pdm => allModels.some(am => am.id === pdm));
            if (availableDefaultModel) {
                systemAgent.model = availableDefaultModel;
                if (defaultAgent) defaultAgent.model = availableDefaultModel;
                projectWasChanged = true;
            }
        }
    }
    
    // 3. ถ้ามีการเปลี่ยนแปลง ให้บันทึกโปรเจกต์ที่อัปเดตแล้วกลับไป
    if (projectWasChanged) {
        stateManager.setProject(project);
    }
    
    // 4. สร้างข้อความ Status จากข้อมูลใน State ที่ถูกต้องและสมบูรณ์แล้ว
    const finalModelList = stateManager.getState().allProviderModels || [];
    const statusMessage = finalModelList.length > 0 ? `Loaded ${finalModelList.length} models.` : 'No models found.';
    stateManager.bus.publish('status:update', { message: statusMessage, state: 'connected' });
    // [FIX END]
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
    const allModels = stateManager.getState().allProviderModels;
    const modelData = allModels.find(m => m.id === agent.model);
    
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
    console.log("API call sees these globalSettings:", project.globalSettings);

    const allModels = stateManager.getState().allProviderModels;
    const modelData = allModels.find(m => m.id === agent.model);
    if (!modelData) throw new Error(`Model data for agent.model ID '${agent.model}' not found.`);

    const provider = modelData.provider;
    let url, headers, body;

    const commonParams = {
        temperature: parseFloat(agent.temperature),
        top_p: parseFloat(agent.topP),
        top_k: parseInt(agent.topK, 10),
        presence_penalty: parseFloat(agent.presence_penalty),
        frequency_penalty: parseFloat(agent.frequency_penalty),
        max_tokens: parseInt(agent.max_tokens, 10),
        seed: parseInt(agent.seed, 10),
        stop: agent.stop_sequences ? agent.stop_sequences.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    };

    if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 
            'Authorization': `Bearer ${UserService.getApiKey()}`, // <-- แก้ไข
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'HTTP-Referer': 'https://sarega.github.io/PromptPrim/',
            'X-Title': 'PromptPrim' 
        };

        const safeParams = {
            temperature: commonParams.temperature,
            top_p: commonParams.top_p,
            max_tokens: commonParams.max_tokens,
        };

        // [FIX] ส่ง modelData เข้าไปใน getCapability
        if (getCapability(modelData, 'top_k') && commonParams.top_k > 0) {
            safeParams.top_k = commonParams.top_k;
        }
        if (getCapability(modelData, 'penalties')) {
            safeParams.presence_penalty = commonParams.presence_penalty;
            safeParams.frequency_penalty = commonParams.frequency_penalty;
        }
        if (getCapability(modelData, 'seed') && commonParams.seed !== -1) {
            safeParams.seed = commonParams.seed;
        }
        if (commonParams.stop) {
            safeParams.stop = commonParams.stop;
        }

        body = { model: agent.model, messages, stream, ...safeParams };
        
        // [FIX] ส่ง modelData เข้าไปใน getCapability
        if (getCapability(modelData, 'tools')) {
            body.tools = [{ "type": "Google Search" }];
        }

    } else { // ollama
        url = `${UserService.getOllamaUrl()}/api/chat`; // <-- แก้ไข
        headers = { 'Content-Type': 'application/json' };
        
        const ollamaOptions = {
            temperature: commonParams.temperature,
            top_p: commonParams.top_p,
            top_k: commonParams.top_k,
            num_predict: commonParams.max_tokens,
            seed: commonParams.seed,
            stop: commonParams.stop,
        };
        Object.keys(ollamaOptions).forEach(key => (ollamaOptions[key] == null || Number.isNaN(ollamaOptions[key])) && delete ollamaOptions[key]);
        body = { model: agent.model, messages, stream, options: ollamaOptions };
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
        if (provider === 'openrouter' && response.headers.has('x-openrouter-usage')) {
            try {
                usage = JSON.parse(response.headers.get('x-openrouter-usage'));
            } catch(e) { console.error("Could not parse usage header:", e); }
        } else {
            // Fallback for Ollama or if header is missing
            usage.prompt_tokens = estimateTokens(JSON.stringify(messages));
            usage.completion_tokens = estimateTokens(fullResponseText);
        }
        
        return { content: fullResponseText, usage, duration };

    } catch (error) {
        if (error.name !== 'AbortError') {
             console.error("Streaming failed:", error);
             stateManager.bus.publish('status:update', { message: `Error: ${error.message}`, state: 'error' });
        }
        throw error;
    }
}

export async function callLLM(agent, messages) {
    const { url, headers, body, provider } = constructApiCall(agent, messages, false);
    try {
        console.log('[API CALL]', { url, headers, body });
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

        // คืนค่าเป็น object ที่มีทั้ง content และ usage
        return {
            content: content,
            usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 }
        };

    } catch (error) {
        console.error("callLLM failed:", error);
        throw error;
    }
}