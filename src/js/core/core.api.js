// ===============================================
// FILE: src/js/core/core.api.js (แก้ไขแล้ว)
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


// --- Main Exported Functions ---

export async function loadAllProviderModels() {
    stateManager.bus.publish('status:update', { message: 'Loading models...', state: 'loading' });
    let project = stateManager.getProject(); // Get the project state at the beginning
    if (!project || !project.globalSettings) {
        stateManager.bus.publish('status:update', { message: 'Project not loaded', state: 'error' });
        return;
    }
    const apiKey = project.globalSettings.apiKey?.trim() || '';
    const baseUrl = project.globalSettings.ollamaBaseUrl?.trim() || '';
    let finalStatus = { message: 'No models found. Please check API settings.', state: 'warning' };
    
    const fetchPromises = [];
    if (apiKey) fetchPromises.push(fetchOpenRouterModels(apiKey).catch(e => { console.error("OpenRouter fetch failed:", e); return []; }));
    if (baseUrl) fetchPromises.push(fetchOllamaModels(baseUrl).catch(e => { console.error("Ollama fetch failed:", e); return []; }));

    try {
        if (fetchPromises.length === 0) {
             stateManager.setAllModels([]);
             finalStatus = { message: 'Ready', state: 'connected' };
             stateManager.bus.publish('status:update', finalStatus);
             return;
        }
        const results = await Promise.all(fetchPromises);
        const allModels = results.flat();
        
        // --- Logic to set default model ---
        if (allModels.length > 0) {
            // [MODIFIED] Set the desired default model to Gemma 3 27B
            const defaultModelId = 'google/gemma-3-27b-it'; 
            const defaultModelExists = allModels.some(m => m.id === defaultModelId);
            
            let projectChanged = false;
            if (defaultModelExists) {
                // 1. Update the project object IN MEMORY FIRST
                
                // Set for System Utility Agent if it's still the initial default or empty
                const oldDefaults = ['openai/gpt-4o-mini', 'google/gemma-2-27b-it'];
                if (!project.globalSettings.systemUtilityAgent.model || oldDefaults.includes(project.globalSettings.systemUtilityAgent.model)) {
                    project.globalSettings.systemUtilityAgent.model = defaultModelId;
                    projectChanged = true;
                }
                
                // Set for the "Default Agent" preset if it's empty
                const defaultAgent = project.agentPresets['Default Agent'];
                if (defaultAgent && !defaultAgent.model) {
                    defaultAgent.model = defaultModelId;
                    projectChanged = true;
                }
            }

            // 2. If changes were made, update the central state BEFORE updating the model list
            if (projectChanged) {
                stateManager.setProject(project);
            }
            
            // 3. NOW, update the model list. This will trigger 'models:loaded' event.
            stateManager.setAllModels(allModels);
            
            // 4. If changes were made, persist them to the database
            if(projectChanged) {
                await stateManager.updateAndPersistState();
            }

            finalStatus = { message: `Loaded ${allModels.length} models successfully.`, state: 'connected' };
        }
    } catch (error) {
        finalStatus = { message: `Error loading models: ${error.message}`, state: 'error' };
    }
    
    // Publish the final status update
    stateManager.bus.publish('status:update', finalStatus);
    
    // Trigger a final re-render to ensure all UI is in sync
    stateManager.bus.publish('project:loaded', { projectData: stateManager.getProject() });
}


export async function callLLM(agent, messages) {
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

export async function streamLLMResponse(contentDiv, agent, messages, speakerName = null) {
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
        contentDiv.innerHTML += " Error: UI render target not found.";
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
    
    stateManager.bus.publish('ui:enhanceCodeBlocks', contentDiv);
    return fullResponseText;
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
