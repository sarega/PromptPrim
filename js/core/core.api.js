// js/core/core.api.js

async function loadAllProviderModels() {
    stateManager.bus.publish('status:update', { message: 'กำลังโหลด models...', state: 'loading' });
    const project = stateManager.getProject();
    const apiKey = project.globalSettings.apiKey ? project.globalSettings.apiKey.trim() : '';
    const baseUrl = project.globalSettings.ollamaBaseUrl ? project.globalSettings.ollamaBaseUrl.trim() : '';
    let finalStatus = { message: 'ไม่พบ Model. กรุณาตรวจสอบการตั้งค่า API', state: 'warning' };
    
    const fetchPromises = [];
    if (apiKey) fetchPromises.push(fetchOpenRouterModels(apiKey).catch(e => { console.error(e); return []; }));
    if (baseUrl) fetchPromises.push(fetchOllamaModels(baseUrl).catch(e => { console.error(e); return []; }));

    try {
        const results = await Promise.all(fetchPromises);
        const allModels = results.flat();
        stateManager.setAllModels(allModels);
        
        if (allModels.length > 0) {
            finalStatus = { message: `โหลด ${allModels.length} models เรียบร้อยแล้ว`, state: 'connected' };
        }
    } catch (error) {
        finalStatus = { message: `เกิดข้อผิดพลาด: ${error.message}`, state: 'error' };
    }
    stateManager.bus.publish('status:update', finalStatus);
}

async function fetchOpenRouterModels(apiKey) {
    const response = await fetch('https://openrouter.ai/api/v1/models', { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error('ไม่สามารถโหลด models จาก OpenRouter');
    const data = await response.json();
    return data.data.map(m => ({ id: m.id, name: m.name || m.id, provider: 'openrouter' }));
}

async function fetchOllamaModels(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) throw new Error(`ไม่สามารถเชื่อมต่อ Ollama (HTTP ${response.status})`);
        const data = await response.json();
        return data.models.map(m => ({ id: m.name, name: m.name, provider: 'ollama'}));
    } catch (error) {
        if (error instanceof TypeError) throw new Error('ไม่สามารถเชื่อมต่อ Ollama. กรุณาตรวจสอบ URL, สถานะ Server, และการตั้งค่า CORS');
        throw error;
    }
}

