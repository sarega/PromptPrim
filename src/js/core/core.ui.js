// ===============================================
// FILE: src/js/core/core.ui.js
// DESCRIPTION: 
// ===============================================

import { stateManager } from './core.state.js';
import * as SettingsUI from '../modules/settings/settings.ui.js';
import * as UserService from '../modules/user/user.service.js';
import { getContextData } from '../modules/chat/chat.handlers.js';

export function updateAppStatus(statusUpdate = {}) {
    const { message, state } = statusUpdate;

    // --- Part 1: Update Left Side (Dot, Model Count, Text) ---
    const statusTextEl = document.getElementById('statusText');
    const statusDotEl = document.getElementById('statusDot');
    const modelStatusSpan = document.getElementById('model-count-status');
    
    if (statusTextEl && statusDotEl && modelStatusSpan) {
        // Update dot and text
        statusTextEl.textContent = message || 'Ready';
        statusDotEl.className = 'status-dot'; // Reset class
        
        const currentState = state || 'connected';
        if (currentState === 'connected') {
            statusDotEl.classList.add('connected');
        } else if (currentState === 'error') {
            statusDotEl.classList.add('error');
        } else if (currentState === 'loading') {
            statusDotEl.classList.add('warning');
        }

        // Update model count
        const allowedModels = UserService.getAllowedModelsForCurrentUser();
        modelStatusSpan.textContent = `${allowedModels.length} Models`;
    }

    // --- Part 2: Update Right Side (Agent, Tokens) ---
    const { totalTokens, agent, agentNameForDisplay } = getContextData();
    const agentStatusSpan = document.getElementById('active-agent-status');
    const tokenStatusSpan = document.getElementById('token-count-status');

    if (agentStatusSpan) agentStatusSpan.textContent = `Active: ${agent.icon || ''} ${agentNameForDisplay}`;
    if (tokenStatusSpan) tokenStatusSpan.textContent = `~${totalTokens.toLocaleString()} Tokens`;
}

export function updateStatus({ message, state }) {
    const statusTextEl = document.getElementById('statusText');
    const statusDotEl = document.getElementById('statusDot');

    if (statusTextEl && statusDotEl) {
        statusTextEl.textContent = message || 'Ready';
        statusDotEl.className = 'status-dot'; // Reset class
        
        const currentState = state || 'connected';
        if (currentState === 'connected') {
            statusDotEl.classList.add('connected');
        } else if (currentState === 'error') {
            statusDotEl.classList.add('error');
        } else if (currentState === 'loading') {
            statusDotEl.classList.add('warning');
        }
    }
}

/**
 * Creates a reusable dropdown menu component.
 * @param {Array<object>} options - An array of option objects.
 * Each object should have: { label: string, action: string, data?: object, isDestructive?: boolean }
 * @returns {HTMLElement} The created dropdown element.
 */
export function createDropdown(options) {
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown align-right';

    const button = document.createElement('button');
    button.className = 'btn-icon';
    button.innerHTML = '&#8942;';
    button.title = 'More options';
    // [CRITICAL FIX] เพิ่มบรรทัดนี้เพื่อให้ Event Listener รู้ว่าต้องทำอะไร
    button.dataset.action = 'toggle-menu';

    const content = document.createElement('div');
    content.className = 'dropdown-content';

    // ... โค้ดส่วนที่เหลือของฟังก์ชันเหมือนเดิมทุกประการ ...
    
    options.forEach(opt => {
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = opt.label;
        if (opt.isDestructive) {
            link.classList.add('is-destructive');
        }
        link.dataset.action = opt.action;
        if (opt.data) {
            link.dataset.data = JSON.stringify(opt.data);
        }
        content.appendChild(link);
    });

    dropdown.append(button, content);
    return dropdown;
}

// --- Exported UI Functions ---
export function showSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'flex';
}

export function hideSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
}

export function showSaveProjectModal() {
    const project = stateManager.getProject();
    document.getElementById('project-name-input').value = (project.name === "Untitled Project") ? "" : project.name;
    document.getElementById('save-project-modal').style.display = 'flex';
}

