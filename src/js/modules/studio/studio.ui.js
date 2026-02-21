// ===============================================
// FILE: src/js/modules/studio/studio.ui.js (New File)
// DESCRIPTION: Centralized UI handler for the Agent & Asset Studio.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';
import { renderAgentPresets } from '../agent/agent.ui.js';
import { renderAgentGroups } from '../group/group.ui.js';
import { loadAndRenderMemories } from '../memory/memory.ui.js';
import { loadAndRenderKnowledgeFiles } from '../knowledge/knowledge.ui.js';
import { getStagedEntityRemainingSeconds } from '../project/project.handlers.js';
import * as StudioHandlers from './studio.handlers.js'; // <-- Import handler ใหม่

let stagedCountdownIntervalId = null;

function escapeSelectorValue(rawValue = '') {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(rawValue);
    }
    return String(rawValue).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findStudioEntityListItem(entity) {
    if (!entity?.type || !entity?.name) return null;
    const escapedName = escapeSelectorValue(entity.name);
    const selector = entity.type === 'group'
        ? `#studio-panel #agentGroupList .item[data-group-name="${escapedName}"]`
        : `#studio-panel #agentPresetList .item[data-agent-name="${escapedName}"]`;
    return document.querySelector(selector);
}

function focusSelectedEntityInList(payload = {}) {
    const entity = {
        type: payload.entityType || payload.type || '',
        name: payload.entityName || payload.name || ''
    };
    if (!entity.type || !entity.name) return;

    const searchInput = document.getElementById('asset-search-input');
    let targetItem = findStudioEntityListItem(entity);

    // If the active agent is hidden by current search, narrow the search to that name.
    if (!targetItem && entity.type === 'agent' && searchInput) {
        const desiredQuery = entity.name;
        if ((searchInput.value || '').trim() !== desiredQuery) {
            searchInput.value = desiredQuery;
            renderStudioContent();
            targetItem = findStudioEntityListItem(entity);
        }
    }

    // Fallback: clear search and render full list.
    if (!targetItem && entity.type === 'agent' && searchInput) {
        if ((searchInput.value || '').trim() !== '') {
            searchInput.value = '';
            renderStudioContent();
            targetItem = findStudioEntityListItem(entity);
        }
    }

    if (!targetItem) return;

    const parentSection = targetItem.closest('details.collapsible-section');
    if (parentSection) parentSection.open = true;

    targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetItem.classList.remove('selected-entity-jump-highlight');
    // Force reflow so highlight animation restarts on repeated clicks.
    void targetItem.offsetWidth;
    targetItem.classList.add('selected-entity-jump-highlight');
    setTimeout(() => {
        targetItem.classList.remove('selected-entity-jump-highlight');
    }, 1200);
}

function updateStudioVisibilityMenuState(sectionVisibility) {
    const menu = document.getElementById('studio-visibility-menu');
    if (!menu) return;

    menu.querySelectorAll('.studio-visibility-option').forEach(option => {
        const sectionKey = option.dataset.sectionKey || '';
        const isSelected = Boolean(sectionVisibility?.[sectionKey]);
        option.classList.toggle('is-selected', isSelected);
        option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });
}

function getPendingSwitchText(stagedSnapshot) {
    const remainingSeconds = getStagedEntityRemainingSeconds();
    return `Switch to ${stagedSnapshot.icon} ${stagedSnapshot.name} in ${remainingSeconds}s`;
}

function stopStagedCountdownTimer() {
    if (!stagedCountdownIntervalId) return;
    clearInterval(stagedCountdownIntervalId);
    stagedCountdownIntervalId = null;
}

function updatePendingCountdownText() {
    const pendingText = document.querySelector('#studio-selected-entity-slot .selected-entity-pending-text');
    if (!pendingText) {
        stopStagedCountdownTimer();
        return;
    }

    const project = stateManager.getProject();
    const stagedEntity = stateManager.getStagedEntity();
    const stagedSnapshot = getEntitySnapshot(project, stagedEntity);
    if (!project || !stagedSnapshot) {
        stopStagedCountdownTimer();
        return;
    }

    pendingText.textContent = getPendingSwitchText(stagedSnapshot);
}

function syncStagedCountdownTimer() {
    const hasPendingCountdown = Boolean(document.querySelector('#studio-selected-entity-slot .selected-entity-pending-text'));
    if (!hasPendingCountdown) {
        stopStagedCountdownTimer();
        return;
    }

    updatePendingCountdownText();
    if (stagedCountdownIntervalId) return;

    stagedCountdownIntervalId = setInterval(() => {
        updatePendingCountdownText();
    }, 250);
}

function getActiveSession(project) {
    if (!project?.activeSessionId) return null;
    return project.chatSessions?.find(session => session.id === project.activeSessionId) || null;
}

