// src/js/modules/studio/studio.handlers.js

import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';

/**
 * ฟังก์ชันกลางสำหรับค้นหา, กรอง, และจัดเรียง Agent ทั้งหมด
 * @returns {Array} - รายชื่อ Agent ที่ผ่านการจัดเรียงและกรองแล้ว
 */
export function getFilteredAndSortedAgents() {
    const project = stateManager.getProject();
    if (!project || !project.agentPresets) return [];

    // ดึงค่าจาก UI
    const searchTerm = document.getElementById('asset-search-input')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('asset-sort-select')?.value || 'modified-desc';

    // 1. แปลง Object เป็น Array เพื่อให้จัดเรียงได้
    let agentsArray = Object.entries(project.agentPresets).map(([name, data]) => ({
        name,
        ...data
    }));

    // 2. ค้นหา (Search)
    if (searchTerm) {
        agentsArray = agentsArray.filter(agent => {
            const searchString = [
                agent.name,
                agent.id,
                agent.description,
                agent.model,
                ...(agent.tags || [])
            ].join(' ').toLowerCase();
            return searchString.includes(searchTerm);
        });
    }

    // 3. จัดเรียง (Sort)
    agentsArray.sort((a, b) => {
        switch (sortBy) {
            case 'modified-desc': return b.modifiedAt - a.modifiedAt;
            case 'modified-asc':  return a.modifiedAt - b.modifiedAt;
            case 'created-desc':  return b.createdAt - a.createdAt;
            case 'created-asc':   return a.createdAt - b.createdAt;
            case 'name-asc':      return a.name.localeCompare(b.name);
            case 'name-desc':     return b.name.localeCompare(a.name);
            default: return 0;
        }
    });

    return agentsArray;
}

export function exportAllAgents() {
    try {
        const project = stateManager.getProject();
        const agentsToExport = project.agentPresets;

        if (Object.keys(agentsToExport).length === 0) {
            showCustomAlert("No agents to export.", "Info");
            return;
        }

        const dataStr = JSON.stringify(agentsToExport, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `promptprim_agents_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Failed to export agents:", error);
        showCustomAlert(`Error exporting agents: ${error.message}`, "Error");
    }
}

/**
 * จัดการไฟล์ JSON ที่ผู้ใช้เลือกเพื่อนำเข้า Agent
 * @param {Event} event - Event ที่ได้รับจาก file input
 */
export function handleAgentImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedAgents = JSON.parse(e.target.result);
            
            // ตรวจสอบ Format ของไฟล์เบื้องต้น
            if (typeof importedAgents !== 'object' || importedAgents === null || Array.isArray(importedAgents)) {
                throw new Error('Invalid file format. Expected a JSON object of agents.');
            }

            const project = stateManager.getProject();
            let importedCount = 0;
            let overwrittenCount = 0;

            for (const agentName in importedAgents) {
                if (project.agentPresets[agentName]) {
                    if (confirm(`Agent "${agentName}" already exists. Overwrite?`)) {
                        project.agentPresets[agentName] = importedAgents[agentName];
                        overwrittenCount++;
                    }
                } else {
                    project.agentPresets[agentName] = importedAgents[agentName];
                    importedCount++;
                }
            }

            stateManager.setProject(project);
            stateManager.updateAndPersistState();
            stateManager.bus.publish('studio:contentShouldRender'); // สั่งให้วาด Studio ใหม่
            showCustomAlert(`Import complete! Added: ${importedCount}, Overwritten: ${overwrittenCount}.`, "Success");

        } catch (error) {
            console.error("Failed to import agents:", error);
            showCustomAlert(`Error importing agents: ${error.message}`, "Error");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // เคลียร์ input เพื่อให้เลือกไฟล์เดิมซ้ำได้
}