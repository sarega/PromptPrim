// ===============================================
// FILE: src/js/core/core.api.js 
// DESCRIPTION: เปลี่ยน Model เริ่มต้นเป็น Gemma 3 27B
// ===============================================

import { stateManager } from './core.state.js';

// --- Helper sub-functions (not exported, private to this module) ---
async function fetchOpenRouterModels(apiKey) {
    const response = await fetch('https://openrouter.ai/api/v1/models', { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error('Could not fetch models from OpenRouter');
    const data = await response.json();
    return data.data.map(m => ({ id: m.id, name: m.name || m.id, provider: 'openrouter' }));
}

async function fetchOllamaModels(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) throw new Error(`Could not connect to Ollama (HTTP ${response.status})`);
        const data = await response.json();
        return data.models.map(m => ({ id: m.name, name: m.name, provider: 'ollama'}));
    } catch (error) {
        if (error instanceof TypeError) throw new Error('Could not connect to Ollama. Check URL, server status, and CORS settings.');
        throw error;
    }
}

/**
 * [REWRITTEN] A robust fetch helper that supports both an external AbortSignal
 * (for the stop button) and an internal timeout.
 * @param {string} resource - The URL to fetch.
 * @param {object} options - The options for the fetch request, may include a signal.
 * @param {number} [timeout=120000] - The timeout in milliseconds.
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(resource, options = {}, timeout = 120000) {
    // 1. สร้าง AbortController สำหรับ Timeout โดยเฉพาะ
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    // 2. [สำคัญที่สุด] รวม signal จากภายนอก (ปุ่ม Stop) กับ signal ของ Timeout
    // โดยใช้ AbortSignal.any() ซึ่งจะทำงานเมื่อ signal ใด signal หนึ่งถูกเรียก
    // ทำให้ไม่ว่าจะเป็นการกดปุ่ม Stop หรือ Timeout ก็สามารถหยุด fetch ได้
    const abortSignal = AbortSignal.any([
        options.signal,
        timeoutController.signal
    ].filter(Boolean)); // .filter(Boolean) เพื่อกรอง signal ที่อาจเป็น null ออกไป

    try {
        // 3. ส่ง AbortSignal ที่รวมแล้วเข้าไปใน fetch request
        const response = await fetch(resource, {
            ...options,
            signal: abortSignal,
        });
        return response;
    } finally {
        // 4. ไม่ว่า fetch จะสำเร็จหรือล้มเหลว ให้เคลียร์ Timeout เสมอ
        clearTimeout(timeoutId);
    }
}


// --- Main Exported Functions ---

export async function loadAllProviderModels() {
    stateManager.bus.publish('status:update', { message: 'Loading models...', state: 'loading' });
    
    // [FIX 1] สร้าง deep copy ของ project state ขึ้นมาทำงานด้วย เพื่อป้องกัน side effect
    const project = JSON.parse(JSON.stringify(stateManager.getProject()));

    if (!project || !project.globalSettings) {
        stateManager.bus.publish('status:update', { message: 'Project not loaded', state: 'error' });
        return;
    }

    const apiKey = project.globalSettings.apiKey?.trim() || '';
    const baseUrl = project.globalSettings.ollamaBaseUrl?.trim() || '';
    
    let allModels = [];
    try {
        const fetchPromises = [];
        if (apiKey) fetchPromises.push(fetchOpenRouterModels(apiKey).catch(e => { console.error("OpenRouter fetch failed:", e); return []; }));
        if (baseUrl) fetchPromises.push(fetchOllamaModels(baseUrl).catch(e => { console.error("Ollama fetch failed:", e); return []; }));

        const results = await Promise.all(fetchPromises);
        allModels = results.flat();
    } catch (error) {
        stateManager.bus.publish('status:update', { message: `Error loading models: ${error.message}`, state: 'error' });
        return;
    }

    // --- [FIX 2] ปรับปรุง Logic การตั้งค่า Default Model ---
    let projectWasChanged = false;
    if (allModels.length > 0) {
        // สร้างรายการ Model เริ่มต้นที่ต้องการ โดยเรียงตามลำดับความสำคัญ
        const preferredDefaults = [
            'google/gemma-3-27b-it',
            'google/gemma-2-9b-it',
            'openai/gpt-4o-mini',
            'mistralai/mistral-7b-instruct'
        ];
        
        // หา Model แรกที่เจอในรายการ `preferredDefaults` ที่ผู้ใช้มี
        const availableDefaultModel = preferredDefaults.find(pdm => allModels.some(am => am.id === pdm));

        if (availableDefaultModel) {
            // 1. อัปเดต System Utility Agent
            const systemAgent = project.globalSettings.systemUtilityAgent;
            if (!systemAgent.model) { // ตั้งค่าให้เฉพาะเมื่อยังไม่มี model เท่านั้น
                systemAgent.model = availableDefaultModel;
                projectWasChanged = true;
                console.log(`System Utility Agent model set to: ${availableDefaultModel}`);
            }

            // 2. อัปเดต Default Agent
            const defaultAgent = project.agentPresets['Default Agent'];
            if (defaultAgent && !defaultAgent.model) {
                defaultAgent.model = availableDefaultModel;
                projectWasChanged = true;
                console.log(`'Default Agent' model set to: ${availableDefaultModel}`);
            }
        }
    }
    
    // --- [FIX 3] จัดการ State Update และ UI Re-render อย่างเป็นขั้นตอน ---
    
    // 1. อัปเดตรายชื่อ Model ทั้งหมดใน State (จะ trigger ให้ dropdown แสดงผล)
    stateManager.setAllModels(allModels);
    
    // 2. ถ้ามีการเปลี่ยนแปลงค่า Default Model ให้ทำการอัปเดต project state ทั้งก้อน
    if (projectWasChanged) {
        stateManager.setProject(project); // อัปเดต state ใน memory
        await stateManager.updateAndPersistState(); // สั่งให้เซฟลง DB และตั้งค่า isDirty
    }
    
    // 3. แจ้งสถานะสุดท้าย
    const statusMessage = allModels.length > 0 ? `Loaded ${allModels.length} models.` : 'No models found. Check API Settings.';
    stateManager.bus.publish('status:update', { message: statusMessage, state: 'connected' });
}

export async function callLLM(agent, messages) {
    const allModels = stateManager.getState().allProviderModels;
    const modelData = allModels.find(m => m.id === agent.model);
    if (!modelData) throw new Error("Model data not found for the agent.");

    const project = stateManager.getProject();
    const provider = modelData.provider;
    
    // สร้าง Object ของ body และ params แยกกันเพื่อความชัดเจน
    const body = { 
        model: agent.model, 
        messages: messages, 
        stream: false 
    };
    
    const params = {
        temperature: parseFloat(agent.temperature), 
        top_p: parseFloat(agent.topP),
        top_k: parseInt(agent.topK, 10), 
        presence_penalty: parseFloat(agent.presence_penalty),
        frequency_penalty: parseFloat(agent.frequency_penalty), 
        max_tokens: parseInt(agent.max_tokens, 10),
        seed: parseInt(agent.seed, 10),
    };

    if (agent.stop_sequences) {
        params.stop = agent.stop_sequences.split(',').map(s => s.trim());
    }

    let url, headers;

    if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 'Authorization': `Bearer ${project.globalSettings.apiKey}`, 'Content-Type': 'application/json' };
        
        // [FIX] เพิ่มส่วนนี้เข้าไปเพื่อเปิดใช้งาน Web Search
        body.tools = [
            { "type": "Google Search" }
        ];

        Object.assign(body, params);

    } else { // ollama
        url = `${project.globalSettings.ollamaBaseUrl}/api/chat`;
        headers = { 'Content-Type': 'application/json' };
        body.options = params;
    }

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${errorText}`);
    }

    const data = await response.json();
    if (provider === 'openrouter' && data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
    }
    if (provider === 'ollama' && data.message) {
        return data.message.content;
    }
    
    throw new Error("Invalid API response structure.");
}

/**
 * [REWRITTEN] A more robust function to stream responses from LLM APIs.
 * It uses modern stream APIs to prevent data loss and parsing errors.
 */