export function hideSaveProjectModal() { document.getElementById('save-project-modal').style.display = 'none'; }
export function showUnsavedChangesModal() { document.getElementById('unsaved-changes-modal').style.display = 'flex'; }
export function hideUnsavedChangesModal() { document.getElementById('unsaved-changes-modal').style.display = 'none'; }

export function showCustomAlert(message, title = 'Notification') {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-message').textContent = message;
    document.getElementById('alert-modal').style.display = 'flex';
}

export function hideCustomAlert() { document.getElementById('alert-modal').style.display = 'none'; }

export function toggleMobileSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('mobile-overlay').classList.toggle('active');
}

export function toggleSidebarCollapse() { document.querySelector('.app-wrapper').classList.toggle('sidebar-collapsed'); }
// -- simplify
export function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = event.target.closest('.dropdown');
    if (!dropdown) return;

    const content = dropdown.querySelector('.dropdown-content');
    const wasOpen = dropdown.classList.contains('open');

    // ปิด Dropdown อื่นๆ ทั้งหมดก่อนเสมอ
    document.querySelectorAll('.dropdown.open').forEach(d => {
        if (d !== dropdown) {
            d.classList.remove('open');
        }
    });

    // [REVERT] ถ้าเมนูกำลังจะถูกเปิด ให้คำนวณทิศทาง
    if (!wasOpen) {
        // ทำให้เมนูมองเห็นได้ชั่วคราวเพื่อวัดขนาดที่แท้จริง
        content.style.visibility = 'hidden';
        content.style.display = 'block';
        const menuHeight = content.offsetHeight;
        // คืนค่าการแสดงผลกลับไปเหมือนเดิม
        content.style.visibility = '';
        content.style.display = '';

        const buttonRect = event.target.closest('button').getBoundingClientRect();
        const spaceBelow = window.innerHeight - buttonRect.bottom;

        // ถ้าพื้นที่ด้านล่างไม่พอ และพื้นที่ด้านบนมีมากกว่า ให้เพิ่มคลาส .opens-up
        if (spaceBelow < menuHeight && buttonRect.top > menuHeight) {
            content.classList.add('opens-up');
        } else {
            // ถ้าพื้นที่พอ ให้ลบคลาสออกเสมอ
            content.classList.remove('opens-up');
        }
    }

    // สลับการแสดงผลของเมนูที่ถูกคลิก
    dropdown.classList.toggle('open');
}

// [NEW] เพิ่ม Listener กลางสำหรับปิด Dropdown เมื่อคลิกนอกพื้นที่
// เราจะเรียกใช้ฟังก์ชันนี้เพียงครั้งเดียวใน app.js
export function initGlobalDropdownListener() {
    document.addEventListener('click', (e) => {
        // --- Part 1: Handle old-style dropdowns with .open class ---
        const openDropdown = document.querySelector('.dropdown.open');
        if (openDropdown && !openDropdown.contains(e.target)) {
            openDropdown.classList.remove('open');
        }

        // --- Part 2: Handle new searchable selectors ---
        // Find any searchable select that is currently showing its options
        const activeSearchableSelect = document.querySelector('.searchable-select-wrapper .searchable-select-options:not(.hidden)');
        if (activeSearchableSelect) {
            // Find the parent wrapper of this specific options container
            const wrapper = activeSearchableSelect.closest('.searchable-select-wrapper');
            // If the click was outside of its parent wrapper, hide the options
            if (wrapper && !wrapper.contains(e.target)) {
                activeSearchableSelect.classList.add('hidden');
            }
        }
    });
}

export function applyFontSettings() {
    const project = stateManager.getProject();
    if (project?.globalSettings?.fontFamilySelect) {
        document.documentElement.style.setProperty('--main-font-family', project.globalSettings.fontFamilySelect);
    }
}

