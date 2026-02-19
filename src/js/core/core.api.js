// ===============================================
// FILE: src/js/core/core.api.js 
// DESCRIPTION: เปลี่ยน Model เริ่มต้นเป็น Gemma 3 27B
// ===============================================

import { stateManager } from './core.state.js';
import * as UserService from '../modules/user/user.service.js';
import { estimateTokens } from '../modules/chat/chat.handlers.js';
import { showCustomAlert } from './core.ui.js';
import {
    ensureProjectFolders,
    getFolderById,
    normalizeFolderContextPolicy,
    normalizeFolderRagSettings,
    normalizeSessionContextMode,
    normalizeSessionRagSettings
} from '../modules/session/session.folder-utils.js';

// import { recommendedModelIds } from './core.state.js';

const modelCapabilities = {
    // Perplexity ไม่ต้องการ params ส่วนใหญ่และไม่รู้จัก tools parameter
    'perplexity/sonar-small-online': { penalties: false, seed: false, top_k: false, tools: false },
    'perplexity/sonar-medium-online': { penalties: false, seed: false, top_k: false, tools: false },
    // Grok (xAI) ไม่รองรับ Penalties และ Seed
    'xai/grok-1.5': { penalties: false, seed: false },
};

function fnv1a32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function tokenizeForEmbedding(text = '') {
    const normalized = text.toLowerCase();
    const tokens = normalized.match(/[\p{L}\p{N}_-]{2,}/gu);
    return tokens || [];
}

function createLocalEmbeddingVector(text, dimensions = 128) {
    const vector = Array.from({ length: dimensions }, () => 0);
    const tokens = tokenizeForEmbedding(text);

    if (tokens.length === 0) return vector;

    for (const token of tokens) {
        const index = fnv1a32(token) % dimensions;
        vector[index] += 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
    if (!magnitude) return vector;
    return vector.map(value => value / magnitude);
}

function cosineSimilarity(a = [], b = []) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
        return 0;
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
        const av = Number(a[i]) || 0;
        const bv = Number(b[i]) || 0;
        dot += av * bv;
        normA += av * av;
        normB += bv * bv;
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractTextFromMessageContent(content) {
    if (typeof content === 'string') {
        return content.trim();
    }
    if (Array.isArray(content)) {
        return content
            .filter(part => part?.type === 'text' && part.text)
            .map(part => part.text)
            .join('\n')
            .trim();
    }
    return '';
}

function getRetrievalQueryText(history = []) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
        const message = history[i];
        if (!message || message.isLoading || message.isSummary || message.isSummaryMarker) continue;
        if (message.role !== 'user' && message.role !== 'assistant') continue;
        const text = extractTextFromMessageContent(message.content);
        if (text && text.length >= 4) {
            return text;
        }
    }
    return '';
}

function resolveSessionRagSettings(project, session) {
    const sessionSettings = normalizeSessionRagSettings(session?.ragSettings, {
        scopeSource: session?.folderId ? 'folder' : 'session'
    });
    const folder = session?.folderId ? getFolderById(project, session.folderId) : null;

    if (sessionSettings.scopeSource === 'folder' && folder) {
        const folderSettings = normalizeFolderRagSettings(folder.ragSettings);
        return {
            ...folderSettings,
            scopeSource: 'folder',
            folderId: folder.id,
            folderName: folder.name
        };
    }

    return {
        ...sessionSettings,
        scopeSource: 'session'
    };
}

function buildSessionExcerptFromHistory(session) {
    const relevantMessages = (session?.history || [])
        .filter(message => (
            message &&
            !message.isLoading &&
            !message.isSummary &&
            !message.isSummaryMarker &&
            (message.role === 'user' || message.role === 'assistant')
        ))
        .slice(-4);

    if (relevantMessages.length === 0) return '';

    const lines = relevantMessages
        .map(message => {
            const text = extractTextFromMessageContent(message.content);
            if (!text) return '';
            const speaker = message.role === 'assistant'
                ? (message.speaker || 'Assistant')
                : 'User';
            return `${speaker}: ${text}`;
        })
        .filter(Boolean);

    if (lines.length === 0) return '';
    return lines.join('\n').slice(0, 1400);
}

