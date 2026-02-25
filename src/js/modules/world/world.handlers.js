// ===============================================
// FILE: src/js/modules/world/world.handlers.js
// DESCRIPTION: Project-level CRUD and workflow handlers for World/Book/Chapter metadata (MVP).
// ===============================================

import { stateManager, defaultSystemUtilityAgent, defaultSummarizationPresets } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';
import { callLLM } from '../../core/core.api.js';
import { buildWorldStructuredContextPack } from './world.retrieval.js';
import {
    createBookId,
    createWorldChangeId,
    createWorldId,
    ensureProjectBooks,
    ensureProjectWorldBookOwnership,
    ensureProjectWorldChanges,
    ensureProjectWorlds,
    normalizeBook,
    normalizeChapterSessionMetadata,
    getBookLinkedSessionDisplayTitle,
    SESSION_KIND_CHAT,
    SESSION_KIND_CHAPTER,
    SESSION_KIND_BOOK_AGENT,
    normalizeWorld,
    normalizeWorldChange,
    normalizeWorldItem,
    WORLD_SCOPE_BOOK,
    WORLD_SCOPE_SHARED,
    WORLD_SCOPE_UNASSIGNED
} from './world.schema-utils.js';

const WORLD_PROPOSAL_EXTRACTION_SCHEMA_VERSION = 1;

function getProject() {
    return stateManager.getProject();
}

function ensureWorldProjectState(project) {
    if (!project || typeof project !== 'object') return;
    ensureProjectWorlds(project);
    ensureProjectWorldChanges(project);
    ensureProjectBooks(project);
    ensureProjectWorldBookOwnership(project);
}

function publishWorldChanged({ worldId = null, bookId = null, reason = 'update' } = {}) {
    stateManager.bus.publish('world:dataChanged', { worldId, bookId, reason });
    stateManager.bus.publish('studio:contentShouldRender');
}

function persistWorldProjectState({ worldId = null, bookId = null, reason = 'update', includeSessionListRefresh = false } = {}) {
    const project = getProject();
    if (!project) return;
    stateManager.setProject(project);
    stateManager.updateAndPersistState();
    if (includeSessionListRefresh) {
        stateManager.bus.publish('session:listChanged');
    }
    publishWorldChanged({ worldId, bookId, reason });
}

function refreshActiveChatTitleIfNeeded(project, session) {
    if (!project || !session) return;
    if (project.activeSessionId !== session.id) return;
    stateManager.bus.publish('ui:updateChatTitle', {
        title: getBookLinkedSessionDisplayTitle(session, { includeAct: true, fallback: session.name || 'AI Assistant' })
    });
}

function findWorld(project, worldId) {
    if (!project || !worldId) return null;
    return (project.worlds || []).find(world => world.id === worldId) || null;
}

function findBook(project, bookId) {
    if (!project || !bookId) return null;
    return (project.books || []).find(book => book.id === bookId) || null;
}

function findSession(project, sessionId) {
    if (!project || !sessionId) return null;
    return (project.chatSessions || []).find(session => session.id === sessionId) || null;
}

function getPreferredAgentPresetNameForBook(project) {
    if (!project || typeof project !== 'object') return null;
    const presets = project.agentPresets || {};
    const presetNames = Object.keys(presets);
    if (presetNames.length === 0) return null;
    const activeEntity = project.activeEntity;
    if (activeEntity?.type === 'agent' && activeEntity?.name && presets[activeEntity.name]) {
        return activeEntity.name;
    }
    return presetNames[0] || null;
}

