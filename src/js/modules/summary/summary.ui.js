// src/js/modules/summary/summary.ui.js (Definitive, Complete & Corrected Version)
import { ReactBridge } from '../../react-entry.jsx';
import SummaryCenterModal from '../../react-components/SummaryCenterModal.jsx';
import { stateManager, defaultSummarizationPresets } from '../../core/core.state.js';
import { toggleDropdown, createSearchableModelSelector } from '../../core/core.ui.js';
import * as SummaryHandlers from './summary.handlers.js';
import { getFilteredModelsForDisplay } from '../models/model-manager.ui.js';
import * as UserService from '../user/user.service.js';

const CONTAINER_ID = 'summary-modal-container';

let activeLogId = null;

// --- Helper Functions ---

function updateActionMenu() {
    const modal = document.getElementById('summarization-modal');
    if (!modal) return;
    const selector = modal.querySelector('#summary-modal-preset-select');
    const menuContent = modal.querySelector('#summary-modal-preset-actions .dropdown-content');
    if (!selector || !menuContent) return;

    menuContent.innerHTML = ''; 

    const selectedOption = selector.options[selector.selectedIndex];
    if (!selectedOption) return;

    const isFactory = defaultSummarizationPresets.hasOwnProperty(selectedOption.value);
    const isCustom = selectedOption.value === 'custom';

    const createActionLink = (text, action, payload = {}) => {
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = text;
        link.dataset.action = action;
        if (payload.saveAs) {
            link.dataset.saveAs = 'true';
        }
        return link;
    };

    if (isCustom || isFactory) {
        menuContent.appendChild(createActionLink(
            isFactory ? 'Save as a Copy...' : 'Save as New Preset...',
            'settings:saveSummaryPreset',
            { saveAs: true }
        ));
    } else { 
        menuContent.appendChild(createActionLink('Save Changes', 'settings:saveSummaryPreset'));
        menuContent.appendChild(createActionLink('Rename...', 'settings:renameSummaryPreset'));
        menuContent.appendChild(createActionLink('Save as New Preset...', 'settings:saveSummaryPreset', { saveAs: true }));
        menuContent.appendChild(document.createElement('div')).className = 'dropdown-divider';
        const deleteLink = createActionLink('Delete Preset', 'settings:deleteSummaryPreset');
        deleteLink.classList.add('is-destructive');
        menuContent.appendChild(deleteLink);
    }
}

function renderSummarizationPresetSelector() {
    const project = stateManager.getProject();
    if (!project || !project.globalSettings) return;

    const selector = document.querySelector('#summarization-modal #summary-modal-preset-select');
    if (!selector) return;
    
    // The project's presets now reliably contain the factory defaults.
    const allPresets = project.globalSettings.summarizationPromptPresets || {};
    const previouslySelectedValue = selector.value;
    
    selector.innerHTML = ''; // Clear existing options

    // The logic to create optgroups is still good.
    const factoryGroup = document.createElement('optgroup');
    factoryGroup.label = 'Factory Presets';
    selector.appendChild(factoryGroup);

    const userGroup = document.createElement('optgroup');
    userGroup.label = 'User Presets';
    selector.appendChild(userGroup);

    let userPresetsExist = false;
    for (const presetName in allPresets) {
        const option = new Option(presetName, presetName);
        if (defaultSummarizationPresets.hasOwnProperty(presetName)) {
            factoryGroup.appendChild(option);
        } else {
            userGroup.appendChild(option);
            userPresetsExist = true;
        }
    }
    
    // Hide the user preset group if it's empty
    if (!userPresetsExist) {
        userGroup.remove();
    }

    // Restore the previous selection if it's still valid
    if (allPresets[previouslySelectedValue]) {
        selector.value = previouslySelectedValue;
    } else {
        // If the old selection is gone, default to 'Standard'
        selector.value = 'Standard';
        // And trigger the change handler to update the textarea
        SummaryHandlers.handleSummarizationPresetChange();
    }

    updateActionMenu();
}

