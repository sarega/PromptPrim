// src/js/react-components/PhotoStudioWorkspace.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { stateManager } from '../core/core.state.js';
import { KieAI_MODELS, getModelDefaults, getModelLimits } from '../modules/kieai/kieai.handlers.js';
import * as KieAIService from '../modules/kieai/kieai.service.js';
import { saveStudioSession, loadStudioSession } from '../modules/studio/studio.sessions.js';
// Import the Suno service to access audio‑specific helpers (WAV and MIDI)
import * as SunoService from '../modules/suno/suno.service.js';
import '../../styles/tw-runtime.css'; 

// ==========================================
// 1. Helper Component: FileDropZone (Drag & Drop UI)
// ==========================================
const FileDropZone = React.memo(({ onFileDrop, imagePreviewUrl, removeImage }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFileDrop(e.dataTransfer.files[0]);
        }
    };
    
    // Fallback: Click to open file dialog
    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileDrop(e.target.files[0]);
        }
    };

    if (imagePreviewUrl) {
        return (
            <div className="tw-relative tw-p-2 tw-bg-slate-600 tw-rounded-lg tw-flex tw-justify-center">
                <img src={imagePreviewUrl} alt="Upload Preview" className="tw-max-h-40 tw-rounded-md tw-shadow-lg" />
                <button 
                    type="button" 
                    onClick={removeImage} 
                    className="tw-absolute tw-top-0 tw-right-0 tw-bg-red-500 hover:tw-bg-red-600 tw-text-white tw-rounded-full tw-w-6 tw-h-6 tw-flex tw-items-center tw-justify-center tw-text-sm"
                >
                    &times;
                </button>
            </div>
        );
    }

    return (
        <label
            htmlFor="i2v-file-upload"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`tw-border-2 tw-border-dashed tw-rounded-lg tw-p-6 tw-text-center tw-cursor-pointer tw-block tw-transition ${isDragging ? 'tw-border-cyan-400 tw-bg-slate-600' : 'tw-border-slate-500 tw-bg-slate-700'}`}
        >
            <input 
                type="file" 
                id="i2v-file-upload" 
                className="tw-hidden" 
                accept="image/*" 
                onChange={handleFileSelect}
            />
            <span className="material-symbols-outlined tw-text-4xl tw-text-gray-400">cloud_upload</span>
            <p className="tw-text-gray-400 tw-text-sm">Drag & drop or click to upload image</p>
        </label>
    );
});