export function initCoreUI() {
    const versionSpan = document.getElementById('app-version');
    if (versionSpan) {
        versionSpan.textContent = import.meta.env.VITE_APP_VERSION || 'N/A';
    }

    stateManager.bus.subscribe('ui:applyFontSettings', applyFontSettings);
    // [FIX] All status-related events are now subscribed here to the single update function.
    // stateManager.bus.subscribe('status:update', (data) => updateAppStatus(data));
    stateManager.bus.subscribe('session:loaded', () => updateAppStatus());
    stateManager.bus.subscribe('entity:selected', () => updateAppStatus());
    stateManager.bus.subscribe('user:settingsUpdated', () => updateAppStatus());
    stateManager.bus.subscribe('user:modelsLoaded', () => updateAppStatus());
    stateManager.bus.subscribe('status:update', updateStatus);
    updateStatus({});

    const settingsBtn = document.querySelector('#settings-btn');
    if (settingsBtn) {
        // [FIX] Force a re-render every time the settings button is clicked
        settingsBtn.addEventListener('click', () => {
            console.log("Settings button clicked. Re-rendering panel before showing.");
            // This ensures the settings panel always has the latest user data and model lists.
            SettingsUI.renderAndShowSettings();
        });
    }

    const mobileOverlay = document.getElementById('mobile-overlay');
    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', toggleMobileSidebar);
    }

    const alertCloseBtn = document.querySelector('#alert-modal .btn');
    if(alertCloseBtn) {
        alertCloseBtn.addEventListener('click', hideCustomAlert);
    }

    const unsavedModal = document.getElementById('unsaved-changes-modal');
    if (unsavedModal) {
        const saveBtn = unsavedModal.querySelector('.btn:not(.btn-secondary):not(.btn-danger)');
        if(saveBtn) saveBtn.addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'save'));

        const discardBtn = unsavedModal.querySelector('.btn-danger');
        if(discardBtn) discardBtn.addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'discard'));

        const cancelBtn = unsavedModal.querySelector('.btn-secondary');
        if(cancelBtn) cancelBtn.addEventListener('click', () => stateManager.bus.publish('project:unsavedChangesChoice', 'cancel'));
    }

    console.log("Core UI Initialized and Listeners Attached.");
}

/**
 * Creates and displays a custom context menu at the specified coordinates.
 * @param {Array<object>} options - Array of menu item objects. e.g., [{ label: 'Copy', action: () => {} }]
 * @param {MouseEvent|TouchEvent} event - The event that triggered the menu.
 */
export function showContextMenu(options, event) {
    // Remove any existing context menus to prevent duplicates
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    event.preventDefault();
    event.stopPropagation();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const list = document.createElement('ul');

    options.forEach(option => {
        const item = document.createElement('li');
        item.textContent = option.label;
        if (option.isDestructive) {
            item.classList.add('destructive');
        }
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            option.action();
            // The menu will be closed by the global listener
        });
        list.appendChild(item);
    });

    menu.appendChild(list);
    document.body.appendChild(menu);

    // Position the menu carefully, ensuring it doesn't go off-screen
    const { clientX, clientY } = (event.touches) ? event.touches[0] : event;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let top = clientY;
    let left = clientX;

    if (clientX + menuWidth > screenWidth) {
        left = screenWidth - menuWidth - 10; // Adjust to not touch the edge
    }
    if (clientY + menuHeight > screenHeight) {
        top = screenHeight - menuHeight - 10; // Adjust to not touch the edge
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    // By wrapping the style change that triggers the transition in a
    // requestAnimationFrame, we ensure the browser has processed the
    // initial state (opacity: 0 from CSS) before transitioning to the final state.
    requestAnimationFrame(() => {
        menu.style.opacity = '1';
        menu.style.transform = 'scale(1)';
    });
    // Close menu when clicking anywhere else on the page
    const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu, true);
    };
    
    // Use a timeout to allow the current event to finish before attaching the listener
    setTimeout(() => {
        document.addEventListener('click', closeMenu, true);
    }, 0);
}

function normalizeModelSearchText(value = '') {
    return String(value || '').trim().toLowerCase();
}

function foldModelSearchText(value = '') {
    return normalizeModelSearchText(value).replace(/[^a-z0-9]+/g, '');
}

function isSubsequence(needle, haystack) {
    if (!needle) return true;
    let i = 0;
    let j = 0;
    while (i < needle.length && j < haystack.length) {
        if (needle[i] === haystack[j]) i += 1;
        j += 1;
    }
    return i === needle.length;
}

function levenshteinDistance(a = '', b = '', maxDistance = Infinity) {
    const left = String(a);
    const right = String(b);

    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let i = 1; i <= left.length; i += 1) {
        const current = [i];
        let rowMin = current[0];

        for (let j = 1; j <= right.length; j += 1) {
            const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
            const value = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + substitutionCost
            );
            current[j] = value;
            if (value < rowMin) rowMin = value;
        }

        if (rowMin > maxDistance) return maxDistance + 1;
        previous = current;
    }

    return previous[right.length];
}

