// src/js/modules/kieai/kieai.handlers.js

import { stateManager } from '../../core/core.state.js';
import * as KieAIService from './kieai.service.js';
// Import the Suno music API service.  This module provides helpers for
// generating music tracks and polling for results.
import * as SunoService from '../suno/suno.service.js';
import { showCustomAlert } from '../../core/core.ui.js';

// [✅ FIXED: Model Definitions ตามเอกสาร Wan และสมมติฐานสำหรับ Wan 2.5]
export const KieAI_MODELS = [
    // Model ID สำหรับ UI → Model ID ที่ API ต้องการ
    { id: 'video/wan2.5-text-to-video',  name: 'WAN 2.5 T2V',          type: 'video', modelApiId: 'wan/2-5-text-to-video' },
    { id: 'video/wan2.5-image-to-video', name: 'WAN 2.5 I2V',          type: 'video', modelApiId: 'wan/2-5-image-to-video' },
    // Seedance 1.0 models (Pro/Lite, Text-to-Video and Image-to-Video)
    { id: 'video/v1-pro-text-to-video',   name: 'Seedance V1 Pro T2V',  type: 'video', modelApiId: 'bytedance/v1-pro-text-to-video' },
    { id: 'video/v1-lite-text-to-video',  name: 'Seedance V1 Lite T2V', type: 'video', modelApiId: 'bytedance/v1-lite-text-to-video' },
    { id: 'video/v1-pro-image-to-video',  name: 'Seedance V1 Pro I2V',  type: 'video', modelApiId: 'bytedance/v1-pro-image-to-video' },
    { id: 'video/v1-lite-image-to-video', name: 'Seedance V1 Lite I2V', type: 'video', modelApiId: 'bytedance/v1-lite-image-to-video' },

    // ==== Suno (Music) Models ==== 
    // These models use the Suno API to generate audio tracks from text prompts.
    // Each entry specifies the model version to use (e.g. V3_5, V4_5, V5).  The
    // modelApiId field stores the version so that handlers can access it.
    { id: 'audio/suno-v3_5-text-to-music',  name: 'Suno V3.5 T2M',  type: 'audio', modelApiId: 'suno/v3_5-text-to-music' },
    { id: 'audio/suno-v4-text-to-music',    name: 'Suno V4 T2M',    type: 'audio', modelApiId: 'suno/v4-text-to-music' },
    { id: 'audio/suno-v4_5-text-to-music',  name: 'Suno V4.5 T2M',  type: 'audio', modelApiId: 'suno/v4_5-text-to-music' },
    { id: 'audio/suno-v4_5plus-text-to-music', name: 'Suno V4.5+ T2M', type: 'audio', modelApiId: 'suno/v4_5plus-text-to-music' },
    { id: 'audio/suno-v5-text-to-music',    name: 'Suno V5 T2M',    type: 'audio', modelApiId: 'suno/v5-text-to-music' },
];

// Registry defining defaults and parameter limits per model endpoint
export const MODEL_REGISTRY = {
    'wan/2-5-text-to-video': {
        // WAN 2.5 models support only 5 or 10 second durations【216777337928515†L37-L41】.
        defaults: { duration: 5, resolution: '720p', aspect_ratio: '16:9' },
        limits:   { duration: [5, 10], resolution: ['720p', '1080p'] },
    },
    'wan/2-5-image-to-video': {
        // Image‑to‑video WAN models also accept only 5 or 10 second durations【216777337928515†L37-L41】.
        defaults: { duration: 5, resolution: '720p' },
        limits:   { duration: [5, 10], resolution: ['720p', '1080p'] },
        requires: ['image_url'],
    },
    'bytedance/v1-pro-text-to-video': {
        // Seedance V1 Pro allows 5 or 10 second videos【584409875813116†L82-L87】.
        defaults: { duration: 5, resolution: '1080p', camera_fixed: false, enable_safety_checker: true },
        limits:   { duration: [5, 10], resolution: ['720p', '1080p'] },
    },
    'bytedance/v1-lite-text-to-video': {
        // Seedance V1 Lite also supports 5 or 10 second durations; default to 5.
        defaults: { duration: 5, resolution: '720p', camera_fixed: true, enable_safety_checker: true },
        limits:   { duration: [5, 10], resolution: ['720p'] },
    },
    // Seedance 1.0 Pro Image-to-Video: requires image_url, optional end_image_url (not yet supported)
    'bytedance/v1-pro-image-to-video': {
        defaults: { duration: 5, resolution: '720p', camera_fixed: false, enable_safety_checker: true, seed: -1 },
        limits:   { duration: [5, 10], resolution: ['480p', '720p', '1080p'] },
        requires: ['image_url'],
    },
    // Seedance 1.0 Lite Image-to-Video: requires image_url
    'bytedance/v1-lite-image-to-video': {
        defaults: { duration: 5, resolution: '720p', camera_fixed: false, enable_safety_checker: true, seed: -1 },
        limits:   { duration: [5, 10], resolution: ['480p', '720p', '1080p'] },
        requires: ['image_url'],
    },

    // ==== Suno Model Registry ====
    // Each Suno model defines default values for the music generation parameters.  The
    // `model` property indicates the version of the Suno API to use.  No limits
    // are enforced for string parameters in this registry.
    'suno/v3_5-text-to-music': {
        defaults: { customMode: false, instrumental: false, model: 'V3_5' },
        limits:   {},
    },
    'suno/v4-text-to-music': {
        defaults: { customMode: false, instrumental: false, model: 'V4' },
        limits:   {},
    },
    'suno/v4_5-text-to-music': {
        defaults: { customMode: false, instrumental: false, model: 'V4_5' },
        limits:   {},
    },
    'suno/v4_5plus-text-to-music': {
        defaults: { customMode: false, instrumental: false, model: 'V4_5PLUS' },
        limits:   {},
    },
    'suno/v5-text-to-music': {
        defaults: { customMode: false, instrumental: false, model: 'V5' },
        limits:   {},
    },
};

