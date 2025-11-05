// src/js/modules/suno/suno.service.js

import * as UserService from '../user/user.service.js';
import { stateManager } from '../../core/core.state.js';

// Endpoints for Suno API according to the official documentation.  These
// endpoints allow you to submit a music generation request and poll for the
// result using the returned task ID【902144609054001†L192-L201】.
const GENERATE_URL = 'https://api.kie.ai/api/v1/generate';
const TASK_INFO_URL = 'https://api.kie.ai/api/v1/generate/record-info';

// Endpoints for audio processing features
const WAV_GENERATE_URL = 'https://api.kie.ai/api/v1/wav/generate';
const WAV_RECORD_URL = 'https://api.kie.ai/api/v1/wav/record-info';

const VOCAL_REMOVAL_URL = 'https://api.kie.ai/api/v1/vocal-removal/generate';
const VOCAL_RECORD_URL = 'https://api.kie.ai/api/v1/vocal-removal/record-info';

const MIDI_GENERATE_URL = 'https://api.kie.ai/api/v1/midi/generate';
const MIDI_RECORD_URL = 'https://api.kie.ai/api/v1/midi/record-info';

// Endpoints for lyrics generation.  These endpoints allow generating lyrics
// separately from audio.  According to the documentation, you must POST to
// `/lyrics` with a prompt and callBackUrl, then poll `/lyrics/record-info`
// to retrieve the results【101042236548674†L100-L197】.
const LYRICS_GENERATE_URL = 'https://api.kie.ai/api/v1/lyrics';
const LYRICS_RECORD_URL = 'https://api.kie.ai/api/v1/lyrics/record-info';

/**
 * Parse a fetch response and return the JSON body.  If the response is not
 * valid JSON, throw an error with a descriptive message.
 *
 * @param {Response} response
 * @returns {Promise<object>}
 */
async function parseResponse(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error(`Invalid JSON from API (status ${response.status})`);
    }
}

/**
 * Execute a Suno music generation task.  This helper submits a task to the
 * Suno API, then polls the task status until completion or timeout.  It
 * publishes progress events on the same event bus used by KieAI video tasks.
 *
 * @param {object} inputPayload - Parameters for the music generation API.  See
 *   official docs for details.  At minimum, include `prompt`,
 *   `customMode`, `instrumental`, and `model`【902144609054001†L192-L201】.
 * @param {function(string):void} onUpdate - Callback for status updates.  The
 *   provided message will be sent to the UI via the event bus.
 * @param {object} opts - Optional settings for polling (currently unused).
 * @returns {Promise<{taskId:string,audioUrl:string,title:string,prompt:string}>}
 */