function buildWorldVerbatimItemTitleFromSelection(text = '', fallback = 'Selection') {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
    const maxLen = 72;
    return firstSentence.length > maxLen
        ? `${firstSentence.slice(0, maxLen - 1).trimEnd()}…`
        : firstSentence;
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function uniquePush(list, value) {
    if (!Array.isArray(list) || !value) return list;
    if (!list.includes(value)) {
        list.push(value);
    }
    return list;
}

function removeValue(list, value) {
    if (!Array.isArray(list) || !value) return list;
    return list.filter(item => item !== value);
}

function sanitizeBookChapterReferences(project, book) {
    if (!book?.structure) return;
    const validSessionIds = new Set((project.chatSessions || []).map(session => session.id));
    book.structure.chapterSessionIds = ensureArray(book.structure.chapterSessionIds)
        .filter(sessionId => validSessionIds.has(sessionId));
}

function buildDefaultBookWorldName(project, book) {
    const baseName = `${String(book?.name || 'Book').trim() || 'Book'} World`;
    const existingNames = new Set((project?.worlds || []).map(world => String(world?.name || '').trim().toLowerCase()).filter(Boolean));
    if (!existingNames.has(baseName.toLowerCase())) return baseName;
    let suffix = 2;
    let candidate = `${baseName} ${suffix}`;
    while (existingNames.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${baseName} ${suffix}`;
    }
    return candidate;
}

function createBookOwnedWorldInProject(project, book, payload = {}) {
    if (!project || !book) return null;
    const now = Date.now();
    const world = normalizeWorld({
        id: createWorldId(),
        name: (payload.name || '').trim() || buildDefaultBookWorldName(project, book),
        description: payload.description || '',
        scope: WORLD_SCOPE_BOOK,
        ownerBookId: book.id,
        sharedBookIds: [book.id],
        createdAt: now,
        updatedAt: now,
        version: 1,
        items: []
    });
    project.worlds.unshift(world);
    book.linkedWorldId = world.id;
    book.updatedAt = now;
    project.activeWorldId = world.id;
    return world;
}

function nextChapterNumberForBook(project, bookId) {
    const sessions = (project?.chatSessions || []).filter(session => session?.bookId === bookId);
    if (sessions.length === 0) return 1;
    const maxChapter = sessions.reduce((max, session) => {
        const chapterNumber = Number(session?.chapterNumber);
        return Number.isFinite(chapterNumber) && chapterNumber > max ? Math.round(chapterNumber) : max;
    }, 0);
    return Math.max(1, maxChapter + 1);
}

function nextActNumberForBook(project, bookId) {
    const sessions = (project?.chatSessions || []).filter(session => session?.bookId === bookId);
    if (sessions.length === 0) return 1;
    const maxAct = sessions.reduce((max, session) => {
        const actNumber = Number(session?.actNumber);
        return Number.isFinite(actNumber) && actNumber > max ? Math.round(actNumber) : max;
    }, 0);
    return Math.max(1, maxAct || 1);
}

function ensureBookStructure(book) {
    if (!book || typeof book !== 'object') return null;
    if (!book.structure || typeof book.structure !== 'object') {
        book.structure = { acts: [], chapterSessionIds: [] };
    }
    book.structure.acts = ensureArray(book.structure.acts);
    book.structure.chapterSessionIds = ensureArray(book.structure.chapterSessionIds);
    return book.structure;
}

function getOrderedBookChapterSessions(project, book) {
    if (!project || !book) return [];
    const sessions = (project.chatSessions || []).filter(session => session && session.bookId === book.id && session.archived !== true);
    const byId = new Map(sessions.map(session => [session.id, session]));
    const orderRefs = ensureArray(book?.structure?.chapterSessionIds);

    const ordered = [];
    const seen = new Set();
    orderRefs.forEach((sessionId) => {
        const session = byId.get(sessionId);
        if (!session || seen.has(sessionId)) return;
        ordered.push(session);
        seen.add(sessionId);
    });

    sessions.forEach((session) => {
        if (seen.has(session.id)) return;
        ordered.push(session);
        seen.add(session.id);
        if (book?.structure) {
            uniquePush(book.structure.chapterSessionIds, session.id);
        }
    });

    return ordered;
}

function sortBookSessionsForRenumber(sessions = []) {
    return [...sessions].sort((a, b) => {
        const aAct = Number.isFinite(Number(a?.actNumber)) ? Math.round(Number(a.actNumber)) : Number.MAX_SAFE_INTEGER;
        const bAct = Number.isFinite(Number(b?.actNumber)) ? Math.round(Number(b.actNumber)) : Number.MAX_SAFE_INTEGER;
        if (aAct !== bAct) return aAct - bAct;
        return 0;
    });
}

function renumberBookChapterSessions(project, book) {
    if (!project || !book) return [];
    ensureBookStructure(book);
    sanitizeBookChapterReferences(project, book);
    const ordered = sortBookSessionsForRenumber(getOrderedBookChapterSessions(project, book));
    let chapterCounter = 1;
    ordered.forEach((session) => {
        const previousChapterNumber = Number.isFinite(Number(session?.chapterNumber))
            ? Math.round(Number(session.chapterNumber))
            : null;
        const previousAsOfChapter = Number.isFinite(Number(session?.revealScope?.asOfChapter))
            ? Math.round(Number(session.revealScope.asOfChapter))
            : null;
        const shouldFollowChapter = previousAsOfChapter === null || previousAsOfChapter === previousChapterNumber;

        session.chapterNumber = chapterCounter;
        if (!session.revealScope || typeof session.revealScope !== 'object') {
            session.revealScope = { asOfChapter: chapterCounter };
        } else if (shouldFollowChapter) {
            session.revealScope.asOfChapter = chapterCounter;
        }
        session.updatedAt = Date.now();
        chapterCounter += 1;
    });
    return ordered;
}

function moveSessionIdInArray(list, fromIndex, toIndex) {
    if (!Array.isArray(list)) return false;
    if (fromIndex < 0 || fromIndex >= list.length) return false;
    const boundedTarget = Math.max(0, Math.min(list.length - 1, toIndex));
    if (boundedTarget === fromIndex) return false;
    const [item] = list.splice(fromIndex, 1);
    list.splice(boundedTarget, 0, item);
    return true;
}

function resolveTargetSessionId(payload = {}) {
    if (payload.sessionId) return payload.sessionId;
    return getProject()?.activeSessionId || null;
}

function cloneJsonish(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return Array.isArray(value) ? [...value] : { ...value };
    }
}

function stableStringify(value) {
    const seen = new WeakSet();
    const normalize = (input) => {
        if (input === null || input === undefined) return input;
        if (typeof input !== 'object') return input;
        if (seen.has(input)) return null;
        seen.add(input);
        if (Array.isArray(input)) {
            return input.map(normalize);
        }
        return Object.keys(input)
            .sort()
            .reduce((acc, key) => {
                acc[key] = normalize(input[key]);
                return acc;
            }, {});
    };
    try {
        return JSON.stringify(normalize(value));
    } catch (_error) {
        try {
            return JSON.stringify(value);
        } catch (_error2) {
            return String(value);
        }
    }
}

function normalizeFingerprintText(value, { lowercase = true } = {}) {
    const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    return lowercase ? text.toLowerCase() : text;
}

function normalizeFingerprintTags(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(
        value
            .map(tag => normalizeFingerprintText(tag))
            .filter(Boolean)
    )].sort();
}

function normalizeFingerprintRevealGate(gate) {
    if (!gate || typeof gate !== 'object') return null;
    const kind = String(gate.kind || '').trim();
    if (kind === 'chapter_threshold') {
        const value = Number(gate.value);
        return Number.isFinite(value) && Math.round(value) > 0
            ? { kind, value: Math.round(value) }
            : null;
    }
    if (kind === 'manual_unlock') {
        return { kind, unlocked: gate.unlocked === true || gate.value === true };
    }
    return null;
}

function normalizeProposalAfterPayloadForFingerprint(afterPayload) {
    if (!afterPayload || typeof afterPayload !== 'object') return null;
    return {
        type: normalizeFingerprintText(afterPayload.type || 'note'),
        title: normalizeFingerprintText(afterPayload.title || ''),
        summary: normalizeFingerprintText(afterPayload.summary || ''),
        tags: normalizeFingerprintTags(afterPayload.tags),
        visibility: normalizeFingerprintText(afterPayload.visibility || 'revealed'),
        revealGate: normalizeFingerprintRevealGate(afterPayload.revealGate)
    };
}

function buildWorldProposalDedupKey(change = {}) {
    return stableStringify({
        worldId: change?.worldId || null,
        bookId: change?.bookId || null,
        proposalType: String(change?.proposalType || ''),
        targetItemId: change?.targetItemId || null,
        afterPayload: normalizeProposalAfterPayloadForFingerprint(change?.afterPayload ?? null)
    });
}

function buildWorldProposalSoftDedupKey(change = {}) {
    const proposalType = String(change?.proposalType || '').trim();
    if (proposalType !== 'create_item' && proposalType !== 'edit_item') return null;
    const afterPayload = normalizeProposalAfterPayloadForFingerprint(change?.afterPayload ?? null);
    if (!afterPayload?.title) return null;
    return stableStringify({
        worldId: change?.worldId || null,
        bookId: change?.bookId || null,
        proposalType,
        targetItemId: change?.targetItemId || null,
        type: afterPayload.type || 'note',
        title: afterPayload.title
    });
}

function extractTextFromMessageContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (part?.type === 'text') return part.text || '';
                if (part?.type === 'image_url') return '[image]';
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    if (content && typeof content === 'object') {
        try {
            return JSON.stringify(content);
        } catch (_error) {
            return String(content);
        }
    }
    return '';
}

function trimTextForPrompt(text, maxChars = 5000) {
    const normalized = String(text || '').trim();
    if (!normalized) return '';
    return normalized.length <= maxChars
        ? normalized
        : `${normalized.slice(0, maxChars)}\n...[trimmed]`;
}

function trimTextForPromptTail(text, maxChars = 5000) {
    const normalized = String(text || '').trim();
    if (!normalized) return '';
    if (normalized.length <= maxChars) return normalized;
    return `...[trimmed]\n${normalized.slice(-maxChars)}`;
}

function extractPlainTextFromHtml(html = '') {
    const raw = String(html || '').trim();
    if (!raw) return '';

    // Preserve common block breaks before removing tags.
    const withBreakHints = raw
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|ul|ol|h[1-6]|blockquote|section|article)>/gi, '$&\n');

    if (typeof document !== 'undefined' && document.createElement) {
        const temp = document.createElement('div');
        temp.innerHTML = withBreakHints;
        const text = temp.textContent || temp.innerText || '';
        return text
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    return withBreakHints
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function getComposerDraftTextForWorldProposal(session, { maxChars = 7000 } = {}) {
    const composerHtml = typeof session?.composerContent === 'string' ? session.composerContent : '';
    if (!composerHtml.trim()) return '';
    const plainText = extractPlainTextFromHtml(composerHtml);
    return trimTextForPromptTail(plainText, Math.max(1000, Number(maxChars) || 7000));
}

function safeParseJsonBlock(text = '') {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenceMatch?.[1]?.trim() || raw;
    try {
        return JSON.parse(candidate);
    } catch (_error) {
        const objectMatch = raw.match(/\{[\s\S]*\}$/);
        if (objectMatch) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch (_error2) {
                return null;
            }
        }
        return null;
    }
}

function getWorldProposalUtilityAgent(project) {
    const utilityAgent = project?.globalSettings?.systemUtilityAgent;
    if (utilityAgent?.model) {
        return { ...utilityAgent, temperature: 0.1 };
    }
    if (defaultSystemUtilityAgent?.model) {
        return { ...defaultSystemUtilityAgent, temperature: 0.1 };
    }
    return null;
}

function getActiveSummarizationPreset(project) {
    const selectedName = String(project?.globalSettings?.activeSummarizationPreset || 'Standard').trim() || 'Standard';
    const customPresets = (project?.globalSettings?.summarizationPromptPresets && typeof project.globalSettings.summarizationPromptPresets === 'object')
        ? project.globalSettings.summarizationPromptPresets
        : {};
    const merged = {
        ...defaultSummarizationPresets,
        ...customPresets
    };
    const promptTemplate = String(
        merged[selectedName]
        || project?.globalSettings?.systemUtilityAgent?.summarizationPrompt
        || defaultSystemUtilityAgent?.summarizationPrompt
        || defaultSummarizationPresets.Standard
        || ''
    );
    return {
        presetName: selectedName,
        promptTemplate
    };
}

function getUtilityAgentForChapterSummary(project) {
    const utilityAgent = project?.globalSettings?.systemUtilityAgent;
    if (utilityAgent?.model) {
        return { ...cloneJsonish(utilityAgent), model: utilityAgent.model };
    }
    if (defaultSystemUtilityAgent?.model) {
        return { ...cloneJsonish(defaultSystemUtilityAgent), model: defaultSystemUtilityAgent.model };
    }
    return null;
}

function getBookAgentPresetName(project, book) {
    if (!project || !book) return null;
    const configured = String(book?.bookAgentConfig?.agentPresetName || '').trim();
    if (configured && project.agentPresets?.[configured]) return configured;
    return null;
}

function getBookCodexAgentPresetName(project, book) {
    if (!project || !book) return null;
    const codexConfig = (book?.codexAgentConfig && typeof book.codexAgentConfig === 'object')
        ? book.codexAgentConfig
        : {};
    if (codexConfig.useBookAgent !== false) {
        return getBookAgentPresetName(project, book);
    }
    const configured = String(codexConfig.agentPresetName || '').trim();
    if (configured && project.agentPresets?.[configured]) return configured;
    return null;
}

function buildBookCodexTaskAgent(project, book, {
    taskSystemPrompt = '',
    defaultTemperature = 0.1
} = {}) {
    if (!project || !book) return { agent: null, presetName: null, error: 'Book not found.' };
    const presetName = getBookCodexAgentPresetName(project, book);
    if (!presetName) {
        return {
            agent: null,
            presetName: null,
            error: 'Codex Agent is not configured for this Book. Set it in Book > Codex first.'
        };
    }
    const preset = project.agentPresets?.[presetName];
    if (!preset || !preset.model) {
        return {
            agent: null,
            presetName: null,
            error: `Selected Codex Agent preset "${presetName}" is missing or has no model.`
        };
    }

    const codexOverride = String(book?.codexAgentConfig?.systemPromptOverride || '').trim();
    const baseSystemPrompt = String(preset.systemPrompt || '').trim();
    const mergedSystemPrompt = [baseSystemPrompt, codexOverride, String(taskSystemPrompt || '').trim()]
        .filter(Boolean)
        .join('\n\n');

    const agent = {
        ...cloneJsonish(preset),
        systemPrompt: mergedSystemPrompt || baseSystemPrompt || '',
        temperature: Number.isFinite(Number(preset.temperature))
            ? preset.temperature
            : defaultTemperature
    };

    return { agent, presetName, error: null };
}

function getRecentSessionMessagesForWorldProposal(session, maxMessages = 8) {
    const usableMessages = ensureArray(session?.history)
        .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
        .slice(-Math.max(2, maxMessages));

    return formatSessionMessagesForWorldProposal(usableMessages);
}

function getAllSessionMessagesForSummary(session = {}) {
    const usableMessages = ensureArray(session?.history)
        .filter(message => message && (message.role === 'user' || message.role === 'assistant'));
    return formatSessionMessagesForWorldProposal(usableMessages, { startIndex: 0 });
}

function getChapterSummarySourceText(session, source = 'chat') {
    const normalizedSource = String(source || 'chat').trim().toLowerCase();
    if (normalizedSource === 'composer') {
        const plain = extractPlainTextFromHtml(typeof session?.composerContent === 'string' ? session.composerContent : '');
        return trimTextForPrompt(plain, 22000);
    }
    return trimTextForPrompt(getAllSessionMessagesForSummary(session), 22000);
}

function detectSummaryOutputLanguageHint(sourceText = '') {
    const text = String(sourceText || '');
    if (!text) return 'same_as_source';
    const sample = text.slice(0, 16000);
    const thaiCount = (sample.match(/[ก-๙]/g) || []).length;
    const latinCount = (sample.match(/[A-Za-z]/g) || []).length;
    if (thaiCount >= 24 && thaiCount >= (latinCount * 0.7)) return 'thai';
    if (latinCount >= 24 && latinCount >= (thaiCount * 1.5)) return 'english';
    if (thaiCount > 0 && latinCount > 0) return 'mixed';
    return 'same_as_source';
}

function buildChapterOverviewSummaryPrompt({
    promptTemplate = '',
    sourceText = '',
    sourceKind = 'chat',
    previousSummary = ''
} = {}) {
    const sourceLabel = sourceKind === 'composer'
        ? 'Chapter draft from Composer'
        : 'Chapter conversation from Chat';
    const template = String(promptTemplate || '').trim() || String(defaultSummarizationPresets.Standard || '');
    const previous = String(previousSummary || '').trim() || 'No previous chapter summary.';
    const languageHint = detectSummaryOutputLanguageHint(sourceText);
    const replaced = template
        .replace(/\$\{previousSummary\}/g, previous)
        .replace(/\$\{newMessages\}/g, sourceText);

    const languageConstraint = languageHint === 'thai'
        ? '- Write the summary in Thai (same language as the source chapter content). Do not translate to English.'
        : (languageHint === 'english'
            ? '- Write the summary in English (same language as the source chapter content). Do not translate to Thai.'
            : (languageHint === 'mixed'
                ? '- Source content is mixed-language. Write the summary in the dominant language used in the chapter text/chat, and keep proper nouns/quoted terms as written.'
                : '- Write the summary in the same primary language as the source content. Do not translate unless the source itself is translated.'));

    return [
        replaced,
        '',
        'Additional constraints for Book Overview chapter bubble:',
        '- Summarize this single chapter only (not the whole book).',
        '- Keep it concise but specific (roughly 3-7 sentences).',
        `- Source used: ${sourceLabel}.`,
        '- Preserve character names, places, key events, and important objects.',
        languageConstraint,
        '- Return only the summary text.'
    ].join('\n');
}

function formatSessionMessagesForWorldProposal(messages = [], { startIndex = 0 } = {}) {
    const usableMessages = ensureArray(messages)
        .filter(message => message && (message.role === 'user' || message.role === 'assistant'));

    return usableMessages.map((message, index) => {
        const speaker = message.speaker || message.role || 'unknown';
        const text = trimTextForPrompt(extractTextFromMessageContent(message.content), 1800) || '(no text)';
        return `[${startIndex + index + 1}] ${speaker}\n${text}`;
    }).join('\n\n');
}

function getSessionWorldProposalDelta(session, { lastScannedMessageCount = 0, maxMessages = 12 } = {}) {
    const usableMessages = ensureArray(session?.history)
        .filter(message => message && (message.role === 'user' || message.role === 'assistant'));
    const totalUsable = usableMessages.length;
    const safeLastCount = Number.isFinite(Number(lastScannedMessageCount))
        ? Math.max(0, Math.round(Number(lastScannedMessageCount)))
        : 0;
    const startIndex = Math.min(safeLastCount, totalUsable);
    const deltaMessages = usableMessages.slice(startIndex);

    if (deltaMessages.length === 0) {
        return {
            totalUsable,
            startIndex,
            deltaMessages,
            transcriptText: ''
        };
    }

    const cappedDelta = deltaMessages.slice(-Math.max(1, maxMessages));
    const transcriptStartIndex = totalUsable - cappedDelta.length;
    return {
        totalUsable,
        startIndex,
        deltaMessages: cappedDelta,
        transcriptText: formatSessionMessagesForWorldProposal(cappedDelta, { startIndex: transcriptStartIndex })
    };
}

function buildWorldProposalExtractionPrompt({ session, world, worldContextPack, latestMessagesText, composerDraftText }) {
    const visibleItems = Array.isArray(worldContextPack?.selectedItems) ? worldContextPack.selectedItems : [];
    const visibleLines = visibleItems.length > 0
        ? visibleItems.map(item => `- id=${item.id} | type=${item.type} | title=${item.title}`).join('\n')
        : '- (none)';

    return [
        'You are a continuity scribe for a writing app.',
        'Extract proposed updates to the World from the recent chat conversation.',
        'Return JSON only (no markdown).',
        '',
        `Schema version: ${WORLD_PROPOSAL_EXTRACTION_SCHEMA_VERSION}`,
        'Output format:',
        '{',
        '  "schemaVersion": 1,',
        '  "proposals": [',
        '    {',
        '      "proposalType": "create_item" | "edit_item",',
        '      "targetItemId": "required for edit_item, omit for create_item",',
        '      "afterPayload": {',
        '        "type": "entity|place|rule|event|note|source|relationship",',
        '        "title": "string",',
        '        "summary": "string",',
        '        "tags": ["optional", "tags"],',
        '        "visibility": "revealed|gated",',
        '        "revealGate": { "kind": "chapter_threshold", "value": number } | null',
        '      },',
        '      "reason": "short reason based on the conversation"',
        '    }',
        '  ]',
        '}',
        '',
        'Rules:',
        '- Only propose changes that are explicitly stated or strongly implied in the recent messages.',
        '- Prefer create_item unless an existing visible item clearly matches and should be edited.',
        '- Do not delete items.',
        '- Keep proposals concise and specific.',
        '- If no useful world updates are found, return {"schemaVersion":1,"proposals":[]}.',
        '',
        `Current session: ${session?.name || 'Untitled'} (Act ${session?.actNumber || '-'}, Chapter ${session?.chapterNumber || '-'})`,
        `World: ${world?.name || 'Unknown'}`,
        '',
        'Visible world items already in context (you may edit these by targetItemId):',
        visibleLines,
        '',
        'World Context Pack (spoiler-safe canonical context):',
        trimTextForPrompt(worldContextPack?.contextText || '(none)', 6000),
        '',
        'Current chapter draft from Composer (latest excerpt, plain text):',
        composerDraftText || '(none)',
        '',
        'Recent chat messages:',
        latestMessagesText || '(none)'
    ].join('\n');
}

function normalizeExtractedProposalType(value) {
    const type = String(value || '').trim();
    if (type === 'edit_item') return 'edit_item';
    return 'create_item';
}

function normalizeExtractedAfterPayload(raw = {}) {
    const base = {
        type: String(raw?.type || 'note').trim().toLowerCase() || 'note',
        title: String(raw?.title || '').trim(),
        summary: typeof raw?.summary === 'string' ? raw.summary : '',
        tags: Array.isArray(raw?.tags)
            ? raw.tags.map(tag => String(tag || '').trim()).filter(Boolean)
            : [],
        visibility: String(raw?.visibility || '').trim().toLowerCase() === 'gated' ? 'gated' : 'revealed',
        revealGate: null
    };

    const gate = raw?.revealGate;
    if (base.visibility === 'gated' && gate && typeof gate === 'object' && gate.kind === 'chapter_threshold') {
        const gateValue = Number(gate.value);
        if (Number.isFinite(gateValue) && Math.round(gateValue) > 0) {
            base.revealGate = { kind: 'chapter_threshold', value: Math.round(gateValue) };
        } else {
            base.visibility = 'revealed';
        }
    }

    return base;
}

function buildChoicePromptLines(items, {
    label = 'item',
    getName = (item) => item?.name || item?.title || 'Untitled',
    getExtra = () => '',
    includeNoneOption = false
} = {}) {
    const lines = [`Select ${label}:`];
    if (includeNoneOption) {
        lines.push('0. (None)');
    }
    items.forEach((item, index) => {
        const extra = String(getExtra(item) || '').trim();
        const suffix = extra ? ` — ${extra}` : '';
        lines.push(`${index + 1}. ${getName(item)}${suffix}`);
    });
    return lines.join('\n');
}

function promptForWorldId(project, {
    defaultWorldId = null,
    allowNone = false,
    title = 'World'
} = {}) {
    const worlds = ensureArray(project?.worlds);
    if (worlds.length === 0) {
        showCustomAlert('No worlds available yet.', 'Info');
        return undefined;
    }

    const defaultIndex = Math.max(0, worlds.findIndex(world => world.id === defaultWorldId));
    const raw = prompt(
        `${buildChoicePromptLines(worlds, {
            label: title,
            getName: (world) => world.name,
            getExtra: (world) => `${ensureArray(world.items).length} items`,
            includeNoneOption: allowNone
        })}\n\nEnter number:`,
        String(allowNone ? (defaultWorldId ? defaultIndex + 1 : 0) : (defaultIndex + 1))
    );
    if (raw === null) return undefined;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    if (allowNone && Math.round(parsed) === 0) return null;

    const choiceIndex = Math.round(parsed) - 1;
    if (choiceIndex < 0 || choiceIndex >= worlds.length) return undefined;
    return worlds[choiceIndex].id;
}

function promptForBookId(project, {
    defaultBookId = null,
    title = 'Book'
} = {}) {
    const books = ensureArray(project?.books);
    if (books.length === 0) {
        showCustomAlert('No books available yet.', 'Info');
        return undefined;
    }

    const defaultIndex = Math.max(0, books.findIndex(book => book.id === defaultBookId));
    const raw = prompt(
        `${buildChoicePromptLines(books, {
            label: title,
            getName: (book) => book.name,
            getExtra: (book) => {
                const chapterCount = ensureArray(book?.structure?.chapterSessionIds).length;
                return `${chapterCount} chapters${book?.linkedWorldId ? ', linked world' : ''}`;
            }
        })}\n\nEnter number:`,
        String(defaultIndex + 1)
    );
    if (raw === null) return undefined;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    const choiceIndex = Math.round(parsed) - 1;
    if (choiceIndex < 0 || choiceIndex >= books.length) return undefined;
    return books[choiceIndex].id;
}

function applyWorldItemPatch(item, patch = {}) {
    const merged = {
        ...item,
        ...patch,
        content: patch.content !== undefined ? cloneJsonish(patch.content) : cloneJsonish(item.content),
        aliases: patch.aliases !== undefined ? cloneJsonish(patch.aliases) : cloneJsonish(item.aliases),
        tags: patch.tags !== undefined ? cloneJsonish(patch.tags) : cloneJsonish(item.tags),
        sourceRefs: patch.sourceRefs !== undefined ? cloneJsonish(patch.sourceRefs) : cloneJsonish(item.sourceRefs)
    };
    return normalizeWorldItem({
        ...merged,
        updatedAt: Date.now()
    });
}

export function createWorldPrompt() {
    const project = getProject();
    if (!project) return null;
    const name = prompt('World name:', `World ${ensureArray(project.worlds).length + 1}`);
    if (!name || !name.trim()) return null;
    return createWorld({ name: name.trim() });
}

export function renameWorldPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const world = findWorld(project, payload.worldId || project.activeWorldId);
    if (!world) return null;
    const nextName = prompt('Rename world:', world.name);
    if (!nextName || !nextName.trim()) return null;
    return updateWorld({ worldId: world.id, name: nextName.trim() });
}

export function createWorld(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const now = Date.now();
    const world = normalizeWorld({
        id: createWorldId(),
        name: (payload.name || '').trim() || `World ${project.worlds.length + 1}`,
        description: payload.description || '',
        scope: payload.scope || (payload.ownerBookId ? WORLD_SCOPE_BOOK : WORLD_SCOPE_UNASSIGNED),
        ownerBookId: payload.ownerBookId || null,
        sharedBookIds: Array.isArray(payload.sharedBookIds) ? payload.sharedBookIds : (payload.ownerBookId ? [payload.ownerBookId] : []),
        createdAt: now,
        updatedAt: now,
        version: 1,
        items: []
    });

    project.worlds.unshift(world);
    if (payload.setActive !== false || !project.activeWorldId) {
        project.activeWorldId = world.id;
    }

    persistWorldProjectState({ worldId: world.id, reason: 'world:create' });
    return world;
}

export function updateWorld(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const world = findWorld(project, payload.worldId);
    if (!world) {
        showCustomAlert('World not found.', 'Error');
        return null;
    }

    if (typeof payload.name === 'string' && payload.name.trim()) {
        world.name = payload.name.trim();
    }
    if (typeof payload.description === 'string') {
        world.description = payload.description;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'ownerBookId')) {
        world.ownerBookId = typeof payload.ownerBookId === 'string' && payload.ownerBookId.trim()
            ? payload.ownerBookId.trim()
            : null;
    }
    if (Array.isArray(payload.sharedBookIds)) {
        world.sharedBookIds = [...new Set(payload.sharedBookIds.map(id => String(id || '').trim()).filter(Boolean))];
    }
    if (typeof payload.scope === 'string') {
        const nextScope = String(payload.scope).trim().toLowerCase();
        world.scope = nextScope === WORLD_SCOPE_SHARED
            ? WORLD_SCOPE_SHARED
            : (nextScope === WORLD_SCOPE_BOOK ? WORLD_SCOPE_BOOK : WORLD_SCOPE_UNASSIGNED);
    }
    world.updatedAt = Date.now();

    persistWorldProjectState({ worldId: world.id, reason: 'world:update' });
    return world;
}

export function setActiveWorld(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const world = findWorld(project, payload.worldId);
    if (!world) return false;
    if (project.activeWorldId === world.id) return true;

    project.activeWorldId = world.id;
    persistWorldProjectState({ worldId: world.id, reason: 'world:setActive' });
    return true;
}

export function deleteWorld(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const worldId = payload.worldId;
    const world = findWorld(project, worldId);
    if (!world) return false;

    if (payload.confirm !== false) {
        const shouldDelete = confirm(`Delete world "${world.name}"?`);
        if (!shouldDelete) return false;
    }

    project.worlds = (project.worlds || []).filter(item => item.id !== worldId);
    project.worldChanges = (project.worldChanges || []).filter(change => change.worldId !== worldId);
    (project.books || []).forEach(book => {
        if (book.linkedWorldId === worldId) {
            book.linkedWorldId = null;
            book.updatedAt = Date.now();
        }
    });
    ensureProjectWorlds(project);
    ensureProjectBooks(project);

    persistWorldProjectState({ reason: 'world:delete' });
    return true;
}

export function createBookPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const name = prompt('Book name:', `Book ${ensureArray(project.books).length + 1}`);
    if (!name || !name.trim()) return null;
    return createBook({
        ...payload,
        name: name.trim(),
        linkedWorldId: payload.linkedWorldId || project.activeWorldId || null
    });
}

export function renameBookPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) return null;
    const nextName = prompt('Rename book:', book.name);
    if (!nextName || !nextName.trim()) return null;
    return updateBook({ bookId: book.id, name: nextName.trim() });
}

export function createBook(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const preferredAgentPresetName = getPreferredAgentPresetNameForBook(project);

    const requestedWorldId = Object.prototype.hasOwnProperty.call(payload, 'linkedWorldId')
        ? (payload.linkedWorldId || null)
        : (project.activeWorldId || null);
    const validWorldId = requestedWorldId && findWorld(project, requestedWorldId)
        ? requestedWorldId
        : null;
    const now = Date.now();

    const book = normalizeBook({
        id: createBookId(),
        name: (payload.name || '').trim() || `Book ${project.books.length + 1}`,
        description: payload.description || '',
        linkedWorldId: validWorldId,
        bookAgentSessionId: payload.bookAgentSessionId || null,
        autoNumberChapters: payload.autoNumberChapters !== false,
        constraints: typeof payload.constraints === 'object' && payload.constraints
            ? cloneJsonish(payload.constraints)
            : {},
        composerDocs: typeof payload.composerDocs === 'object' && payload.composerDocs
            ? cloneJsonish(payload.composerDocs)
            : {
                treatment: '',
                synopsis: '',
                outline: '',
                sceneBeats: ''
            },
        exportProfile: typeof payload.exportProfile === 'object' && payload.exportProfile
            ? cloneJsonish(payload.exportProfile)
            : {
                title: (payload.name || '').trim() || `Book ${project.books.length + 1}`,
                subtitle: '',
                author: '',
                chapterTitleMode: 'number_and_title',
                includeChapterSummaries: false,
                sceneBreakMarker: '***',
                frontMatterNotes: ''
            },
        bookAgentConfig: typeof payload.bookAgentConfig === 'object' && payload.bookAgentConfig
            ? cloneJsonish(payload.bookAgentConfig)
            : {
                agentPresetName: preferredAgentPresetName,
                systemPromptOverride: ''
            },
        codexAgentConfig: typeof payload.codexAgentConfig === 'object' && payload.codexAgentConfig
            ? cloneJsonish(payload.codexAgentConfig)
            : {
                useBookAgent: true,
                agentPresetName: null,
                systemPromptOverride: ''
            },
        agentAutomation: typeof payload.agentAutomation === 'object' && payload.agentAutomation
            ? cloneJsonish(payload.agentAutomation)
            : {
                worldProposals: {
                    autoProposeEnabled: false,
                    lastScannedMessageCount: 0,
                    lastScannedAt: null
                }
            },
        structure: {
            acts: [],
            chapterSessionIds: []
        },
        createdAt: now,
        updatedAt: now
    }, { validWorldIds: new Set((project.worlds || []).map(world => world.id)) });

    project.books.unshift(book);
    if (payload.setActive !== false || !project.activeBookId) {
        project.activeBookId = book.id;
    }
    if (!book.linkedWorldId && payload.createBookWorld !== false) {
        createBookOwnedWorldInProject(project, book, {
            name: payload.bookWorldName || '',
            description: payload.bookWorldDescription || ''
        });
    }

    persistWorldProjectState({ bookId: book.id, reason: 'book:create' });
    return book;
}

export function updateBook(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return null;
    }

    if (typeof payload.name === 'string' && payload.name.trim()) {
        book.name = payload.name.trim();
    }
    if (typeof payload.description === 'string') {
        book.description = payload.description;
    }
    if (payload.constraints && typeof payload.constraints === 'object') {
        book.constraints = {
            ...(book.constraints || {}),
            ...cloneJsonish(payload.constraints)
        };
    }
    if (payload.composerDocs && typeof payload.composerDocs === 'object') {
        book.composerDocs = {
            ...(book.composerDocs || {}),
            ...cloneJsonish(payload.composerDocs)
        };
    }
    if (payload.exportProfile && typeof payload.exportProfile === 'object') {
        book.exportProfile = {
            ...(book.exportProfile || {}),
            ...cloneJsonish(payload.exportProfile)
        };
    }
    if (payload.bookAgentConfig && typeof payload.bookAgentConfig === 'object') {
        book.bookAgentConfig = {
            ...(book.bookAgentConfig || {}),
            ...cloneJsonish(payload.bookAgentConfig)
        };
    }
    if (payload.codexAgentConfig && typeof payload.codexAgentConfig === 'object') {
        book.codexAgentConfig = {
            ...(book.codexAgentConfig || {}),
            ...cloneJsonish(payload.codexAgentConfig)
        };
    }
    if (payload.chapterStructureDefaults && typeof payload.chapterStructureDefaults === 'object') {
        book.chapterStructureDefaults = {
            ...(book.chapterStructureDefaults || {}),
            ...cloneJsonish(payload.chapterStructureDefaults)
        };
    }
    if (payload.agentAutomation && typeof payload.agentAutomation === 'object') {
        book.agentAutomation = {
            ...(book.agentAutomation || {}),
            ...cloneJsonish(payload.agentAutomation)
        };
        if (payload.agentAutomation.worldProposals && typeof payload.agentAutomation.worldProposals === 'object') {
            book.agentAutomation.worldProposals = {
                ...((book.agentAutomation && book.agentAutomation.worldProposals) || {}),
                ...cloneJsonish(payload.agentAutomation.worldProposals)
            };
        }
        // Re-normalize via normalizeBook-like shape on next ensure cycle, but keep fields sane now.
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'bookAgentSessionId')) {
        book.bookAgentSessionId = typeof payload.bookAgentSessionId === 'string' && payload.bookAgentSessionId.trim()
            ? payload.bookAgentSessionId.trim()
            : null;
    }
    if (payload.autoNumberChapters !== undefined) {
        book.autoNumberChapters = payload.autoNumberChapters !== false;
    }
    book.updatedAt = Date.now();

    persistWorldProjectState({ bookId: book.id, reason: 'book:update' });
    return book;
}

export function upsertBookAct(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return null;
    }

    const actNumberRaw = Number(payload.actNumber);
    const actNumber = Number.isFinite(actNumberRaw) && Math.round(actNumberRaw) > 0
        ? Math.round(actNumberRaw)
        : null;
    if (!actNumber) {
        showCustomAlert('Valid act number is required.', 'Error');
        return null;
    }

    if (!book.structure || typeof book.structure !== 'object') {
        book.structure = { acts: [], chapterSessionIds: [] };
    }
    book.structure.acts = ensureArray(book.structure.acts);

    let act = book.structure.acts.find(entry => Number(entry?.order) === actNumber) || null;
    if (!act) {
        act = {
            id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            order: actNumber,
            title: `Act ${actNumber}`,
            summary: ''
        };
        book.structure.acts.push(act);
    }

    if (typeof payload.title === 'string') {
        const trimmed = payload.title.trim();
        act.title = trimmed || `Act ${actNumber}`;
    }
    if (typeof payload.summary === 'string') {
        act.summary = payload.summary;
    }
    act.order = actNumber;

    book.structure.acts = book.structure.acts
        .filter(Boolean)
        .sort((a, b) => {
            const aOrder = Number.isFinite(Number(a?.order)) ? Math.round(Number(a.order)) : Number.MAX_SAFE_INTEGER;
            const bOrder = Number.isFinite(Number(b?.order)) ? Math.round(Number(b.order)) : Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return String(a?.title || '').localeCompare(String(b?.title || ''));
        });

    book.updatedAt = Date.now();
    persistWorldProjectState({ bookId: book.id, reason: 'book:actUpsert' });
    return act;
}

export function setActiveBook(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId);
    if (!book) return false;
    if (project.activeBookId === book.id) return true;

    project.activeBookId = book.id;
    persistWorldProjectState({ bookId: book.id, reason: 'book:setActive' });
    return true;
}

export function linkBookToWorldPrompt(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return false;
    }

    const selectedWorldId = promptForWorldId(project, {
        defaultWorldId: book.linkedWorldId || project.activeWorldId,
        allowNone: true,
        title: 'world to link'
    });
    if (selectedWorldId === undefined) return false;
    return linkBookToWorld({ bookId: book.id, worldId: selectedWorldId });
}

export function linkBookToWorld(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return false;
    }

    const nextWorldId = payload.worldId ? (findWorld(project, payload.worldId)?.id || null) : null;
    if (book.linkedWorldId === nextWorldId) return true;

    book.linkedWorldId = nextWorldId;
    book.updatedAt = Date.now();
    ensureProjectWorldBookOwnership(project);
    persistWorldProjectState({ worldId: nextWorldId, bookId: book.id, reason: 'book:linkWorld' });
    return true;
}

export function ensureBookWorld(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Book');
        return null;
    }

    let world = book.linkedWorldId ? findWorld(project, book.linkedWorldId) : null;
    if (!world) {
        world = createBookOwnedWorldInProject(project, book, {
            name: payload.name || '',
            description: payload.description || ''
        });
        if (!world) {
            showCustomAlert('Could not create Book World.', 'Book');
            return null;
        }
        ensureProjectWorldBookOwnership(project);
        persistWorldProjectState({ worldId: world.id, bookId: book.id, reason: 'book:ensureWorld:create' });
        return world;
    }

    if (payload.setActive !== false && project.activeWorldId !== world.id) {
        project.activeWorldId = world.id;
        ensureProjectWorldBookOwnership(project);
        persistWorldProjectState({ worldId: world.id, bookId: book.id, reason: 'book:ensureWorld:setActive' });
        return world;
    }

    return world;
}

export function deleteBook(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const bookId = payload.bookId;
    const book = findBook(project, bookId);
    if (!book) return false;

    if (payload.confirm !== false) {
        const shouldDelete = confirm(`Delete book "${book.name}"? Chapter metadata links will be cleared.`);
        if (!shouldDelete) return false;
    }

    project.books = (project.books || []).filter(item => item.id !== bookId);
    (project.chatSessions || []).forEach(session => {
        if (session.bookId !== bookId) return;
        Object.assign(
            session,
            normalizeChapterSessionMetadata(
                {
                    ...session,
                    bookId: null,
                    actNumber: null,
                    chapterNumber: null,
                    chapterTitle: '',
                    revealScope: { asOfChapter: null }
                },
                { validBookIds: new Set() }
            )
        );
        session.kind = SESSION_KIND_CHAT;
    });
    (project.chatSessions || []).forEach(session => {
        if (session?.bookAgentBookId !== bookId) return;
        session.bookAgentBookId = null;
        session.kind = SESSION_KIND_CHAT;
        session.updatedAt = Date.now();
    });
    project.worldChanges = (project.worldChanges || []).filter(change => change.bookId !== bookId);
    ensureProjectBooks(project);

    persistWorldProjectState({ reason: 'book:delete', includeSessionListRefresh: true });
    return true;
}

export function assignSessionToBookPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('No active chat session to assign.', 'Info');
        return null;
    }

    const selectedBookId = promptForBookId(project, {
        defaultBookId: session.bookId || project.activeBookId,
        title: 'book for this chat'
    });
    if (!selectedBookId) return null;

    return assignSessionToBook({
        ...payload,
        sessionId,
        bookId: selectedBookId
    });
}

export function updateChapterMetadataPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('Chat session not found.', 'Error');
        return null;
    }

    const actRaw = prompt('Act number (blank to keep):', session.actNumber ? String(session.actNumber) : '');
    if (actRaw === null) return null;
    const chapterRaw = prompt('Chapter number (blank to keep):', session.chapterNumber ? String(session.chapterNumber) : '');
    if (chapterRaw === null) return null;
    const revealRaw = prompt('Reveal scope as-of chapter (blank = use chapter number):', session.revealScope?.asOfChapter ? String(session.revealScope.asOfChapter) : '');
    if (revealRaw === null) return null;
    const titleRaw = prompt('Chapter title (optional):', session.chapterTitle || '');
    if (titleRaw === null) return null;
    const modeRaw = prompt('Writing mode ("writing" or "author"):', session.writingMode || 'writing');
    if (modeRaw === null) return null;

    const toNumberOrNull = (value) => {
        const trimmed = String(value || '').trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? Math.round(parsed) : null;
    };

    return updateChapterMetadata({
        sessionId,
        actNumber: toNumberOrNull(actRaw),
        chapterNumber: toNumberOrNull(chapterRaw),
        chapterTitle: String(titleRaw || ''),
        writingMode: String(modeRaw || '').trim().toLowerCase() === 'author' ? 'author' : 'writing',
        revealScope: {
            asOfChapter: toNumberOrNull(revealRaw)
        }
    });
}

function escapeHtmlForComposerScaffold(text = '') {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeChapterStructureConfigForScaffold(rawConfig = {}) {
    const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    const titleTemplatePreset = [
        'chapter_number_title',
        'chapter_number_only',
        'chapter_title_only',
        'thai_chapter_number_title',
        'thai_chapter_number_only',
        'custom'
    ].includes(String(source.titleTemplatePreset || '').trim())
        ? String(source.titleTemplatePreset).trim()
        : 'chapter_number_title';
    const titleTemplateCustom = String(source.titleTemplateCustom || 'Chapter {number}: {title}');
    const titleAlign = ['left', 'center', 'right'].includes(String(source.titleAlign || '').trim())
        ? String(source.titleAlign).trim()
        : 'left';
    const rawFontSize = Number(source.titleFontSizePx);
    const titleFontSizePx = Number.isFinite(rawFontSize)
        ? Math.max(14, Math.min(96, Math.round(rawFontSize)))
        : 32;
    return {
        titleTemplatePreset,
        titleTemplateCustom,
        titleAlign,
        titleFontSizePx
    };
}

function buildDefaultChapterTitleForComposer(session = {}, structureConfig = {}) {
    const normalizedConfig = normalizeChapterStructureConfigForScaffold(structureConfig);
    const chapterNumber = Number.isFinite(Number(session?.chapterNumber))
        ? Math.round(Number(session.chapterNumber))
        : null;
    const chapterTitle = String(session?.chapterTitle || '').trim();

    let template = 'Chapter {number}: {title}';
    if (normalizedConfig.titleTemplatePreset === 'chapter_number_only') template = 'Chapter {number}';
    if (normalizedConfig.titleTemplatePreset === 'chapter_title_only') template = '{title}';
    if (normalizedConfig.titleTemplatePreset === 'thai_chapter_number_title') template = 'บทที่ {number}: {title}';
    if (normalizedConfig.titleTemplatePreset === 'thai_chapter_number_only') template = 'บทที่ {number}';
    if (normalizedConfig.titleTemplatePreset === 'custom') {
        template = String(normalizedConfig.titleTemplateCustom || '').trim() || 'Chapter {number}: {title}';
    }

    const filled = template
        .replace(/\{number\}/g, chapterNumber ? String(chapterNumber) : '')
        .replace(/\{title\}/g, chapterTitle);

    const cleaned = filled
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([:.\-–—])/g, '$1')
        .replace(/([:.\-–—])\s*$/, '$1')
        .trim();

    if (cleaned) return cleaned;
    if (chapterNumber && chapterTitle) return `Chapter ${chapterNumber}: ${chapterTitle}`;
    if (chapterNumber) return `Chapter ${chapterNumber}`;
    if (chapterTitle) return chapterTitle;
    return normalizedConfig.titleTemplatePreset.startsWith('thai_') ? 'บทที่' : 'Chapter';
}

function buildDefaultChapterComposerScaffoldHtml(session = {}, structureConfig = {}) {
    const normalizedConfig = normalizeChapterStructureConfigForScaffold(structureConfig);
    const chapterHeading = escapeHtmlForComposerScaffold(buildDefaultChapterTitleForComposer(session, normalizedConfig));
    const headingAlign = normalizedConfig.titleAlign && normalizedConfig.titleAlign !== 'left'
        ? ` style="text-align: ${normalizedConfig.titleAlign};"`
        : '';
    const titleSpan = `<span style="font-size: ${normalizedConfig.titleFontSizePx}px;">${chapterHeading}</span>`;
    return `<h1${headingAlign}>${titleSpan}</h1><p></p>`;
}

function isDefaultChapterComposerScaffoldHtml(html = '') {
    const normalized = String(html || '')
        .replace(/\s+/g, '')
        .toLowerCase();
    if (!normalized) return true;
    return normalized === '<h2>scene1</h2><p></p>'
        || normalized === '<h1>chapter</h1><p></p>'
        || normalized === '<h1>chapter</h1><h2>scene1</h2><p></p>'
        || /^<h1>chapter\d*(?::[^<]*)?<\/h1><p><\/p>$/.test(normalized)
        || /^<h1>chapter\d*(?::[^<]*)?<\/h1><h2>scene1<\/h2><p><\/p>$/.test(normalized)
        || /^<h1(?:[^>]*)?>.*<\/h1><p><\/p>$/.test(normalized)
        || /^<h1(?:[^>]*)?>.*<\/h1><h2(?:[^>]*)?>scene1<\/h2><p><\/p>$/.test(normalized);
}

function maybeInitializeChapterComposerScaffold(session = {}, options = {}) {
    if (!session || String(session.kind || '').toLowerCase() !== 'chapter') return;
    const currentComposerHtml = typeof session?.composerContent === 'string' ? session.composerContent : '';
    if (!isDefaultChapterComposerScaffoldHtml(currentComposerHtml)) return;
    const structureConfig = options?.structureConfig && typeof options.structureConfig === 'object'
        ? options.structureConfig
        : (session.chapterStructureConfig && typeof session.chapterStructureConfig === 'object' ? session.chapterStructureConfig : {});
    session.composerContent = buildDefaultChapterComposerScaffoldHtml(session, structureConfig);
}

export function assignSessionToBook(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('Chat session not found.', 'Error');
        return null;
    }

    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Error');
        return null;
    }

    const nextActNumber = payload.actNumber ?? session.actNumber ?? nextActNumberForBook(project, book.id);
    const shouldAutoNumber = payload.autoNumber !== false && book.autoNumberChapters !== false;
    const nextChapterNumber = payload.chapterNumber
        ?? session.chapterNumber
        ?? (shouldAutoNumber ? nextChapterNumberForBook(project, book.id) : null);

    const mergedMetadataSource = {
        ...session,
        bookId: book.id,
        actNumber: nextActNumber,
        chapterNumber: nextChapterNumber,
        chapterTitle: payload.chapterTitle ?? session.chapterTitle,
        chapterSummary: payload.chapterSummary ?? session.chapterSummary,
        chapterStatus: payload.chapterStatus ?? session.chapterStatus,
        revealScope: payload.revealScope ?? session.revealScope,
        writingMode: payload.writingMode ?? session.writingMode
    };

    const validBookIds = new Set((project.books || []).map(item => item.id));
    Object.assign(session, normalizeChapterSessionMetadata(mergedMetadataSource, { validBookIds }));
    if (payload.revealScope && typeof payload.revealScope === 'object') {
        session.revealScope = {
            ...(session.revealScope || {}),
            ...cloneJsonish(payload.revealScope)
        };
    }
    session.kind = SESSION_KIND_CHAPTER;
    if (!book.chapterStructureDefaults || typeof book.chapterStructureDefaults !== 'object') {
        book.chapterStructureDefaults = cloneJsonish(
            session.chapterStructureConfig && typeof session.chapterStructureConfig === 'object'
                ? session.chapterStructureConfig
                : {
                    titleTemplatePreset: 'chapter_number_title',
                    titleTemplateCustom: 'Chapter {number}: {title}',
                    titleAlign: 'left',
                    titleFontSizePx: 32,
                    segmentNoun: 'scene',
                    customSegmentNoun: '',
                    implicitFirstSegment: true,
                    segmentMarkerStyle: 'heading',
                    segmentMarkerSymbol: '***'
                }
        ) || {};
    }
    if (!session.chapterStructureConfig || typeof session.chapterStructureConfig !== 'object') {
        session.chapterStructureConfig = {
            titleTemplatePreset: 'chapter_number_title',
            titleTemplateCustom: 'Chapter {number}: {title}',
            titleAlign: 'left',
            titleFontSizePx: 32,
            segmentNoun: 'scene',
            customSegmentNoun: '',
            implicitFirstSegment: true,
            segmentMarkerStyle: 'heading',
            segmentMarkerSymbol: '***'
        };
    }
    maybeInitializeChapterComposerScaffold(session, {
        structureConfig: (book && typeof book.chapterStructureDefaults === 'object' && book.chapterStructureDefaults)
            ? book.chapterStructureDefaults
            : session.chapterStructureConfig
    });
    session.updatedAt = Date.now();

    (project.books || []).forEach(otherBook => {
        if (!otherBook?.structure) return;
        otherBook.structure.chapterSessionIds = removeValue(ensureArray(otherBook.structure.chapterSessionIds), session.id);
        sanitizeBookChapterReferences(project, otherBook);
    });
    if (!book.structure || typeof book.structure !== 'object') {
        book.structure = { acts: [], chapterSessionIds: [] };
    }
    book.structure.chapterSessionIds = ensureArray(book.structure.chapterSessionIds);
    uniquePush(book.structure.chapterSessionIds, session.id);
    book.updatedAt = Date.now();
    project.activeBookId = book.id;
    if (book.linkedWorldId) {
        project.activeWorldId = book.linkedWorldId;
    }

    refreshActiveChatTitleIfNeeded(project, session);

    persistWorldProjectState({
        worldId: book.linkedWorldId || null,
        bookId: book.id,
        reason: 'chapter:assignToBook',
        includeSessionListRefresh: true
    });
    return session;
}

export function detachSessionFromBook(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) return false;
    if (!session.bookId) return true;

    const previousBookId = session.bookId;
    const previousBook = findBook(project, previousBookId);

    Object.assign(
        session,
        normalizeChapterSessionMetadata(
            {
                ...session,
                bookId: null,
                actNumber: null,
                chapterNumber: null,
                chapterTitle: '',
                revealScope: { asOfChapter: null }
            },
            { validBookIds: new Set((project.books || []).map(book => book.id)) }
        )
    );
    session.kind = SESSION_KIND_CHAT;
    session.updatedAt = Date.now();

    if (previousBook?.structure) {
        previousBook.structure.chapterSessionIds = removeValue(ensureArray(previousBook.structure.chapterSessionIds), session.id);
        previousBook.updatedAt = Date.now();
    }

    refreshActiveChatTitleIfNeeded(project, session);

    persistWorldProjectState({
        bookId: previousBookId,
        reason: 'chapter:detachFromBook',
        includeSessionListRefresh: true
    });
    return true;
}

export function updateChapterMetadata(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        showCustomAlert('Chat session not found.', 'Error');
        return null;
    }

    const validBookIds = new Set((project.books || []).map(book => book.id));
    const merged = {
        ...session,
        ...cloneJsonish(payload),
        revealScope: {
            ...(session.revealScope || {}),
            ...(payload.revealScope && typeof payload.revealScope === 'object' ? payload.revealScope : {})
        }
    };
    delete merged.sessionId;

    Object.assign(session, normalizeChapterSessionMetadata(merged, { validBookIds }));
    session.kind = session.bookId ? SESSION_KIND_CHAPTER : SESSION_KIND_CHAT;
    session.updatedAt = Date.now();

    if (session.bookId) {
        const book = findBook(project, session.bookId);
        if (book) {
            if (!book.structure || typeof book.structure !== 'object') {
                book.structure = { acts: [], chapterSessionIds: [] };
            }
            book.structure.chapterSessionIds = ensureArray(book.structure.chapterSessionIds);
            uniquePush(book.structure.chapterSessionIds, session.id);
            sanitizeBookChapterReferences(project, book);
            book.updatedAt = Date.now();
            maybeInitializeChapterComposerScaffold(session, {
                structureConfig: (book.chapterStructureDefaults && typeof book.chapterStructureDefaults === 'object')
                    ? book.chapterStructureDefaults
                    : session.chapterStructureConfig
            });
        }
    } else {
        maybeInitializeChapterComposerScaffold(session, { structureConfig: session.chapterStructureConfig });
    }

    refreshActiveChatTitleIfNeeded(project, session);

    persistWorldProjectState({
        bookId: session.bookId,
        reason: 'chapter:updateMeta',
        includeSessionListRefresh: true
    });
    return session;
}

export async function summarizeChapterForOverview(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    const silent = payload.silent === true;
    if (!session) {
        if (!silent) showCustomAlert('Chapter session not found.', 'Chapter Summary');
        return null;
    }
    if (!session.bookId) {
        if (!silent) showCustomAlert('This chat is not linked to a Book chapter.', 'Chapter Summary');
        return null;
    }

    const sourceKind = String(payload.source || 'chat').trim().toLowerCase() === 'composer'
        ? 'composer'
        : 'chat';
    const sourceText = getChapterSummarySourceText(session, sourceKind);
    if (!sourceText) {
        if (!silent) {
            showCustomAlert(
                sourceKind === 'composer'
                    ? 'No Composer draft found for this chapter.'
                    : 'Not enough Chat content to summarize for this chapter.',
                'Chapter Summary'
            );
        }
        return null;
    }

    const summarizerAgent = getUtilityAgentForChapterSummary(project);
    if (!summarizerAgent?.model) {
        if (!silent) showCustomAlert('No summarization model configured. Check Summary settings.', 'Chapter Summary');
        return null;
    }

    const { presetName, promptTemplate } = getActiveSummarizationPreset(project);
    const summaryPrompt = buildChapterOverviewSummaryPrompt({
        promptTemplate,
        sourceText,
        sourceKind,
        previousSummary: String(session.chapterSummary || '')
    });

    try {
        stateManager.bus.publish('chapter:overviewSummaryProgress', {
            sessionId: session.id,
            bookId: session.bookId,
            source: sourceKind,
            state: 'start',
            batch: payload.batch === true
        });
        if (!silent) {
            stateManager.bus.publish('status:update', {
                message: `Summarizing chapter from ${sourceKind === 'composer' ? 'Composer' : 'Chat'}...`,
                state: 'loading'
            });
        }

        const response = await callLLM(summarizerAgent, [{ role: 'user', content: summaryPrompt }]);
        const nextSummary = String(response?.content || '').trim();
        if (!nextSummary) {
            throw new Error('Received an empty summary response.');
        }

        session.chapterSummary = nextSummary;
        session.chapterSummaryMeta = {
            source: sourceKind,
            presetName,
            model: summarizerAgent.model,
            updatedAt: Date.now()
        };
        session.updatedAt = Date.now();

        persistWorldProjectState({
            bookId: session.bookId,
            reason: 'chapter:overviewSummary',
            includeSessionListRefresh: false
        });

        if (!silent) {
            stateManager.bus.publish('status:update', { message: 'Chapter summary updated.', state: 'success' });
            showCustomAlert(
                `Chapter summary updated from ${sourceKind === 'composer' ? 'Composer' : 'Chat'} (preset: ${presetName}).`,
                'Chapter Summary'
            );
        }
        return nextSummary;
    } catch (error) {
        console.error('Failed to summarize chapter for overview:', error);
        if (!silent) {
            stateManager.bus.publish('status:update', { message: 'Failed to summarize chapter.', state: 'error' });
            showCustomAlert(`Failed to summarize chapter: ${error.message || error}`, 'Chapter Summary');
        }
        return null;
    } finally {
        stateManager.bus.publish('chapter:overviewSummaryProgress', {
            sessionId: session.id,
            bookId: session.bookId,
            source: sourceKind,
            state: 'done',
            batch: payload.batch === true
        });
    }
}

export async function summarizeMissingBookChaptersForOverview(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Chapter Summary');
        return null;
    }

    const sourceKind = String(payload.source || 'composer').trim().toLowerCase() === 'chat' ? 'chat' : 'composer';
    const forceRegenerate = payload.force === true || String(payload.force || '').trim().toLowerCase() === 'true';
    const allChapters = getOrderedBookChapterSessions(project, book);
    const targetChapters = forceRegenerate
        ? allChapters
        : allChapters.filter(session => !String(session?.chapterSummary || '').trim());
    if (targetChapters.length === 0) {
        showCustomAlert(
            forceRegenerate
                ? 'No chapters in this Book to regenerate summaries for.'
                : 'No missing chapter summaries in this Book.',
            'Chapter Summary'
        );
        return { total: 0, summarized: 0, skippedNoSource: 0, failed: 0, mode: forceRegenerate ? 'regenerate' : 'missing' };
    }

    stateManager.bus.publish('book:overviewSummaryBatchProgress', {
        bookId: book.id,
        source: sourceKind,
        state: 'start',
        total: targetChapters.length,
        mode: forceRegenerate ? 'regenerate' : 'missing'
    });

    stateManager.bus.publish('status:update', {
        message: forceRegenerate
            ? `Regenerating ${targetChapters.length} chapter summary(s) from ${sourceKind === 'composer' ? 'Composer' : 'Chat'}...`
            : `Summarizing ${targetChapters.length} chapter(s) from ${sourceKind === 'composer' ? 'Composer' : 'Chat'}...`,
        state: 'loading'
    });

    let summarized = 0;
    let skippedNoSource = 0;
    let failed = 0;

    try {
        for (const chapterSession of targetChapters) {
            const sourceText = getChapterSummarySourceText(chapterSession, sourceKind);
            if (!sourceText) {
                skippedNoSource += 1;
                continue;
            }
            const result = await summarizeChapterForOverview({
                sessionId: chapterSession.id,
                source: sourceKind,
                silent: true,
                batch: true
            });
            if (typeof result === 'string' && result.trim()) {
                summarized += 1;
            } else {
                failed += 1;
            }
        }

        const parts = [];
        parts.push(`${forceRegenerate ? 'Regenerated' : 'Updated'} ${summarized} chapter summary${summarized === 1 ? '' : 'ies'}`);
        if (skippedNoSource > 0) parts.push(`${skippedNoSource} skipped (no ${sourceKind === 'composer' ? 'Composer draft' : 'Chat content'})`);
        if (failed > 0) parts.push(`${failed} failed`);

        stateManager.bus.publish('status:update', {
            message: forceRegenerate ? 'Batch chapter summary regeneration complete.' : 'Batch chapter summary complete.',
            state: failed > 0 ? 'warning' : 'success'
        });
        showCustomAlert(parts.join(' • '), 'Chapter Summary');

        return {
            total: targetChapters.length,
            summarized,
            skippedNoSource,
            failed,
            mode: forceRegenerate ? 'regenerate' : 'missing'
        };
    } finally {
        stateManager.bus.publish('book:overviewSummaryBatchProgress', {
            bookId: book.id,
            source: sourceKind,
            state: 'done',
            total: targetChapters.length,
            summarized,
            skippedNoSource,
            failed,
            mode: forceRegenerate ? 'regenerate' : 'missing'
        });
    }
}

export function moveChapterInBookOrder(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session?.bookId) {
        showCustomAlert('This chat is not linked to a Book chapter.', 'Book');
        return false;
    }
    const book = findBook(project, session.bookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Book');
        return false;
    }
    ensureBookStructure(book);
    sanitizeBookChapterReferences(project, book);
    uniquePush(book.structure.chapterSessionIds, session.id);

    const direction = String(payload.direction || '').trim().toLowerCase();
    if (direction !== 'up' && direction !== 'down') return false;

    const ordered = getOrderedBookChapterSessions(project, book);
    const peers = ordered.filter(item => (item.actNumber || null) === (session.actNumber || null));
    const peerIndex = peers.findIndex(item => item.id === session.id);
    if (peerIndex < 0) return false;
    const targetPeer = direction === 'up' ? peers[peerIndex - 1] : peers[peerIndex + 1];
    if (!targetPeer) return false;

    const list = book.structure.chapterSessionIds;
    const fromIndex = list.indexOf(session.id);
    const targetIndex = list.indexOf(targetPeer.id);
    if (fromIndex < 0 || targetIndex < 0) return false;
    moveSessionIdInArray(list, fromIndex, targetIndex);

    if (book.autoNumberChapters !== false && payload.renumber !== false) {
        renumberBookChapterSessions(project, book);
    }
    book.updatedAt = Date.now();
    refreshActiveChatTitleIfNeeded(project, session);
    refreshActiveChatTitleIfNeeded(project, targetPeer);

    persistWorldProjectState({
        bookId: book.id,
        reason: 'chapter:moveOrder',
        includeSessionListRefresh: true
    });
    return true;
}

export function reorderChapterInBook(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const targetSessionId = String(payload.targetSessionId || '').trim();
    const position = String(payload.position || 'before').trim().toLowerCase() === 'after' ? 'after' : 'before';
    if (!sessionId || !targetSessionId || sessionId === targetSessionId) return false;

    const session = findSession(project, sessionId);
    const targetSession = findSession(project, targetSessionId);
    if (!session?.bookId || !targetSession?.bookId || session.bookId !== targetSession.bookId) {
        showCustomAlert('Chapters must be in the same Book to reorder.', 'Book');
        return false;
    }

    const book = findBook(project, session.bookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Book');
        return false;
    }

    ensureBookStructure(book);
    sanitizeBookChapterReferences(project, book);
    uniquePush(book.structure.chapterSessionIds, session.id);
    uniquePush(book.structure.chapterSessionIds, targetSession.id);

    const list = book.structure.chapterSessionIds;
    const fromIndex = list.indexOf(session.id);
    let targetIndex = list.indexOf(targetSession.id);
    if (fromIndex < 0 || targetIndex < 0) return false;

    const [movedId] = list.splice(fromIndex, 1);
    if (fromIndex < targetIndex) {
        targetIndex -= 1;
    }
    const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    list.splice(Math.max(0, Math.min(list.length, insertIndex)), 0, movedId);

    const adoptTargetAct = payload.adoptTargetAct !== false;
    if (adoptTargetAct) {
        session.actNumber = Number.isFinite(Number(targetSession.actNumber))
            ? Math.round(Number(targetSession.actNumber))
            : null;
    }

    session.updatedAt = Date.now();
    if (book.autoNumberChapters !== false && payload.renumber !== false) {
        renumberBookChapterSessions(project, book);
    }
    book.updatedAt = Date.now();

    refreshActiveChatTitleIfNeeded(project, session);
    refreshActiveChatTitleIfNeeded(project, targetSession);

    persistWorldProjectState({
        bookId: book.id,
        reason: 'chapter:reorderInBook',
        includeSessionListRefresh: true
    });
    return true;
}

export function moveChapterToAct(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session?.bookId) {
        showCustomAlert('This chat is not linked to a Book chapter.', 'Book');
        return false;
    }
    const book = findBook(project, session.bookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Book');
        return false;
    }
    ensureBookStructure(book);
    sanitizeBookChapterReferences(project, book);
    uniquePush(book.structure.chapterSessionIds, session.id);

    const actNumber = payload.actNumber === null || payload.actNumber === undefined || String(payload.actNumber).trim?.() === ''
        ? null
        : Math.max(1, Math.round(Number(payload.actNumber)));
    if (payload.actNumber !== null && payload.actNumber !== undefined && !Number.isFinite(Number(payload.actNumber))) {
        showCustomAlert('Invalid act number.', 'Book');
        return false;
    }

    // Ensure act definition exists when moving into a numbered act.
    if (actNumber) {
        const existingAct = ensureArray(book.structure.acts).find(act => Number(act?.order) === actNumber);
        if (!existingAct) {
            book.structure.acts.push({
                id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                order: actNumber,
                title: `Act ${actNumber}`,
                summary: ''
            });
            book.structure.acts.sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
        }
    }

    session.actNumber = actNumber;
    session.updatedAt = Date.now();

    const list = book.structure.chapterSessionIds;
    const currentIndex = list.indexOf(session.id);
    if (currentIndex >= 0) list.splice(currentIndex, 1);

    const orderedWithoutCurrent = ensureArray(book.structure.chapterSessionIds)
        .map((id) => findSession(project, id))
        .filter((item) => item && item.id !== session.id && item.bookId === book.id && item.archived !== true);
    let insertBeforeSessionId = null;
    let lastSameActSessionId = null;
    if (actNumber === null) {
        // Unassigned acts appear last.
        insertBeforeSessionId = null;
    } else {
        for (const candidate of orderedWithoutCurrent) {
            const candidateAct = Number.isFinite(Number(candidate?.actNumber)) ? Math.round(Number(candidate.actNumber)) : null;
            if (candidateAct === actNumber) {
                lastSameActSessionId = candidate.id;
                continue;
            }
            if (candidateAct !== null && candidateAct > actNumber) {
                insertBeforeSessionId = candidate.id;
                break;
            }
            if (candidateAct === null) {
                insertBeforeSessionId = candidate.id;
                break;
            }
        }
    }

    if (lastSameActSessionId) {
        const idx = list.indexOf(lastSameActSessionId);
        list.splice(idx + 1, 0, session.id);
    } else if (insertBeforeSessionId) {
        const idx = list.indexOf(insertBeforeSessionId);
        list.splice(Math.max(0, idx), 0, session.id);
    } else {
        list.push(session.id);
    }

    if (book.autoNumberChapters !== false && payload.renumber !== false) {
        renumberBookChapterSessions(project, book);
    }
    book.updatedAt = Date.now();
    refreshActiveChatTitleIfNeeded(project, session);

    persistWorldProjectState({
        bookId: book.id,
        reason: 'chapter:moveToAct',
        includeSessionListRefresh: true
    });
    return true;
}

export function renumberBookChapters(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const book = findBook(project, payload.bookId || project.activeBookId);
    if (!book) {
        showCustomAlert('Book not found.', 'Book');
        return false;
    }

    renumberBookChapterSessions(project, book);
    book.updatedAt = Date.now();

    const activeSession = findSession(project, project.activeSessionId);
    refreshActiveChatTitleIfNeeded(project, activeSession);

    persistWorldProjectState({
        bookId: book.id,
        reason: 'book:renumberChapters',
        includeSessionListRefresh: true
    });
    showCustomAlert(`Re-numbered chapters in "${book.name}".`, 'Book');
    return true;
}

export function createWorldItemPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const worldId = payload.worldId || project.activeWorldId;
    const world = findWorld(project, worldId);
    if (!world) {
        showCustomAlert('No active world selected.', 'Info');
        return null;
    }

    const defaultType = String(payload.type || 'entity');
    const typeRaw = payload.type
        ? defaultType
        : prompt('Item type (entity/place/rule/event/note/source/relationship):', defaultType);
    if (typeRaw === null) return null;

    const type = String(typeRaw || '').trim().toLowerCase() || 'entity';
    const title = prompt('Item title:', '');
    if (!title || !title.trim()) return null;
    const summary = prompt('Description / note (optional):', '') ?? '';
    const tagsRaw = prompt('Tags (comma-separated, optional):', '') ?? '';
    const gatedRaw = prompt('Reveal gate chapter number (blank for revealed now):', '') ?? '';

    const gatedValue = Number(gatedRaw);
    const hasChapterGate = String(gatedRaw).trim() && Number.isFinite(gatedValue) && Math.round(gatedValue) > 0;

    return createWorldItem({
        worldId: world.id,
        type,
        title: title.trim(),
        summary: String(summary || ''),
        tags: String(tagsRaw || '')
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean),
        status: 'canon',
        visibility: hasChapterGate ? 'gated' : 'revealed',
        revealGate: hasChapterGate
            ? { kind: 'chapter_threshold', value: Math.round(gatedValue) }
            : null
    });
}

export function editWorldItemPrompt(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const world = findWorld(project, payload.worldId || project.activeWorldId);
    if (!world) return null;
    const item = ensureArray(world.items).find(entry => entry.id === payload.itemId);
    if (!item) {
        showCustomAlert('World item not found.', 'Error');
        return null;
    }

    const title = prompt('Item title:', item.title || '');
    if (title === null || !title.trim()) return null;
    const summary = prompt('Description / note:', item.summary || '') ?? '';
    const tagsRaw = prompt('Tags (comma-separated):', ensureArray(item.tags).join(', ')) ?? '';
    const visibilityRaw = prompt('Visibility ("revealed" or "gated"):', item.visibility || 'revealed');
    if (visibilityRaw === null) return null;
    let revealGate = cloneJsonish(item.revealGate);
    let visibility = String(visibilityRaw || '').trim().toLowerCase() === 'gated' ? 'gated' : 'revealed';

    if (visibility === 'gated') {
        const currentGateVal = item.revealGate?.kind === 'chapter_threshold' ? item.revealGate.value : '';
        const gateRaw = prompt('Reveal at chapter number (blank to keep manual lock/none):', currentGateVal ? String(currentGateVal) : '');
        if (gateRaw === null) return null;
        const parsed = Number(gateRaw);
        if (String(gateRaw).trim() && Number.isFinite(parsed) && Math.round(parsed) > 0) {
            revealGate = { kind: 'chapter_threshold', value: Math.round(parsed) };
        }
    } else {
        revealGate = null;
    }

    return updateWorldItem({
        worldId: world.id,
        itemId: item.id,
        patch: {
            title: title.trim(),
            summary: String(summary || ''),
            tags: String(tagsRaw || '')
                .split(',')
                .map(tag => tag.trim())
                .filter(Boolean),
            visibility,
            revealGate
        }
    });
}

export function createWorldItem(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const worldId = payload.worldId || project.activeWorldId;
    const world = findWorld(project, worldId);
    if (!world) {
        showCustomAlert('World not found.', 'Error');
        return null;
    }

    const now = Date.now();
    const item = normalizeWorldItem({
        ...cloneJsonish(payload.item || {}),
        ...cloneJsonish(payload),
        worldId: undefined,
        item: undefined,
        status: payload.status || payload.item?.status || 'canon',
        createdBy: 'user',
        updatedBy: 'user',
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 1
    });

    if (!Array.isArray(world.items)) {
        world.items = [];
    }
    world.items.unshift(item);
    world.updatedAt = now;
    world.version = Number.isFinite(world.version) ? world.version + 1 : 1;

    persistWorldProjectState({ worldId: world.id, reason: 'worldItem:create' });
    return item;
}

export function addSelectionVerbatimToWorld(payload = {}) {
    const project = getProject();
    if (!project) {
        showCustomAlert('No project loaded.', 'Codex');
        return null;
    }
    ensureWorldProjectState(project);

    const exactText = String(payload.text || '').trim();
    if (!exactText) {
        showCustomAlert('Please select text first.', 'Codex');
        return null;
    }

    const session = findSession(project, payload.sessionId || project.activeSessionId);
    const explicitBook = findBook(project, payload.bookId || null);
    const sessionBook = session?.bookId ? findBook(project, session.bookId) : null;
    const activeBook = project.activeBookId ? findBook(project, project.activeBookId) : null;
    const book = explicitBook || sessionBook || activeBook || null;

    const resolvedWorldId = payload.worldId
        || book?.linkedWorldId
        || project.activeWorldId
        || null;
    const world = findWorld(project, resolvedWorldId);
    if (!world?.id) {
        showCustomAlert('No active Codex/World found. Open a Book with a linked Codex first.', 'Codex');
        return null;
    }

    const sourceKind = String(payload.sourceKind || 'chat').trim().toLowerCase() || 'chat';
    const requestedType = String(payload.type || 'note').trim().toLowerCase() || 'note';
    const allowedTypes = new Set(['note', 'entity', 'place', 'rule', 'event']);
    const itemType = allowedTypes.has(requestedType) ? requestedType : 'note';

    const summaryLimit = Math.max(80, Number(payload.summaryLimit) || 280);
    const summary = exactText.length > summaryLimit
        ? `${exactText.slice(0, summaryLimit).trimEnd()}…`
        : exactText;

    const tags = [];
    uniquePush(tags, 'verbatim');
    uniquePush(tags, `${sourceKind}-selection`);
    ensureArray(payload.tags).forEach((tag) => {
        const normalizedTag = String(tag || '').trim().toLowerCase();
        if (normalizedTag) uniquePush(tags, normalizedTag);
    });

    const sourceRefs = [];
    ensureArray(payload.sourceRefs).forEach((ref) => {
        const value = String(ref || '').trim();
        if (value) sourceRefs.push(value);
    });
    if (session?.id) {
        sourceRefs.push(`chat_session:${session.id}`);
        if (sourceKind === 'composer') {
            sourceRefs.push(`composer_session:${session.id}`);
        }
    }
    if (sourceKind === 'chat' && payload.messageId) {
        sourceRefs.push(`chat_message:${session?.id || 'unknown'}:${String(payload.messageId)}`);
    }

    const titleFallbackMap = {
        note: 'Chat Selection',
        entity: 'Character / Entity Draft',
        place: 'Place Draft',
        rule: 'Rule Draft',
        event: 'Event Draft'
    };
    const item = createWorldItem({
        worldId: world.id,
        type: itemType,
        title: String(payload.title || '').trim() || buildWorldVerbatimItemTitleFromSelection(exactText, titleFallbackMap[itemType] || 'Selection'),
        summary,
        content: exactText,
        status: 'draft',
        visibility: 'revealed',
        tags,
        sourceRefs
    });

    if (!item) return null;

    const sourceLabel = sourceKind === 'composer' ? 'Composer' : 'Chat';
    showCustomAlert(`Added selection to Codex as a draft ${itemType} (${world.name}) from ${sourceLabel}.`, 'Codex');
    return item;
}

export function updateWorldItem(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const worldId = payload.worldId || project.activeWorldId;
    const world = findWorld(project, worldId);
    if (!world) {
        showCustomAlert('World not found.', 'Error');
        return null;
    }
    if (!Array.isArray(world.items)) world.items = [];

    const index = world.items.findIndex(item => item.id === payload.itemId);
    if (index < 0) {
        showCustomAlert('World item not found.', 'Error');
        return null;
    }

    const patch = payload.patch && typeof payload.patch === 'object'
        ? payload.patch
        : payload;
    const nextItem = applyWorldItemPatch(world.items[index], {
        ...cloneJsonish(patch),
        updatedBy: 'user'
    });
    world.items[index] = nextItem;
    world.updatedAt = Date.now();
    world.version = Number.isFinite(world.version) ? world.version + 1 : 1;

    persistWorldProjectState({ worldId: world.id, reason: 'worldItem:update' });
    return nextItem;
}

export function deleteWorldItem(payload = {}) {
    const project = getProject();
    if (!project) return false;
    ensureWorldProjectState(project);

    const worldId = payload.worldId || project.activeWorldId;
    const world = findWorld(project, worldId);
    if (!world || !Array.isArray(world.items)) return false;

    const existing = world.items.find(item => item.id === payload.itemId);
    if (!existing) return false;

    if (payload.confirm !== false) {
        const shouldDelete = confirm(`Delete world item "${existing.title}"?`);
        if (!shouldDelete) return false;
    }

    world.items = world.items.filter(item => item.id !== payload.itemId);
    world.updatedAt = Date.now();
    world.version = Number.isFinite(world.version) ? world.version + 1 : 1;

    persistWorldProjectState({ worldId: world.id, reason: 'worldItem:delete' });
    return true;
}

export function createWorldChangeProposal(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const now = Date.now();
    const proposal = normalizeWorldChange({
        id: createWorldChangeId(),
        ...cloneJsonish(payload),
        status: 'pending',
        createdAt: now,
        updatedAt: now
    });

    const dedupKey = buildWorldProposalDedupKey(proposal);
    const softDedupKey = buildWorldProposalSoftDedupKey(proposal);
    const duplicatePending = ensureArray(project.worldChanges).find((existing) => {
        if (!existing) return false;
        if (String(existing.status || 'pending') !== 'pending') return false;
        const existingStrictKey = buildWorldProposalDedupKey(existing);
        if (existingStrictKey === dedupKey) return true;
        if (!softDedupKey) return false;
        const existingSoftKey = buildWorldProposalSoftDedupKey(existing);
        return Boolean(existingSoftKey) && existingSoftKey === softDedupKey;
    });
    if (duplicatePending) {
        return null;
    }

    project.worldChanges.unshift(proposal);
    persistWorldProjectState({ worldId: proposal.worldId, bookId: proposal.bookId, reason: 'worldChange:create' });
    return proposal;
}

function applyProposalToWorld(project, proposal, reviewPayload = {}) {
    if (!proposal || !proposal.worldId) {
        throw new Error('Proposal is missing worldId.');
    }
    const world = findWorld(project, proposal.worldId);
    if (!world) {
        throw new Error('Target world not found.');
    }
    if (!Array.isArray(world.items)) {
        world.items = [];
    }

    const proposalType = String(proposal.proposalType || '').trim();
    const afterPayload = reviewPayload.afterPayload !== undefined
        ? cloneJsonish(reviewPayload.afterPayload)
        : cloneJsonish(proposal.afterPayload);
    const targetItemId = reviewPayload.targetItemId || proposal.targetItemId || afterPayload?.id || null;

    if (proposalType === 'create_item') {
        const newItem = normalizeWorldItem({
            ...afterPayload,
            id: afterPayload?.id || targetItemId || undefined,
            createdBy: 'agent',
            updatedBy: 'agent',
            approvedAt: Date.now(),
            status: afterPayload?.status || 'canon'
        });
        const existingIndex = world.items.findIndex(item => item.id === newItem.id);
        if (existingIndex >= 0) {
            world.items[existingIndex] = newItem;
        } else {
            world.items.unshift(newItem);
        }
    } else if (proposalType === 'edit_item') {
        const index = world.items.findIndex(item => item.id === targetItemId);
        if (index < 0) {
            throw new Error('Target world item not found for edit proposal.');
        }
        world.items[index] = applyWorldItemPatch(world.items[index], {
            ...afterPayload,
            updatedBy: 'agent',
            approvedAt: Date.now()
        });
    } else if (proposalType === 'delete_item') {
        const index = world.items.findIndex(item => item.id === targetItemId);
        if (index >= 0) {
            world.items.splice(index, 1);
        }
    } else {
        throw new Error(`Unsupported proposal type for auto-apply: ${proposalType || '(empty)'}`);
    }

    world.updatedAt = Date.now();
    world.version = Number.isFinite(world.version) ? world.version + 1 : 1;
    return world;
}

export function reviewWorldChangeProposal(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const change = (project.worldChanges || []).find(item => item.id === payload.changeId);
    if (!change) {
        showCustomAlert('World proposal not found.', 'Error');
        return null;
    }

    const requestedStatus = payload.status === 'approved'
        ? 'approved'
        : (payload.status === 'rejected' ? 'rejected' : 'edited');

    const shouldApply = requestedStatus !== 'rejected' && payload.apply !== false;
    if (shouldApply) {
        try {
            applyProposalToWorld(project, change, payload);
        } catch (error) {
            console.error('[World] Failed to apply proposal:', error);
            showCustomAlert(error.message || 'Failed to apply world proposal.', 'Error');
            return null;
        }
    }

    change.status = requestedStatus;
    if (payload.afterPayload !== undefined) {
        change.afterPayload = cloneJsonish(payload.afterPayload);
    }
    if (payload.reason !== undefined && typeof payload.reason === 'string') {
        change.reason = payload.reason;
    }
    change.reviewedBy = payload.reviewedBy || 'user';
    change.reviewedAt = Date.now();
    change.updatedAt = Date.now();

    persistWorldProjectState({ worldId: change.worldId, bookId: change.bookId, reason: 'worldChange:review' });
    return change;
}

export async function proposeWorldUpdatesFromCurrentChat(payload = {}) {
    const project = getProject();
    if (!project) return [];
    ensureWorldProjectState(project);
    const silent = payload.silent === true;

    const sessionId = resolveTargetSessionId(payload);
    const session = findSession(project, sessionId);
    if (!session) {
        if (!silent) showCustomAlert('No active chat session found.', 'World Proposals');
        return null;
    }

    const book = findBook(project, payload.bookId || session.bookId || project.activeBookId);
    if (!book) {
        if (!silent) showCustomAlert('World proposals require a Book context. Open this chat from a Book and configure Codex Agent.', 'World Proposals');
        return null;
    }
    const world = findWorld(project, payload.worldId || book?.linkedWorldId || project.activeWorldId);
    if (!world) {
        if (!silent) showCustomAlert('No World is linked to this chat/book yet.', 'World Proposals');
        return null;
    }
    const { agent: codexAgent, presetName: codexPresetName, error: codexAgentError } = buildBookCodexTaskAgent(project, book);
    if (!codexAgent?.model) {
        if (!silent) showCustomAlert(codexAgentError || 'Codex Agent is not configured for this Book.', 'World Proposals');
        return null;
    }

    const latestMessagesText = typeof payload.recentMessagesText === 'string'
        ? payload.recentMessagesText.trim()
        : getRecentSessionMessagesForWorldProposal(session, Number(payload.maxMessages) || 8);
    const includeComposerDraft = payload.includeComposerDraft !== false;
    const hasComposerDraftOverride = Object.prototype.hasOwnProperty.call(payload, 'composerDraftText');
    const composerDraftText = includeComposerDraft
        ? (hasComposerDraftOverride
            ? String(payload.composerDraftText || '').trim()
            : getComposerDraftTextForWorldProposal(session, { maxChars: Number(payload.maxComposerChars) || 7000 }))
        : '';

    if (!latestMessagesText.trim() && !composerDraftText.trim()) {
        if (!silent) showCustomAlert('Not enough chapter content (chat/composer) to extract proposals.', 'World Proposals');
        return [];
    }

    const hybridSourceText = [
        composerDraftText ? `[COMPOSER_DRAFT]\n${composerDraftText}` : '',
        latestMessagesText ? `[RECENT_CHAT]\n${latestMessagesText}` : ''
    ].filter(Boolean).join('\n\n');

    const worldContextPack = buildWorldStructuredContextPack(project, session, {
        queryText: hybridSourceText || latestMessagesText,
        maxItems: Number(payload.maxWorldItems) || 14
    });

    const extractionPrompt = buildWorldProposalExtractionPrompt({
        session,
        world,
        worldContextPack,
        latestMessagesText,
        composerDraftText
    });

    if (!silent) {
        stateManager.bus.publish('status:update', { message: 'Extracting World proposals...', state: 'loading' });
    }

    try {
        const response = await callLLM(codexAgent, [{ role: 'user', content: extractionPrompt }]);
        const parsed = safeParseJsonBlock(response?.content || '');
        const proposals = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
        const created = [];
        const skipped = [];

        proposals.forEach((rawProposal, index) => {
            const proposalType = normalizeExtractedProposalType(rawProposal?.proposalType);
            const afterPayload = normalizeExtractedAfterPayload(rawProposal?.afterPayload || {});
            const targetItemId = String(rawProposal?.targetItemId || '').trim() || null;

            if (!afterPayload.title) {
                skipped.push(`#${index + 1}: missing title`);
                return;
            }

            let beforePayload = null;
            if (proposalType === 'edit_item') {
                if (!targetItemId) {
                    skipped.push(`#${index + 1}: edit_item missing targetItemId`);
                    return;
                }
                const existingItem = ensureArray(world.items).find(item => item.id === targetItemId);
                if (!existingItem) {
                    skipped.push(`#${index + 1}: target item not found (${targetItemId})`);
                    return;
                }
                beforePayload = cloneJsonish(existingItem);
                if (!afterPayload.type) {
                    afterPayload.type = existingItem.type || 'note';
                }
            }

            const proposal = createWorldChangeProposal({
                worldId: world.id,
                bookId: book?.id || session.bookId || null,
                chapterSessionId: session.id,
                proposalType,
                targetItemId: proposalType === 'edit_item' ? targetItemId : null,
                beforePayload,
                afterPayload,
                reason: String(rawProposal?.reason || '').trim() || 'Extracted from recent chat conversation.',
                evidenceRefs: [
                    {
                        type: 'chat_session',
                        sessionId: session.id,
                        sessionName: session.name || 'Untitled'
                    }
                ],
                createdByAgentId: codexPresetName || codexAgent.model
            });

            if (proposal) {
                created.push(proposal);
            } else {
                skipped.push(`#${index + 1}: duplicate pending proposal`);
            }
        });

        if (created.length === 0) {
            const skippedHint = skipped.length > 0 ? `\n\nSkipped:\n${skipped.slice(0, 5).join('\n')}` : '';
            if (!silent) showCustomAlert(`No world proposals were created.${skippedHint}`, 'World Proposals');
            return [];
        }

        const skippedLabel = skipped.length > 0 ? ` (${skipped.length} skipped)` : '';
        if (!silent) showCustomAlert(`Created ${created.length} world proposal(s)${skippedLabel}. Review them in World > Changes.`, 'World Proposals');
        return created;
    } catch (error) {
        console.error('[World] Proposal extraction failed:', error);
        if (!silent) showCustomAlert(`Failed to extract World proposals: ${error.message || 'Unknown error'}`, 'World Proposals');
        return null;
    } finally {
        if (!silent) {
            stateManager.bus.publish('status:update', { message: 'Ready', state: 'connected' });
        }
    }
}

