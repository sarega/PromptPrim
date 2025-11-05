// src/js/modules/kieai/kieai.service.js (FINAL & ROBUST VERSION)

import * as UserService from '../user/user.service.js';
// NOTE: `core.state.js` resides two directories up from this module (src/js/modules/kieai -> src/js)
import { stateManager } from '../../core/core.state.js';
import { showCustomAlert } from '../../core/core.ui.js';

const CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const QUERY_TASK_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo';

// --- File Upload API ---
// Endpoints for uploading files to Kie.AI's file storage service.  Uploaded files are temporary and will
// be automatically deleted after a few days according to the official documentation.
const FILE_STREAM_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-stream-upload';

/**
 * Upload a local file using the Kie.AI File Upload API (multipart/form-data).
 * Returns the public URL for the uploaded file, which can then be used as the
 * `image_url` for I2V models.  This helper relies on a valid API key in
 * the user's settings.  The file will be stored temporarily (for about 3 days).
 *
 * @param {File} file - The file object selected by the user (e.g. from an <input type="file">)
 * @param {string} uploadPath - The destination directory on Kie.AI (no leading/trailing slash)
 * @param {string|null} fileName - Optional name for the uploaded file.  If omitted, a random name is generated.
 * @returns {Promise<string>} A promise that resolves with the public file URL upon successful upload
 */
export async function uploadFileStream(file, uploadPath = 'user-uploads', fileName = null) {
    const kieAiApiKey = UserService.getKieAiApiKey();
    if (!kieAiApiKey) throw new Error('Kie.ai API Key is missing. Please check your Settings.');
    if (!(file instanceof File)) throw new Error('Invalid file object provided to uploadFileStream.');
    // Prepare form data; note that we do NOT set a Content-Type header for multipart/form-data.
    const formData = new FormData();
    formData.append('file', file);
    // Use a subfolder to avoid cluttering root; if uploadPath is empty string, omit it completely
    if (uploadPath) formData.append('uploadPath', uploadPath);
    if (fileName) formData.append('fileName', fileName);
    const headers = {
        Authorization: `Bearer ${kieAiApiKey}`,
        // No explicit Content-Type; fetch will set it with boundary.
    };
    const response = await fetch(FILE_STREAM_UPLOAD_URL, {
        method: 'POST',
        headers,
        body: formData,
    });
    let result;
    try {
        result = await response.json();
    } catch (e) {
        throw new Error('Failed to parse upload response.');
    }
    if (!response.ok || !result || !result.success) {
        const msg = result?.msg || result?.message || `HTTP ${response.status} during file upload`;
        throw new Error(msg);
    }
    // The API may return either fileUrl or downloadUrl; prefer fileUrl when available
    const data = result.data || {};
    const fileUrl = data.fileUrl || data.downloadUrl;
    if (!fileUrl) {
        throw new Error('Upload succeeded but no file URL was returned by the API.');
    }
    return fileUrl;
}

// Base polling interval in seconds. Polling will be scaled up using a simple backoff scheme.
const BASE_POLL_SEC = 5;

/**
 * Compute the maximum number of polling attempts based on video duration and resolution.
 * This prevents prematurely timing out long or high‑resolution tasks.
 *
 * @param {object} context - Task context containing durationSec and resolution
 * @param {number} context.durationSec - Video duration in seconds
 * @param {string} context.resolution - Resolution (e.g. '720p', '1080p', '4k')
 * @returns {number} Maximum polling attempts
 */
function computeMaxAttempts({ durationSec = 5, resolution = '720p' } = {}) {
    let multiplier = 1.0;
    if (resolution === '1080p') multiplier = 1.8;
    else if (resolution === '4k') multiplier = 3.0;
    // At least ~3 minutes for short tasks, scale linearly with duration
    const expectedSec = Math.max(180, durationSec * 18 * multiplier);
    return Math.ceil(expectedSec / BASE_POLL_SEC);
}