function createLogListItem(log) {
    const item = document.createElement('div');
    item.className = 'item summary-log-item';
    item.dataset.logId = log.id;
    if (log.id === activeLogId) item.classList.add('active');
    item.innerHTML = `<span class="item-name"><span class="item-icon">💡</span> ${log.summary}</span>`;
    item.title = `Created: ${new Date(log.timestamp).toLocaleString()}`;
    return item;
}

export function showEditorActions(mode) {
    const editorActions = document.getElementById('summary-editor-actions');
    const summarizeBtn = document.getElementById('summarize-conversation-btn');
    if (!editorActions || !summarizeBtn) return;
    
    editorActions.classList.remove('hidden');
    summarizeBtn.classList.add('hidden');
    editorActions.querySelector('#summary-editor-delete-btn').style.display = (mode === 'existing') ? 'inline-flex' : 'none';
    editorActions.querySelector('#summary-editor-load-btn').style.display = (mode === 'existing') ? 'inline-flex' : 'none';
    editorActions.querySelector('#summary-editor-save-btn').textContent = (mode === 'existing') ? 'Save Changes' : 'Save New Log';
}

function updateModalActionsVisibility() {
    const modal = document.getElementById('summarization-modal');
    if (!modal) return;

    const editorActions = modal.querySelector('#summary-editor-actions');
    const summarizeBtn = modal.querySelector('#summarize-conversation-btn');
    const activeTab = modal.querySelector('.tab-btn.active')?.dataset.tab;

    if (activeTab === 'settings') {
        // ถ้าอยู่ในแท็บ Settings ให้ซ่อนปุ่มทั้งหมดที่เกี่ยวกับการจัดการ Log
        editorActions.classList.add('hidden');
        summarizeBtn.classList.add('hidden');
    } else { // ถ้าอยู่ในแท็บ 'logs'
        // ให้กลับไปใช้ Logic เดิม คือแสดง/ซ่อนปุ่มตามสถานะของ activeLogId
        if (activeLogId) {
            editorActions.classList.remove('hidden');
            summarizeBtn.classList.add('hidden');
        } else {
            editorActions.classList.add('hidden');
            summarizeBtn.classList.remove('hidden');
        }
    }
}


export function selectLog(logId) {
    activeLogId = logId;
    const project = stateManager.getProject();
    const log = project.summaryLogs.find(l => l.id === logId);
    
    document.getElementById('summary-editor-title').value = log ? log.summary : '';
    document.getElementById('summary-editor-content').value = log ? log.content : '';

    if (log) {
        showEditorActions('existing');
    } else {
        document.getElementById('summary-editor-actions').classList.add('hidden');
        document.getElementById('summarize-conversation-btn').classList.remove('hidden');
    }
    renderLogList();
}

export function renderLogList() {
    const container = document.getElementById('summary-log-list-modal');
    if (!container) return;
    const project = stateManager.getProject();
    container.innerHTML = '';
    const logs = project.summaryLogs || [];

    if (logs.length === 0) {
        container.innerHTML = `<p class="no-items-message">No summaries yet.</p>`;
        return;
    }
    
    const logsBySession = logs.reduce((acc, log) => {
        const key = log.sourceSessionId;
        const session = project.chatSessions.find(s => s.id === key);
        if (!acc[key]) acc[key] = { name: session ? session.name : "Unknown Session", logs: [] };
        acc[key].logs.push(log);
        return acc;
    }, {});

    Object.values(logsBySession).forEach(group => {
        const sessionLogs = group.logs.sort((a, b) => b.timestamp - a.timestamp);
        const details = document.createElement('details');
        details.open = true;
        details.innerHTML = `<summary>For: ${group.name}</summary>`;
        sessionLogs.forEach(log => details.appendChild(createLogListItem(log)));
        container.appendChild(details);
    });
}