export async function streamLLMResponse(agent, messages, onChunk) {
    const project = stateManager.getProject();
    const allModels = stateManager.getState().allProviderModels;
    const modelData = allModels.find(m => m.id === agent.model);
    if (!modelData) throw new Error("Model data not found for active agent.");

    const statusMessage = `Responding with ${modelData?.name || agent.model}...`;
    stateManager.bus.publish('status:update', { message: statusMessage, state: 'loading' });

    const provider = modelData.provider;
    let url, headers, body;

    // --- Setup request details based on provider ---
    if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 'Authorization': `Bearer ${project.globalSettings.apiKey}`, 'Content-Type': 'application/json' };
        body = { 
            model: agent.model, 
            messages, 
            stream: true,
            // [Feature] เปิดใช้งาน Web Search สำหรับ OpenRouter
            tools: [
                { "type": "Google Search" }
            ],
            ...agent.parameters
        };
    } else { // ollama
        // [Fix] แก้ไขการอ้างอิงเป็น globalSettings (S ตัวใหญ่)
        url = `${project.globalSettings.ollamaBaseUrl}/api/chat`;
        headers = { 'Content-Type': 'application/json' };
        body = { 
            model: agent.model, 
            messages, 
            stream: true, 
            options: agent.parameters 
        };
    }

    try {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: stateManager.getState().abortController?.signal
        });

        if (!response.ok || !response.body) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        // [Robustness] ใช้ TextDecoderStream เพื่อจัดการ Stream ที่มีประสิทธิภาพและปลอดภัย
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let fullResponseText = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const rawChunks = value.split('\n').filter(line => line.trim() !== '');

            for (const chunk of rawChunks) {
                let token = '';
                try {
                    if (provider === 'openrouter') {
                        if (!chunk.startsWith('data: ')) continue;
                        const jsonStr = chunk.replace(/^data: /, '').trim();
                        if (jsonStr === '[DONE]') break;
                        
                        const data = JSON.parse(jsonStr);
                        token = data.choices?.[0]?.delta?.content || '';

                    } else { // ollama
                        const data = JSON.parse(chunk);
                        token = data.message?.content || '';
                    }
                } catch (e) {
                     console.warn("Skipping malformed JSON chunk during stream:", chunk);
                }

                if (token) {
                    fullResponseText += token;
                    onChunk(token); // เรียก callback เพื่อส่งข้อมูลไปให้ UI
                }
            }
        }
        return fullResponseText; // คืนค่าข้อความทั้งหมดเมื่อจบ

    } catch (error) {
        if (error.name !== 'AbortError') {
             console.error("Streaming failed:", error);
             stateManager.bus.publish('status:update', { message: `Error: ${error.message}`, state: 'error' });
        }
        // โยน error ต่อเพื่อให้ฟังก์ชันที่เรียกใช้ (เช่น sendSingleAgentMessage) จัดการต่อไป
        throw error;
    }
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