function ensureBookAgentWorldProposalAutomation(book) {
    if (!book || typeof book !== 'object') return null;
    if (!book.agentAutomation || typeof book.agentAutomation !== 'object') {
        book.agentAutomation = {};
    }
    if (!book.agentAutomation.worldProposals || typeof book.agentAutomation.worldProposals !== 'object') {
        book.agentAutomation.worldProposals = {};
    }
    const wp = book.agentAutomation.worldProposals;
    wp.autoProposeEnabled = wp.autoProposeEnabled === true;
    const rawCount = Number(wp.lastScannedMessageCount);
    wp.lastScannedMessageCount = Number.isFinite(rawCount) ? Math.max(0, Math.round(rawCount)) : 0;
    wp.lastScannedComposerFingerprint = typeof wp.lastScannedComposerFingerprint === 'string'
        ? wp.lastScannedComposerFingerprint
        : null;
    wp.lastScanSourceKind = typeof wp.lastScanSourceKind === 'string' ? wp.lastScanSourceKind : null;
    wp.lastScanMode = typeof wp.lastScanMode === 'string' ? wp.lastScanMode : null;
    wp.lastScanResult = typeof wp.lastScanResult === 'string' ? wp.lastScanResult : null;
    wp.lastScanCreatedCount = Number.isFinite(Number(wp.lastScanCreatedCount))
        ? Math.max(0, Math.round(Number(wp.lastScanCreatedCount)))
        : 0;
    wp.lastScanAttemptAt = Number.isFinite(Number(wp.lastScanAttemptAt))
        ? Math.round(Number(wp.lastScanAttemptAt))
        : null;
    wp.lastScannedAt = Number.isFinite(wp.lastScannedAt) ? wp.lastScannedAt : null;
    return wp;
}