export function setSummaryLoading(isLoading) {
    const btn = document.getElementById('summarize-conversation-btn');
    if (btn) {
        // [THE FIX] Toggle the loading class instead of the overlay
        btn.classList.toggle('is-loading', isLoading);
    }
}

function populateSummaryModelSelector() {
    const wrapper = document.getElementById('system-model-search-wrapper');
    const searchInput = document.getElementById('system-model-search-input');
    const valueInput = document.getElementById('system-utility-model-select');
    const optionsContainer = document.getElementById('system-model-options-container');
    if (!wrapper || !searchInput || !valueInput || !optionsContainer) return;

    const allModels = stateManager.getState().allProviderModels || [];
    const currentModelId = stateManager.getProject().globalSettings.systemUtilityAgent?.model;

    const renderOptions = (modelsToRender) => {
        optionsContainer.innerHTML = '';
        if (modelsToRender.length === 0) {
            optionsContainer.innerHTML = `<div class="searchable-option-item">No models found.</div>`;
            return;
        }
        modelsToRender.forEach(model => {
            const item = document.createElement('div');
            item.className = 'searchable-option-item';
            item.dataset.value = model.id;
            item.innerHTML = `${model.name} <small>${model.id}</small>`;
            item.addEventListener('click', () => {
                searchInput.value = model.name; // แสดงชื่อให้ User เห็น
                valueInput.value = model.id;    // เก็บ ID ไว้ใช้งานจริง
                optionsContainer.classList.add('hidden');
            });
            optionsContainer.appendChild(item);
        });
    };

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredModels = allModels.filter(m => 
            m.name.toLowerCase().includes(searchTerm) || 
            m.id.toLowerCase().includes(searchTerm)
        );
        renderOptions(filteredModels);
    });

    searchInput.addEventListener('focus', () => {
        renderOptions(allModels); // แสดงทั้งหมดเมื่อ focus
        optionsContainer.classList.remove('hidden');
    });

    // ซ่อน Dropdown เมื่อคลิกที่อื่น
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            optionsContainer.classList.add('hidden');
        }
    });

    // ตั้งค่าเริ่มต้น
    const currentModel = allModels.find(m => m.id === currentModelId);
    if (currentModel) {
        searchInput.value = currentModel.name;
        valueInput.value = currentModel.id;
    }
}


// Helper: สร้าง Container ของตัวเอง
function ensureContainer() {
    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = CONTAINER_ID;
        document.body.appendChild(container);
    }
    return container;
}

// Helper: ทำลาย Container ของตัวเอง
function removeContainer() {
    const container = document.getElementById(CONTAINER_ID);
    if (container) {
        ReactBridge.unmount(container); // สั่ง React ให้ทำความสะอาดก่อน
        container.remove();
    }
}

export function showSummarizationCenter() {
    console.log("📍 showSummarizationCenter called");
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;

    // [แก้ไข] เรียกใช้ helper function เพื่อความแน่นอน
    const targetElement = ensureContainer();

    const props = {
        summaryLogs: project.summaryLogs || [],
        allModels: UserService.getAllowedModelsForCurrentUser(),
        promptTemplates: { ...defaultSummarizationPresets, ...project.globalSettings.summarizationPromptPresets },
        currentSessionName: session.name,
        systemUtilityModel: project.globalSettings.systemUtilityAgent?.model,
        activeTemplate: project.globalSettings.activeSummarizationPreset,
        defaultPresets: defaultSummarizationPresets,
        onApplySettings: (settings) => {
            SummaryHandlers.applySummarySettings(settings);
            hideSummarizationCenter();
        },
        unmount: hideSummarizationCenter
    };

    ReactBridge.mount(SummaryCenterModal, props, targetElement);
    targetElement.style.display = 'block'; // ทำให้แสดงผล
}

export function hideSummarizationCenter() {
    console.log("📍 hideSummarizationCenter called");
    removeContainer(); // สั่งทำลาย Container ทิ้งทั้งหมด
}

export function initSummaryUI() {
    console.log("✅ Summary UI Initialized (Listeners are in app.js)");
}