function buildModelSearchIndex(models = []) {
    const seenIds = new Set();
    const uniqueModels = [];

    (Array.isArray(models) ? models : []).forEach((model) => {
        const normalizedId = normalizeModelSearchText(model?.id);
        if (!normalizedId || seenIds.has(normalizedId)) return;
        seenIds.add(normalizedId);

        const canonicalId = String(model.id).trim();
        const displayName = String(model.name || canonicalId).trim();
        const providerName = String(model.provider || '').trim();

        uniqueModels.push({
            ...model,
            id: canonicalId,
            name: displayName,
            provider: providerName
        });
    });

    uniqueModels.sort((a, b) => {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) return byName;
        return a.id.localeCompare(b.id);
    });

    return uniqueModels.map((model, order) => {
        const idLower = normalizeModelSearchText(model.id);
        const nameLower = normalizeModelSearchText(model.name);
        const providerLower = normalizeModelSearchText(model.provider);
        const idTailLower = idLower.includes('/') ? idLower.split('/').slice(1).join('/') : idLower;

        return {
            model,
            order,
            idLower,
            nameLower,
            providerLower,
            idTailLower,
            idFolded: foldModelSearchText(idLower),
            nameFolded: foldModelSearchText(nameLower),
            idTailFolded: foldModelSearchText(idTailLower)
        };
    });
}

function rankModelMatches(indexedModels, rawQuery) {
    const query = normalizeModelSearchText(rawQuery);
    const queryFolded = foldModelSearchText(rawQuery);

    if (!query && !queryFolded) {
        return indexedModels.map((entry) => ({ entry, tier: 99, detail: entry.order }));
    }

    const ranked = [];

    indexedModels.forEach((entry) => {
        let tier = Number.POSITIVE_INFINITY;
        let detail = Number.POSITIVE_INFINITY;

        const exactMatch = (
            entry.idLower === query ||
            entry.idTailLower === query ||
            entry.nameLower === query
        );

        const foldedExactMatch = Boolean(queryFolded) && (
            entry.idFolded === queryFolded ||
            entry.idTailFolded === queryFolded ||
            entry.nameFolded === queryFolded
        );

        if (exactMatch) {
            tier = 0;
            detail = 0;
        } else if (foldedExactMatch) {
            tier = 1;
            detail = 0;
        } else {
            const prefixMatch = query && (
                entry.idLower.startsWith(query) ||
                entry.idTailLower.startsWith(query) ||
                entry.nameLower.startsWith(query) ||
                entry.providerLower.startsWith(query)
            );
            const foldedPrefixMatch = Boolean(queryFolded) && (
                entry.idFolded.startsWith(queryFolded) ||
                entry.idTailFolded.startsWith(queryFolded) ||
                entry.nameFolded.startsWith(queryFolded)
            );

            if (prefixMatch || foldedPrefixMatch) {
                tier = 2;
                const positions = [
                    entry.idLower.indexOf(query),
                    entry.idTailLower.indexOf(query),
                    entry.nameLower.indexOf(query),
                    entry.providerLower.indexOf(query)
                ].filter((index) => index >= 0);
                detail = positions.length ? Math.min(...positions) : 0;
            } else {
                const substringMatch = query && (
                    entry.idLower.includes(query) ||
                    entry.idTailLower.includes(query) ||
                    entry.nameLower.includes(query) ||
                    entry.providerLower.includes(query)
                );
                const foldedSubstringMatch = Boolean(queryFolded) && (
                    entry.idFolded.includes(queryFolded) ||
                    entry.idTailFolded.includes(queryFolded) ||
                    entry.nameFolded.includes(queryFolded)
                );

                if (substringMatch || foldedSubstringMatch) {
                    tier = 3;
                    detail = Math.min(
                        ...[
                            entry.nameLower.indexOf(query),
                            entry.idLower.indexOf(query),
                            entry.idTailLower.indexOf(query)
                        ].filter((index) => index >= 0)
                    );
                } else if (queryFolded.length >= 2) {
                    const fuzzyLimit = Math.max(1, Math.floor(queryFolded.length * 0.4));
                    const candidates = [entry.idTailFolded, entry.nameFolded, entry.idFolded];
                    let fuzzyScore = Number.POSITIVE_INFINITY;

                    candidates.forEach((candidate) => {
                        if (!candidate) return;

                        if (isSubsequence(queryFolded, candidate)) {
                            fuzzyScore = Math.min(
                                fuzzyScore,
                                Math.max(1, candidate.length - queryFolded.length)
                            );
                        }

                        const comparisonTarget = candidate.slice(0, Math.max(queryFolded.length + 2, 8));
                        const distance = levenshteinDistance(queryFolded, comparisonTarget, fuzzyLimit);
                        if (distance <= fuzzyLimit) {
                            fuzzyScore = Math.min(fuzzyScore, distance);
                        }
                    });

                    if (Number.isFinite(fuzzyScore)) {
                        tier = 4;
                        detail = fuzzyScore;
                    }
                }
            }
        }

        if (Number.isFinite(tier)) {
            ranked.push({ entry, tier, detail });
        }
    });

    ranked.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (a.detail !== b.detail) return a.detail - b.detail;
        const byName = a.entry.model.name.localeCompare(b.entry.model.name);
        if (byName !== 0) return byName;
        return a.entry.model.id.localeCompare(b.entry.model.id);
    });

    return ranked;
}