function getEntitySnapshot(project, entity) {
    if (!entity?.type || !entity?.name) return null;

    if (entity.type === 'agent') {
        const preset = project.agentPresets?.[entity.name];
        return {
            type: 'agent',
            name: entity.name,
            icon: preset?.icon || '🤖',
            detail: preset?.model ? `Model: ${preset.model}` : 'Model is not configured',
            exists: Boolean(preset)
        };
    }

    if (entity.type === 'group') {
        const group = project.agentGroups?.[entity.name];
        return {
            type: 'group',
            name: entity.name,
            icon: '🤝',
            detail: group?.moderatorAgent ? `Moderator: ${group.moderatorAgent}` : 'Moderator is not configured',
            exists: Boolean(group)
        };
    }

    return null;
}

function buildSelectedEntitySection(project) {
    const section = document.createElement('section');
    section.className = 'selected-entity-section is-compact';

    const session = getActiveSession(project);
    const linkedEntity = session?.linkedEntity || null;
    const activeEntity = project.activeEntity || null;
    const stagedEntity = stateManager.getStagedEntity();
    const activeSnapshot = getEntitySnapshot(project, linkedEntity || activeEntity);
    const stagedSnapshot = getEntitySnapshot(project, stagedEntity);
    const hasPendingSwitch = Boolean(
        stagedEntity &&
        (!activeSnapshot || stagedEntity.type !== activeSnapshot.type || stagedEntity.name !== activeSnapshot.name)
    );

    const heading = document.createElement('div');
    heading.className = 'selected-entity-heading';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'selected-entity-title';

    const title = document.createElement('h4');
    title.textContent = 'Selected Agent';
    titleWrap.appendChild(title);

    if (activeSnapshot) {
        const activeBadge = document.createElement('span');
        activeBadge.className = 'selected-entity-badge is-active';
        activeBadge.textContent = 'Active';
        titleWrap.appendChild(activeBadge);
    }

    heading.appendChild(titleWrap);

    const source = document.createElement('span');
    source.className = 'selected-entity-source';
    source.textContent = session?.name ? `Chat: ${session.name}` : 'No active chat';
    heading.appendChild(source);

    section.appendChild(heading);

    const card = document.createElement('div');
    card.className = 'selected-entity-current';
    if (activeSnapshot && !activeSnapshot.exists) {
        card.classList.add('is-missing');
    } else if (activeSnapshot?.exists) {
        card.classList.add('is-active-entity');
    }

    if (activeSnapshot) {
        const icon = document.createElement('span');
        icon.className = 'selected-entity-icon';
        icon.textContent = activeSnapshot.icon;

        const info = document.createElement('div');
        info.className = 'selected-entity-info';

        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'selected-entity-name selected-entity-name-btn';
        name.dataset.action = 'studio:focusSelectedEntity';
        name.dataset.entityType = activeSnapshot.type;
        name.dataset.entityName = activeSnapshot.name;
        name.textContent = activeSnapshot.name;
        name.title = 'Show in list';

        const meta = document.createElement('div');
        meta.className = 'selected-entity-meta';
        meta.textContent = activeSnapshot.exists
            ? (activeSnapshot.type === 'group' ? 'Group' : 'Agent')
            : 'This linked entity no longer exists. Open another chat or reselect.';

        info.append(name, meta);
        card.append(icon, info);
    } else {
        const empty = document.createElement('div');
        empty.className = 'selected-entity-empty';
        empty.textContent = 'No linked Agent/Group found for this chat.';
        card.appendChild(empty);
    }

    section.appendChild(card);

    if (hasPendingSwitch && stagedSnapshot) {
        const pending = document.createElement('div');
        pending.className = 'selected-entity-pending';

        const pendingHeader = document.createElement('div');
        pendingHeader.className = 'selected-entity-pending-header';

        const pendingBadge = document.createElement('span');
        pendingBadge.className = 'selected-entity-badge is-pending';
        pendingBadge.textContent = 'Pending';

        const pendingText = document.createElement('div');
        pendingText.className = 'selected-entity-pending-text';
        pendingText.textContent = getPendingSwitchText(stagedSnapshot);
        pendingHeader.append(pendingBadge, pendingText);

        const actions = document.createElement('div');
        actions.className = 'selected-entity-actions';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn btn-small';
        applyBtn.dataset.action = 'entity:stagedApply';
        applyBtn.textContent = 'Apply';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary btn-small';
        cancelBtn.dataset.action = 'entity:stagedCancel';
        cancelBtn.textContent = 'Cancel';

        actions.append(applyBtn, cancelBtn);
        pending.append(pendingHeader, actions);
        section.appendChild(pending);
    }

    return section;
}

