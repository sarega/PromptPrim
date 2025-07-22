// src/js/modules/user/user.service.js

import { stateManager } from "../../core/core.state.js";

const USER_SETTINGS_KEY = 'promptPrimUserSettings_v1';
let currentUserSettings = null;


const defaultUserSettings = {
  userProfile: {
    userId: `user_${Date.now()}`,
    userName: "New User",
    plan: "free",
    userCredits: 1000000
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
        modelIds: ["openai/gpt-4o", "anthropic/claude-4-sonnet", "google/gemma-3-27b-it"]
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
            let needsSave = false;

            // [MIGRATION] Ensure top-level default objects exist if they are missing
            for (const key in defaultUserSettings) {
                if (!currentUserSettings[key]) {
                    currentUserSettings[key] = defaultUserSettings[key];
                    needsSave = true;
                }
            }
            
            // [MIGRATION] Handle old 'credits' property -> 'userCredits'
            const profile = currentUserSettings.userProfile;
            if (profile && profile.credits !== undefined) {
                console.log("Migrating 'credits' to 'userCredits'.");
                profile.userCredits = profile.credits;
                delete profile.credits;
                needsSave = true;
            }

            // [DEFINITIVE FIX for Safari/Testing]
            // If credits are invalid, zero, or the old default of 50k, reset to the new default.
            if (!profile || typeof profile.userCredits !== 'number' || profile.userCredits <= 0 || profile.userCredits === 50000) {
                console.warn("User profile or credits are invalid/stale. Resetting to new default for testing.");
                currentUserSettings.userProfile = { 
                    ...defaultUserSettings.userProfile,
                    ...(profile || {}),
                    userCredits: defaultUserSettings.userProfile.userCredits
                };
                needsSave = true;
            }

            if (needsSave) saveUserSettings();
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

export function getCurrentUserProfile() {
    return currentUserSettings?.userProfile || {};
}
export function saveUserSettings() {
    if (currentUserSettings) {
        localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(currentUserSettings));
        stateManager.bus.publish('user:settingsUpdated', currentUserSettings);
    }
}


const modelPrices = {
    "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.60 },
    "google/gemma-3-27b-it": { prompt: 0.20, completion: 0.20 },
    "anthropic/claude-3.5-sonnet": { prompt: 3.00, completion: 15.00 },
    "meta-llama/llama-3.1-8b-instruct": { prompt: 0.20, completion: 0.20 },
    "default": { prompt: 0.50, completion: 1.50 } // ราคาเริ่มต้นสำหรับ Model ที่ไม่มีในลิสต์
};


export function burnCreditsForUsage(usage, modelId) {
    if (!currentUserSettings || !usage || !modelId) return;
    
    // [FIX] แก้ไขให้ทำงานกับ userProfile object โดยตรง
    const profile = currentUserSettings.userProfile;
    if (profile.plan === 'free' && profile.userCredits <= 0) return;

    const prices = modelPrices[modelId] || modelPrices.default;
    const promptCost = (usage.prompt_tokens / 1000000) * prices.prompt;
    const completionCost = (usage.completion_tokens / 1000000) * prices.completion;
    const costWithMarkup = (promptCost + completionCost) * 2.5;
    const creditsToBurn = Math.ceil(costWithMarkup * 1000000);

    console.log(`🔥 Burning ${creditsToBurn.toLocaleString()} credits for model ${modelId}.`);
    
    // [FIX] แก้ไขให้หักเครดิตจากตำแหน่งที่ถูกต้อง
    profile.userCredits -= creditsToBurn;
    saveUserSettings(); // บันทึกการเปลี่ยนแปลงทั้งหมด
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