function getClosestModelSuggestions(indexedModels, rawQuery, limit = 3) {
    const query = normalizeModelSearchText(rawQuery);
    const queryFolded = foldModelSearchText(rawQuery);
    if (!query && !queryFolded) return [];

    const scored = indexedModels.map((entry) => {
        const candidates = [entry.idTailFolded, entry.nameFolded, entry.idFolded].filter(Boolean);
        if (!candidates.length) return { entry, score: Number.POSITIVE_INFINITY };

        let score = Number.POSITIVE_INFINITY;
        if (query && (entry.idLower.includes(query) || entry.idTailLower.includes(query) || entry.nameLower.includes(query))) {
            score = 0;
        }

        if (queryFolded) {
            const maxDistance = Math.max(2, Math.ceil(queryFolded.length * 0.7));
            candidates.forEach((candidate) => {
                const comparison = candidate.slice(0, Math.max(queryFolded.length + 3, 10));
                const distance = levenshteinDistance(queryFolded, comparison, maxDistance);
                score = Math.min(score, distance);
            });
        }

        return { entry, score };
    });

    const threshold = Math.max(2, Math.ceil((queryFolded || query).length * 0.7));
    return scored
        .filter((item) => Number.isFinite(item.score) && item.score <= threshold)
        .sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            const byName = a.entry.model.name.localeCompare(b.entry.model.name);
            if (byName !== 0) return byName;
            return a.entry.model.id.localeCompare(b.entry.model.id);
        })
        .slice(0, limit)
        .map((item) => item.entry);
}

const MODEL_PICKER_PREFERENCES_KEY = 'promptPrimModelPickerPrefs_v1';
const MAX_RECENT_MODELS = 8;
const MAX_PINNED_MODELS = 24;

