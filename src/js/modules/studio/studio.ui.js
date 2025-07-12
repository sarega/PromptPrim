// ===============================================
// FILE: src/js/modules/studio/studio.ui.js (New File)
// DESCRIPTION: Centralized UI handler for the Agent & Asset Studio.
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown } from '../../core/core.ui.js';

import { renderAgentPresets } from '../agent/agent.ui.js';
import { renderAgentGroups } from '../group/group.ui.js';
import { loadAndRenderMemories } from '../memory/memory.ui.js';
import { renderSummaryLogs } from '../summary/summary.ui.js';

function renderStudioContent() {
    const assetsContainer = document.querySelector('#studio-panel .studio-assets-container');
    if (!assetsContainer) return;

    // 1. [CRITICAL FIX] ล้างเนื้อหาเก่าทั้งหมดทิ้งก่อนเสมอ
    assetsContainer.innerHTML = ''; 

    // 2. เรียกใช้ฟังก์ชันย่อยเพื่อ "เติมข้อมูล" ลงใน container ที่ว่างเปล่า
    renderAgentPresets(assetsContainer);
    renderAgentGroups(assetsContainer);
    loadAndRenderMemories(assetsContainer);
    renderSummaryLogs(assetsContainer);
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
        const itemContext = target.closest('.item');

        // Case 1: An action button was clicked (e.g., +, edit, delete)
        if (actionTarget) {
            e.preventDefault();
            e.stopPropagation();
            const action = actionTarget.dataset.action;
            let data = { ...actionTarget.dataset, ...itemContext?.dataset };
            if (action === 'toggle-menu') {
                toggleDropdown(e);
            } else {
                stateManager.bus.publish(action, data);
                actionTarget.closest('.dropdown.open')?.classList.remove('open');
            }
            return; // จบการทำงานทันที
        }

        // Case 2: An item itself was clicked (for staging/selecting)
        if (itemContext) {
            e.preventDefault();
            const agentName = itemContext.dataset.agentName;
            const groupName = itemContext.dataset.groupName;
            
            if (agentName) {
                stateManager.bus.publish('studio:itemClicked', { type: 'agent', name: agentName });
            } else if (groupName) {
                stateManager.bus.publish('studio:itemClicked', { type: 'group', name: groupName });
            }
            return; // จบการทำงานทันที
        }

        // Case 3: [DEFINITIVE FIX] Clicked away (only runs if not an item and not an action)
        // ถ้าคลิกนอกพื้นที่ Item ให้ล้าง Staging ทิ้ง
        stateManager.setStagedEntity(null);
    });

    // Subscriptions to re-render the studio content
    stateManager.bus.subscribe('entity:selected', renderStudioContent); 
    // stateManager.bus.subscribe('entity:selected', renderStudioContent);
    stateManager.bus.subscribe('studio:contentShouldRender', renderStudioContent);
    
    // [KEY FIX] ต้องดักฟัง Event นี้เพื่อให้ UI วาดไฮไลท์สีเหลืองใหม่
    stateManager.bus.subscribe('entity:staged', renderStudioContent);
}