async function callLLM(agent, messages) {
    const allModels = stateManager.getState().allProviderModels;
    const modelData = allModels.find(m => m.id === agent.model);
    if (!modelData) throw new Error("Model data not found for the agent.");

    const project = stateManager.getProject();
    const provider = modelData.provider;
    const body = { model: agent.model, messages: messages, stream: false };
    const params = {
        temperature: parseFloat(agent.temperature), top_p: parseFloat(agent.topP),
        top_k: parseInt(agent.topK, 10), presence_penalty: parseFloat(agent.presence_penalty),
        frequency_penalty: parseFloat(agent.frequency_penalty), max_tokens: parseInt(agent.max_tokens, 10),
        seed: parseInt(agent.seed, 10),
    };
    if (agent.stop_sequences) params.stop = agent.stop_sequences.split(',').map(s => s.trim());

    let url, headers;
    if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 'Authorization': `Bearer ${project.globalSettings.apiKey}`, 'Content-Type': 'application/json' };
        Object.assign(body, params);
    } else { // ollama
        url = `${project.globalSettings.ollamaBaseUrl}/api/chat`;
        headers = { 'Content-Type': 'application/json' };
        body.options = params;
    }

    const response = await fetch(url, {
        method: 'POST', headers: headers, body: JSON.stringify(body),
        signal: stateManager.getState().abortController?.signal
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${errorText}`);
    }

    const data = await response.json();
    if (provider === 'openrouter' && data.choices && data.choices.length > 0) return data.choices[0].message.content;
    if (provider === 'ollama' && data.message) return data.message.content;
    
    throw new Error("Invalid API response structure.");
}

// [FIXED] แก้ไขฟังก์ชันนี้ทั้งหมดเพื่ออัปเดต UI อย่างปลอดภัย
async function streamLLMResponse(contentDiv, agent, messages, speakerName = null) {
    const allModels = stateManager.getState().allProviderModels;
    const modelData = allModels.find(m => m.id === agent.model);
    if (!modelData) throw new Error("Model data not found for active agent.");

    const project = stateManager.getProject();
    const provider = modelData.provider;
    const body = { model: agent.model, messages: messages, stream: true };
    const params = {
        temperature: parseFloat(agent.temperature), top_p: parseFloat(agent.topP),
        top_k: parseInt(agent.topK, 10), presence_penalty: parseFloat(agent.presence_penalty),
        frequency_penalty: parseFloat(agent.frequency_penalty), max_tokens: parseInt(agent.max_tokens, 10),
        seed: parseInt(agent.seed, 10),
    };
    if (agent.stop_sequences) params.stop = agent.stop_sequences.split(',').map(s => s.trim());

    let url, headers;
    if (provider === 'openrouter') {
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 'Authorization': `Bearer ${project.globalSettings.apiKey}`, 'Content-Type': 'application/json' };
        Object.assign(body, params);
    } else { // ollama
        url = `${project.globalSettings.ollamaBaseUrl}/api/chat`;
        headers = { 'Content-Type': 'application/json' };
        body.options = params;
    }

    const response = await fetch(url, {
        method: 'POST', headers: headers, body: JSON.stringify(body),
        signal: stateManager.getState().abortController?.signal
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponseText = '';
    let buffer = '';

    const streamingContentSpan = contentDiv.querySelector('.streaming-content');
    if (!streamingContentSpan) {
        console.error("Streaming target '.streaming-content' not found in message bubble.");
        contentDiv.innerHTML += " Error: UI render failed.";
        return;
    }
    streamingContentSpan.innerHTML = ''; // Clear loading dots

    while (true) {
        if (stateManager.getState().abortController?.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last, possibly incomplete, line

        for (const line of lines) {
            if (line.trim() === '') continue;
            let token = '';
            try {
                 if (provider === 'openrouter') {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(6);
                        if (jsonStr.trim() === '[DONE]') break;
                        const data = JSON.parse(jsonStr);
                        token = data.choices[0]?.delta?.content || '';
                    }
                } else {
                    const data = JSON.parse(line);
                    token = data.message?.content || '';
                    if(data.done) break;
                }
            } catch (e) { console.warn("Error parsing stream chunk:", e); }

            if (token) {
                fullResponseText += token;
                if (agent.useMarkdown) {
                    streamingContentSpan.innerHTML = marked.parse(fullResponseText);
                } else {
                    streamingContentSpan.textContent = fullResponseText;
                }
            }
        }
    }
    
    if (contentDiv) enhanceCodeBlocks(contentDiv);
    return fullResponseText;
}


async function generateAndRenameSession(history){
     try{
        const project = stateManager.getProject();
        if(project.activeEntity.type !== 'agent') return;

        const agentName = project.activeEntity.name;
        const agent = project.agentPresets[agentName];
        if(!agent || !agent.model) return;
        
        const titlePrompt = `Based on the conversation, generate a concise title (3-5 words) and a single relevant emoji. Respond with a JSON object like {"title": "your title", "emoji": "👍"}.`;
        
        const messages = [{ role: "user", content: titlePrompt }];
        const body = { model: agent.model, messages: messages, stream: false, options: { temperature: 0.2, num_predict: 20 } };
        
        const allModels = stateManager.getState().allProviderModels;
        const modelData = allModels.find(m => m.id === agent.model);
        const provider = modelData ? modelData.provider : null;
        let url, headers;

        if (provider === 'openrouter') {
            url = 'https://openrouter.ai/api/v1/chat/completions';
            headers = { 'Authorization': `Bearer ${project.globalSettings.apiKey}`, 'Content-Type': 'application/json' };
            body.response_format = { "type": "json_object" };
        } else {
            url = `${project.globalSettings.ollamaBaseUrl}/api/chat`;
            headers = { 'Content-Type': 'application/json' };
            body.format = "json";
        }

        const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
        if (!response.ok) return;

        let data = await response.json();
        let content = data.choices ? data.choices[0].message.content : data.message.content;
        
        let newTitleData = {};
        try { newTitleData = JSON.parse(content); } catch(e) { console.error("Failed to parse title JSON:", content); }
        
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