function resolveBookAgentContextForWorldScan(project, payload = {}) {
    const book = findBook(project, payload.bookId || project?.activeBookId);
    if (!book) return { error: 'Book not found.' };
    const session = findSession(project, payload.sessionId || book.bookAgentSessionId || project?.activeSessionId);
    if (!session) return { error: 'Book Agent chat not found.' };
    if (session.kind !== SESSION_KIND_BOOK_AGENT && session.bookAgentBookId !== book.id) {
        return { error: 'Target chat is not this Book Agent session.' };
    }
    const world = findWorld(project, payload.worldId || book.linkedWorldId || project?.activeWorldId);
    if (!world) return { error: 'No Book World linked yet.' };
    const automation = ensureBookAgentWorldProposalAutomation(book);
    return { book, session, world, automation };
}

export function resetBookAgentProposalScanCursor(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);

    const { book, automation, error } = resolveBookAgentContextForWorldScan(project, payload);
    if (error || !book || !automation) {
        showCustomAlert(error || 'Book Agent context not found.', 'Book Agent');
        return null;
    }

    automation.lastScannedMessageCount = 0;
    automation.lastScannedComposerFingerprint = null;
    automation.lastScannedAt = Date.now();
    book.updatedAt = Date.now();
    persistWorldProjectState({ bookId: book.id, reason: 'bookAgent:autoProposeCursorReset' });
    showCustomAlert('Book Agent scan cursor reset. Next scan will re-read the full conversation window.', 'Book Agent');
    return { bookId: book.id, lastScannedMessageCount: 0 };
}