/**
 * Get default parameter values for a given model API ID.
 * @param {string} modelApiId
 * @returns {object} Defaults object or empty object if not defined
 */
export function getModelDefaults(modelApiId) {
    return MODEL_REGISTRY[modelApiId]?.defaults ?? {};
}

/**
 * Get parameter limit lists for a given model API ID.
 * @param {string} modelApiId
 * @returns {object} Limits object or empty object if not defined
 */
export function getModelLimits(modelApiId) {
    return MODEL_REGISTRY[modelApiId]?.limits ?? {};
}

export function getKieAiModels() {
    // Return all defined models (video and audio).  By not filtering on type, we
    // include Suno audio models in the options list for the Studio UI.  If new
    // model types are added (e.g. image), you may choose to filter those out
    // here.
    return KieAI_MODELS;
}


/**
 * Main handler to process a generation request from the Studio UI.
 * @param {object} params - Parameters from the React Component.
 */
export async function handleGenerationRequest(params) {
    const {
        modelId,
        prompt,
        duration,
        resolution,
        seed,
        image_url_input, // Public URL Input from the form
        negative_prompt,
        enable_prompt_expansion,
        camera_fixed,
        enable_safety_checker,
        // Audio-specific parameters
        customMode,
        instrumental,
        model,
        style,
        title,
        negativeTags,
        callBackUrl,
    } = params;
    
        const modelInfo = KieAI_MODELS.find(m => m.id === modelId);
        // Determine whether this request targets an audio model.  We treat
        // anything containing the substring 'suno' or starting with 'audio/' as
        // an audio task even if the model definition is missing.  Fall back to
        // the model's declared type when available.  This prevents video
        // handlers from misclassifying audio models and requiring an image URL.
        const isAudio =
            modelId?.toLowerCase().includes('suno') ||
            modelId?.toLowerCase().startsWith('audio/') ||
            (modelInfo && modelInfo.type === 'audio');

        // If the model definition is missing, warn and return (except for audio, which we still handle).
        if (!modelInfo && !isAudio) {
            showCustomAlert(`Model ID ${modelId} not found in handler mapping.`, "Configuration Error");
            return;
        }

    stateManager.bus.publish('kieai:statusUpdate', { status: 'loading', message: 'Submitting task...' });
    
    try {
        // --- Handle Suno Music Generation ---
        if (isAudio) {
            // Build input payload for music generation.  Required fields include
            // `prompt`, `customMode`, `instrumental` and `model`【902144609054001†L192-L201】.  Optional fields
            // include `style`, `title`, `negativeTags` and `callBackUrl`.
            // Determine the default model version from the modelApiId.  The API ID
            // format is 'suno/<version>-text-to-music', so we split on '/' and '-'
            // to obtain the version segment (e.g. 'v3_5') and then uppercase it
            // (e.g. 'V3_5').  If the UI supplied a model value, use that instead.
            // Determine the default Suno model version.  If modelInfo is not
            // defined (e.g. custom audio model), default to 'V3_5'.  The API ID
            // format is 'suno/<version>-text-to-music'.  When modelInfo is
            // available, extract the version; otherwise fall back to a sensible
            // default.  Uppercase the version string for the API.
            let versionSegment;
            if (modelInfo?.modelApiId) {
                versionSegment = (modelInfo.modelApiId.split('/')[1] || 'v3_5').split('-')[0];
            } else {
                versionSegment = 'v3_5';
            }
            const defaultVersion = versionSegment.toUpperCase();
            const musicPayload = {
                prompt: prompt,
                customMode: customMode || false,
                instrumental: instrumental || false,
                model: model || defaultVersion,
            };
            if (style) musicPayload.style = style;
            if (title) musicPayload.title = title;
            if (negativeTags) musicPayload.negativeTags = negativeTags;
            if (callBackUrl) musicPayload.callBackUrl = callBackUrl;

            // If the user did not provide a callback URL, supply a default one.
            // The Suno API requires callBackUrl for all music generation requests【624622856951812†L365-L373】.
            if (!musicPayload.callBackUrl) {
                musicPayload.callBackUrl = 'https://example.com/callback';
            }
            const musicResult = await SunoService.executeMusicTask(
                musicPayload,
                (message) => stateManager.bus.publish('kieai:statusUpdate', { status: 'loading', message }),
                {},
            );

            // Publish success status and result
            stateManager.bus.publish('kieai:statusUpdate', { status: 'success', message: 'Music generation complete!' });
            // Publish audio result with additional fields.  Besides the MP3 URL
            // (`audioUrl`) and title, include the `audioId` returned from
            // Suno so that follow‑up tasks such as WAV conversion, vocal
            // separation, and MIDI generation can reference it.  Also
            // initialise `wavUrl` and `midiData` as null.
            stateManager.bus.publish('kieai:newResult', {
                id: musicResult.taskId,
                type: 'audio',
                prompt,
                // Provide the primary URL for playing the MP3 and a separate
                // stream URL when available.  Many clients rely on `url` to
                // display and download the MP3; `streamUrl` can be used as a
                // fallback when `audioUrl` is not set.  These are derived
                // directly from the API response in executeMusicTask().
                url: musicResult.audioUrl,
                streamUrl: musicResult.streamAudioUrl,
                title: musicResult.title,
                audioId: musicResult.audioId,
                wavUrl: null,
                midiData: null,
            });
            return;
        }

        const isWan25 = modelId.includes('wan2.5');
        // detect any image-to-video model (Wan or Seedance) but never treat an
        // audio model as I2V.  This prevents errors requiring image URLs for
        // music generation tasks.
        const isI2V = !isAudio && modelId.includes('image-to-video');
        // detect any Seedance V1 model (both T2V and I2V)
        const isSeedance = modelId.includes('v1-pro') || modelId.includes('v1-lite');

        // Build base input payload
        const inputPayload = {
            prompt: prompt,
            resolution: String(resolution) || '720p',
            duration: String(duration) || '5',
            seed: Number(seed) || -1,
        };
        // aspect_ratio only applies to text-to-video models
        if (!isI2V) {
            inputPayload.aspect_ratio = params.aspect_ratio || '16:9';
        }

        // 1. Handle Image URL for any I2V model (Wan or Seedance)
        if (isI2V) {
            const urlToUse = image_url_input?.trim();
            if (!urlToUse || !urlToUse.startsWith('http')) {
                // Throw error to prompt user to provide a proper image URL
                throw new Error('I2V requires a valid public image URL.');
            }
            inputPayload.image_url = urlToUse;
        }
        
        // 2. Add model-specific parameters
        if (isWan25) {
            if (negative_prompt) inputPayload.negative_prompt = negative_prompt;
            inputPayload.enable_prompt_expansion = enable_prompt_expansion || false;
        }
        // For Seedance models (Pro and Lite, both T2V and I2V) include camera and safety flags
        if (isSeedance) {
            inputPayload.camera_fixed = camera_fixed || false;
            // The safety checker is always enabled by default; allow override via UI
            inputPayload.enable_safety_checker = enable_safety_checker !== undefined ? enable_safety_checker : true;
        }

        // 3. Call Service with context for dynamic polling
        const result = await KieAIService.executeGenerationTask(
            modelInfo.modelApiId,
            inputPayload,
            (message) => stateManager.bus.publish('kieai:statusUpdate', { status: 'loading', message }),
            {
                taskContext: {
                    // Default to 5 seconds when unspecified; both T2V and I2V models support only 5 or 10 seconds.
                    durationSec: Number(duration) || Number(params.duration) || 5,
                    resolution: String(resolution) || '720p',
                },
            },
        );

        stateManager.bus.publish('kieai:statusUpdate', { status: 'success', message: 'Generation Complete!' });
        
        // 4. Publish Result
        stateManager.bus.publish('kieai:newResult', {
            id: result.taskId,
            type: 'video', 
            prompt,
            url: result.url,
        });

    } catch (error) {
        const errorMessage = error.message || "An unknown network error occurred.";
        
        console.error(`Kie.ai Generation Error (Task: N/A):`, error);
        
        // [✅ FIX] ปรับปรุง Error Handling ให้แสดงข้อความ API ชัดเจนขึ้น
        if (errorMessage.includes("Image required") || errorMessage.includes("valid public image URL")) {
            showCustomAlert("Please paste a valid public image URL.", "Input Missing");
        } else {
             // แสดง Error ที่มาจาก API Gateway (เช่น Operation not found, Balance)
             showCustomAlert(`API Error: ${errorMessage}`, "Kie.ai Submission Failed");
        }

    } finally {
        // [✅ FIX] ต้องสั่ง reset loading เสมอ
        stateManager.bus.publish('kieai:statusUpdate', { status: 'ready', message: 'Ready' });
    }
}