// [NEW HELPER] ตรวจสอบ Response ว่าเป็น JSON ที่ถูกต้องหรือไม่
async function parseResponse(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        // If the response is not valid JSON (e.g. HTML error page), throw a meaningful error
        console.error('Non-JSON API Response (HTML/Error Page):', text);
        throw new Error(`Invalid API Response: Server returned non-JSON data (Status ${response.status}). Check API Key/Endpoint.`);
    }
}

/**
 * Executes a generation task and polls for the result.
 * @param {string} modelApiId - Model ID ที่ API ต้องการ (e.g., 'wan/2-5-image-to-video').
 * @param {object} inputPayload - The 'input' object contents.
 * @param {function(string):void} onUpdate - Callback for status updates.
 */
export async function executeGenerationTask(modelApiId, inputPayload, onUpdate = () => {}, opts = {}) {
    // Extract dynamic polling context from opts (duration, resolution) if provided
    const { taskContext = {} } = opts;

    const kieAiApiKey = UserService.getKieAiApiKey();
    if (!kieAiApiKey) throw new Error('Kie.ai API Key is missing. Please check your Settings.');

    const headers = {
        Authorization: `Bearer ${kieAiApiKey}`,
        'Content-Type': 'application/json',
    };

    // 1. Create the task
    const createBody = { model: modelApiId, input: inputPayload };
    onUpdate('Submitting task...');

    let response = await fetch(CREATE_TASK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(createBody),
    });

    const initialData = await parseResponse(response);

    if (!response.ok || initialData.code !== 200) {
        throw new Error(`Submission Failed (${response.status}): ${initialData.msg || initialData.message || 'Check parameters.'}`);
    }

    const taskId = initialData.data?.taskId;
    if (!taskId) throw new Error('Invalid response: Task ID is missing.');

    onUpdate(`Task submitted: ${taskId}. Waiting...`);
    // Notify the UI that a task has been submitted
    stateManager.bus.publish('kieai:progress', {
        taskId,
        status: 'submitted',
        progress: 0,
        message: 'Queued',
    });

    // 2. Poll for the result status
    let attempts = 0;
    const maxAttempts = computeMaxAttempts({
        // Default to 5 seconds when unspecified. The API supports 5 s or 10 s durations only.
        durationSec: Number(taskContext.durationSec) || Number(inputPayload.duration) || 5,
        resolution: String(taskContext.resolution || inputPayload.resolution) || '720p',
    });

    while (attempts < maxAttempts) {
        // Exponential/backoff: delay increases over time but capped
        const delaySec = Math.min(BASE_POLL_SEC * Math.max(1, Math.ceil(attempts / 6) + 1), 15);
        await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
        attempts++;

        const pollingUrl = `${QUERY_TASK_URL}?taskId=${encodeURIComponent(taskId)}`;
        let pollResponse;
        try {
            pollResponse = await fetch(pollingUrl, { headers });
        } catch (e) {
            // Network hiccup – publish retry progress and continue to next attempt
            stateManager.bus.publish('kieai:progress', {
                taskId,
                status: 'network-retry',
                progress: null,
                attempt: attempts,
                max: maxAttempts,
                message: 'Network hiccup, retrying...'
            });
            continue;
        }
        const taskData = await parseResponse(pollResponse);
        if (!pollResponse.ok || taskData.code !== 200) {
            throw new Error(`Polling API Error (${pollResponse.status}): ${taskData.msg || 'Check Key/Balance.'}`);
        }

        const status = taskData.data?.state;
        if (status === 'success') {
            // 100% complete
            stateManager.bus.publish('kieai:progress', {
                taskId,
                status: 'success',
                progress: 100,
                attempt: attempts,
                max: maxAttempts,
                message: 'Done',
            });
            let resultJsonData = {};
            try {
                resultJsonData = JSON.parse(taskData.data.resultJson);
            } catch (e) {
                console.warn('Could not parse resultJson', e);
            }
            return {
                url: resultJsonData.resultUrls?.[0],
                resultJson: resultJsonData,
                taskId,
            };
        } else if (status === 'fail') {
            throw new Error(`Kie.ai Task Failed: ${taskData.data.failMsg || 'Generation failed.'}`);
        } else {
            // Estimate progress: use percent from API if available; otherwise approximate
            const percent = Number(taskData.data?.percent ?? taskData.data?.progress ?? NaN);
            const est = isFinite(percent)
                ? Math.max(0, Math.min(100, percent))
                : Math.round((attempts / maxAttempts) * 95);
            stateManager.bus.publish('kieai:progress', {
                taskId,
                status,
                progress: est,
                attempt: attempts,
                max: maxAttempts,
                message: `Status: ${status}`,
            });
            onUpdate(`Status: ${status} (${attempts}/${maxAttempts})`);
        }
    }
    throw new Error('Kie.ai Polling Timed Out.');
}

