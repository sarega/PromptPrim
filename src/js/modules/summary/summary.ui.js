// src/js/modules/summary/summary.ui.js (Definitive, Complete & Corrected Version)
import { mountReactComponent } from '../../react-entry.jsx';
import SummaryCenterModal from '../../react-components/SummaryCenterModal.jsx'; // Also import the component itself

import { stateManager, defaultSummarizationPresets } from '../../core/core.state.js';
import { toggleDropdown, createSearchableModelSelector } from '../../core/core.ui.js';
import * as SummaryHandlers from './summary.handlers.js';
import { getFilteredModelsForDisplay } from '../models/model-manager.ui.js';
import * as UserService from '../user/user.service.js';

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

// export function showSummarizationCenter() {
//     const modal = document.getElementById('summarization-modal');
//     if (!modal) return;

//     // --- Reset UI elements ---
//     modal.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
//     modal.querySelector('.tab-btn[data-tab="logs"]')?.classList.add('active');
//     modal.querySelector('.tab-content[data-tab-content="logs"]')?.classList.add('active');
    
//     selectLog(null);
//     renderLogList();
//     renderSummarizationPresetSelector();
//     SummaryHandlers.handleSummarizationPresetChange();
//     updateModalActionsVisibility();

//     // --- [THE FIX] ---
//     // 1. Get the correctly filtered list of models for the current user.
//     const modelsToShow = UserService.getAllowedModelsForCurrentUser();

//     // 2. Get the currently selected model for the system agent as a default.
//     const project = stateManager.getProject();
//     const initialModelId = project.globalSettings.systemUtilityAgent?.model;
    
//     // 3. Create the searchable dropdown using the correct, filtered list.
//     createSearchableModelSelector(
//         'summary-model-wrapper',
//         initialModelId,
//         modelsToShow
//     );

//     modal.style.display = 'flex';
// }

export function showSummarizationCenter() {
    const project = stateManager.getProject();
    const session = project.chatSessions.find(s => s.id === project.activeSessionId);
    if (!session) return;
    
    const props = {
        summaryLogs: project.summaryLogs || [],
        allModels: UserService.getAllowedModelsForCurrentUser(),
        promptTemplates: { ...defaultSummarizationPresets, ...project.globalSettings.summarizationPromptPresets },
        currentSessionName: session.name,
        systemUtilityModel: project.globalSettings.systemUtilityAgent?.model,
        // [THE FIX] อ่านค่าที่เคยบันทึกไว้ส่งเข้าไปเป็น State เริ่มต้น
        activeTemplate: project.globalSettings.activeSummarizationPreset,
        defaultPresets: defaultSummarizationPresets,
        onApplySettings: (settings) => SummaryHandlers.applySummarySettings(settings),
    };

    const targetElement = document.getElementById('react-modal-root');
    if (targetElement) {
        mountReactComponent(SummaryCenterModal, props, targetElement);
    }
}

export function hideSummarizationCenter() {
    const el = document.getElementById('summarization-modal');
    if (el) el.style.display = 'none';
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

export function initSummaryUI() {
    const modal = document.getElementById('summarization-modal');
    if (!modal) return;

    modal.querySelector('#summary-modal-close-btn')?.addEventListener('click', hideSummarizationCenter);
    modal.querySelector('.modal-close-btn')?.addEventListener('click', hideSummarizationCenter);
    modal.querySelector('#summarize-conversation-btn')?.addEventListener('click', SummaryHandlers.generateNewSummary);
    
    modal.querySelector('#summary-editor-save-btn')?.addEventListener('click', () => {
        if (activeLogId) {
            SummaryHandlers.saveSummaryEdit({
                logId: activeLogId,
                title: document.getElementById('summary-editor-title').value,
                content: document.getElementById('summary-editor-content').value
            });
        } else {
            SummaryHandlers.saveNewSummaryLog();
        }
    });

    modal.querySelector('#summary-editor-delete-btn')?.addEventListener('click', () => {
        if(activeLogId) SummaryHandlers.deleteSummaryLog({ logId: activeLogId });
    });
    modal.querySelector('#summary-editor-load-btn')?.addEventListener('click', () => {
        if(activeLogId) SummaryHandlers.loadSummaryToContext({ logId: activeLogId });
    });

    modal.querySelector('.tab-buttons')?.addEventListener('click', (e) => {
        if (e.target.matches('.tab-btn')) {
            const tabName = e.target.dataset.tab;
            modal.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
            e.target.classList.add('active');
            modal.querySelector(`.tab-content[data-tab-content="${tabName}"]`)?.classList.add('active');
            
            // --- เรียกใช้ฟังก์ชันเพื่ออัปเดตปุ่มทุกครั้งที่สลับแท็บ ---
            updateModalActionsVisibility();
        }
    });
    
    modal.querySelector('#summary-log-list-modal')?.addEventListener('click', (e) => {
        const logItem = e.target.closest('.summary-log-item[data-log-id]');
        if (logItem) {
            selectLog(logItem.dataset.logId);
        }
    });

    modal.querySelector('#summary-modal-preset-select')?.addEventListener('change', () => {
        SummaryHandlers.handleSummarizationPresetChange();
    });

    modal.querySelector('#summary-modal-prompt-textarea')?.addEventListener('input', () => {
        renderSummarizationPresetSelector();
    });

    const summaryActionsWrapper = modal.querySelector('#summary-modal-preset-actions');
    if (summaryActionsWrapper) {
        summaryActionsWrapper.addEventListener('click', (e) => {
            const target = e.target.closest('a[data-action], button[data-action]');
            if (!target) return;
            e.preventDefault();
            e.stopPropagation();
            const action = target.dataset.action;

            if (action === 'toggle-menu') {
                toggleDropdown(e);
            } else {
                const saveAs = target.dataset.saveAs === 'true';
                if (action === 'settings:saveSummaryPreset') {
                    SummaryHandlers.handleSaveSummarizationPreset({ saveAs });
                } else if (action === 'settings:renameSummaryPreset') {
                    SummaryHandlers.renameSummarizationPreset();
                } else if (action === 'settings:deleteSummaryPreset') {
                    SummaryHandlers.deleteSummarizationPreset();
                }
                target.closest('.dropdown.open')?.classList.remove('open');
            }
        });
    }

        // [ADD THIS] Add a listener for when a new summary model is selected.
    const summaryModelValueInput = document.getElementById('summary-model-value');
    if (summaryModelValueInput) {
        summaryModelValueInput.addEventListener('change', (e) => {
            const newModelId = e.target.value;
            if (newModelId) {
                const project = stateManager.getProject();
                if (project && project.globalSettings.systemUtilityAgent) {
                    project.globalSettings.systemUtilityAgent.model = newModelId;
                    stateManager.updateAndPersistState(); // Save the change
                    console.log(`Summary/System model updated to: ${newModelId}`);
                }
            }
        });
    }

    // Subscribe to events that should trigger a re-render of the preset selector
    stateManager.bus.subscribe('ui:renderSummarizationSelector', renderSummarizationPresetSelector);
    stateManager.bus.subscribe('ui:updateSummaryActionButtons', updateActionMenu);

    // Subscribe กับ Event กลางเพื่ออัปเดตตัวเอง
    stateManager.bus.subscribe('app:settingsChanged', () => {
        if (modal && modal.style.display === 'flex') {
            showSummarizationCenter();
        }
    });


    console.log("✅ Summarization Center UI Initialized.");
}
