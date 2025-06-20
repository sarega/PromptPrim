// --- API & LLM Communication ---

async function loadAllProviderModels() {
    updateStatus('กำลังโหลด models...', 'loading');
    const apiKey = document.getElementById('apiKey').value.trim();
    const baseUrl = document.getElementById('ollamaBaseUrl').value.trim();
    let finalStatus = { message: 'ไม่พบ Model. กรุณาตรวจสอบการตั้งค่า API', state: 'warning' };
    
    const fetchPromises = [];
    if (apiKey) fetchPromises.push(fetchOpenRouterModels(apiKey).catch(e => {
        console.error(e);
        finalStatus = { message: 'Error: OpenRouter failed', state: 'error' };
        return []; 
    }));
    if (baseUrl) fetchPromises.push(fetchOllamaModels(baseUrl).catch(e => {
        console.error("Ollama fetch raw error:", e);
        finalStatus = { message: e.message, state: 'error' };
        return []; 
    }));

    const results = await Promise.all(fetchPromises);
    allProviderModels = results.flat().sort((a, b) => a.name.localeCompare(b.name));
    currentProject.globalSettings.allModels = allProviderModels;
    
    if (allProviderModels.length > 0) {
         finalStatus = { message: `โหลด ${allProviderModels.length} models เรียบร้อยแล้ว`, state: 'connected' };
    }
    
    updateStatus(finalStatus.message, finalStatus.state);
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
        if (!response.ok) {
            throw new Error(`ไม่สามารถเชื่อมต่อ Ollama (HTTP ${response.status})`);
        }
        const data = await response.json();
        return data.models.map(m => ({ id: m.name, name: m.name, provider: 'ollama'}));
    } catch (error) {
        if (error instanceof TypeError) {
             throw new Error('ไม่สามารถเชื่อมต่อ Ollama. กรุณาตรวจสอบ URL, สถานะ Server, และการตั้งค่า CORS');
        }
        throw error;
    }
}

async function callLLM(agent, messages) {
    const modelData = allProviderModels.find(m => m.id === agent.model);
    if (!modelData) throw new Error("Model data not found for the agent.");
    const provider = modelData.provider;

    const body = { model: agent.model, messages: messages, stream: false }; // Non-streaming
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
        headers = { 'Authorization': `Bearer ${currentProject.globalSettings.apiKey}`, 'Content-Type': 'application/json' };
        Object.assign(body, params);
    } else { // ollama
        url = `${currentProject.globalSettings.ollamaBaseUrl}/api/chat`;
        headers = { 'Content-Type': 'application/json' };
        body.options = params;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: abortController?.signal
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${errorText}`);
    }

    const data = await response.json();
    
    if (provider === 'openrouter' && data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
    } else if (provider === 'ollama' && data.message) {
        return data.message.content;
    }
    
    throw new Error("Invalid API response structure.");
}

async function streamLLMResponse(contentDiv, agent, messages, speakerName = null) {
    const modelData = allProviderModels.find(m => m.id === agent.model);
    if (!modelData) throw new Error("Model data not found for active agent.");
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
        headers = { 'Authorization': `Bearer ${currentProject.globalSettings.apiKey}`, 'Content-Type': 'application/json' };
        Object.assign(body, params);
    } else { // ollama
        url = `${currentProject.globalSettings.ollamaBaseUrl}/api/chat`;
        headers = { 'Content-Type': 'application/json' };
        body.options = params; // Ollama uses an 'options' object for parameters
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: abortController?.signal
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponseText = '';
    
    if (speakerName && contentDiv) {
        const speakerLabel = document.createElement('span');
        speakerLabel.className = 'speaker-label';
        speakerLabel.textContent = `${speakerName}:`;
        contentDiv.innerHTML = '';
        contentDiv.appendChild(speakerLabel);
    } else if (contentDiv) {
         contentDiv.innerHTML = ''; 
    }

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            let token = '';
            try {
                 if (provider === 'openrouter') {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(6);
                        if (jsonStr.trim() === '[DONE]') {
                            if(abortController?.signal.aborted) return fullResponseText;
                            break;
                        };
                        const data = JSON.parse(jsonStr);
                        token = data.choices[0]?.delta?.content || '';
                    }
                } else { // Ollama
                    const data = JSON.parse(line);
                    token = data.message?.content || '';
                    if(data.done) {
                        if(abortController?.signal.aborted) return fullResponseText;
                        break;
                    };
                }
            } catch (e) { /* ignore parse errors */ }

            if (token) {
                fullResponseText += token;
                if(contentDiv) {
                    if (agent.useMarkdown) {
                        let currentHTML = marked.parse(fullResponseText);
                         if (speakerName) {
                            contentDiv.innerHTML = `<span class="speaker-label">${speakerName}:</span>${currentHTML}`;
                         } else {
                            contentDiv.innerHTML = currentHTML;
                         }
                    }
                    else contentDiv.textContent = speakerName ? `${speakerName}: ${fullResponseText}` : fullResponseText;
                }
            }
        }
    }
    if (contentDiv) {
        contentDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
    return fullResponseText;
}

async function generateAndRenameSession(history){
     try{
        if(currentProject.activeEntity.type !== 'agent') return;
        const agentName = currentProject.activeEntity.name;
        const agent = currentProject.agentPresets[agentName];
        if(!agent || !agent.model) return;
        
        const conversation = history.map(m => {
            let contentText = (typeof m.content === 'string') ? m.content : (m.content.find(p => p.type === 'text')?.text || '');
            return `${m.role}: ${contentText}`;
        }).join('\n');
        
        const titlePrompt = `Based on the conversation, generate a concise title (3-5 words) and a single relevant emoji. Respond with a JSON object like {"title": "your title", "emoji": "👍"}.`;
        
        const messages = [{ role: "user", content: titlePrompt }];
        const body = { model: agent.model, messages: messages, stream: false, options: { temperature: 0.2, num_predict: 20 } };
        let url, headers;

        const modelData = allProviderModels.find(m => m.id === agent.model);
        const provider = modelData ? modelData.provider : null;

        if (provider === 'openrouter') {
            url = 'https://openrouter.ai/api/v1/chat/completions';
            headers = { 'Authorization': `Bearer ${currentProject.globalSettings.apiKey}`, 'Content-Type': 'application/json' };
            body.response_format = { "type": "json_object" };
        } else {
            url = `${currentProject.globalSettings.ollamaBaseUrl}/api/chat`;
            headers = { 'Content-Type': 'application/json' };
            body.format = "json";
        }

        const response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
        if (!response.ok) return;

        let data = await response.json();
        let content = data.choices ? data.choices[0].message.content : data.message.content;
        
        let newTitleData = {};
        try {
            newTitleData = JSON.parse(content);
        } catch(e) {
            console.error("Failed to parse title JSON:", content);
            newTitleData = { title: content.substring(0, 30), emoji: '💬' };
        }
        
        const newTitle = `${newTitleData.emoji || '💬'} ${newTitleData.title || 'Untitled'}`;
        if (newTitle) await renameChatSession(currentProject.activeSessionId, null, newTitle);
    } catch(e) {
        console.error("Auto-rename failed:", e);
    }
}
