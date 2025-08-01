// ===============================================
// FILE: src/js/modules/studio/studio.ui.js (New File)
// DESCRIPTION: Centralized UI handler for the Agent & Asset Studio.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';
import { renderAgentPresets } from '../agent/agent.ui.js';
import { renderAgentGroups } from '../group/group.ui.js';
import { loadAndRenderMemories } from '../memory/memory.ui.js';
import * as StudioHandlers from './studio.handlers.js'; // <-- Import handler ใหม่

function renderStudioContent() {
    const assetsContainer = document.querySelector('#studio-panel .studio-assets-container');
    if (!assetsContainer) return;
    assetsContainer.innerHTML = ''; 

    const filteredAgents = StudioHandlers.getFilteredAndSortedAgents();
    
    renderAgentPresets(assetsContainer, filteredAgents);
    renderAgentGroups(assetsContainer);
    loadAndRenderMemories(assetsContainer);
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
            let eventPayload = { ...itemContext?.dataset };

            if (action === 'toggle-menu') {
                toggleDropdown(e);
            } else {
                // Handle new Import/Export actions
                if (action === 'agent:import') {
                    document.getElementById('import-agents-input')?.click();
                } else if (action === 'agent:exportAll') {
                    StudioHandlers.exportAllAgents();
                } else {
                    // Handle all other original actions
                    stateManager.bus.publish(action, eventPayload);
                }
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
    stateManager.bus.subscribe('entity:selected', renderStudioContent);
    stateManager.bus.subscribe('entity:staged', renderStudioContent);
    
    console.log("✅ Studio UI Initialized with definitive, robust event listeners.");
}
