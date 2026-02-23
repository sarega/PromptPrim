// src/js/modules/kieai/kieai.handlers.js

import { stateManager } from '../../core/core.state.js';
import * as KieAIService from './kieai.service.js';
// Import the Suno music API service.  This module provides helpers for
// generating music tracks and polling for results.
import * as SunoService from '../suno/suno.service.js';
import { showCustomAlert } from '../../core/core.ui.js';

// [✅ FIXED: Model Definitions ตามเอกสาร Wan และสมมติฐานสำหรับ Wan 2.5]
export const KieAI_MODELS = [
    // Wan 2.6 models - Latest video generation models
    { id: 'video/wan-2-6-text-to-video',  name: 'Wan 2.6 T2V',          type: 'video', modelApiId: 'wan/2-6-text-to-video' },
    { id: 'video/wan-2-6-image-to-video', name: 'Wan 2.6 I2V',          type: 'video', modelApiId: 'wan/2-6-image-to-video' },
    { id: 'video/wan-2-6-video-to-video', name: 'Wan 2.6 V2V',          type: 'video', modelApiId: 'wan/2-6-video-to-video' },
    // Model ID สำหรับ UI → Model ID ที่ API ต้องการ
    { id: 'video/wan2.5-text-to-video',  name: 'WAN 2.5 T2V',          type: 'video', modelApiId: 'wan/2-5-text-to-video' },
    { id: 'video/wan2.5-image-to-video', name: 'WAN 2.5 I2V',          type: 'video', modelApiId: 'wan/2-5-image-to-video' },
    // Seedance 1.0 models (Pro/Lite, Text-to-Video and Image-to-Video)
    { id: 'video/v1-pro-text-to-video',   name: 'Seedance V1 Pro T2V',  type: 'video', modelApiId: 'bytedance/v1-pro-text-to-video' },
    { id: 'video/v1-lite-text-to-video',  name: 'Seedance V1 Lite T2V', type: 'video', modelApiId: 'bytedance/v1-lite-text-to-video' },
    { id: 'video/v1-pro-image-to-video',  name: 'Seedance V1 Pro I2V',  type: 'video', modelApiId: 'bytedance/v1-pro-image-to-video' },
    { id: 'video/v1-lite-image-to-video', name: 'Seedance V1 Lite I2V', type: 'video', modelApiId: 'bytedance/v1-lite-image-to-video' },
    { id: 'video/seedance-1-5-pro-text-to-video',  name: 'Seedance 1.5 Pro T2V', type: 'video', modelApiId: 'bytedance/seedance-1.5-pro' },
    { id: 'video/seedance-1-5-pro-image-to-video', name: 'Seedance 1.5 Pro I2V', type: 'video', modelApiId: 'bytedance/seedance-1.5-pro' },

    
    // ==== Seedream (Image) Models ====
    // Seedream models use the unified Market createTask endpoint.
    { id: 'image/seedream4.0-text-to-image', name: 'Seedream 4.0 T2I', type: 'image', modelApiId: 'bytedance/seedream-v4-text-to-image' },
    { id: 'image/seedream4.5-text-to-image', name: 'Seedream 4.5 T2I', type: 'image', modelApiId: 'seedream/4.5-text-to-image' },
    { id: 'image/seedream4-edit', name: 'Seedream V4 Edit', type: 'image', modelApiId: 'bytedance/seedream-v4-edit' },
    { id: 'image/seedream4.5-edit', name: 'Seedream 4.5 Edit', type: 'image', modelApiId: 'seedream/4.5-edit' },

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
    'wan/2-6-text-to-video': {
        // WAN 2.6 text-to-video supports 5, 10, or 15 second durations
        defaults: { duration: 5, resolution: '1080p' },
        limits:   { duration: [5, 10, 15], resolution: ['720p', '1080p'] },
    },
    'wan/2-6-image-to-video': {
        // WAN 2.6 image-to-video supports 5, 10, or 15 second durations
        defaults: { duration: 5, resolution: '1080p' },
        limits:   { duration: [5, 10, 15], resolution: ['720p', '1080p'] },
        requires: ['image_urls'],
    },
    'wan/2-6-video-to-video': {
        // WAN 2.6 video-to-video supports 5 or 10 second durations (not 15)
        defaults: { duration: 5, resolution: '1080p' },
        limits:   { duration: [5, 10], resolution: ['720p', '1080p'] },
        requires: ['video_urls'],
    },
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
    'bytedance/seedance-1.5-pro': {
        // Seedance 1.5 Pro supports 4/8/12s and 480p/720p/1080p, plus aspect ratio and optional audio/fixed_lens.
        defaults: { duration: 4, resolution: '720p', aspect_ratio: '16:9', fixed_lens: false, generate_audio: false },
        limits: {
            duration: [4, 8, 12],
            resolution: ['480p', '720p', '1080p'],
            aspect_ratio: ['16:9', '21:9', '4:3', '3:4', '1:1', '4:5', '5:4', '9:16', '2:3', '3:2']
        }
    },

    // ==== Seedream V4 Text-to-Image ====
    'bytedance/seedream-v4-text-to-image': {
        defaults: { image_size: 'square_hd', image_resolution: '1K' },
        limits: {
            image_size: ['square', 'square_hd', 'portrait_4_3', 'portrait_3_2', 'portrait_16_9',
                         'landscape_4_3', 'landscape_3_2', 'landscape_16_9', 'landscape_21_9'],
            image_resolution: ['1K', '2K', '4K']
        }
    },

    // ==== Seedream 4.5 Text-to-Image ====
    'seedream/4.5-text-to-image': {
        defaults: { aspect_ratio: '1:1', quality: 'basic' },
        limits: {
            aspect_ratio: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'],
            quality: ['basic', 'high']
        }
    },
    
    // ==== Seedream V4 Edit (Image-to-Image) ====
    'bytedance/seedream-v4-edit': {
        defaults: { image_size: 'square_hd', image_resolution: '1K', max_images: 1 },
        limits:   {
            image_size: ['square', 'square_hd', 'portrait_4_3', 'portrait_3_2', 'portrait_16_9',
                         'landscape_4_3', 'landscape_3_2', 'landscape_16_9', 'landscape_21_9'],
            image_resolution: ['1K', '2K', '4K'],
            max_images: [1, 2, 3, 4, 5, 6]
        },
        // Requires at least one image URL (up to 10) for edit mode.
        requires: ['image_urls'],
    },

    // ==== Seedream 4.5 Edit (Image-to-Image) ====
    'seedream/4.5-edit': {
        defaults: { aspect_ratio: '1:1', quality: 'basic', max_images: 1 },
        limits:   {
            aspect_ratio: ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'],
            quality: ['basic', 'high'], // basic = 2K, high = 4K
            max_images: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
        },
        // Requires at least one image (up to 14), each <= 10MB
        requires: ['image_urls'],
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
        fixed_lens,
        generate_audio,
        enable_safety_checker,
        enableSafetyChecker,
                // Image-specific parameters
        image_size,
        image_resolution,
        max_images,
        aspect_ratio,
        quality,
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

        const isImage =
            modelId?.toLowerCase().startsWith('image/') ||
            (modelInfo && modelInfo.type === 'image');


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

        
        // --- Handle Image Generation (Seedream via Market createTask) ---
        if (isImage) {
            // Build input payload for Seedream models.
            // Seedream4.0 expects: prompt, image_size, image_resolution, max_images.
            // Seedream4.5 expects: prompt, aspect_ratio, quality.
            const registry = MODEL_REGISTRY[modelInfo.modelApiId] || {};
            const defaults = registry.defaults || {};

            const inputPayload = { prompt };

            if (modelInfo.modelApiId === 'bytedance/seedream-v4-text-to-image') {
                inputPayload.image_size = (image_size || defaults.image_size || 'square_hd');
                inputPayload.image_resolution = (image_resolution || defaults.image_resolution || '1K');
                inputPayload.max_images = Number(max_images || defaults.max_images || 1);
            } else if (modelInfo.modelApiId === 'seedream/4.5-text-to-image') {
                inputPayload.aspect_ratio = (aspect_ratio || defaults.aspect_ratio || '1:1');
                inputPayload.quality = (quality || defaults.quality || 'basic');
            } else if (modelInfo.modelApiId === 'bytedance/seedream-v4-edit') {
                // Seedream V4 Edit (I2I): requires image_urls[] (max 10). Optionally upload local Files via File Upload API.
                let urls = [];
                const providedUrls = params.image_urls || params.imageUrls || null;
                const providedFiles = params.image_files || params.imageFiles || null;

                // Upload local files if provided (preferred)
                if (providedFiles && (providedFiles instanceof FileList || Array.isArray(providedFiles))) {
                    const filesArr = Array.from(providedFiles);
                    if (filesArr.length < 1) throw new Error('Seedream V4 Edit requires at least 1 image.');
                    if (filesArr.length > 10) throw new Error('Seedream V4 Edit supports up to 10 images.');
                    for (const f of filesArr) {
                        if (!(f instanceof File)) continue;
                        if (f.size > 10 * 1024 * 1024) throw new Error('Each image must be <= 10MB.');
                        const okType = ['image/jpeg','image/png','image/webp'].includes(f.type);
                        if (!okType) throw new Error('Supported formats: JPEG, PNG, WEBP.');
                        const u = await KieAIService.uploadFileStream(f, 'seedream-edit');
                        urls.push(u);
                    }
                } else if (Array.isArray(providedUrls)) {
                    urls = providedUrls.filter(Boolean);
                }

                if (!urls.length) throw new Error('Seedream V4 Edit requires image_urls (or image_files).');

                inputPayload.image_urls = urls;
                inputPayload.image_size = (image_size || defaults.image_size || 'square_hd');
                inputPayload.image_resolution = (image_resolution || defaults.image_resolution || '1K');
                inputPayload.max_images = Number(max_images || defaults.max_images || 1);
                if (seed !== undefined && seed !== null && seed !== -1) {
                    inputPayload.seed = Number(seed);
                }
            } else if (modelInfo.modelApiId === 'seedream/4.5-edit') {
                // Seedream 4.5 Edit (I2I): requires image_urls[] (max 14). Upload local Files via File Upload API.
                let urls = [];
                const providedUrls = params.image_urls || params.imageUrls || null;
                const providedFiles = params.image_files || params.imageFiles || null;

                // Upload local files if provided (preferred)
                if (providedFiles && (providedFiles instanceof FileList || Array.isArray(providedFiles))) {
                    const filesArr = Array.from(providedFiles);
                    if (filesArr.length < 1) throw new Error('Seedream 4.5 Edit requires at least 1 image.');
                    if (filesArr.length > 14) throw new Error('Seedream 4.5 Edit supports up to 14 images.');
                    for (const f of filesArr) {
                        if (!(f instanceof File)) continue;
                        if (f.size > 10 * 1024 * 1024) throw new Error('Each image must be <= 10MB.');
                        const okType = ['image/jpeg','image/png','image/webp'].includes(f.type);
                        if (!okType) throw new Error('Supported formats: JPEG, PNG, WEBP.');
                        const u = await KieAIService.uploadFileStream(f, 'seedream-4.5-edit');
                        urls.push(u);
                    }
                } else if (Array.isArray(providedUrls)) {
                    urls = providedUrls.filter(Boolean);
                }

                if (!urls.length) throw new Error('Seedream 4.5 Edit requires image_urls (or image_files).');

                inputPayload.image_urls = urls;
                inputPayload.aspect_ratio = (aspect_ratio || defaults.aspect_ratio || '1:1');
                inputPayload.quality = (quality || defaults.quality || 'basic'); // basic=2K, high=4K
                if (seed !== undefined && seed !== null && seed !== -1) {
                    inputPayload.seed = Number(seed);
                }
            } else {
                // Fallback: pass-through common fields if present
                if (image_size) inputPayload.image_size = image_size;
                if (image_resolution) inputPayload.image_resolution = image_resolution;
                if (max_images !== undefined) inputPayload.max_images = Number(max_images);
                if (aspect_ratio) inputPayload.aspect_ratio = aspect_ratio;
                if (quality) inputPayload.quality = quality;
            }

            const imageResult = await KieAIService.executeGenerationTask(
                modelInfo.modelApiId,
                inputPayload,
                (message) => stateManager.bus.publish('kieai:statusUpdate', { status: 'loading', message }),
                { taskContext: {} },
            );

            stateManager.bus.publish('kieai:statusUpdate', { status: 'success', message: 'Image generation complete!' });
            
            // Publish image result in the same format as video results so PhotoStudioWorkspace can display it
            stateManager.bus.publish('kieai:newResult', {
                id: imageResult.taskId,
                type: 'image',
                prompt,
                url: imageResult.url,
                resultJson: imageResult.resultJson,
            });
            
            return imageResult;
        }

        // --- Handle Video Generation (WAN and Seedance) ---
        const isWan25 = modelId.includes('wan2.5');
        const isWan26 = modelId.includes('wan-2-6');
        const isWan = isWan25 || isWan26;
        // detect any image-to-video model (Wan or Seedance) but never treat an
        // audio model as I2V.  This prevents errors requiring image URLs for
        // music generation tasks.
        const isI2V = !isAudio && modelId.includes('image-to-video');
        // detect video-to-video models (Wan 2.6 only)
        const isV2V = !isAudio && modelId.includes('video-to-video');
        // detect any Seedance V1 model (both T2V and I2V)
        const isSeedanceV1 = modelId.includes('v1-pro') || modelId.includes('v1-lite');
        const isSeedance15Pro = modelInfo?.modelApiId === 'bytedance/seedance-1.5-pro' || modelId.includes('seedance-1-5-pro');

        // Build base input payload for video
        const videoPayload = {
            prompt: prompt,
            resolution: String(resolution) || '720p',
            duration: String(duration) || '5',
        };
        
        // Only add seed for models that support it (not Wan 2.6)
        if (!isWan26 && !isSeedance15Pro) {
            videoPayload.seed = Number(seed) || -1;
        }
        
        // aspect_ratio only applies to text-to-video models
        if (!isI2V && !isV2V) {
            videoPayload.aspect_ratio = params.aspect_ratio || '16:9';
        }

        // 1. Handle Image URL for I2V models
        if (isI2V) {
            const urlToUse = image_url_input?.trim();
            if (!urlToUse || !urlToUse.startsWith('http')) {
                throw new Error('I2V requires a valid public image URL.');
            }
            
            // Wan 2.6 uses image_urls array; Seedance 1.5 Pro uses input_urls (0-2 refs); older models use image_url
            if (isWan26) {
                videoPayload.image_urls = [urlToUse];
            } else if (isSeedance15Pro) {
                videoPayload.input_urls = [urlToUse];
            } else {
                videoPayload.image_url = urlToUse;
            }
        }
        
        // 2. Handle Video URL for V2V models (Wan 2.6 only)
        if (isV2V) {
            const videoUrlToUse = params.video_url_input?.trim();
            if (!videoUrlToUse || !videoUrlToUse.startsWith('http')) {
                throw new Error('V2V requires a valid public video URL.');
            }
            videoPayload.video_urls = [videoUrlToUse];
        }

        // Seedance 1.5 Pro optionally accepts reference images via input_urls (up to 2).
        if (isSeedance15Pro) {
            const referenceUrls = [];
            const explicitUrls = Array.isArray(params.input_urls)
                ? params.input_urls
                : (Array.isArray(params.image_urls) ? params.image_urls : null);
            if (explicitUrls) {
                explicitUrls.forEach((u) => {
                    const value = String(u || '').trim();
                    if (value && value.startsWith('http')) referenceUrls.push(value);
                });
            } else {
                const singleImageUrl = String(image_url_input || params.image_url || '').trim();
                if (singleImageUrl && singleImageUrl.startsWith('http')) referenceUrls.push(singleImageUrl);
            }
            if (referenceUrls.length > 0) {
                videoPayload.input_urls = referenceUrls.slice(0, 2);
            }
        }
        
        // 3. Add model-specific parameters
        if (isWan25) {
            if (negative_prompt) videoPayload.negative_prompt = negative_prompt;
            videoPayload.enable_prompt_expansion = enable_prompt_expansion || false;
        }
        // Wan 2.6 models don't support negative_prompt or enable_prompt_expansion
        // They have simpler parameters (just prompt, duration, resolution, and media URLs)
        
        // For Seedance models (Pro and Lite, both T2V and I2V) include camera and safety flags
        if (isSeedanceV1) {
            videoPayload.camera_fixed = camera_fixed || false;
            // The safety checker is always enabled by default; allow override via UI
            const esc = (enable_safety_checker !== undefined) ? enable_safety_checker : (enableSafetyChecker !== undefined ? enableSafetyChecker : undefined);
            videoPayload.enable_safety_checker = esc !== undefined ? esc : true;
        }
        if (isSeedance15Pro) {
            videoPayload.fixed_lens = fixed_lens === true;
            videoPayload.generate_audio = generate_audio === true;
        }

        // 4. Call Service with context for dynamic polling
        const result = await KieAIService.executeGenerationTask(
            modelInfo.modelApiId,
            videoPayload,
            (message) => stateManager.bus.publish('kieai:statusUpdate', { status: 'loading', message }),
            {
                taskContext: {
                    // Default to 5 seconds when unspecified. Wan 2.6 supports 5, 10, 15s; older models 5 or 10s.
                    durationSec: Number(duration) || Number(params.duration) || 5,
                    resolution: String(resolution) || '720p',
                },
            },
        );

        stateManager.bus.publish('kieai:statusUpdate', { status: 'success', message: 'Generation Complete!' });
        
        // 5. Publish Result
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