export async function executeMusicTask(inputPayload, onUpdate = () => {}, opts = {}) {
    const apiKey = UserService.getKieAiApiKey();
    if (!apiKey) {
        throw new Error('Kie.ai API Key is missing. Please check your Settings.');
    }
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };

    // 1. Submit the generation request
    onUpdate('Submitting music task...');
    let response;
    try {
        response = await fetch(GENERATE_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(inputPayload),
        });
    } catch (e) {
        throw new Error('Network error during submission');
    }
    const submitData = await parseResponse(response);
    if (!response.ok || submitData.code !== 200) {
        const msg = submitData?.msg || submitData?.message || `HTTP ${response.status}`;
        throw new Error(`Music submission failed: ${msg}`);
    }
    const taskId = submitData.data?.taskId;
    if (!taskId) throw new Error('Invalid submission response: missing taskId');

    onUpdate(`Task submitted: ${taskId}. Waiting...`);
    stateManager.bus.publish('kieai:progress', {
        taskId,
        status: 'submitted',
        progress: 0,
        message: 'Queued',
    });

    // 2. Poll for the task result.  Use a fixed polling interval of 10s and a
    // maximum of 60 attempts (10 minutes)【902144609054001†L463-L523】.
    const POLL_INTERVAL_MS = 10000;
    const MAX_ATTEMPTS = 60;
    let attempts = 0;
    while (attempts < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        attempts++;
        let statusResponse;
        try {
            statusResponse = await fetch(`${TASK_INFO_URL}?taskId=${encodeURIComponent(taskId)}`, {
                method: 'GET',
                headers,
            });
        } catch (e) {
            // network hiccup – continue polling
            stateManager.bus.publish('kieai:progress', {
                taskId,
                status: 'network-retry',
                progress: null,
                attempt: attempts,
                max: MAX_ATTEMPTS,
                message: 'Network hiccup, retrying...'
            });
            continue;
        }
        const statusData = await parseResponse(statusResponse);
        if (!statusResponse.ok || statusData.code !== 200) {
            const msg = statusData?.msg || statusData?.message || `HTTP ${statusResponse.status}`;
            throw new Error(`Music polling error: ${msg}`);
        }
        const status = statusData.data?.status;
        // Recognize success states according to docs【902144609054001†L463-L523】.
        if (status === 'SUCCESS' || status === 'FIRST_SUCCESS' || status === 'TEXT_SUCCESS') {
            stateManager.bus.publish('kieai:progress', {
                taskId,
                status: 'success',
                progress: 100,
                attempt: attempts,
                max: MAX_ATTEMPTS,
                message: 'Done',
            });
            const sunoData = statusData.data?.response?.sunoData || [];
            const track = sunoData[0] || {};
            // The API returns an `id` for each track in sunoData which is needed
            // for subsequent operations (e.g., wav conversion).  Include it in
            // the result as audioId.  Also return the prompt for completeness.
            // Some API responses may not include an `audioUrl` property but do
            // provide `streamAudioUrl` for streaming.  Use `audioUrl` if
            // available, otherwise fall back to `streamAudioUrl`.  If neither
            // exists, set to null so the UI can handle missing audio properly.
            const audioUrl = track.audioUrl || track.streamAudioUrl || null;
            return {
                taskId,
                audioUrl: audioUrl,
                streamAudioUrl: track.streamAudioUrl || null,
                title: track.title,
                prompt: track.prompt,
                audioId: track.id,
            };
        }
        // Error states according to docs【902144609054001†L463-L523】.
        if (status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED' || status === 'CALLBACK_EXCEPTION' || status === 'SENSITIVE_WORD_ERROR') {
            const errMsg = statusData.data?.errorMessage || `Music generation failed (status: ${status})`;
            throw new Error(errMsg);
        }
        // Pending or other status; update progress and continue
        stateManager.bus.publish('kieai:progress', {
            taskId,
            status: status || 'pending',
            progress: null,
            attempt: attempts,
            max: MAX_ATTEMPTS,
            message: status || 'Pending',
        });
    }
    throw new Error('Music generation timed out');
}

/**
 * Submit a WAV conversion task for a generated track.  This helper calls the
 * `/wav/generate` endpoint, which requires the original music task ID and
 * audio track ID.  A callBackUrl is mandatory according to the docs【259695445619002†L263-L275】.  You may
 * supply your own callback URL; if omitted a placeholder URL is used.
 *
 * @param {string} taskId - The music generation task ID
 * @param {string} audioId - The audio track ID returned in sunoData
 * @param {string} callBackUrl - URL to receive completion notifications
 * @returns {Promise<string>} - The task ID for the WAV conversion
 */
export async function convertToWav(taskId, audioId, callBackUrl = 'https://example.com/callback') {
    const apiKey = UserService.getKieAiApiKey();
    if (!apiKey) throw new Error('Kie.ai API Key is missing.');
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    const payload = { taskId, audioId, callBackUrl };
    const resp = await fetch(WAV_GENERATE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const data = await parseResponse(resp);
    if (!resp.ok || data.code !== 200) {
        const msg = data?.msg || data?.message || `HTTP ${resp.status}`;
        throw new Error(`WAV conversion submission failed: ${msg}`);
    }
    return data.data?.taskId;
}

/**
 * Poll the status of a WAV conversion task until it completes.  This helper
 * repeatedly calls `/wav/record-info` until the status flag is SUCCESS and
 * returns the WAV file URL【943541061726397†L95-L221】.  It will throw on failures or timeout.
 *
 * @param {string} taskId - The WAV conversion task ID returned from convertToWav()
 * @param {number} maxAttempts - Maximum polling iterations (defaults to 60 ~10min)
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {Promise<string>} - The downloadable WAV file URL
 */
export async function pollWavConversion(taskId, maxAttempts = 60, intervalMs = 10000) {
    const apiKey = UserService.getKieAiApiKey();
    if (!apiKey) throw new Error('Kie.ai API Key is missing.');
    const headers = { Authorization: `Bearer ${apiKey}` };
    let attempts = 0;
    while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        attempts++;
        const resp = await fetch(`${WAV_RECORD_URL}?taskId=${encodeURIComponent(taskId)}`, {
            method: 'GET',
            headers,
        });
        const data = await parseResponse(resp);
        if (!resp.ok || data.code !== 200) {
            const msg = data?.msg || data?.message || `HTTP ${resp.status}`;
            throw new Error(`WAV polling failed: ${msg}`);
        }
        const flag = data.data?.successFlag;
        // successFlag may be either a string (e.g. 'SUCCESS') or a number (1).
        // Treat numeric 1 or string 'SUCCESS' as success.  When flag is a
        // number greater than 1, consider it a failure.  When flag is a
        // string that starts with a failure prefix, also treat as failure.
        if (flag === 'SUCCESS' || flag === 1 || flag === '1') {
            const wavUrl = data.data?.response?.audioWavUrl;
            if (!wavUrl) throw new Error('WAV conversion completed but URL missing');
            return wavUrl;
        }
        if ((typeof flag === 'string' && flag.startsWith('GENERATE_AUDIO_FAILED')) || (typeof flag === 'number' && flag > 1)) {
            throw new Error('WAV conversion failed');
        }
        // otherwise treat as pending (0 or other string) and continue polling
    }
    throw new Error('WAV conversion timed out');
}