function getSessionSharedContextSnippet(project, session) {
    const activeSummaryId = session?.summaryState?.activeSummaryId;
    if (activeSummaryId) {
        const activeSummary = (project.summaryLogs || []).find(log => log.id === activeSummaryId);
        if (activeSummary?.content?.trim()) {
            return {
                source: 'summary',
                text: activeSummary.content.trim().slice(0, 2200)
            };
        }
    }

    const excerpt = buildSessionExcerptFromHistory(session);
    if (!excerpt) return null;

    return {
        source: 'recent_turns',
        text: excerpt
    };
}

function buildFolderSharedContext(project, session) {
    const contextMode = normalizeSessionContextMode(session?.contextMode);
    const emptyResult = {
        enabled: false,
        autoEnabled: false,
        mode: contextMode,
        folderId: session?.folderId || null,
        folderName: '',
        maxSharedSessions: 0,
        budgetTokens: 0,
        usedTokens: 0,
        candidateCount: 0,
        usedSessionCount: 0,
        usedSessions: [],
        contextText: '',
        reason: 'disabled'
    };

    if (!session) {
        return {
            ...emptyResult,
            reason: 'no_active_session'
        };
    }

    if (contextMode === 'session_only') {
        return {
            ...emptyResult,
            reason: 'session_only'
        };
    }

    if (!session.folderId) {
        return {
            ...emptyResult,
            reason: 'no_folder'
        };
    }

    const folder = getFolderById(project, session.folderId);
    if (!folder) {
        return {
            ...emptyResult,
            reason: 'missing_folder'
        };
    }

    const policy = normalizeFolderContextPolicy(folder.contextPolicy);
    if (policy.autoSharedContext === false) {
        return {
            ...emptyResult,
            mode: contextMode,
            folderId: folder.id,
            folderName: folder.name,
            maxSharedSessions: policy.maxSharedSessions,
            budgetTokens: policy.sharedContextBudgetTokens,
            reason: 'folder_auto_disabled'
        };
    }

    const queryText = getRetrievalQueryText(session?.history || []);
    const queryVector = queryText ? createLocalEmbeddingVector(queryText, 128) : null;
    const perSessionTokenCap = Math.max(140, Math.floor(policy.sharedContextBudgetTokens * 0.45));
    const candidateSessions = (project.chatSessions || [])
        .filter(item => (
            item &&
            item.id !== session.id &&
            !item.archived &&
            item.folderId === folder.id
        ))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (candidateSessions.length === 0) {
        return {
            ...emptyResult,
            enabled: true,
            autoEnabled: true,
            folderId: folder.id,
            folderName: folder.name,
            maxSharedSessions: policy.maxSharedSessions,
            budgetTokens: policy.sharedContextBudgetTokens,
            reason: 'no_related_sessions'
        };
    }

    const snippets = candidateSessions
        .map(candidate => {
            const snippet = getSessionSharedContextSnippet(project, candidate);
            if (!snippet?.text) return null;
            const cappedChars = perSessionTokenCap * 4;
            const cappedText = snippet.text.length > cappedChars
                ? `${snippet.text.slice(0, cappedChars)}\n...[trimmed to fit folder context budget]`
                : snippet.text;
            const tokenEstimate = Math.max(1, estimateTokens(cappedText));
            const relevanceScore = queryVector
                ? cosineSimilarity(queryVector, createLocalEmbeddingVector(cappedText, queryVector.length))
                : 0;
            return {
                sessionId: candidate.id,
                sessionName: candidate.name || 'Untitled',
                source: snippet.source,
                updatedAt: candidate.updatedAt || candidate.createdAt || 0,
                tokenEstimate,
                relevanceScore: Number.isFinite(relevanceScore) ? relevanceScore : 0,
                text: cappedText
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (queryVector) {
                const relevanceDiff = b.relevanceScore - a.relevanceScore;
                if (relevanceDiff !== 0) return relevanceDiff;
            }
            return b.updatedAt - a.updatedAt;
        });

    if (snippets.length === 0) {
        return {
            ...emptyResult,
            enabled: true,
            autoEnabled: true,
            folderId: folder.id,
            folderName: folder.name,
            maxSharedSessions: policy.maxSharedSessions,
            budgetTokens: policy.sharedContextBudgetTokens,
            candidateCount: candidateSessions.length,
            reason: 'no_context_snippets'
        };
    }

    const selectedSnippets = [];
    let usedTokens = 0;
    for (const snippet of snippets) {
        if (selectedSnippets.length >= policy.maxSharedSessions) break;
        if ((usedTokens + snippet.tokenEstimate) > policy.sharedContextBudgetTokens) {
            continue;
        }
        selectedSnippets.push(snippet);
        usedTokens += snippet.tokenEstimate;
    }

    if (selectedSnippets.length === 0) {
        return {
            ...emptyResult,
            enabled: true,
            autoEnabled: true,
            folderId: folder.id,
            folderName: folder.name,
            maxSharedSessions: policy.maxSharedSessions,
            budgetTokens: policy.sharedContextBudgetTokens,
            candidateCount: snippets.length,
            reason: 'budget_limited'
        };
    }

    const lines = [
        `Shared context from sibling sessions in folder "${folder.name}".`,
        'Use this only when relevant to the current request.'
    ];

    selectedSnippets.forEach((snippet, index) => {
        lines.push('');
        const scoreLabel = queryVector ? `, relevance: ${snippet.relevanceScore.toFixed(3)}` : '';
        lines.push(`[${index + 1}] Session: ${snippet.sessionName} (source: ${snippet.source}${scoreLabel})`);
        lines.push(snippet.text);
    });

    return {
        enabled: true,
        autoEnabled: true,
        mode: contextMode,
        folderId: folder.id,
        folderName: folder.name,
        maxSharedSessions: policy.maxSharedSessions,
        budgetTokens: policy.sharedContextBudgetTokens,
        usedTokens,
        candidateCount: snippets.length,
        usedSessionCount: selectedSnippets.length,
        usedSessions: selectedSnippets.map(snippet => ({
            sessionId: snippet.sessionId,
            sessionName: snippet.sessionName,
            source: snippet.source,
            relevanceScore: Number((snippet.relevanceScore || 0).toFixed(3)),
            tokenEstimate: snippet.tokenEstimate,
            updatedAt: snippet.updatedAt
        })),
        contextText: lines.join('\n'),
        reason: 'ok'
    };
}

function buildRetrievedKnowledgeContext(queryText, project, session) {
    const ragSettings = resolveSessionRagSettings(project, session);
    const isFolderAutoRagDisabled = ragSettings.scopeSource === 'folder' && ragSettings.autoRetrieve === false;
    const emptyResult = {
        enabled: !isFolderAutoRagDisabled,
        queryText: queryText || '',
        settings: ragSettings,
        scopeMode: ragSettings.scopeMode,
        totalCandidateChunks: 0,
        totalUsedTokens: 0,
        usedChunks: [],
        contextText: '',
        reason: 'empty_query'
    };

    if (isFolderAutoRagDisabled) {
        return {
            ...emptyResult,
            reason: 'folder_rag_disabled'
        };
    }

    const chunks = project?.knowledgeIndex?.chunks;
    if (!queryText || !Array.isArray(chunks) || chunks.length === 0) {
        return {
            ...emptyResult,
            reason: !queryText ? 'empty_query' : 'no_index'
        };
    }

    const selectedFileIdsSet = new Set(ragSettings.selectedFileIds || []);
    const candidateChunks = ragSettings.scopeMode === 'selected'
        ? chunks.filter(chunk => selectedFileIdsSet.has(chunk.fileId))
        : chunks;

    if (!candidateChunks.length) {
        return {
            ...emptyResult,
            reason: 'scope_has_no_chunks'
        };
    }

    const dimensions = Number.isFinite(project?.knowledgeIndex?.dimensions)
        ? project.knowledgeIndex.dimensions
        : 128;
    const queryVector = createLocalEmbeddingVector(queryText, dimensions);

    const scoredChunks = candidateChunks
        .filter(chunk => chunk?.text && Array.isArray(chunk.vector))
        .map(chunk => ({
            chunk,
            score: cosineSimilarity(queryVector, chunk.vector)
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, ragSettings.retrievalTopK);

    if (scoredChunks.length === 0) {
        return {
            ...emptyResult,
            totalCandidateChunks: candidateChunks.length,
            reason: 'no_similarity_match'
        };
    }

    const selected = [];
    let totalTokens = 0;

    for (const item of scoredChunks) {
        const chunkText = item.chunk.text || '';
        const chunkTokens = Number.isFinite(item.chunk.tokenEstimate)
            ? item.chunk.tokenEstimate
            : Math.max(1, Math.round(chunkText.length / 4));
        if (!chunkText) continue;
        if (totalTokens + chunkTokens > ragSettings.maxContextTokens) break;
        selected.push(item);
        totalTokens += chunkTokens;
    }

    if (selected.length === 0) {
        return {
            ...emptyResult,
            totalCandidateChunks: candidateChunks.length,
            reason: 'budget_limited',
            totalUsedTokens: totalTokens
        };
    }

    const lines = [
        'Retrieved knowledge context from uploaded project files:',
        'Use this as supporting context when relevant.'
    ];

    selected.forEach((item, index) => {
        const citation = `${item.chunk.fileName || 'Unknown file'} #chunk${(item.chunk.chunkIndex || 0) + 1}`;
        lines.push('');
        lines.push(`[${index + 1}] ${citation} (score: ${item.score.toFixed(3)})`);
        lines.push(item.chunk.text);
    });

    lines.push('');
    lines.push('If you use this context in your answer, cite the source as [source: filename #chunkN].');

    const usedChunks = selected.map(item => ({
        fileId: item.chunk.fileId || '',
        fileName: item.chunk.fileName || 'Unknown file',
        chunkIndex: Number.isFinite(item.chunk.chunkIndex) ? item.chunk.chunkIndex : 0,
        score: Number(item.score.toFixed(3)),
        tokenEstimate: Number.isFinite(item.chunk.tokenEstimate) ? item.chunk.tokenEstimate : Math.max(1, Math.round((item.chunk.text || '').length / 4)),
        charCount: Number.isFinite(item.chunk.charCount) ? item.chunk.charCount : (item.chunk.text || '').length,
        excerpt: (item.chunk.text || '').slice(0, 280)
    }));

    return {
        enabled: true,
        queryText,
        settings: ragSettings,
        scopeMode: ragSettings.scopeMode,
        totalCandidateChunks: candidateChunks.length,
        totalUsedTokens: totalTokens,
        usedChunks,
        contextText: lines.join('\n'),
        reason: 'ok'
    };
}

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
    const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim().replace(/^Bearer\s+/i, '').trim() : '';
    if (!normalizedApiKey) return [];

    const response = await fetch('https://openrouter.ai/api/v1/models', { 
        headers: { 'Authorization': `Bearer ${normalizedApiKey}` } 
    });
    if (!response.ok) {
        let errorText = '';
        try {
            errorText = (await response.text()).trim();
        } catch (_) {
            errorText = '';
        }
        const details = errorText ? ` Details: ${errorText.slice(0, 240)}` : '';
        if (response.status === 401) {
            throw new Error(`OpenRouter returned 401 Unauthorized. Check API key format in Settings.${details}`);
        }
        throw new Error(`Could not fetch models from OpenRouter (HTTP ${response.status}).${details}`);
    }
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
    if (!baseUrl) return []; // Return empty array if no URL is provided
    const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
    if (!trimmed) return [];
    const normalizedBaseUrl = (/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`).replace(/\/+$/, '');

    try {
        const response = await fetch(`${normalizedBaseUrl}/api/tags`);
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

async function safeReadErrorText(response) {
    try {
        return (await response.text()).trim();
    } catch (_) {
        return '';
    }
}

function buildApiErrorMessage(provider, status, statusText = '', rawDetails = '') {
    const compactDetails = rawDetails.replace(/\s+/g, ' ').trim().slice(0, 240);
    const detailsSuffix = compactDetails ? ` Details: ${compactDetails}` : '';

    if (status === 401) {
        if (provider === 'openrouter') {
            return `API Error: 401 Unauthorized from OpenRouter. Check API key in Settings and remove any leading 'Bearer '.${detailsSuffix}`;
        }
        if (provider === 'ollama') {
            return `API Error: 401 Unauthorized from Ollama endpoint. Check Ollama URL and reverse-proxy auth configuration.${detailsSuffix}`;
        }
        return `API Error: 401 Unauthorized.${detailsSuffix}`;
    }

    const statusPart = statusText ? ` ${statusText}` : '';
    return `API Error: ${status}${statusPart}${detailsSuffix}`;
}

function normalizeApiKeyForFetch(rawValue) {
    if (typeof rawValue !== 'string') return '';
    const trimmed = rawValue.trim();
    if (!trimmed) return '';
    return trimmed.replace(/^Bearer\s+/i, '').trim();
}

function normalizeOllamaUrlForFetch(rawValue) {
    if (typeof rawValue !== 'string') return '';
    let value = rawValue.trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) {
        value = `http://${value}`;
    }
    return value.replace(/\/+$/, '');
}

function resolveModelLoadSettings({ apiKey, ollamaBaseUrl, isUserKey = false } = {}) {
    const hasApiOverride = apiKey !== undefined;
    const hasOllamaOverride = ollamaBaseUrl !== undefined;

    if (isUserKey) {
        const profile = UserService.getCurrentUserProfile();
        const profileSettings = (profile?.apiSettings && typeof profile.apiSettings === 'object')
            ? profile.apiSettings
            : {};
        const rawProviderEnabled = profileSettings.providerEnabled || {};
        return {
            apiKey: normalizeApiKeyForFetch(
                hasApiOverride ? String(apiKey || '') : String(profileSettings.openrouterKey || '')
            ),
            ollamaBaseUrl: normalizeOllamaUrlForFetch(
                hasOllamaOverride ? String(ollamaBaseUrl || '') : String(profileSettings.ollamaBaseUrl || '')
            ),
            providerEnabled: {
                openrouter: rawProviderEnabled.openrouter !== false,
                ollama: rawProviderEnabled.ollama !== false
            }
        };
    }

    const systemSettings = UserService.getSystemApiSettings();
    const rawProviderEnabled = systemSettings.providerEnabled || {};
    return {
        apiKey: normalizeApiKeyForFetch(
            hasApiOverride ? String(apiKey || '') : String(systemSettings.openrouterKey || '')
        ),
        ollamaBaseUrl: normalizeOllamaUrlForFetch(
            hasOllamaOverride ? String(ollamaBaseUrl || '') : String(systemSettings.ollamaBaseUrl || '')
        ),
        providerEnabled: {
            openrouter: rawProviderEnabled.openrouter !== false,
            ollama: rawProviderEnabled.ollama !== false
        }
    };
}

export async function loadAllProviderModels({ apiKey, ollamaBaseUrl, isUserKey = false } = {}) {
    stateManager.bus.publish('status:update', { message: 'Loading models...', state: 'loading' });
    const resolved = resolveModelLoadSettings({ apiKey, ollamaBaseUrl, isUserKey });
    let allModels = [];
    let attemptedProviders = 0;

    // 1. Fetch from OpenRouter if enabled and apiKey is provided
    if (resolved.providerEnabled.openrouter && resolved.apiKey) {
        attemptedProviders += 1;
        try {
            const openRouterModels = await fetchOpenRouterModels(resolved.apiKey);
            allModels.push(...openRouterModels);
        } catch (error) {
            console.error("Failed to fetch OpenRouter models:", error);
            showCustomAlert(error.message || "Could not fetch models from OpenRouter.", "Warning");
        }
    }

    // 2. Fetch from Ollama if enabled and url is provided
    if (resolved.providerEnabled.ollama && resolved.ollamaBaseUrl) {
        attemptedProviders += 1;
        try {
            const ollamaModels = await fetchOllamaModels(resolved.ollamaBaseUrl);
            allModels.push(...ollamaModels);
        } catch (error) {
            console.error("Failed to fetch Ollama models:", error);
            showCustomAlert(error.message, "Warning");
        }
    }
    
    // 3. Save to the correct state (user or system)
    if (isUserKey) {
        stateManager.setUserModels(allModels);
    } else {
        stateManager.setSystemModels(allModels);
    }
    
    const statusMessage = attemptedProviders > 0
        ? `Models loaded (${allModels.length})`
        : 'No enabled model providers configured';
    stateManager.bus.publish('status:update', { message: statusMessage, state: 'connected' });
}

// --- Main Exported Functions ---
export async function loadAllSystemModels() {
    stateManager.bus.publish('status:update', { message: 'Loading all system models...', state: 'loading' });
    
    const settings = UserService.getSystemApiSettings();
    const providerEnabled = settings.providerEnabled || {};
    let allModels = [];

    // 1. พยายามดึงโมเดลจาก OpenRouter (ถ้ามี Key)
    if (providerEnabled.openrouter !== false && settings.openrouterKey) {
        try {
            const openRouterModels = await fetchOpenRouterModels(settings.openrouterKey);
            allModels.push(...openRouterModels);
        } catch (error) {
            console.error("Failed to fetch OpenRouter models:", error);
            showCustomAlert(error.message || "Could not fetch models from OpenRouter. Check key and connection.", "Warning");
        }
    }

    // 2. พยายามดึงโมเดลจาก Ollama (ถ้ามี URL)
    if (providerEnabled.ollama !== false && settings.ollamaBaseUrl) {
        try {
            const ollamaModels = await fetchOllamaModels(settings.ollamaBaseUrl);
            allModels.push(...ollamaModels);
        } catch (error) {
            console.error("Failed to fetch Ollama models:", error);
            showCustomAlert(error.message, "Warning");
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

    // 1. ประกาศตัวแปรที่นี่ เพื่อให้มี Scope ครอบคลุมทั้งฟังก์ชัน
    let entityAgent;

    // 2. ใช้ agentName ที่ส่งเข้ามาเป็นเป้าหมายหลักเสมอ
    const targetAgentName = agentName;

    // 3. ถ้ามี targetAgentName ให้ค้นหาข้อมูล Agent โดยตรง
    if (targetAgentName) {
        entityAgent = project.agentPresets?.[targetAgentName];
    } else {
        // 4. ถ้าไม่มี (เป็น Fallback) ให้หาจาก Active Entity
        const activeEntity = project.activeEntity;
        if (activeEntity?.type === 'agent') {
            entityAgent = project.agentPresets?.[activeEntity.name];
        } else if (activeEntity?.type === 'group') {
            const group = project.agentGroups?.[activeEntity.name];
            entityAgent = project.agentPresets?.[group?.moderatorAgent];
        }
    }

    // 5. ตรวจสอบให้แน่ใจว่าเราหา Agent เจอจริงๆ ก่อนทำงานต่อ
    if (!entityAgent) {
        // console.warn(`getFullSystemPrompt: Could not resolve an agent for "${agentName || project.activeEntity?.name}".`);
        return ""; // คืนค่าว่างอย่างปลอดภัย
    }

    // --- ส่วนที่เหลือของฟังก์ชันจะทำงานได้อย่างปลอดภัย ---
    let basePrompt = entityAgent.systemPrompt || "";
    const activeMemoryNames = entityAgent.activeMemories || [];

    if (activeMemoryNames.length === 0) {
        return basePrompt.trim();
    }

    const memoryContent = activeMemoryNames
        .map(name => project.memories.find(m => m.name === name)?.content)
        .filter(Boolean)
        .join('\n\n');

    if (!memoryContent) {
        return basePrompt.trim();
    }

    return `${basePrompt.trim()}\n\n--- Active Memories ---\n${memoryContent}`;
}

export function buildPayloadMessages(history, targetAgentName, payloadOptions = null) {
    const project = stateManager.getProject();
    if (!project) return [];
    ensureProjectFolders(project);

    const agent = project.agentPresets[targetAgentName];
    if (!agent) return [];

    const messages = [];

    // --- ส่วนที่ 1: เพิ่ม System Prompt และ Memories (ไม่มีการแก้ไข) ---
    const finalSystemPrompt = getFullSystemPrompt(targetAgentName);
    if (finalSystemPrompt) {
        messages.push({ role: 'system', content: finalSystemPrompt });
    }

    // --- ส่วนที่ 2: จัดการ Summary Context (ไม่มีการแก้ไข) ---
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    const activeSummaryId = session?.summaryState?.activeSummaryId;
    let startIndex = 0;
    if (activeSummaryId) {
        const activeSummary = project.summaryLogs?.find(log => log.id === activeSummaryId);
        if (activeSummary) {
            const summaryContext = `This is a summary of the conversation so far. Use this for context:\n\n---\n${activeSummary.content}\n---`;
            messages.push({ role: 'system', content: summaryContext });
            startIndex = session.summaryState.summarizedUntilIndex || 0;
        }
    }

    // --- ส่วนที่ 3: [ผ่าตัด] สร้างประวัติการแชทพร้อมแปลง Role สำหรับ Group Chat ---
    const relevantHistory = history.slice(startIndex);

    // --- ส่วนที่ 3.25: เพิ่ม Folder-aware shared context ---
    const folderContext = buildFolderSharedContext(project, session);
    if (payloadOptions && payloadOptions.__collect === true) {
        payloadOptions.folderContext = folderContext;
    }
    if (folderContext?.contextText) {
        messages.push({ role: 'system', content: folderContext.contextText });
    }

    // --- ส่วนที่ 3.5: เพิ่ม Retrieved Knowledge Context (RAG) ---
    const retrievalQueryText = getRetrievalQueryText(relevantHistory);
    const retrievalResult = buildRetrievedKnowledgeContext(retrievalQueryText, project, session);
    if (payloadOptions && payloadOptions.__collect === true) {
        payloadOptions.rag = retrievalResult;
    }
    if (retrievalResult?.contextText) {
        messages.push({ role: 'system', content: retrievalResult.contextText });
    }
    
    // นับจำนวน Turn ของ Assistant เพื่อระบุว่าเป็น Group Chat หรือไม่
    const assistantTurns = relevantHistory.filter(m => m.role === 'assistant' && m.content && !m.isLoading).length;

    relevantHistory.forEach((msg, index) => {
        if (msg.isLoading || !msg.content || msg.isSummary || msg.isSummaryMarker) return;

        let apiMessageContent = msg.content;
        
        // --- ส่วนย่อย: จัดการ Multimodal Content (ไม่มีการแก้ไข) ---
        if (Array.isArray(apiMessageContent)) {
            const allModels = [
                ...(stateManager.getState().systemProviderModels || []),
                ...(stateManager.getState().userProviderModels || [])
            ];
            const modelData = allModels.find(m => m.id === agent.model);
            const supportsMultimodalArray = modelData?.provider === 'openrouter';

            if (supportsMultimodalArray) {
                apiMessageContent = apiMessageContent.map(part => {
                    if (part.type === 'image_url') {
                        return { type: 'image_url', image_url: { url: part.url } };
                    }
                    return part;
                });
            } else {
                apiMessageContent = apiMessageContent
                    .filter(part => part.type === 'text' && part.text)
                    .map(part => part.text)
                    .join('\n');
            }
        }
        
        // --- ส่วนย่อย: สร้าง Payload สำหรับ API ---
        const apiMessage = {
            role: msg.role,
            content: apiMessageContent
        };

        // ===== [หัวใจของการแก้ไขอยู่ตรงนี้] =====
        const isLastMessageInHistory = (index === relevantHistory.length - 1);

        if (assistantTurns > 0 && msg.role === 'assistant' && isLastMessageInHistory) {
            // ถ้าเป็นการคุยกันของ Agent (assistantTurns > 0)
            // และข้อความนี้เป็นข้อความล่าสุดของ Agent คนก่อนหน้า
            // ให้ "แปลงร่าง" role ของมันเป็น 'user' ชั่วคราว
            apiMessage.role = 'user';
        } else if (msg.role === 'assistant' && msg.speaker) {
            // สำหรับข้อความ Assistant อื่นๆ ในประวัติ ให้ใส่ชื่อกำกับไว้ (ถ้า model รองรับ)
            apiMessage.name = msg.speaker.replace(/[^a-zA-Z0-9_-]/g, '_');
        }
        
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

function constructApiCall(agent, messages, stream = false, forceSystemAgentCall = false) {
    const project = stateManager.getProject();
    const systemUtilityAgent = project?.globalSettings?.systemUtilityAgent;
    const matchesSystemAgentByIdentity = Boolean(systemUtilityAgent && agent === systemUtilityAgent);
    const matchesSystemAgentBySignature = Boolean(
        systemUtilityAgent &&
        agent &&
        typeof agent === 'object' &&
        agent.name &&
        agent.model &&
        agent.name === systemUtilityAgent.name &&
        agent.model === systemUtilityAgent.model
    );
    const isSystemAgentCall = Boolean(forceSystemAgentCall || matchesSystemAgentByIdentity || matchesSystemAgentBySignature);

    const modelsToSearchFrom = isSystemAgentCall 
        ? (stateManager.getState().systemProviderModels || [])
        : UserService.getAllowedModelsForCurrentUser();

    const modelData = modelsToSearchFrom.find(m => m.id === agent.model);
    
    if (!modelData) {
        const reason = isSystemAgentCall ? "it might be missing from the system's model list" : "it's not allowed in your current plan";
        throw new Error(`Model '${agent.model}' not found or not allowed because ${reason}.`);
    }

    const provider = modelData.provider || (String(agent.model || '').includes('/') ? 'openrouter' : 'ollama');
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
        if (!UserService.isApiProviderEnabled('openrouter', { useSystemSettings: isSystemAgentCall })) {
            throw new Error("OpenRouter API is disabled in Settings for this scope.");
        }
        const apiKey = isSystemAgentCall 
            ? UserService.getSystemApiSettings().openrouterKey 
            : UserService.getApiKey();
        if (!apiKey) {
            throw new Error("Required OpenRouter API Key is missing for this operation.");
        }

        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 
            'Authorization': `Bearer ${apiKey}`,
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
    } else if (provider === 'ollama') {
        if (!UserService.isApiProviderEnabled('ollama', { useSystemSettings: isSystemAgentCall })) {
            throw new Error("Ollama API is disabled in Settings for this scope.");
        }
        const ollamaBaseUrl = isSystemAgentCall
            ? UserService.getSystemApiSettings().ollamaBaseUrl
            : UserService.getOllamaUrl();
        if (!ollamaBaseUrl) {
            throw new Error("Required Ollama Base URL is missing for this operation.");
        }

        url = `${ollamaBaseUrl}/api/chat`;
        headers = { 'Content-Type': 'application/json' };
        body = { model: agent.model, messages, stream, options: safeParams };
    } else {
        throw new Error(`Unsupported model provider '${provider}' for model '${agent.model}'.`);
    }

    return { url, headers, body, provider };
}

// =========================================================================
// == MAIN EXPORTED API FUNCTIONS (Unchanged, they use the new constructor)
// =========================================================================

export async function streamLLMResponse(agent, messages, onChunk) {
    const { url, headers, body, provider } = constructApiCall(agent, messages, true, false);
    try {
        stateManager.bus.publish('status:update', { message: `Responding with ${agent.model}...`, state: 'loading' });
        
        const startTime = performance.now();
        const response = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body), signal: stateManager.getState().abortController?.signal });
        
        if (!response.ok) {
            const errorText = await safeReadErrorText(response);
            throw new Error(buildApiErrorMessage(provider, response.status, response.statusText, errorText));
        }
        
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
                            if (jsonStr === '[DONE]') continue; // Use continue instead of break
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
        
        // [THE FIX] ประมวลผลข้อมูลส่วนสุดท้ายที่อาจค้างอยู่ใน buffer
        if (buffer.trim()) {
            // ทำการประมวลผลเหมือนใน Loop ทุกประการ
            let token = '';
            try {
                if (provider === 'openrouter') {
                    if (buffer.startsWith('data: ')) {
                        const jsonStr = buffer.replace(/^data: /, '').trim();
                        if (jsonStr !== '[DONE]') {
                             const data = JSON.parse(jsonStr);
                             token = data.choices?.[0]?.delta?.content || '';
                        }
                    }
                } else { // ollama
                    const data = JSON.parse(buffer);
                    token = data.message?.content || '';
                }
            } catch (e) { console.warn("Skipping malformed final JSON chunk:", buffer); }
            if (token) {
                fullResponseText += token;
                onChunk(token);
            }
        }
        
        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000;

        let usage = { prompt_tokens: 0, completion_tokens: 0 };
        let cost = 0;
        let usageIsEstimated = true;

        if (provider === 'openrouter' && response.headers.get('x-openrouter-usage')) {
            try {
                const parsedUsage = JSON.parse(response.headers.get('x-openrouter-usage'));
                usage = {
                    prompt_tokens: parsedUsage.prompt_tokens || 0,
                    completion_tokens: parsedUsage.completion_tokens || 0
                };
                cost = parsedUsage.cost || 0;
                usageIsEstimated = false;
            } catch(e) { console.error("Could not parse usage header:", e); }
        }
        
        if (usageIsEstimated) {
            usage.prompt_tokens = estimateTokens(JSON.stringify(messages));
            usage.completion_tokens = estimateTokens(fullResponseText);
        }
        
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
    const { url, headers, body, provider } = constructApiCall(agent, messages, false, false);

    try {
        const response = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) { 
            const errorText = await safeReadErrorText(response);
            throw new Error(buildApiErrorMessage(provider, response.status, response.statusText, errorText));
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

export async function callSystemLLM(agent, messages) {
    // [CRITICAL] บังคับให้ใช้ System API Settings เท่านั้น
    const systemSettings = UserService.getSystemApiSettings();
    const systemApiKey = systemSettings.openrouterKey;
    const ollamaUrl = systemSettings.ollamaBaseUrl;

    if (!systemApiKey && !ollamaUrl) {
        throw new Error("System API or Ollama URL is not configured by the admin.");
    }
    
    // สร้าง Payload โดยใช้ System Key
    const { url, headers, body, provider } = constructApiCall(agent, messages, false, true);
    
    try {
        const response = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) { 
            const errorText = await safeReadErrorText(response);
            throw new Error(buildApiErrorMessage(provider, response.status, response.statusText, errorText));
        }
        
        // ... โค้ดส่วนที่เหลือในการประมวลผล response เหมือนกับ callLLM เดิม ...
        const data = await response.json();
        const content = (provider === 'openrouter' && data.choices?.length > 0) 
            ? data.choices[0].message.content 
            : data.message?.content;

        if (content === undefined) {
            throw new Error("Invalid API response structure.");
        }
        return { content, usage: data.usage || {} };

    } catch (error) {
        console.error("callSystemLLM failed:", error);
        throw error;
    }
}