export async function scanBookAgentForWorldProposals(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const silent = payload.silent === true;

    const { book, session, world, automation, error } = resolveBookAgentContextForWorldScan(project, payload);
    if (error || !book || !session || !world || !automation) {
        if (!silent) showCustomAlert(error || 'Book Agent context not found.', 'World Proposals');
        return null;
    }

    if (payload.requireAutoEnabled === true && automation.autoProposeEnabled !== true) {
        return { proposals: [], skipped: 'auto_disabled' };
    }

    const useDelta = payload.delta !== false;
    const includeComposerDraft = payload.includeComposerDraft !== false;
    let transcriptText = '';
    let cursorAdvanceCount = automation.lastScannedMessageCount;
    let composerDraftText = '';
    let composerFingerprint = null;
    let composerChanged = false;

    if (includeComposerDraft) {
        composerDraftText = getComposerDraftTextForWorldProposal(session, {
            maxChars: Number(payload.maxComposerChars) || 7000
        });
        composerFingerprint = composerDraftText
            ? stableStringify({ composerDraft: normalizeFingerprintText(composerDraftText) })
            : null;
        composerChanged = composerFingerprint !== automation.lastScannedComposerFingerprint;
    }

    if (useDelta) {
        const delta = getSessionWorldProposalDelta(session, {
            lastScannedMessageCount: automation.lastScannedMessageCount,
            maxMessages: Number(payload.maxMessages) || 12
        });
        transcriptText = delta.transcriptText || '';
        cursorAdvanceCount = delta.totalUsable;
        if (!transcriptText.trim() && !composerChanged) {
            automation.lastScanSourceKind = 'none';
            automation.lastScanMode = useDelta ? 'delta' : 'manual';
            automation.lastScanResult = 'no_delta';
            automation.lastScanCreatedCount = 0;
            automation.lastScanAttemptAt = Date.now();
            if (payload.advanceCursorOnEmpty === true) {
                automation.lastScannedMessageCount = cursorAdvanceCount;
                automation.lastScannedAt = Date.now();
                book.updatedAt = Date.now();
                persistWorldProjectState({ bookId: book.id, reason: 'bookAgent:autoProposeNoDelta' });
            } else {
                stateManager.bus.publish('world:dataChanged', { bookId: book.id, reason: 'bookAgent:autoProposeNoDelta' });
            }
            stateManager.bus.publish('world:bookAgentAutoProposeResult', {
                bookId: book.id,
                sessionId: session.id,
                createdCount: 0,
                sourceKind: 'none',
                usedChatSource: false,
                usedComposerSource: false,
                scanMode: useDelta ? 'delta' : 'manual',
                usedDelta: useDelta,
                autoTriggered: payload.requireAutoEnabled === true,
                noDelta: true
            });
            if (!silent) {
                showCustomAlert(
                    'No new Book Agent messages or Composer draft changes since the last scan. Continue drafting/chatting or use Reset Cursor to scan older messages again.',
                    'World Proposals'
                );
            }
            return { proposals: [], skipped: 'no_delta' };
        }
    }

    const effectiveRecentMessagesText = typeof payload.recentMessagesText === 'string'
        ? String(payload.recentMessagesText || '').trim()
        : (useDelta
            ? String(transcriptText || '').trim()
            : getRecentSessionMessagesForWorldProposal(session, Number(payload.maxMessages) || 8));
    const effectiveComposerDraftText = includeComposerDraft
        ? ((useDelta && !composerChanged) ? '' : String(composerDraftText || '').trim())
        : '';
    const usedChatSource = Boolean(effectiveRecentMessagesText);
    const usedComposerSource = Boolean(effectiveComposerDraftText);
    const sourceKind = usedChatSource && usedComposerSource
        ? 'both'
        : (usedComposerSource ? 'composer' : (usedChatSource ? 'chat' : 'none'));

    const created = await proposeWorldUpdatesFromCurrentChat({
        sessionId: session.id,
        bookId: book.id,
        worldId: world.id,
        recentMessagesText: effectiveRecentMessagesText || undefined,
        includeComposerDraft: includeComposerDraft && (useDelta ? composerChanged : true),
        composerDraftText: includeComposerDraft && composerChanged ? composerDraftText : undefined,
        maxComposerChars: Number(payload.maxComposerChars) || 7000,
        maxMessages: Number(payload.maxMessages) || 8,
        maxWorldItems: Number(payload.maxWorldItems) || 14,
        silent
    });

    if (created === null) {
        return null;
    }

    const createdCount = Array.isArray(created) ? created.length : 0;
    automation.lastScanSourceKind = sourceKind;
    automation.lastScanMode = useDelta ? 'delta' : 'manual';
    automation.lastScanResult = 'success';
    automation.lastScanCreatedCount = createdCount;
    automation.lastScanAttemptAt = Date.now();

    if (includeComposerDraft && payload.recordComposerFingerprint !== false) {
        automation.lastScannedComposerFingerprint = composerFingerprint;
    }

    if (!useDelta) {
        automation.lastScannedAt = Date.now();
        book.updatedAt = Date.now();
        persistWorldProjectState({ bookId: book.id, reason: 'bookAgent:manualProposeScan' });
    }

    if (useDelta && payload.advanceCursor !== false) {
        automation.lastScannedMessageCount = cursorAdvanceCount;
        automation.lastScannedAt = Date.now();
        book.updatedAt = Date.now();
        persistWorldProjectState({ bookId: book.id, reason: 'bookAgent:autoProposeScan' });
    }

    stateManager.bus.publish('world:bookAgentAutoProposeResult', {
        bookId: book.id,
        sessionId: session.id,
        createdCount,
        sourceKind,
        usedChatSource,
        usedComposerSource,
        scanMode: useDelta ? 'delta' : 'manual',
        usedDelta: useDelta,
        autoTriggered: payload.requireAutoEnabled === true
    });

    return {
        proposals: Array.isArray(created) ? created : [],
        scannedMessageCount: cursorAdvanceCount,
        usedDelta: useDelta
    };
}

export async function handleBookAgentAssistantTurnCompleted(payload = {}) {
    const project = getProject();
    if (!project) return null;
    ensureWorldProjectState(project);
    const session = findSession(project, payload.sessionId || project.activeSessionId);
    if (!session) return null;
    if (session.kind !== SESSION_KIND_BOOK_AGENT && !session.bookAgentBookId) return null;
    const bookId = session.bookAgentBookId || payload.bookId || null;
    if (!bookId) return null;

    return scanBookAgentForWorldProposals({
        bookId,
        sessionId: session.id,
        delta: true,
        requireAutoEnabled: true,
        silent: true,
        maxMessages: 12,
        maxWorldItems: 16
    });
}