/**
 * Submit a vocal separation task for a generated track.  The API splits the
 * original audio into stems.  Use this before generating MIDI【673508396318663†L190-L227】.
 *
 * @param {string} taskId - Original music generation task ID
 * @param {string} audioId - Audio track ID
 * @param {string} type - Separation mode ('separate_vocal' or 'split_stem')
 * @param {string} callBackUrl - Callback URL
 * @returns {Promise<string>} - Task ID for the separation job
 */
export async function separateVocals(taskId, audioId, type = 'split_stem', callBackUrl = 'https://example.com/callback') {
    const apiKey = UserService.getKieAiApiKey();
    if (!apiKey) throw new Error('Kie.ai API Key is missing.');
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    const payload = { taskId, audioId, type, callBackUrl };
    const resp = await fetch(VOCAL_REMOVAL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const data = await parseResponse(resp);
    if (!resp.ok || data.code !== 200) {
        const msg = data?.msg || data?.message || `HTTP ${resp.status}`;
        throw new Error(`Vocal separation submission failed: ${msg}`);
    }
    return data.data?.taskId;
}

/**
 * Poll for vocal separation completion.  Once complete, returns the full
 * response object containing stem URLs【332768543614268†L114-L139】.
 *
 * @param {string} separationTaskId - Task ID returned from separateVocals()
 * @param {number} maxAttempts
 * @param {number} intervalMs
 * @returns {Promise<object>} - Separation response with stem URLs
 */
export async function pollVocalSeparation(separationTaskId, maxAttempts = 60, intervalMs = 10000) {
    const apiKey = UserService.getKieAiApiKey();
    if (!apiKey) throw new Error('Kie.ai API Key is missing.');
    const headers = { Authorization: `Bearer ${apiKey}` };
    let attempts = 0;
    while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        attempts++;
        const resp = await fetch(`${VOCAL_RECORD_URL}?taskId=${encodeURIComponent(separationTaskId)}`, {
            method: 'GET',
            headers,
        });
        const data = await parseResponse(resp);
        if (!resp.ok || data.code !== 200) {
            const msg = data?.msg || data?.message || `HTTP ${resp.status}`;
            throw new Error(`Vocal separation polling failed: ${msg}`);
        }
        const flag = data.data?.successFlag;
        // Treat string 'SUCCESS' or numeric 1 as success.  Numeric codes >1
        // indicate failure; string codes starting with 'CREATE_TASK_FAILED' or
        // 'GENERATE_AUDIO_FAILED' also indicate failure.
        if (flag === 'SUCCESS' || flag === 1 || flag === '1') {
            return data.data;
        }
        if ((typeof flag === 'string' && (flag.startsWith('CREATE_TASK_FAILED') || flag.startsWith('GENERATE_AUDIO_FAILED'))) || (typeof flag === 'number' && flag > 1)) {
            throw new Error('Vocal separation failed');
        }
    }
    throw new Error('Vocal separation timed out');
}

/**
 * Submit a MIDI generation request for separated audio.  Requires the
 * separation task ID and a callback URL【903950040242335†L186-L224】.
 *
 * @param {string} separationTaskId - Task ID from pollVocalSeparation()
 * @param {string} callBackUrl - Callback URL for results
 * @returns {Promise<string>} - MIDI generation task ID
 */