function renderStudioContent() {
    const assetsContainer = document.querySelector('#studio-panel .studio-assets-container');
    const selectedEntitySlot = document.getElementById('studio-selected-entity-slot');
    if (!assetsContainer) return;
    assetsContainer.innerHTML = ''; 

    const project = stateManager.getProject();
    const sectionVisibility = StudioHandlers.getStudioSectionVisibility(project);
    const studioToolbar = document.querySelector('#studio-panel .studio-toolbar');
    if (studioToolbar) {
        studioToolbar.classList.toggle('hidden', !sectionVisibility.search);
    }
    updateStudioVisibilityMenuState(sectionVisibility);

    if (selectedEntitySlot) {
        selectedEntitySlot.innerHTML = '';
    }
    if (project && selectedEntitySlot) {
        selectedEntitySlot.appendChild(buildSelectedEntitySection(project));
    }

    if (!project) {
        syncStagedCountdownTimer();
        return;
    }

    const filteredAgents = StudioHandlers.getFilteredAndSortedAgents();

    const shouldRenderAnyAssetSection = (
        sectionVisibility.agentPresets ||
        sectionVisibility.agentGroups ||
        sectionVisibility.commandMemories ||
        sectionVisibility.knowledgeFiles
    );

    if (shouldRenderAnyAssetSection) {
        if (sectionVisibility.agentPresets) {
            renderAgentPresets(assetsContainer, filteredAgents);
        }
        if (sectionVisibility.agentGroups) {
            renderAgentGroups(assetsContainer);
        }
        if (sectionVisibility.commandMemories) {
            loadAndRenderMemories(assetsContainer);
        }
        if (sectionVisibility.knowledgeFiles) {
            loadAndRenderKnowledgeFiles(assetsContainer);
        }
    } else {
        assetsContainer.innerHTML = '<p class="no-items-message">No sections selected. Use filter menu to show sections.</p>';
    }

    syncStagedCountdownTimer();
}

export function initStudioUI() {
    const studioPanel = document.getElementById('studio-panel');
    if (!studioPanel || studioPanel.dataset.listenerAttached === 'true') return;
    studioPanel.dataset.listenerAttached = 'true';

    // --- [CRITICAL FIX] Rewritten Event Listener for Robustness ---
    studioPanel.addEventListener('click', (e) => {
        const target = e.target;

        // Case 1: Memory Toggle Click (special case)
        const memoryToggle = target.closest('.memory-toggle');
        if (memoryToggle) {
            e.stopPropagation();
            const memoryItem = memoryToggle.closest('.item[data-name]');
            if (memoryItem) {
                stateManager.bus.publish('memory:toggle', { name: memoryItem.dataset.name });
            }
            return;
        }

        // Case 2: Generic Action Button Click (e.g., Edit, Delete, More Actions)
        const actionTarget = target.closest('[data-action]');
        if (actionTarget) {
            e.preventDefault();
            e.stopPropagation();
            
            const action = actionTarget.dataset.action;
            const itemContext = target.closest('.item');
            
            // สร้าง Payload เริ่มต้นจาก item หลัก (ถ้ามี)
            let eventPayload = { ...itemContext?.dataset };
            Object.entries(actionTarget.dataset || {}).forEach(([key, value]) => {
                if (key === 'action' || key === 'data') return;
                eventPayload[key] = value;
            });

            // [KEY FIX] นำข้อมูล index จาก data-data ของปุ่มมาใส่ใน Payload
            if (actionTarget.dataset.data) {
                try {
                    const jsonData = JSON.parse(actionTarget.dataset.data);
                    Object.assign(eventPayload, jsonData);
                } catch (err) { console.error("Failed to parse data attribute JSON", err); }
            }

            if (action === 'toggle-menu') {
                toggleDropdown(e);
            } else {
                stateManager.bus.publish(action, eventPayload);
                actionTarget.closest('.dropdown.open')?.classList.remove('open');
            }
            return;
        }

        // Case 3: Click on an item itself for selection/staging
        const itemContext = target.closest('.item');
        if (itemContext) {
            e.preventDefault();
            const { agentName, groupName } = itemContext.dataset;
            if (agentName) {
                stateManager.bus.publish('studio:itemClicked', { type: 'agent', name: agentName });
            } else if (groupName) {
                stateManager.bus.publish('studio:itemClicked', { type: 'group', name: groupName });
            }
            return;
        }
    });

    // --- Toolbar Listeners ---
    const searchInput = document.getElementById('asset-search-input');
    const sortSelect = document.getElementById('asset-sort-select');
    searchInput?.addEventListener('input', renderStudioContent);
    sortSelect?.addEventListener('change', renderStudioContent);
    
    // --- Import Input Listener ---
    const importInput = document.getElementById('import-agents-input');
    importInput?.addEventListener('change', StudioHandlers.handleAgentImport);

    // --- Subscriptions ---
    stateManager.bus.subscribe('project:loaded', renderStudioContent);
    stateManager.bus.subscribe('studio:contentShouldRender', renderStudioContent);
    stateManager.bus.subscribe('session:loaded', renderStudioContent);
    stateManager.bus.subscribe('entity:selected', renderStudioContent);
    stateManager.bus.subscribe('entity:staged', renderStudioContent);
    stateManager.bus.subscribe('studio:focusSelectedEntity', focusSelectedEntityInList);
    
    console.log("✅ Studio UI Initialized with definitive, robust event listeners.");
}
