// ===============================================
// FILE: src/js/modules/studio/studio.ui.js (New File)
// DESCRIPTION: Centralized UI handler for the Agent & Asset Studio.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';

function renderStudioContent() {
    const assetsContainer = document.querySelector('#studio-panel .studio-assets-container');
    if (!assetsContainer) return;

    assetsContainer.innerHTML = ''; // Clear old content before re-rendering

    // We use dynamic imports to prevent circular dependency issues and ensure
    // the render functions are available when needed.
    import('../agent/agent.ui.js').then(m => m.renderAgentPresets(assetsContainer));
    import('../group/group.ui.js').then(m => m.renderAgentGroups(assetsContainer));
    import('../memory/memory.ui.js').then(m => m.loadAndRenderMemories(assetsContainer));
    import('../summary/summary.ui.js').then(m => m.renderSummaryLogs(assetsContainer));
}

/**
 * Initializes a dedicated delegated event listener for the ENTIRE studio panel.
 * This is the single source of truth for all user interactions in this panel.
 */
export function initStudioUI() {
    const studioPanel = document.getElementById('studio-panel');
    if (!studioPanel) return;

    studioPanel.addEventListener('click', (e) => {
        const target = e.target;
        const actionTarget = target.closest('[data-action]');
        
        // [FIX] ย้ายการประกาศ itemContext มาไว้ตรงนี้เพื่อให้รู้จักตัวแปร
        const itemContext = target.closest('.item'); 

        // จัดการการเลือก Item (Agent/Group)
        if (itemContext && !actionTarget) {
            e.preventDefault();
            const agentName = itemContext.dataset.agentName;
            const groupName = itemContext.dataset.groupName;
            if (agentName) {
                stateManager.bus.publish('entity:select', { type: 'agent', name: agentName });
            } else if (groupName) {
                stateManager.bus.publish('entity:select', { type: 'group', name: groupName });
            }
            return;
        }

        // จัดการปุ่ม Action ต่างๆ
        if (actionTarget) {
            e.preventDefault();
            e.stopPropagation();

            const action = actionTarget.dataset.action;
            let data = { ...actionTarget.dataset, ...itemContext?.dataset };
            
            if (data.data) Object.assign(data, JSON.parse(data.data));
            if (data.logId) data.logId = data.logId; // ตรวจสอบให้แน่ใจว่ามี logId
            
            if (action === 'toggle-menu') {
                toggleDropdown(e);
            } else {
                stateManager.bus.publish(action, data);
                actionTarget.closest('.dropdown.open')?.classList.remove('open');
            }
        }
    });
    // --- Subscriptions to re-render the studio content whenever data changes ---
    stateManager.bus.subscribe('project:loaded', renderStudioContent);
    stateManager.bus.subscribe('entity:selected', renderStudioContent);
    stateManager.bus.subscribe('agent:listChanged', renderStudioContent);
    stateManager.bus.subscribe('group:listChanged', renderStudioContent);
    stateManager.bus.subscribe('memory:listChanged', renderStudioContent);
    stateManager.bus.subscribe('summary:listChanged', renderStudioContent);
    stateManager.bus.subscribe('studio:contentShouldRender', renderStudioContent);
    
    console.log("✅ Studio UI and its dedicated event listener initialized.");
}