export async function generateMidiFromAudio(separationTaskId, callBackUrl = 'https://example.com/callback') {
    const apiKey = UserService.getKieAiApiKey();
    if (!apiKey) throw new Error('Kie.ai API Key is missing.');
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    const payload = { taskId: separationTaskId, callBackUrl };
    const resp = await fetch(MIDI_GENERATE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const data = await parseResponse(resp);
    if (!resp.ok || data.code !== 200) {
        const msg = data?.msg || data?.message || `HTTP ${resp.status}`;
        throw new Error(`MIDI generation submission failed: ${msg}`);
    }
    return data.data?.taskId;
}

/**
 * Poll for MIDI generation completion and return MIDI data.  The response
 * includes instrument names and note arrays【903950040242335†L186-L224】.
 *
 * @param {string} midiTaskId - Task ID returned from generateMidiFromAudio()
 * @param {number} maxAttempts
 * @param {number} intervalMs
 * @returns {Promise<object>} - MIDI data from the API
 */
export async function pollMidiGeneration(midiTaskId, maxAttempts = 60, intervalMs = 10000) {
    const apiKey = UserService.getKieAiApiKey();
    if (!apiKey) throw new Error('Kie.ai API Key is missing.');
    const headers = { Authorization: `Bearer ${apiKey}` };
    let attempts = 0;
    while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        attempts++;
        const resp = await fetch(`${MIDI_RECORD_URL}?taskId=${encodeURIComponent(midiTaskId)}`, {
            method: 'GET',
            headers,
        });
        const data = await parseResponse(resp);
        if (!resp.ok || data.code !== 200) {
            const msg = data?.msg || data?.message || `HTTP ${resp.status}`;
            throw new Error(`MIDI polling failed: ${msg}`);
        }
        const flag = data.data?.successFlag;
        // Treat success when flag is 'SUCCESS' or 1 (numeric or string).  Treat
        // errors when flag is a numeric value greater than 1 or starts with
        // known failure prefixes.  Otherwise continue polling.
        if (flag === 'SUCCESS' || flag === 1 || flag === '1') {
            return data.data?.midiData;
        }
        if ((typeof flag === 'string' && (flag.startsWith('CREATE_TASK_FAILED') || flag.startsWith('GENERATE_AUDIO_FAILED'))) || (typeof flag === 'number' && flag > 1)) {
            throw new Error('MIDI generation failed');
        }
    }
    throw new Error('MIDI generation timed out');
}

/**
 * Generate lyrics using the Suno API.  This helper submits a lyric generation
 * request and polls for completion.  The prompt describes the desired
 * lyrical content.  See docs for parameter rules and character limits【101042236548674†L190-L242】.
 *
 * @param {string} prompt - Detailed description of desired lyrics
 * @param {string} callBackUrl - Callback URL (required by API)
 * @returns {Promise<Array<{title:string,text:string}>>} - Array of lyric variations
 */
export async function generateLyrics(prompt, callBackUrl = 'https://example.com/callback') {
    const apiKey = UserService.getKieAiApiKey();
    if (!apiKey) throw new Error('Kie.ai API Key is missing.');
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    // Submit lyric generation request
    const payload = { prompt, callBackUrl };
    const resp = await fetch(LYRICS_GENERATE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const submitData = await parseResponse(resp);
    if (!resp.ok || submitData.code !== 200) {
        const msg = submitData?.msg || submitData?.message || `HTTP ${resp.status}`;
        throw new Error(`Lyrics submission failed: ${msg}`);
    }
    const taskId = submitData.data?.taskId;
    if (!taskId) throw new Error('Invalid lyrics submission response: missing taskId');
    // Poll for completion
    const maxAttempts = 60;
    const intervalMs = 10000;
    let attempts = 0;
    while (attempts < maxAttempts) {
        await new Promise((res) => setTimeout(res, intervalMs));
        attempts++;
        const statusResp = await fetch(`${LYRICS_RECORD_URL}?taskId=${encodeURIComponent(taskId)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        const statusData = await parseResponse(statusResp);
        if (!statusResp.ok || statusData.code !== 200) {
            const msg = statusData?.msg || statusData?.message || `HTTP ${statusResp.status}`;
            throw new Error(`Lyrics polling failed: ${msg}`);
        }
        const status = statusData.data?.status;
        if (status === 'SUCCESS') {
            // Extract lyric variations from the response array
            const variations = statusData.data?.response?.data || [];
            // Map to array of {title,text}
            return variations.map((v) => ({ title: v.title, text: v.text }));
        }
        if (status && status.startsWith('CREATE_TASK_FAILED') || status && status.startsWith('GENERATE_LYRICS_FAILED')) {
            throw new Error('Lyrics generation failed');
        }
    }
    throw new Error('Lyrics generation timed out');
}