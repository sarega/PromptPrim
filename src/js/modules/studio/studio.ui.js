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


// export function initStudioUI() {
//     const studioPanel = document.getElementById('studio-panel');
//     if (!studioPanel) return;

//     // [REWRITTEN] A more robust delegated event listener
//     studioPanel.addEventListener('click', (e) => {
//         const target = e.target;
//         const actionTarget = target.closest('[data-action]');
//         const itemContext = target.closest('.item');

//         // Case 1: An action button was clicked (e.g., +, edit, delete)
//         if (actionTarget) {
//             e.preventDefault();
//             e.stopPropagation();
            
//             const action = actionTarget.dataset.action;
            
//             // --- [DEFINITIVE FIX] ---
//             // สร้าง object payload พื้นฐานจาก item หลักก่อน (เช่น data-memory-index, data-agent-name)
//             let eventPayload = { ...itemContext?.dataset };

//             // ตรวจสอบว่าปุ่มที่กดมีข้อมูลเสริมใน data-data หรือไม่ (สำหรับ dropdown)
//             if (actionTarget.dataset.data) {
//                 try {
//                     // ถ้ามี ให้ parse JSON แล้วรวมเข้าไปใน payload ของเรา
//                     const jsonData = JSON.parse(actionTarget.dataset.data);
//                     Object.assign(eventPayload, jsonData);
//                 } catch (err) {
//                     console.error("Failed to parse data-data attribute:", actionTarget.dataset.data, err);
//                 }
//             }
//             // -------------------------

//             if (action === 'toggle-menu') {
//                 toggleDropdown(e);
//             } else {
//                 // ส่ง payload ที่สมบูรณ์แล้ว (มีทั้ง index และข้อมูลอื่นๆ)
//                 stateManager.bus.publish(action, eventPayload);
//                 actionTarget.closest('.dropdown.open')?.classList.remove('open');
//             }
//             return;
//         }

//         // Case 2: An item itself was clicked (for staging/selecting)
//         if (itemContext) {
//             e.preventDefault();
//             const agentName = itemContext.dataset.agentName;
//             const groupName = itemContext.dataset.groupName;
            
//             if (agentName) {
//                 stateManager.bus.publish('studio:itemClicked', { type: 'agent', name: agentName });
//             } else if (groupName) {
//                 stateManager.bus.publish('studio:itemClicked', { type: 'group', name: groupName });
//             }
//             return;
//         }

//         // Case 3: Clicked away from any item
//         stateManager.setStagedEntity(null);
//     });

//     // Subscriptions to re-render the studio content
//     stateManager.bus.subscribe('project:loaded', renderStudioContent);
//     stateManager.bus.subscribe('entity:selected', renderStudioContent);
//     stateManager.bus.publish('studio:contentShouldRender');
//     stateManager.bus.subscribe('entity:staged', renderStudioContent);
// }

export function initStudioUI() {
    const studioPanel = document.getElementById('studio-panel');
    if (!studioPanel) return;

    // เพิ่ม Guard เพื่อป้องกันการเพิ่ม Listener ซ้ำซ้อน
    if (studioPanel.dataset.listenerAttached === 'true') {
        return;
    }
    studioPanel.dataset.listenerAttached = 'true';

    studioPanel.addEventListener('click', (e) => {
        const target = e.target;
        const actionTarget = target.closest('[data-action]');
        const itemContext = target.closest('.item');

        // [DEBUG STEP 1] ตรวจสอบการคลิกที่ปุ่ม Toggle
        if (target.closest('.memory-toggle')) {
            e.stopPropagation();
            const memoryItem = target.closest('.item[data-name]');
            if (memoryItem) {
                const memoryName = memoryItem.dataset.name;
                console.log(`[DEBUG 1] ✅ StudioUI: Memory Toggle clicked for: '${memoryName}'. Publishing 'memory:toggle'.`);
                stateManager.bus.publish('memory:toggle', { name: memoryName });
            } else {
                console.error("[DEBUG 1] ❌ StudioUI: Toggle clicked, but couldn't find parent .item[data-name].");
            }
            return;
        }

        // --- ส่วนที่เหลือของ Listener ยังคงเหมือนเดิม ---
        if (actionTarget) {
            e.preventDefault();
            e.stopPropagation();
            const action = actionTarget.dataset.action;
            let eventPayload = { ...itemContext?.dataset };
            if (actionTarget.dataset.data) {
                try {
                    const jsonData = JSON.parse(actionTarget.dataset.data);
                    Object.assign(eventPayload, jsonData);
                } catch (err) { /* ... */ }
            }
            if (action === 'toggle-menu') {
                toggleDropdown(e);
            } else {
                stateManager.bus.publish(action, eventPayload);
                actionTarget.closest('.dropdown.open')?.classList.remove('open');
            }
            return;
        }
        if (itemContext) {
            e.preventDefault();
            const { agentName, groupName } = itemContext.dataset;
            if (agentName) {
                stateManager.bus.publish('studio:itemClicked', { type: 'agent', name: agentName });
            } else if (groupName) {
                stateManager.bus.publish('studio:itemClicked', { type: 'group', name: groupName });
            }
        }
    });

    // --- Subscriptions ---
    stateManager.bus.subscribe('project:loaded', renderStudioContent);
    stateManager.bus.subscribe('entity:selected', renderStudioContent);
    stateManager.bus.subscribe('studio:contentShouldRender', () => {
        renderStudioContent();
    });
    stateManager.bus.subscribe('entity:staged', renderStudioContent);
    console.log("✅ Studio UI and its dedicated event listener initialized ONCE.");
}