function readModelPickerPreferenceStore() {
    try {
        const raw = localStorage.getItem(MODEL_PICKER_PREFERENCES_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn('Failed to read model picker preferences:', error);
        return {};
    }
}

function writeModelPickerPreferenceStore(store) {
    try {
        localStorage.setItem(MODEL_PICKER_PREFERENCES_KEY, JSON.stringify(store));
    } catch (error) {
        console.warn('Failed to write model picker preferences:', error);
    }
}

function areStringArraysEqual(left = [], right = []) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

function normalizeModelIdPreferences(rawList, indexedById, maxSize = Infinity) {
    const normalized = [];
    const seen = new Set();
    if (!Array.isArray(rawList)) return normalized;

    rawList.forEach((value) => {
        const key = normalizeModelSearchText(value);
        if (!key) return;
        const entry = indexedById.get(key);
        if (!entry) return;

        const canonicalId = entry.model.id;
        if (seen.has(canonicalId)) return;
        seen.add(canonicalId);
        normalized.push(canonicalId);
    });

    return normalized.slice(0, maxSize);
}

function normalizeModelPickerPreferences(rawPreferences, indexedById) {
    return {
        pinnedModelIds: normalizeModelIdPreferences(
            rawPreferences?.pinnedModelIds,
            indexedById,
            MAX_PINNED_MODELS
        ),
        recentModelIds: normalizeModelIdPreferences(
            rawPreferences?.recentModelIds,
            indexedById,
            MAX_RECENT_MODELS
        )
    };
}

function createModelOptionItem(entry, { onSelect, onTogglePin, isPinned = false } = {}) {
    const item = document.createElement('div');
    item.className = 'searchable-option-item searchable-option-row';
    item.dataset.value = entry.model.id;
    item.dataset.selectable = 'true';

    const content = document.createElement('div');
    content.className = 'searchable-option-main';

    const title = document.createElement('span');
    title.className = 'searchable-option-title';
    title.textContent = entry.model.name;

    const meta = document.createElement('small');
    meta.textContent = entry.model.provider
        ? `${entry.model.id} • ${entry.model.provider}`
        : entry.model.id;

    content.append(title, meta);
    item.append(content);

    if (typeof onTogglePin === 'function') {
        const pinButton = document.createElement('button');
        pinButton.type = 'button';
        pinButton.className = `searchable-option-pin${isPinned ? ' is-pinned' : ''}`;
        pinButton.textContent = isPinned ? 'Pinned' : 'Pin';
        pinButton.title = isPinned ? 'Unpin model' : 'Pin model';
        pinButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onTogglePin(entry);
        });
        item.append(pinButton);
    }

    item.addEventListener('click', () => {
        if (typeof onSelect === 'function') {
            onSelect(entry);
        }
    });
    return item;
}

/**
 * Creates a searchable model selector component.
 * @param {string} wrapperId - The ID of the wrapper element that contains text input + hidden input.
 * @param {string} initialModelId - The model ID to initialize in the selector.
 * @param {Array<object>} modelsToShow - Optional model list to render instead of the global list.
 */
