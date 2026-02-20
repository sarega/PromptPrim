// ===============================================
// FILE: src/js/modules/project/project.ui.js
// DESCRIPTION: ทำให้ฟังก์ชัน updateProjectTitle เป็นศูนย์กลางการแสดงผลชื่อและสถานะ Dirty
// ===============================================

import { stateManager } from '../../core/core.state.js';
import { toggleDropdown, showContextMenu, showCustomAlert } from '../../core/core.ui.js';

const MOBILE_HEADER_BREAKPOINT = 768;

function isMobileViewport() {
    return window.matchMedia(`(max-width: ${MOBILE_HEADER_BREAKPOINT}px)`).matches;
}

function triggerProjectAction(action) {
    const eventMap = {
        'newProject': { name: 'project:new' },
        'openProject': { name: 'project:open' },
        'saveProject': { name: 'project:save', data: false },
        'saveProjectAs': { name: 'project:save', data: true },
        'exportChat': { name: 'project:exportChat' }
    };

    const mappedEvent = eventMap[action];
    if (!mappedEvent) return false;

    stateManager.bus.publish(mappedEvent.name, mappedEvent.data);
    return true;
}

function buildProjectMenuOptions() {
    return [
        { label: 'New...', action: () => triggerProjectAction('newProject') },
        { label: 'Open...', action: () => triggerProjectAction('openProject') },
        { label: 'Save', action: () => triggerProjectAction('saveProject') },
        { label: 'Save As...', action: () => triggerProjectAction('saveProjectAs') }
    ];
}

function createAnchorEvent(anchorElement) {
    const rect = anchorElement?.getBoundingClientRect();
    const fallbackX = rect ? Math.round(rect.left + Math.min(rect.width, 56)) : Math.round(window.innerWidth / 2);
    const fallbackY = rect ? Math.round(rect.bottom + 8) : 56;

    return {
        clientX: fallbackX,
        clientY: fallbackY,
        preventDefault() {},
        stopPropagation() {}
    };
}

function openMobileProjectMenu(event, anchorElement) {
    if (!isMobileViewport()) return false;
    const triggerEvent = (
        event && typeof event.clientX === 'number' && typeof event.clientY === 'number'
    ) ? event : createAnchorEvent(anchorElement);

    showContextMenu(buildProjectMenuOptions(), triggerEvent);
    return true;
}

/**
 * [MODIFIED] This function is now the single source of truth for the project title display.
 * It checks the dirty state and appends a '*' if necessary.
 * @param {string} [projectName] - Optional. The base name of the project. If not provided, it will be retrieved from the state.
 */
export function updateProjectTitle(projectName) {
    const projectTitleEl = document.getElementById('project-title');
    if (projectTitleEl) {
        const isDirty = stateManager.isUserDirty();
        // Use the passed projectName or get it from the state as a fallback
        const nameToShow = projectName || stateManager.getProject()?.name || "Untitled";
        projectTitleEl.textContent = isDirty ? `${nameToShow} *` : nameToShow;
    }
}

function showSaveAsModal() {
    const modal = document.getElementById('save-project-modal');
    const projectNameInput = document.getElementById('project-name-input');
    const currentProject = stateManager.getProject();

    // Pre-fill the input with a suggestion
    projectNameInput.value = currentProject ? `${currentProject.name} - Copy` : 'Untitled Project';
    modal.style.display = 'flex';
    projectNameInput.focus();
    projectNameInput.select();
}

function hideSaveAsModal() {
    const modal = document.getElementById('save-project-modal');
    modal.style.display = 'none';
}


