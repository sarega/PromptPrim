// src/js/components/parameter-editor.js

import { MODEL_PARAMETER_DEFINITIONS } from '../config/model-parameters.js';

/**
 * สร้าง HTML สำหรับ Parameter หนึ่งแถว (ยังไม่มี Event)
 * @param {string} name - The internal name of the parameter (e.g., 'temperature')
 * @param {object} definition - The definition object from the blueprint file.
 * @param {any} currentValue - The current value for this parameter.
 * @returns {string} - The complete HTML string for this parameter row and its control.
 */
function createParameterRowHTML(name, definition, currentValue) {
    const isDefault = (currentValue === undefined || currentValue === '' || currentValue === null || currentValue === definition.default);
    const displayValue = isDefault ? 'Default' : currentValue;
    const valueClass = isDefault ? 'param-value' : 'param-value custom';

    let controlHTML = '';
    const value = (currentValue === undefined || currentValue === null || currentValue === '') ? definition.default : currentValue;

    switch (definition.type) {
        case 'range':
            controlHTML = `
                <input type="range" class="param-slider" data-control="slider"
                       min="${definition.min}" max="${definition.max}" 
                       step="${definition.step}" value="${value}">
                <input type="number" class="param-input" data-control="input"
                       min="${definition.min}" max="${definition.max}" 
                       step="${definition.step}" value="${value}">
                <button type="button" class="btn-link param-reset-btn" data-action="reset">Reset</button>
            `;
            break;
        case 'number':
            controlHTML = `<input type="number" class="param-input-full" data-control="input" value="${value}" placeholder="${definition.default}">`;
            break;
        case 'text':
            controlHTML = `<input type="text" class="param-input-full" data-control="input" value="${value}" placeholder="${definition.default}">`;
            break;
        case 'textarea':
             controlHTML = `<textarea class="param-input-full" data-control="input" rows="3">${value}</textarea>`;
             break;
        case 'select':
            const options = definition.options.map(opt => 
                `<option value="${opt}" ${opt == value ? 'selected' : ''}>${opt}</option>`
            ).join('');
            controlHTML = `<select class="param-input-full" data-control="input">${options}</select>`;
            break;
    }

    return `
        <div class="param-wrapper" data-param-name="${name}">
            <div class="param-row" data-action="toggle">
                <span class="param-label" title="${definition.tooltip}">${definition.label}</span>
                <span class="${valueClass}">${displayValue}</span>
            </div>
            <div class="param-control hidden">
                ${controlHTML}
            </div>
        </div>
    `;
}

/**
 * Main function to create and render the parameter editor UI.
 * This version only renders the static HTML. Interactivity will be added next.
 * @param {HTMLElement} containerElement - The DOM element to render the editor into.
 * @param {object} currentValues - The current settings object for the agent.
 * @param {string} provider - The provider of the selected model ('openrouter' or 'ollama').
 */
export function createParameterEditor(containerElement, currentValues, provider) {
    if (!containerElement) return null;

    // 1. Render the static HTML (same as before)
    let coreHTML = '<h4>Core Parameters</h4>';
    let ollamaHTML = '<div id="ollama-section"><h4>Advanced (Ollama only)</h4>';
    let hasOllamaParams = false;

    for (const paramName in MODEL_PARAMETER_DEFINITIONS) {
        const definition = MODEL_PARAMETER_DEFINITIONS[paramName];
        const currentValue = currentValues ? currentValues[paramName] : undefined;
        
        if (definition.provider === 'all' || definition.provider === provider) {
            const rowHTML = createParameterRowHTML(paramName, definition, currentValue);
            if (definition.provider === 'ollama') {
                ollamaHTML += rowHTML;
                hasOllamaParams = true;
            } else {
                coreHTML += rowHTML;
            }
        }
    }
    console.log('Generated Core HTML:', coreHTML);
    console.log('Generated Ollama HTML:', ollamaHTML);

    ollamaHTML += '</div>';
    containerElement.innerHTML = coreHTML + ollamaHTML;

    const ollamaSection = containerElement.querySelector('#ollama-section');
    if (ollamaSection) {
        ollamaSection.style.display = (provider === 'ollama' && hasOllamaParams) ? 'block' : 'none';
    }

    // --- Event Handlers ---
    const clickHandler = (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;
        const wrapper = actionTarget.closest('.param-wrapper');
        if (!wrapper) return;

        if (actionTarget.dataset.action === 'toggle') {
            const control = wrapper.querySelector('.param-control');
            const isHidden = control.classList.contains('hidden');
            containerElement.querySelectorAll('.param-control:not(.hidden)').forEach(c => c.classList.add('hidden'));
            if (isHidden) control.classList.remove('hidden');
        } else if (actionTarget.dataset.action === 'reset') {
            const paramName = wrapper.dataset.paramName;
            const definition = MODEL_PARAMETER_DEFINITIONS[paramName];
            wrapper.querySelector('.param-value').textContent = 'Default';
            wrapper.querySelector('.param-value').classList.remove('custom');
            wrapper.querySelectorAll('input, select, textarea').forEach(input => input.value = definition.default);
        }
    };

    const inputHandler = (e) => {
        const controlTarget = e.target.closest('[data-control]');
        if (!controlTarget) return;
        const wrapper = controlTarget.closest('.param-wrapper');
        if (!wrapper) return;
        
        const valueDisplay = wrapper.querySelector('.param-value');
        const slider = wrapper.querySelector('.param-slider');
        const numberInput = wrapper.querySelector('.param-input');
        
        if (slider && numberInput) {
            if (controlTarget.dataset.control === 'slider') {
                numberInput.value = e.target.value;
            } else {
                slider.value = e.target.value;
            }
        }
        valueDisplay.textContent = e.target.value;
        valueDisplay.classList.add('custom');
    };

    containerElement.addEventListener('click', clickHandler);
    containerElement.addEventListener('input', inputHandler);

    // --- Public API ---
    return {
        getValues: () => {
            const values = {};
            containerElement.querySelectorAll('.param-wrapper').forEach(wrapper => {
                const paramName = wrapper.dataset.paramName;
                if (wrapper.querySelector('.param-value.custom')) {
                    const input = wrapper.querySelector('[data-control="input"], .param-input-full');
                    if (input) {
                        const def = MODEL_PARAMETER_DEFINITIONS[paramName];
                        values[paramName] = (def.type === 'range' || def.type === 'number') ? parseFloat(input.value) : input.value;
                    }
                }
            });
            return values;
        },
        destroy: () => {
            containerElement.removeEventListener('click', clickHandler);
            containerElement.removeEventListener('input', inputHandler);
            containerElement.innerHTML = '';
        }
    };
}