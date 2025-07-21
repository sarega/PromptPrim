// src/js/modules/user/user.service.js

import { stateManager } from "../../core/core.state.js";

const USER_SETTINGS_KEY = 'promptPrimUserSettings_v1';
let currentUserSettings = null;


const defaultUserSettings = {
  userProfile: {
    userId: `user_${Date.now()}`,
    userName: "New User",
    plan: "free",
    credits: 50000
  },
   appSettings: {
    // [FIX] Added activeModelPreset to the default settings
    activeModelPreset: "top_models", 
    apiKeys: {
      openrouter: "",
      ollamaBaseUrl: "http://localhost:11434"
    },
    preferences: {
      font: "'Sarabun', sans-serif",
      theme: "system",
      language: "en" // 'en' or 'th'
    }
  },
  modelPresets: {
    'free_tier': {
        name: "Free Tier",
        modelIds: ["mistralai/mistral-7b-instruct:free", "google/gemma-2-9b-it:free"]
    },
    'top_models': {
        name: "Top Models",
        modelIds: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemma-3-27b-it"]
    }
  },
  systemAgentDefaults: {
    utilityAgent: {
      model: "google/gemma-3-27b-it",
      // [FIX] แก้ไข typo ตรงนี้
      "systemPrompt": "You are a highly efficient assistant..." 
    },
    summarizationPresets: {
      "Standard": "You are a professional summarizer..."
    }
  }
};

export function initUserSettings() {
    return new Promise((resolve) => {
        const storedSettings = localStorage.getItem(USER_SETTINGS_KEY);
        if (storedSettings) {
            currentUserSettings = JSON.parse(storedSettings);
            // Ensure new properties exist if loading older settings
            if (!currentUserSettings.appSettings) currentUserSettings.appSettings = {};
            if (!currentUserSettings.appSettings.activeModelPreset) {
                currentUserSettings.appSettings.activeModelPreset = 'top_models';
            }
        } else {
            currentUserSettings = defaultUserSettings;
            saveUserSettings();
        }
        console.log("👤 User Settings Initialized:", currentUserSettings);
        stateManager.bus.publish('user:settingsLoaded', currentUserSettings);
        resolve(currentUserSettings);
    });
}
export function getUserSettings() {
    return currentUserSettings;
}

export function saveUserSettings() {
    if (currentUserSettings) {
        localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(currentUserSettings));
        stateManager.bus.publish('user:settingsUpdated', currentUserSettings);
    }
}

// --- Specific Getters and Setters for convenience ---

export function getApiKey() {
    return currentUserSettings?.appSettings?.apiKeys?.openrouter || '';
}

export function getOllamaUrl() {
    return currentUserSettings?.appSettings?.apiKeys?.ollamaBaseUrl || '';
}

export function updateApiSettings({ openrouterKey, ollamaBaseUrl }) {
    if (!currentUserSettings) return;
    if (openrouterKey !== undefined) currentUserSettings.appSettings.apiKeys.openrouter = openrouterKey;
    if (ollamaBaseUrl !== undefined) currentUserSettings.appSettings.apiKeys.ollamaBaseUrl = ollamaBaseUrl;
    saveUserSettings();
}

export function getModelPresets() {
    return currentUserSettings?.modelPresets || {};
}

export function saveModelPresets(presets) {
    if (!currentUserSettings) return;
    currentUserSettings.modelPresets = presets;
    saveUserSettings();
}

// --- [ADD THIS] The missing functions ---
export function getActiveModelPresetKey() {
    return currentUserSettings?.appSettings?.activeModelPreset || 'top_models';
}

export function setActiveModelPreset(presetKey) {
    if (!currentUserSettings) return;
    currentUserSettings.appSettings.activeModelPreset = presetKey;
    saveUserSettings();
}

// /**
//  * Initializes the user profile from LocalStorage or creates a new one.
//  */
// export function initUserProfile() {
//     return new Promise((resolve) => {
//         const storedProfile = localStorage.getItem(USER_PROFILE_KEY);
//         if (storedProfile) {
//             currentUserProfile = JSON.parse(storedProfile);
//         } else {
//             currentUserProfile = defaultUserProfile;
//             saveUserProfile();
//         }
//         console.log("👤 User Profile Initialized:", currentUserProfile);
//         stateManager.bus.publish('user:profileLoaded', currentUserProfile);
//         resolve(currentUserProfile); // ส่งสัญญาณว่าทำงานเสร็จแล้ว
//     });
// }

// /**
//  * Returns the currently loaded user profile object.
//  * @returns {object}
//  */
// export function getCurrentUserProfile() {
//     return currentUserProfile;
// }

// /**
//  * Saves the current user profile state to LocalStorage.
//  */
// export function saveUserProfile() {
//     if (currentUserProfile) {
//         localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(currentUserProfile));
//         stateManager.bus.publish('user:profileUpdated', currentUserProfile);
//     }
// }


// //================ Model Manager UI Functions ===========//

// const modelPrices = {
//     "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.60 },
//     "google/gemma-3-27b-it": { prompt: 0.20, completion: 0.20 },
//     "anthropic/claude-3.5-sonnet": { prompt: 3.00, completion: 15.00 },
//     "meta-llama/llama-3.1-8b-instruct": { prompt: 0.20, completion: 0.20 },
//     "default": { prompt: 0.50, completion: 1.50 } // ราคาเริ่มต้นสำหรับ Model ที่ไม่มีในลิสต์
// };

// /**
//  * Calculates credit cost from API usage and deducts it from the user's profile.
//  * @param {object} usage - The usage object from the API response { prompt_tokens, completion_tokens }.
//  * @param {string} modelId - The ID of the model used for the request.
//  */
// export function burnCreditsForUsage(usage, modelId) {
//     if (!currentUserProfile || !usage || !modelId) return;
//     if (currentUserProfile.plan === 'free' && currentUserProfile.userCredits <= 0) return;

//     const prices = modelPrices[modelId] || modelPrices.default;
    
//     const promptCost = (usage.prompt_tokens / 1000000) * prices.prompt;
//     const completionCost = (usage.completion_tokens / 1000000) * prices.completion;
    
//     const realCostUSD = promptCost + completionCost;
//     const costWithMarkup = realCostUSD * 2.5; // Markup 2.5x
    
//     const creditsToBurn = Math.ceil(costWithMarkup * 1000000);

//     console.log(`🔥 Burning ${creditsToBurn.toLocaleString()} credits for model ${modelId}.`);
//     deductCredits(creditsToBurn);
// }

// /**
//  * Deducts a specified amount of credits from the user's balance.
//  * @param {number} amount - The number of credits to deduct.
//  */
// export function deductCredits(amount) {
//     if (!currentUserProfile) return;
//     currentUserProfile.userCredits -= amount;
//     saveUserProfile();
// }

// /**
//  * A simple getter for the current credit balance.
//  * @returns {number}
//  */
// export function getCredits() {
//     return currentUserProfile?.userCredits || 0;
// }