export function scrollToLinkedEntity(type, name) {
    let element;
    if (type === 'agent') {
        element = document.querySelector(`.item[data-agent-name="${name}"]`);
    } else if (type === 'group') {
        element = document.querySelector(`.item[data-group-name="${name}"]`);
    }
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

export function initProjectUI() {
    // --- Subscribe to Events (ส่วนนี้ของคุณถูกต้องแล้ว) ---
    stateManager.bus.subscribe('project:loaded', (eventData) => {
        updateProjectTitle(eventData.projectData.name);
    });
    stateManager.bus.subscribe('project:nameChanged', (newName) => updateProjectTitle(newName));
    stateManager.bus.subscribe('userDirty:changed', () => updateProjectTitle());
    // stateManager.bus.subscribe('ui:renderSummarizationSelector', renderSummarizationPresetSelector);
    // stateManager.bus.subscribe('ui:updateSummaryActionButtons', updateSummarizationActionButtons);
    stateManager.bus.subscribe('ui:showSaveAsModal', showSaveAsModal);

    // --- Setup Event Listeners ---
    const projectDropdownWrapper = document.querySelector('#project-menu-dropdown') || document.querySelector('.sidebar-bottom-row .dropdown');
    if (projectDropdownWrapper) {
        const toggleButton = projectDropdownWrapper.querySelector('button');
        if (toggleButton) {
            toggleButton.addEventListener('click', toggleDropdown);
        }

        // Use event delegation for the dropdown menu itself
        projectDropdownWrapper.addEventListener('click', (e) => {
            const target = e.target.closest('a');
            if (!target) return;

            const action = target.dataset.action;
            if (action) {
                e.preventDefault();
                triggerProjectAction(action);
                projectDropdownWrapper.classList.remove('open');
            }
        });
    }

    const mobileProjectTrigger = document.querySelector('.chat-header .app-main-title');
    if (mobileProjectTrigger) {
        mobileProjectTrigger.classList.add('project-menu-mobile-trigger');
        mobileProjectTrigger.setAttribute('role', 'button');
        mobileProjectTrigger.setAttribute('tabindex', '0');
        mobileProjectTrigger.setAttribute('aria-label', 'Open project menu');
        mobileProjectTrigger.title = 'Project menu';

        mobileProjectTrigger.addEventListener('click', (event) => {
            openMobileProjectMenu(event, mobileProjectTrigger);
        });

        mobileProjectTrigger.addEventListener('keydown', (event) => {
            if (!isMobileViewport()) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;

            event.preventDefault();
            openMobileProjectMenu(null, mobileProjectTrigger);
        });
    }

    // --- Setup Modal Listeners using Event Delegation ---
    const saveProjectModal = document.getElementById('save-project-modal');
    if (saveProjectModal) {
        saveProjectModal.addEventListener('click', (e) => {
            if (e.target.matches('.btn:not(.btn-secondary)')) { // Save button
                const newName = document.getElementById('project-name-input').value.trim();
                if (newName) {
                    stateManager.bus.publish('project:saveConfirm', { projectName: newName });
                    hideSaveAsModal(); // Hide modal on successful action
                } else {
                    showCustomAlert('Please enter a project name.');
                }
            } else if (e.target.matches('.btn-secondary') || e.target === saveProjectModal) { // Cancel or overlay click
                hideSaveAsModal();
            }
        });
    }
    
    document.getElementById('load-project-input')?.addEventListener('change', (e) => stateManager.bus.publish('project:fileSelectedForOpen', e));

    // const summaryActionsWrapper = document.getElementById('summary-modal-preset-actions');
    // if (summaryActionsWrapper) {
    //     summaryActionsWrapper.querySelector('button[data-action="toggle-menu"]')?.addEventListener('click', toggleDropdown);
    //     summaryActionsWrapper.querySelector('.dropdown-content')?.addEventListener('click', (e) => {
    //         const actionTarget = e.target.closest('a[data-action]');
    //         if (!actionTarget) return;
    //         e.preventDefault();
    //         e.stopPropagation();
    //         const action = actionTarget.dataset.action;
    //         const saveAs = actionTarget.dataset.saveAs === 'true';
    //         stateManager.bus.publish(action, { saveAs });
    //         summaryActionsWrapper.classList.remove('open');
    //     });
    // }
    console.log("Project UI Initialized with definitive listeners.");
}