/**
 * Resume polling an existing Kie.ai task.
 * Allows the app to reload and continue waiting for tasks without losing progress.
 *
 * @param {string} taskId - The task ID to poll
 * @param {object} meta - Context with durationSec and resolution to compute polling limits
 * @param {function} onUpdate - Optional callback for text status updates
 * @returns {Promise<object>} Result when complete, same shape as executeGenerationTask
 */
export async function resumePolling(taskId, meta = {}, onUpdate = () => {}) {
    const kieAiApiKey = UserService.getKieAiApiKey();
    if (!kieAiApiKey) throw new Error('Kie.ai API Key is missing. Please check your Settings.');
    const headers = {
        Authorization: `Bearer ${kieAiApiKey}`,
        'Content-Type': 'application/json',
    };
    let attempts = 0;
    const maxAttempts = computeMaxAttempts({
        // Use 5 seconds as default if duration is unknown; Kie.ai models only support 5 or 10 seconds.
        durationSec: Number(meta.durationSec) || 5,
        resolution: String(meta.resolution || '720p'),
    });
    stateManager.bus.publish('kieai:progress', {
        taskId,
        status: 'resuming',
        progress: null,
        attempt: 0,
        max: maxAttempts,
        message: 'Resuming task...'
    });
    while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, BASE_POLL_SEC * 1000));
        attempts++;
        const pollingUrl = `${QUERY_TASK_URL}?taskId=${encodeURIComponent(taskId)}`;
        let pollResponse;
        try {
            pollResponse = await fetch(pollingUrl, { headers });
        } catch (e) {
            stateManager.bus.publish('kieai:progress', {
                taskId,
                status: 'network-retry',
                progress: null,
                attempt: attempts,
                max: maxAttempts,
                message: 'Network hiccup, retrying...'
            });
            continue;
        }
        const taskData = await parseResponse(pollResponse);
        if (!pollResponse.ok || taskData.code !== 200) {
            throw new Error(`Polling API Error (${pollResponse.status}): ${taskData.msg || 'Check Key/Balance.'}`);
        }
        const status = taskData.data?.state;
        if (status === 'success') {
            stateManager.bus.publish('kieai:progress', {
                taskId,
                status: 'success',
                progress: 100,
                attempt: attempts,
                max: maxAttempts,
                message: 'Done'
            });
            let resultJsonData = {};
            try {
                resultJsonData = JSON.parse(taskData.data.resultJson);
            } catch (e) {
                console.warn('Could not parse resultJson', e);
            }
            return {
                url: resultJsonData.resultUrls?.[0],
                resultJson: resultJsonData,
                taskId,
            };
        }
        if (status === 'fail') {
            throw new Error(taskData.data?.failMsg || 'Generation failed');
        }
        // Otherwise, still processing
        stateManager.bus.publish('kieai:progress', {
            taskId,
            status,
            progress: null,
            attempt: attempts,
            max: maxAttempts,
            message: `Status: ${status}`
        });
    }
    throw new Error('Resume polling timed out');
}