// ==========================================
// 2. Helper Component: Model Specific Inputs
// ==========================================
const renderModelSpecificInputs = (selectedModel, params, setParams, imagePreviewUrl, handleFileDrop, handleRemoveImage) => {
    // Determine the underlying model ID (string) safely.  Use optional chaining
    // so that undefined selections do not cause runtime errors.  If no
    // selection is available, default to an empty string for substring checks.
        const modelId = selectedModel?.id || '';
        // A Wan 2.5 model contains the substring "wan2.5" in its identifier.
        const isWan25 = modelId.includes('wan2.5');
        // Detect audio models exclusively by their `type` property.  Relying on
        // string substrings like 'suno' can lead to false positives if future
        // models happen to include that substring.  The `type` field defined on
        // each model is the authoritative indicator for audio.
        const isAudio = selectedModel?.type === 'audio';
        // Identify any image-to-video model (both Wan and Seedance) by checking
        // for this substring in the model ID.  However, never treat an audio
        // model as image-to-video even if the ID accidentally contains that
        // substring.  This resolves a bug where the UI still requested an
        // image URL when an audio model was selected.
        const isI2V = !isAudio && modelId.includes('image-to-video');
        // Treat all Seedance V1 models (Pro/Lite, T2V or I2V) as Seedance.
        const isSeedance = modelId.includes('v1-pro') || modelId.includes('v1-lite');

    return (
        <>
            {/* Audio models: customMode & instrumental toggles, plus optional style/title */}
            {isAudio && (
                <div className="form-group tw-flex tw-flex-col tw-gap-3">
                    <div className="tw-flex tw-justify-between tw-items-center">
                        <label className="tw-text-sm tw-font-medium tw-text-gray-300">Advanced Custom Mode</label>
                        <input
                            type="checkbox"
                            checked={!!params.customMode}
                            onChange={(e) => setParams(p => ({ ...p, customMode: e.target.checked }))}
                            className="tw-toggle"
                        />
                    </div>
                    <div className="tw-flex tw-justify-between tw-items-center">
                        <label className="tw-text-sm tw-font-medium tw-text-gray-300">Instrumental Only</label>
                        <input
                            type="checkbox"
                            checked={!!params.instrumental}
                            onChange={(e) => setParams(p => ({ ...p, instrumental: e.target.checked }))}
                            className="tw-toggle"
                        />
                    </div>
                    {/* Show Style and Title only in custom mode */}
                    {params.customMode && (
                        <>
                            <div>
                                <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Style (Custom Mode)</label>
                                <input
                                    type="text"
                                    value={params.style || ''}
                                    onChange={(e) => setParams(p => ({ ...p, style: e.target.value }))}
                                    className="tw-w-full tw-p-2 tw-rounded-md tw-bg-slate-600 tw-text-white"
                                    placeholder="e.g., Jazz, Classical"
                                />
                            </div>
                            <div>
                                <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Title (Custom Mode)</label>
                                <input
                                    type="text"
                                    value={params.title || ''}
                                    onChange={(e) => setParams(p => ({ ...p, title: e.target.value }))}
                                    className="tw-w-full tw-p-2 tw-rounded-md tw-bg-slate-600 tw-text-white"
                                    placeholder="Song title"
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Image-to-Video models: require image URL; show upload/URL input */}
            {isI2V && !isAudio && (
                <div className="form-group">
                    <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Initial Frame Image (Public URL or Upload)</label>
                    {/* Input for public image URL */}
                    <input
                        type="text"
                        value={params.image_url_input || ''}
                        onChange={(e) => setParams(p => ({ ...p, image_url_input: e.target.value }))}
                        className="tw-w-full tw-p-2 tw-rounded-md tw-bg-slate-600 tw-text-white tw-mb-3"
                        placeholder="Paste Public Image URL here (e.g., https://example.com/pic.jpg)"
                    />
                    {/* File drop zone is optional for preview; only object URL used for preview */}
                    <FileDropZone
                        onFileDrop={handleFileDrop}
                        imagePreviewUrl={imagePreviewUrl}
                        removeImage={handleRemoveImage}
                    />
                </div>
            )}

            {/* Wan 2.5 Specific Input: Negative Prompt */}
            {isWan25 && !isAudio && (
                <div className="form-group">
                    <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Negative Prompt (Optional)</label>
                    <textarea
                        value={params.negative_prompt || ''}
                        onChange={(e) => setParams(p => ({ ...p, negative_prompt: e.target.value }))}
                        rows="2"
                        className="tw-w-full tw-p-2 tw-rounded-md tw-bg-slate-600 tw-text-white"
                        placeholder="Content to avoid"
                    />
                </div>
            )}

            {/* Wan 2.5 Specific Input: Prompt Expansion Toggle */}
            {isWan25 && !isAudio && (
                <div className="form-group tw-flex tw-justify-between tw-items-center">
                    <label className="tw-text-sm tw-font-medium tw-text-gray-300">Enable Prompt Expansion</label>
                    <input
                        type="checkbox"
                        checked={!!params.enable_prompt_expansion}
                        onChange={(e) => setParams(p => ({ ...p, enable_prompt_expansion: e.target.checked }))}
                        className="tw-toggle" 
                    />
                </div>
            )}

            {/* Seedance Specific Input: Camera Fixed & Safety Checker (video only) */}
            {isSeedance && !isAudio && (
                <>
                    <div className="form-group tw-flex tw-justify-between tw-items-center">
                        <label className="tw-text-sm tw-font-medium tw-text-gray-300">Fixed Camera Position</label>
                        <input
                            type="checkbox"
                            checked={!!params.camera_fixed}
                            onChange={(e) => setParams(p => ({ ...p, camera_fixed: e.target.checked }))}
                            className="tw-toggle" 
                        />
                    </div>
                    <div className="form-group tw-flex tw-justify-between tw-items-center">
                        <label className="tw-text-sm tw-font-medium tw-text-gray-300">Enable Safety Checker</label>
                        <input
                            type="checkbox"
                            checked={params.enable_safety_checker ?? true} 
                            onChange={(e) => setParams(p => ({ ...p, enable_safety_checker: e.target.checked }))}
                            className="tw-toggle" 
                        />
                    </div>
                </>
            )}
        </>
    );
};

// ==========================================
// 3. Main Exported Component: StudioForm
// ==========================================
export const StudioForm = ({ models, onSubmit, status }) => {
    // [Model State - Initialization]
    const initialModelId = models.find(m => m.id.includes('wan2.5-text-to-video'))?.id || models[0]?.id;

    const [selectedId, setSelectedId] = useState(initialModelId);

    const [prompt, setPrompt] = useState('');
    const [params, setParams] = useState({
        resolution: '1080p',
        duration: 5,
        aspect_ratio: '16:9',
        seed: -1,
        enable_safety_checker: true,
        image_url_input: '',
        // Audio-specific defaults
        customMode: false,
        instrumental: false,
        style: '',
        title: '',
        negativeTags: '',
        callBackUrl: '',
    });
    // Limits for duration and resolution based on selected model
    const [limits, setLimits] = useState({ duration: [5, 10], resolution: ['480p', '720p', '1080p'] });

    // Restore form from session when PhotoStudioWorkspace publishes a restore event
    useEffect(() => {
        const unsub = stateManager.bus.subscribe('studio:restoreForm', (form) => {
            if (!form) return;
            // set selected model
            if (form.modelId) {
                setSelectedId(form.modelId);
                const modelInfo = KieAI_MODELS.find((m) => m.id === form.modelId);
                if (modelInfo?.modelApiId) {
                    setLimits(getModelLimits(modelInfo.modelApiId));
                }
            }
            // restore prompt and params
            setPrompt(form.prompt || '');
            if (form.params) {
                setParams((prev) => ({ ...prev, ...form.params }));
            }
        });
        return () => {
            unsub();
        };
    }, []);

    // [File State] Use a single preview state to show the uploaded image locally while uploading
    const [imagePreview, setImagePreview] = useState(null);

    // [Derived State - Guarded Access]
    const selectedModel = useMemo(() => {
        // Prefer the models array passed via props (which includes any custom
        // models) over the static KieAI_MODELS import.  If the selected ID
        // cannot be found (e.g. due to a stale ID), fall back to the first
        // model provided.  This avoids mismatches that can occur if the
        // imported constant and the runtime list diverge.
        return models.find((m) => m.id === selectedId) || models[0];
    }, [selectedId, models]);

    // --- Guard Clause (ป้องกัน undefined crash) ---
    if (!selectedModel) {
        return <p className="tw-text-red-400 tw-p-4">Error: Model data failed to load or initialize.</p>;
    }
    
    // --- Helper Vars ---
        // Detect audio models based solely on the model's `type` property.  This
        // prevents accidental matches on substrings (e.g. 'suno') and ensures that
        // any future audio models are correctly flagged.  `selectedModel` will
        // always be defined because it falls back to the first model in the list.
        const isAudio = selectedModel?.type === 'audio';
        // Determine whether the current selection is an image‑to‑video model.
        // Always return false for audio models even if the selectedId happens
        // to contain the substring 'image-to-video'.  This avoids the bug where
        // audio models were treated as I2V and required an image URL.
        const isI2V = !isAudio && selectedId.includes('image-to-video');
        const isWan25 = selectedId.includes('wan2.5');
        const isSeedance = selectedId.includes('v1-pro') || selectedId.includes('v1-lite');
    const isLoading = status.status === 'loading';
    

    // --- File Handlers (เก็บไว้เป็น No-Op/Display Only) ---
    const handleFileDrop = useCallback(async (file) => {
        // Show a local preview immediately
        const reader = new FileReader();
        reader.onload = async (e) => {
            setImagePreview(e.target.result);
            try {
                // Upload the file to KieAI and get a public URL
                const fileUrl = await KieAIService.uploadFileStream(file, 'images/user-uploads');
                setParams((p) => ({ ...p, image_url_input: fileUrl }));
            } catch (err) {
                alert('Upload failed: ' + (err?.message || 'Unknown error'));
                // Clear the preview and reset the URL input
                setImagePreview(null);
                setParams((p) => ({ ...p, image_url_input: '' }));
            }
        };
        reader.readAsDataURL(file);
    }, []);

    const handleRemoveImage = useCallback(() => {
        // Remove preview and clear the image URL input
        setImagePreview(null);
        setParams((p) => ({ ...p, image_url_input: '' }));
    }, []);


    // --- Submit Logic ---
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!prompt || isLoading) return;
        // For audio tasks, we simply pass audio parameters; no validation on resolution/duration
        if (isAudio) {
            onSubmit({
                modelId: selectedId,
                prompt,
                ...params,
            });
            return;
        }
        // Validation for any I2V model (video)
        if (isI2V && (!params.image_url_input || !params.image_url_input.startsWith('http'))) {
            alert('I2V requires a valid public image URL (e.g., https://example.com/pic.jpg).');
            return;
        }
        // Construct final params: convert resolution/duration/seed to correct types for video models
        const finalParams = {
            resolution: String(params.resolution) || '1080p',
            duration: String(params.duration) || '5',
            seed: Number(params.seed) || -1,
        };
        // Include aspect ratio only if not I2V
        if (!isI2V) {
            finalParams.aspect_ratio = params.aspect_ratio || '16:9';
        }
        // Include image_url for I2V
        if (isI2V) {
            finalParams.image_url = params.image_url_input;
        }
        // Submit with combined params.  Note: spread `params` before `prompt` so that
        // the current prompt overrides any stale prompt value stored inside
        // `params` (e.g. after restoring a session).  See bug fix notes.
        // Do not allow a stale modelId to override the selected model.  Remove
        // modelId from the params object before spreading.  This prevents
        // scenarios where params.modelId (possibly restored from a prior
        // session) would overwrite the currently selected model in the
        // generated request.  See bug fix notes.
        const { modelId: _unusedModelId, ...safeParams } = params;
        onSubmit({
            modelId: selectedId,
            ...safeParams,
            prompt,
            ...finalParams,
        });
    };
    
    // --- Model Switch Handler (Clean up parameters) ---
    const handleModelChange = (e) => {
        const newId = e.target.value;
        const newModel = KieAI_MODELS.find((m) => m.id === newId);

        setSelectedId(newId);
        // Reset image preview
        handleRemoveImage();

        // Determine defaults and limits for the selected model
        const defaults = newModel?.modelApiId ? getModelDefaults(newModel.modelApiId) : {};
        const newLimits = newModel?.modelApiId ? getModelLimits(newModel.modelApiId) : {};
        // Set default params, preserving manual overrides only if still valid
        setParams((prev) => {
            // When switching models, drop any lingering modelId from the
            // parameter state.  If a modelId property remains in params it may
            // override the newly selected model when handleSubmit spreads
            // params over the request body.  We explicitly omit modelId here.
            const { modelId: _ignored, ...rest } = prev || {};
            return {
                ...rest,
                camera_fixed: false,
                enable_safety_checker: true,
                negative_prompt: '',
                enable_prompt_expansion: false,
                image_url_input: '',
                customMode: false,
                instrumental: false,
                style: '',
                title: '',
                negativeTags: '',
                callBackUrl: '',
                ...defaults,
            };
        });
        setLimits(newLimits);
    };
    
    // [Render Sub Components via Memoization]
    const renderSpecificInputs = useMemo(() => {
        return renderModelSpecificInputs(selectedModel, params, setParams, imagePreview, handleFileDrop, handleRemoveImage);
    }, [selectedModel, params, imagePreview, handleFileDrop, handleRemoveImage]);

    const renderResolutionOptions = useMemo(() => {
        // Audio models have no resolution setting
        if (isAudio) return null;
        const availableResolutions = limits.resolution || (isWan25 ? ['720p', '1080p'] : ['480p', '720p', '1080p']);
        return (
            <div className="form-group">
                <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Resolution</label>
                <div className="tw-flex tw-gap-2">
                    {availableResolutions.map(res => (
                        <button
                            key={res}
                            type="button"
                            onClick={() => setParams(p => ({ ...p, resolution: res }))}
                            className={`tw-flex-1 tw-py-1.5 tw-rounded-md tw-text-sm ${params.resolution === res ? 'tw-bg-cyan-500 tw-text-white' : 'tw-bg-slate-600 tw-text-gray-300 hover:tw-bg-slate-500'}`}
                        >
                            {res}
                        </button>
                    ))}
                </div>
            </div>
        );
    }, [isWan25, params.resolution, limits.resolution, isAudio]);

    const renderDurationOptions = useMemo(() => {
        // Audio models have no duration setting
        if (isAudio) return null;
        const durations = limits.duration || [5, 10];
        return (
            <div className="form-group">
                <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Duration (seconds)</label>
                <div className="tw-flex tw-gap-2">
                    {durations.map(dur => (
                        <button
                            key={dur}
                            type="button"
                            onClick={() => setParams(p => ({ ...p, duration: dur }))}
                            className={`tw-flex-1 tw-py-1.5 tw-rounded-md tw-text-sm ${params.duration === dur ? 'tw-bg-cyan-500 tw-text-white' : 'tw-bg-slate-600 tw-text-gray-300 hover:tw-bg-slate-500'}`}
                        >
                            {dur}s
                        </button>
                    ))}
                </div>
            </div>
        );
    }, [params.duration, limits.duration, isAudio]);

    const renderAspectRatioOptions = useMemo(() => {
        // Audio models have no aspect ratio setting
        if (isAudio) return null;
        const options = ['16:9', '21:9', '4:3', '1:1', '3:4', '9:16'];
        return (
            <div className="form-group">
                <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Aspect Ratio</label>
                <select
                    value={params.aspect_ratio || '16:9'}
                    onChange={(e) => setParams(p => ({ ...p, aspect_ratio: e.target.value }))}
                    className="tw-w-full tw-p-2 tw-rounded-md tw-bg-slate-600 tw-text-white"
                >
                    {options.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
                </select>
            </div>
        );
    }, [params.aspect_ratio, isAudio]);

    // --- JSON Debugging ---
    // Provide a toggle to view the fully constructed payload that will be sent
    // to the Kie.ai API or Suno API.  This helps the user verify that the
    // prompt and settings are being packaged correctly.  The JSON shown here
    // mirrors the logic in handleSubmit: for audio models it displays the
    // music payload, and for video/image models it shows the input payload.
    const [showJson, setShowJson] = useState(false);

    /**
     * Construct a debug payload based on the current selection.  This helper
     * replicates the logic in handleSubmit() but does not perform any
     * validation.  It returns an object containing the modelId, prompt, and
     * payload fields that would be sent to the backend.  Use JSON.stringify
     * on the return value to present it to the user.
     */
    const debugPayload = useMemo(() => {
        // Base object always includes the modelId and prompt
        const base = { modelId: selectedId, prompt };
        // Audio (Suno) models use a different payload structure
        if (isAudio) {
            // Determine the version segment from the model API ID (e.g. v4)
            const versionSegment = (selectedModel?.modelApiId?.split('/')?.[1] || '').split('-')[0];
            const defaultVersion = versionSegment ? versionSegment.toUpperCase() : undefined;
            const musicPayload = {
                prompt: prompt,
                customMode: params.customMode || false,
                instrumental: params.instrumental || false,
                model: params.model || defaultVersion,
            };
            if (params.style) musicPayload.style = params.style;
            if (params.title) musicPayload.title = params.title;
            if (params.negativeTags) musicPayload.negativeTags = params.negativeTags;
            if (params.callBackUrl) musicPayload.callBackUrl = params.callBackUrl;
            return { ...base, ...musicPayload };
        }
        // Build video/image payload
        const payload = {
            resolution: String(params.resolution) || (limits.resolution?.[0] || '1080p'),
            duration: String(params.duration) || '5',
            seed: Number(params.seed) || -1,
        };
        // For text-to-video models include aspect ratio
        if (!isI2V) {
            payload.aspect_ratio = params.aspect_ratio || '16:9';
        }
        // For image-to-video models include image_url
        if (isI2V) {
            payload.image_url = params.image_url_input || '';
        }
        // Model-specific extras
        if (isWan25) {
            if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
            payload.enable_prompt_expansion = !!params.enable_prompt_expansion;
        }
        if (isSeedance) {
            payload.camera_fixed = !!params.camera_fixed;
            payload.enable_safety_checker = params.enable_safety_checker !== undefined ? !!params.enable_safety_checker : true;
        }
        return { ...base, ...payload };
    }, [selectedId, prompt, params, isAudio, isI2V, isWan25, isSeedance, limits.resolution, selectedModel?.modelApiId]);
    
    
    // --- Final JSX Return ---
    return (
        <form onSubmit={handleSubmit} className="tw-bg-slate-700 tw-p-4 tw-rounded-lg tw-shadow-lg tw-flex tw-flex-col tw-gap-4">
            <h4 className="tw-text-white tw-font-bold tw-text-lg">Generation Settings</h4>
            
            {/* 1. Model Selector หลัก */}
            <div className="form-group">
                <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Model Endpoint</label>
                <select
                    value={selectedId}
                    onChange={handleModelChange}
                    className="tw-w-full tw-p-2 tw-rounded-md tw-bg-slate-600 tw-text-white"
                >
                    {models.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option> 
                    ))}
                </select>
            </div>
            
            {/* 2. Prompt Input */}
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={(() => {
                    // For audio models, adjust placeholder based on custom mode and instrumental settings.
                    if (isAudio) {
                        if (params.customMode && !params.instrumental) {
                            return 'Enter the full song lyrics here...';
                        }
                        return 'Describe the theme or mood for the song...';
                    }
                    // Video or image models
                    return `Enter prompt for ${selectedModel.name}...`;
                })()}
                rows={5}
                className="tw-w-full tw-p-3 tw-rounded-md tw-bg-slate-600 tw-text-white tw-border tw-border-slate-500 focus:tw-border-cyan-400"
                required
            />
            
            {/* 3. Model Specific Inputs (Negative Prompt, I2V URL Input, Toggles) */}
            {renderSpecificInputs}

            {/* 4. Aspect Ratio & Resolution */}
            <div className="tw-grid tw-grid-cols-2 tw-gap-4">
                {/* For I2V models, skip aspect ratio selection */}
                {!isI2V && renderAspectRatioOptions}
                {renderResolutionOptions}
            </div>

            {/* 5. Duration & Seed */}
            {/* Hide duration and seed for audio models */}
            {!isAudio && (
                <div className="tw-grid tw-grid-cols-2 tw-gap-4">
                    {renderDurationOptions}
                    <div className="form-group">
                        <label className="tw-block tw-text-sm tw-font-medium tw-text-gray-300">Seed (-1 for Random)</label>
                        <input
                            type="number"
                            value={params.seed}
                            onChange={(e) => setParams(p => ({ ...p, seed: parseInt(e.target.value, 10) || -1 }))}
                            className="tw-w-full tw-p-2 tw-rounded-md tw-bg-slate-600 tw-text-white"
                            placeholder="-1"
                            min="-1"
                            max="2147483647"
                        />
                    </div>
                </div>
            )}
            
                {/* 6. Submit Button */}
                <button type="submit" disabled={isLoading} className={`btn tw-w-full tw-py-3 ${isLoading ? 'is-loading' : 'tw-bg-cyan-500 hover:tw-bg-cyan-600'}`}>
                    {isLoading ? status.message : `✨ Run Generation`}
                </button>
                {status.status === 'error' && (
                     <p className="tw-text-red-400 tw-text-sm tw-mt-2 tw-text-center">Error: {status.message}</p>
                )}

                {/* 7. Debug Payload Toggle & View */}
                <div className="tw-mt-4 tw-text-right">
                    <button
                        type="button"
                        onClick={() => setShowJson(prev => !prev)}
                        className="tw-text-cyan-400 tw-text-sm hover:tw-underline"
                    >
                        {showJson ? 'Hide JSON' : 'Show JSON'}
                    </button>
                </div>
                {showJson && (
                    <pre className="tw-mt-2 tw-bg-slate-800 tw-rounded-md tw-text-gray-200 tw-text-xs tw-p-3 tw-overflow-x-auto">
                        {JSON.stringify(debugPayload, null, 2)}
                    </pre>
                )}
        </form>
    );
};
// ==========================================
// 4. Main Component: ResultGallery
// ==========================================