export function createSearchableModelSelector(wrapperId, initialModelId, modelsToShow) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    if (typeof wrapper.__searchableModelSelectorCleanup === 'function') {
        wrapper.__searchableModelSelectorCleanup();
    }

    const allModels = modelsToShow !== undefined
        ? modelsToShow
        : (stateManager.getState().allProviderModels || []);
    const indexedModels = buildModelSearchIndex(allModels);
    const indexedById = new Map();
    indexedModels.forEach((entry) => {
        indexedById.set(entry.idLower, entry);
    });

    const searchInput = wrapper.querySelector('input[type="text"]');
    const valueInput = wrapper.querySelector('input[type="hidden"]');
    const optionsContainer = wrapper.querySelector('.searchable-select-options');
    if (!searchInput || !valueInput || !optionsContainer) return;

    let activeIndex = -1;
    let selectedEntry = null;
    const cleanupFns = [];
    const userScopeKey = `user:${UserService.getCurrentUserProfile()?.userId || 'anonymous'}`;
    let preferenceStore = readModelPickerPreferenceStore();
    let pickerPreferences = normalizeModelPickerPreferences(preferenceStore[userScopeKey], indexedById);

    const savePreferences = (nextPreferences) => {
        const normalized = normalizeModelPickerPreferences(nextPreferences, indexedById);
        if (
            areStringArraysEqual(normalized.pinnedModelIds, pickerPreferences.pinnedModelIds) &&
            areStringArraysEqual(normalized.recentModelIds, pickerPreferences.recentModelIds)
        ) {
            return;
        }
        pickerPreferences = normalized;
        preferenceStore[userScopeKey] = normalized;
        writeModelPickerPreferenceStore(preferenceStore);
    };

    const isPinned = (modelId) => pickerPreferences.pinnedModelIds.includes(modelId);

    const getEntriesForModelIds = (modelIds = []) => modelIds
        .map((modelId) => indexedById.get(normalizeModelSearchText(modelId)))
        .filter(Boolean);

    const markAsRecent = (entry) => {
        const modelId = entry?.model?.id;
        if (!modelId) return;
        const nextRecent = [
            modelId,
            ...pickerPreferences.recentModelIds.filter((id) => id !== modelId)
        ].slice(0, MAX_RECENT_MODELS);
        savePreferences({
            ...pickerPreferences,
            recentModelIds: nextRecent
        });
    };

    const addListener = (target, eventName, handler, options) => {
        target.addEventListener(eventName, handler, options);
        cleanupFns.push(() => target.removeEventListener(eventName, handler, options));
    };

    const getSelectableItems = () => Array.from(
        optionsContainer.querySelectorAll('.searchable-option-item[data-selectable="true"]')
    );

    const hideOptions = () => {
        optionsContainer.classList.add('hidden');
        activeIndex = -1;
    };

    const showOptions = () => {
        optionsContainer.classList.remove('hidden');
    };

    const updateActiveOption = () => {
        const selectableItems = getSelectableItems();
        selectableItems.forEach((item, index) => {
            item.classList.toggle('active', index === activeIndex);
            if (index === activeIndex) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    };

    const commitSelection = (entry, { emitChange = true } = {}) => {
        const previousValue = valueInput.value;
        markAsRecent(entry);
        selectedEntry = entry;
        searchInput.value = entry.model.name;
        valueInput.value = entry.model.id;
        hideOptions();
        if (emitChange && previousValue !== entry.model.id) {
            valueInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    const restoreCommittedText = () => {
        if (!selectedEntry) {
            searchInput.value = '';
            valueInput.value = '';
            return;
        }
        searchInput.value = selectedEntry.model.name;
        valueInput.value = selectedEntry.model.id;
    };

    const renderDidYouMean = (rawQuery) => {
        const suggestionEntries = getClosestModelSuggestions(indexedModels, rawQuery, 3);
        if (!suggestionEntries.length) return;

        const hint = document.createElement('div');
        hint.className = 'searchable-option-hint';
        hint.textContent = 'Did you mean';
        optionsContainer.appendChild(hint);

        suggestionEntries.forEach((entry) => {
            optionsContainer.appendChild(createModelOptionItem(entry, {
                isPinned: isPinned(entry.model.id),
                onTogglePin: (selected) => {
                    const modelId = selected.model.id;
                    const nextPinned = isPinned(modelId)
                        ? pickerPreferences.pinnedModelIds.filter((id) => id !== modelId)
                        : [modelId, ...pickerPreferences.pinnedModelIds.filter((id) => id !== modelId)].slice(0, MAX_PINNED_MODELS);
                    savePreferences({ ...pickerPreferences, pinnedModelIds: nextPinned });
                    renderOptionsForQuery(searchInput.value);
                    showOptions();
                },
                onSelect: (selected) => {
                    commitSelection(selected);
                }
            }));
        });
    };

    const createSectionTitle = (title) => {
        const titleElement = document.createElement('div');
        titleElement.className = 'searchable-option-section-title';
        titleElement.textContent = title;
        return titleElement;
    };

    const togglePinnedModel = (entry) => {
        const modelId = entry.model.id;
        const nextPinned = isPinned(modelId)
            ? pickerPreferences.pinnedModelIds.filter((id) => id !== modelId)
            : [modelId, ...pickerPreferences.pinnedModelIds.filter((id) => id !== modelId)].slice(0, MAX_PINNED_MODELS);

        savePreferences({ ...pickerPreferences, pinnedModelIds: nextPinned });
        renderOptionsForQuery(searchInput.value);
        showOptions();
    };

    const appendModelEntries = (entries) => {
        entries.forEach((entry) => {
            optionsContainer.appendChild(createModelOptionItem(entry, {
                isPinned: isPinned(entry.model.id),
                onTogglePin: togglePinnedModel,
                onSelect: (selected) => {
                    commitSelection(selected);
                }
            }));
        });
    };

    const renderOptionsForQuery = (rawQuery = '') => {
        optionsContainer.innerHTML = '';
        activeIndex = -1;

        const hasQuery = Boolean(
            normalizeModelSearchText(rawQuery) || foldModelSearchText(rawQuery)
        );
        const ranked = rankModelMatches(indexedModels, rawQuery);
        if (ranked.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'searchable-option-item searchable-option-empty';
            emptyState.dataset.selectable = 'false';
            emptyState.textContent = 'No models found.';
            optionsContainer.appendChild(emptyState);
            renderDidYouMean(rawQuery);
            return;
        }

        if (hasQuery) {
            appendModelEntries(ranked.map((item) => item.entry));
            return;
        }

        const pinnedEntries = getEntriesForModelIds(pickerPreferences.pinnedModelIds);
        const pinnedIdSet = new Set(pinnedEntries.map((entry) => entry.model.id));

        const recentEntries = getEntriesForModelIds(pickerPreferences.recentModelIds)
            .filter((entry) => !pinnedIdSet.has(entry.model.id));
        const recentIdSet = new Set(recentEntries.map((entry) => entry.model.id));

        const allEntries = ranked
            .map((item) => item.entry)
            .filter((entry) => !pinnedIdSet.has(entry.model.id) && !recentIdSet.has(entry.model.id));

        if (pinnedEntries.length > 0) {
            optionsContainer.appendChild(createSectionTitle('Pinned'));
            appendModelEntries(pinnedEntries);
        }

        if (recentEntries.length > 0) {
            optionsContainer.appendChild(createSectionTitle('Recent'));
            appendModelEntries(recentEntries);
        }

        if (allEntries.length > 0) {
            if (pinnedEntries.length > 0 || recentEntries.length > 0) {
                optionsContainer.appendChild(createSectionTitle('All Models'));
            }
            appendModelEntries(allEntries);
        }
    };

    const tryCommitTypedValue = () => {
        const query = normalizeModelSearchText(searchInput.value);
        const queryFolded = foldModelSearchText(searchInput.value);

        if (!query && !queryFolded) {
            restoreCommittedText();
            return;
        }

        const exactEntry = indexedModels.find((entry) =>
            entry.idLower === query ||
            entry.idTailLower === query ||
            entry.nameLower === query ||
            (queryFolded && (
                entry.idFolded === queryFolded ||
                entry.idTailFolded === queryFolded ||
                entry.nameFolded === queryFolded
            ))
        );

        if (exactEntry) {
            commitSelection(exactEntry);
            return;
        }

        restoreCommittedText();
    };

    addListener(searchInput, 'keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (optionsContainer.classList.contains('hidden')) {
                renderOptionsForQuery(searchInput.value);
                showOptions();
            }
            const selectableItems = getSelectableItems();
            if (!selectableItems.length) return;

            if (event.key === 'ArrowDown') {
                activeIndex = (activeIndex + 1) % selectableItems.length;
            } else {
                activeIndex = (activeIndex - 1 + selectableItems.length) % selectableItems.length;
            }
            updateActiveOption();
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();

            if (optionsContainer.classList.contains('hidden')) {
                renderOptionsForQuery(searchInput.value);
                showOptions();
            }

            const selectableItems = getSelectableItems();
            if (!selectableItems.length) {
                tryCommitTypedValue();
                hideOptions();
                return;
            }

            const indexToSelect = activeIndex >= 0 ? activeIndex : 0;
            selectableItems[indexToSelect].click();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            restoreCommittedText();
            hideOptions();
        }
    });

    addListener(searchInput, 'input', () => {
        renderOptionsForQuery(searchInput.value);
        showOptions();
    });

    addListener(searchInput, 'focus', () => {
        renderOptionsForQuery(searchInput.value);
        showOptions();
    });

    addListener(searchInput, 'click', () => {
        renderOptionsForQuery(searchInput.value);
        showOptions();
    });

    addListener(searchInput, 'blur', () => {
        window.setTimeout(() => {
            if (wrapper.contains(document.activeElement)) return;
            tryCommitTypedValue();
            hideOptions();
        }, 100);
    });

    const initialEntry = indexedModels.find(
        (entry) => entry.idLower === normalizeModelSearchText(initialModelId)
    );

    if (initialEntry) {
        selectedEntry = initialEntry;
        searchInput.value = initialEntry.model.name;
        valueInput.value = initialEntry.model.id;
        hideOptions();
    } else {
        selectedEntry = null;
        searchInput.value = '';
        valueInput.value = '';
        hideOptions();
    }

    wrapper.__searchableModelSelectorCleanup = () => {
        cleanupFns.forEach((cleanup) => cleanup());
        delete wrapper.__searchableModelSelectorCleanup;
    };
}