const ResultGallery = ({ results, onDelete, onConvertWav, onGenerateMidi }) => {
    return (
        <div className="tw-mt-6">
            <h4 className="tw-text-white tw-font-bold tw-text-lg tw-mb-3">Results ({results.length})</h4>
            <div className="tw-flex tw-flex-col tw-gap-4 tw-p-2">
                {results.map((result) => (
                    <div key={result.id} className="tw-bg-slate-700 tw-rounded-xl tw-overflow-hidden tw-shadow-xl">
                        {/* Media preview */}
                        {result.type === 'image' ? (
                            <img
                                src={result.url}
                                alt={result.prompt}
                                className="tw-w-full tw-h-auto tw-object-contain tw-max-h-[60vh]"
                            />
                        ) : result.type === 'audio' ? (
                            // For audio results, attempt to play either the WAV URL (if present) or the
                            // original audio URL.  If neither is available, do not render the
                            // audio element to avoid passing an empty string to the src attribute【522233546692511†screenshot】.
                            // Determine a playable URL: prefer WAV, then MP3 URL, then stream URL.
                            (() => {
                                const playUrl = result.wavUrl || result.url || result.streamUrl;
                                if (playUrl) {
                                    return (
                                        <audio
                                            controls
                                            src={playUrl}
                                            className="tw-w-full tw-h-auto tw-max-h-[60vh]"
                                        />
                                    );
                                }
                                return <div className="tw-p-3 tw-text-gray-400">Audio unavailable</div>;
                            })()
                        ) : (
                            <video
                                controls
                                preload="metadata"
                                src={result.url}
                                className="tw-w-full tw-h-auto tw-object-contain tw-max-h-[60vh]"
                            />
                        )}
                        {/* Prompt or Title */}
                        <p className="tw-text-xs tw-p-3 tw-text-gray-300 tw-leading-snug">
                            {result.type === 'audio' && result.title ? result.title : result.prompt}
                        </p>
                        {/* Action buttons */}
                        <div className="tw-flex tw-flex-wrap tw-justify-end tw-gap-3 tw-px-3 tw-py-2">
                            {result.type === 'audio' ? (
                                <>
                                    {/* Download MP3: always show when a URL is available.  Use target=_blank to avoid cross-origin download issues. */}
                                    {(() => {
                                        const mp3Href = result.url || result.streamUrl;
                                        if (typeof mp3Href === 'string' && mp3Href.length > 0) {
                                            return (
                                                <a
                                                    href={mp3Href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="tw-text-cyan-400 hover:tw-underline tw-text-sm"
                                                >
                                                    MP3
                                                </a>
                                            );
                                        }
                                        return null;
                                    })()}
                                    {/* Convert or download WAV */}
                                    {result.wavUrl ? (
                                        <a
                                            href={result.wavUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="tw-text-cyan-400 hover:tw-underline tw-text-sm"
                                        >
                                            WAV
                                        </a>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onConvertWav && onConvertWav(result.id)}
                                            className="tw-text-cyan-400 hover:tw-underline tw-text-sm"
                                        >
                                            Convert to WAV
                                        </button>
                                    )}
                                    {/* Generate or download MIDI */}
                                    {result.midiData ? (
                                        <a
                                            href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(result.midiData))}`}
                                            download={`midi-${result.id}.json`}
                                            className="tw-text-cyan-400 hover:tw-underline tw-text-sm"
                                        >
                                            MIDI
                                        </a>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => onGenerateMidi && onGenerateMidi(result.id)}
                                            className="tw-text-cyan-400 hover:tw-underline tw-text-sm"
                                        >
                                            Generate MIDI
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => onDelete && onDelete(result.id)}
                                        className="tw-text-red-400 hover:tw-underline tw-text-sm"
                                    >
                                        Delete
                                    </button>
                                </>
                            ) : (
                                <>
                                    <a
                                        href={result.url}
                                        download
                                        className="tw-text-cyan-400 hover:tw-underline tw-text-sm"
                                    >
                                        Download
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => onDelete && onDelete(result.id)}
                                        className="tw-text-red-400 hover:tw-underline tw-text-sm"
                                    >
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
                {results.length === 0 && (
                    <p className="tw-text-gray-400 tw-text-center">Start generating images or videos!</p>
                )}
            </div>
        </div>
    );
};

// --- Main Workspace Component ---
export default function PhotoStudioWorkspace({ agentName, models, onGenerate }) {
    const [results, setResults] = useState([]);
    const [status, setStatus] = useState({ status: 'ready', message: 'Ready' });
    const [progress, setProgress] = useState({ taskId: null, percent: 0, label: 'Idle', attempt: 0, max: 0 });
    // Refs to persist form and pending tasks for session storage
    const lastFormRef = React.useRef(null);
    const pendingRef = React.useRef([]);

    // Wrap onGenerate to capture last form information
    const handleGenerate = useCallback((params) => {
        // Store the last form state (modelId and prompt) separately from the rest of
        // parameters.  To avoid accidentally persisting a stale prompt into the
        // parameter object, remove `prompt` from the params before storing.  The
        // `prompt` is stored at the top level of the form object only.  This
        // prevents scenarios where an old prompt could linger inside
        // lastFormRef.current.params and be reused unexpectedly in future
        // generation requests.
        // Separate prompt and modelId out of the params object before
        // persisting the form state.  Do not persist modelId inside the
        // params subobject to avoid future requests being sent with a stale
        // model identifier when the user switches models.  See bug fix notes.
        const { prompt: currentPrompt, modelId: _ignored, ...otherParams } = params;
        lastFormRef.current = {
            modelId: params.modelId,
            prompt: currentPrompt,
            params: { ...otherParams },
        };
        if (onGenerate) onGenerate(params);
    }, [onGenerate]);

    // Handler for removing a result.  When the user clicks the delete button on a
    // video card, remove it from the local results array and persist the updated
    // session so that deleted clips do not reappear after a page refresh.
    const handleDelete = useCallback((id) => {
        setResults((prev) => {
            const newResults = prev.filter((r) => r.id !== id);
            try {
                const project = stateManager.getProject();
                const projectId = project?.id || 'default';
                saveStudioSession(projectId, {
                    form: lastFormRef.current,
                    pendingTasks: pendingRef.current,
                    results: newResults,
                });
            } catch (_) {
                // ignore persistence errors; deletion still applies locally
            }
            return newResults;
        });
    }, []);

    /**
     * Convert an audio result to WAV.  This submits a WAV conversion task
     * for the given result and updates the result with the returned URL when
     * complete.  Shows status messages during the process.
     *
     * @param {string} id - The task ID of the audio result
     */
    const handleConvertToWav = useCallback(async (id) => {
        const target = results.find((r) => r.id === id);
        if (!target || target.type !== 'audio') return;
        // Show status to user
        setStatus({ status: 'loading', message: 'Submitting WAV conversion...' });
        try {
            // Submit conversion and poll for completion
            const wavTaskId = await SunoService.convertToWav(target.id, target.audioId);
            setStatus({ status: 'loading', message: 'Converting to WAV...' });
            const wavUrl = await SunoService.pollWavConversion(wavTaskId);
            // Prepare updated results array
            const updated = results.map((r) => (r.id === id ? { ...r, wavUrl } : r));
            // Update state
            setResults(updated);
            setStatus({ status: 'success', message: 'WAV conversion complete!' });
            // Persist session
            const project = stateManager.getProject();
            const projectId = project?.id || 'default';
            saveStudioSession(projectId, {
                form: lastFormRef.current,
                pendingTasks: pendingRef.current,
                results: updated,
            }).catch(() => {});
        } catch (err) {
            setStatus({ status: 'error', message: err.message || 'WAV conversion failed' });
        }
    }, [results]);

    /**
     * Generate a MIDI file from an audio result.  This performs vocal separation
     * (split into stems) and then submits a MIDI generation task.  The returned
     * MIDI data is stored on the result for download.  Status messages are
     * updated throughout the process.
     *
     * @param {string} id - The task ID of the audio result
     */
    const handleGenerateMidi = useCallback(async (id) => {
        const target = results.find((r) => r.id === id);
        if (!target || target.type !== 'audio') return;
        setStatus({ status: 'loading', message: 'Separating vocals...' });
        try {
            // 1. Submit vocal separation (split into stems)
            const sepTaskId = await SunoService.separateVocals(target.id, target.audioId, 'split_stem');
            // 2. Poll for separation completion
            const separationData = await SunoService.pollVocalSeparation(sepTaskId);
            // 3. Submit MIDI generation using the separation task ID
            setStatus({ status: 'loading', message: 'Generating MIDI...' });
            const midiTaskId = await SunoService.generateMidiFromAudio(sepTaskId);
            // 4. Poll for MIDI completion and retrieve data
            const midiData = await SunoService.pollMidiGeneration(midiTaskId);
            // Prepare updated results
            const updated = results.map((r) => (r.id === id ? { ...r, midiData } : r));
            setResults(updated);
            setStatus({ status: 'success', message: 'MIDI generation complete!' });
            // Persist session
            const project = stateManager.getProject();
            const projectId = project?.id || 'default';
            saveStudioSession(projectId, {
                form: lastFormRef.current,
                pendingTasks: pendingRef.current,
                results: updated,
            }).catch(() => {});
        } catch (err) {
            setStatus({ status: 'error', message: err.message || 'MIDI generation failed' });
        }
    }, [results]);

    useEffect(() => {
        const handleStatus = ({ status: stat, message }) => setStatus({ status: stat, message });
        const handleResult = (result) => {
            setResults((prev) => {
                const newResults = [result, ...prev];
                // Remove from pending tasks if exists
                pendingRef.current = pendingRef.current.filter((t) => t.taskId !== result.id);
                // Save session after new result arrives
                const project = stateManager.getProject();
                const projectId = project?.id || 'default';
                saveStudioSession(projectId, {
                    form: lastFormRef.current,
                    pendingTasks: pendingRef.current,
                    results: newResults,
                }).catch(() => {});
                return newResults;
            });
        };
        const handleProgress = (p) => {
            // update progress state
            setProgress((prev) => ({
                taskId: p.taskId || prev.taskId,
                percent: typeof p.progress === 'number' && isFinite(p.progress) ? p.progress : prev.percent,
                label: p.message || p.status || prev.label,
                attempt: p.attempt || prev.attempt,
                max: p.max || prev.max,
            }));
            // Manage pending tasks list
            if (p.status === 'submitted') {
                pendingRef.current = [
                    {
                        taskId: p.taskId,
                        meta: {
                            // Use 5 seconds as the default when duration is not specified. All models support 5 or 10 seconds.
                            durationSec: lastFormRef.current?.params?.duration || 5,
                            resolution: lastFormRef.current?.params?.resolution || '720p',
                        },
                    },
                    ...pendingRef.current,
                ];
                // Persist session when a new task is queued
                const project = stateManager.getProject();
                const projectId = project?.id || 'default';
                saveStudioSession(projectId, {
                    form: lastFormRef.current,
                    pendingTasks: pendingRef.current,
                    results: results,
                }).catch(() => {});
            } else if (p.status === 'success') {
                pendingRef.current = pendingRef.current.filter((t) => t.taskId !== p.taskId);
                // Persist session when a task completes to clear pending list
                const project = stateManager.getProject();
                const projectId = project?.id || 'default';
                saveStudioSession(projectId, {
                    form: lastFormRef.current,
                    pendingTasks: pendingRef.current,
                    results: results,
                }).catch(() => {});
            }
        };
        const unsubStatus = stateManager.bus.subscribe('kieai:statusUpdate', handleStatus);
        const unsubResult = stateManager.bus.subscribe('kieai:newResult', handleResult);
        const unsubProg = stateManager.bus.subscribe('kieai:progress', handleProgress);
        return () => {
            unsubStatus();
            unsubResult();
            unsubProg();
        };
    }, [results, onGenerate]);

    // On mount, load any saved session from IndexedDB
    useEffect(() => {
        (async () => {
            const project = stateManager.getProject();
            const projectId = project?.id || 'default';
            const saved = await loadStudioSession(projectId);
            if (!saved) return;
            // Restore results
            if (Array.isArray(saved.results) && saved.results.length) {
                setResults(saved.results);
            }
            // Restore form: publish event to StudioForm to update internal state
            if (saved.form) {
                lastFormRef.current = saved.form;
                stateManager.bus.publish('studio:restoreForm', saved.form);
            }
            // Resume pending tasks
            if (Array.isArray(saved.pendingTasks) && saved.pendingTasks.length) {
                pendingRef.current = saved.pendingTasks;
                for (const t of saved.pendingTasks) {
                    try {
                        const res = await KieAIService.resumePolling(t.taskId, t.meta);
                        // Publish result via bus
                        stateManager.bus.publish('kieai:newResult', {
                            id: res.taskId,
                            type: 'video',
                            prompt: saved.form?.prompt || '',
                            url: res.url,
                        });
                    } catch (e) {
                        console.warn('Resume polling failed', e);
                    }
                }
            }
        })();
    }, []);

    // Navigate back to chat/composer using the header buttons.  These handlers
    // trigger the existing navigation logic by programmatically clicking the
    // corresponding header button.  Without these, the full‑screen studio
    // overlay would make it impossible to switch back.
    const handleBackToChat = useCallback(() => {
        const btn = document.getElementById('switch-to-chat-btn');
        if (btn) btn.click();
    }, []);
    const handleBackToComposer = useCallback(() => {
        const btn = document.getElementById('switch-to-composer-btn');
        if (btn) btn.click();
    }, []);

    // Render UI
    return (
        <div className="studio-content tw-flex tw-flex-col tw-h-full tw-p-6 tw-bg-slate-800 tw-text-white tw-overflow-y-auto">
            {/* Header with back buttons and agent name */}
            <div className="tw-flex tw-justify-between tw-items-center tw-mb-4">
                <h2 className="tw-text-2xl tw-font-extrabold tw-text-cyan-400">{agentName}</h2>
                <div className="tw-flex tw-gap-2">
                    <button
                        type="button"
                        onClick={handleBackToChat}
                        className="tw-bg-slate-700 tw-text-gray-200 tw-rounded-md tw-px-3 tw-py-1 hover:tw-bg-slate-600"
                    >
                        ← Back to Chat
                    </button>
                    <button
                        type="button"
                        onClick={handleBackToComposer}
                        className="tw-bg-slate-700 tw-text-gray-200 tw-rounded-md tw-px-3 tw-py-1 hover:tw-bg-slate-600"
                    >
                        ← Back to Composer
                    </button>
                </div>
            </div>
            <div className="tw-flex tw-gap-6 tw-flex-grow tw-overflow-hidden">
                <div className="tw-w-full lg:tw-w-1/3 tw-flex-shrink-0">
                    <StudioForm models={models} onSubmit={handleGenerate} status={status} />
                    {/* Progress Meter */}
                    {status.status !== 'ready' && (
                        <div className="tw-mt-4 tw-bg-slate-700 tw-rounded-lg tw-p-3">
                            <div className="tw-flex tw-justify-between tw-text-xs tw-text-gray-300">
                                <span>{progress.label}</span>
                                <span>{progress.attempt}/{progress.max || '∞'}</span>
                            </div>
                            <progress className="tw-w-full tw-mt-2" max="100" value={progress.percent || 5}></progress>
                        </div>
                    )}
                </div>
                <div className="tw-w-full lg:tw-w-2/3">
                    <ResultGallery
                        results={results}
                        onDelete={handleDelete}
                        onConvertWav={handleConvertToWav}
                        onGenerateMidi={handleGenerateMidi}
                    />
                </div>
            </div>
        </div>
    );
}