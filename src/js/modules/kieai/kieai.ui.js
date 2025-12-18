// src/js/modules/kieai/kieai.ui.js
import { ReactBridge } from '../../react-entry.jsx';
import PhotoStudioWorkspace from '../../react-components/PhotoStudioWorkspace.jsx';
import * as KieAIHandlers from './kieai.handlers.js';
import * as UserService from '../user/user.service.js';

const WORKSPACE_ID = 'kieai-studio-workspace';
const MOUNT_ID = 'photo-studio-root';

const KieAI_MODELS = [
    { id: 'video/wan-2-6-text-to-video', name: 'Wan 2.6 T2V', type: 'video' },
    { id: 'video/wan-2-6-image-to-video', name: 'Wan 2.6 I2V', type: 'video' },
    { id: 'video/wan-2-6-video-to-video', name: 'Wan 2.6 V2V', type: 'video' },
    { id: 'image/4o-image', name: 'GPT-4o Image', type: 'image' },
    { id: 'image/flux-kontext', name: 'Flux Kontext', type: 'image' },
    { id: 'image/seedream4.0-text-to-image', name: 'Seedream 4.0 T2I', type: 'image' },
    { id: 'image/seedream4.5-text-to-image', name: 'Seedream 4.5 T2I', type: 'image' },
    { id: 'image/seedream4.5-edit', name: 'Seedream 4.5 Edit', type: 'image' },
    { id: 'video/wan2.5-image-to-video', name: 'Wan 2.5 I2V', type: 'video' },
    { id: 'video/v1-pro-text-to-video', name: 'Seedance V1 Pro T2V', type: 'video' },
    { id: 'video/v1-lite-text-to-video', name: 'Seedance V1 Lite T2V', type: 'video' },
    { id: 'video/v1-pro-image-to-video', name: 'Seedance V1 Pro I2V', type: 'video' },
    { id: 'video/v1-lite-image-to-video', name: 'Seedance V1 Lite I2V', type: 'video' },
    { id: 'video/runway-aleph', name: 'Runway Aleph', type: 'video' },
];

function ensureWorkspaceDOM() {
    let workspace = document.getElementById(WORKSPACE_ID);
    if (!workspace) {
        workspace = document.createElement('div');
        workspace.id = WORKSPACE_ID;
        workspace.className = 'workspace hidden';
        document.querySelector('.main-view-container').appendChild(workspace);
        
        // Create the inner div for React to mount into
        const reactRoot = document.createElement('div');
        reactRoot.id = MOUNT_ID;
        workspace.appendChild(reactRoot);
    }
    return workspace;
}

export function mountPhotoStudio(agentName) {
    const workspace = ensureWorkspaceDOM();
    const chatWorkspace = document.getElementById('chat-compose-workspace'); // << [FIX] ต้องหา Chat Workspace

    // 1. ซ่อน Chat Workspace และแสดง Photo Studio
    chatWorkspace.classList.add('hidden');
    workspace.classList.remove('hidden');
    // Expand the studio to completely cover the chat view.  We assign a
    // fixed position so that the workspace floats above the existing
    // application layout, taking up the full viewport.  Without this, the
    // chat panel underneath still occupies space and squeezes the studio when
    // many results are rendered.  The zIndex ensures the overlay appears
    // above other elements within the same document.  When the studio is
    // unmounted these styles are cleared in `unmountPhotoStudio()`.
    workspace.style.position = 'fixed';
    workspace.style.top = '0';
    workspace.style.left = '0';
    workspace.style.right = '0';
    workspace.style.bottom = '0';
    workspace.style.zIndex = '9999';
    workspace.style.overflowY = 'auto';

    const chatInputWrapper = document.querySelector('.chat-input-wrapper');
    if (chatInputWrapper) chatInputWrapper.classList.add('hidden');

    // Use the provided agentName directly for display.  Previously, this logic
    // prefixed non-KieAI agent names with "Visual Studio -", which resulted
    // in confusing titles like "Visual Studio - Visual Studio" when the agent
    // itself is named "Visual Studio".  Passing the agent name through
    // unchanged ensures the header displays exactly what was specified.
    const displayAgentName = agentName;
    
    const props = {
        agentName: displayAgentName,
        models: KieAIHandlers.getKieAiModels(),
        onGenerate: KieAIHandlers.handleGenerationRequest,
    };    
// 2. Mount React Component ลงใน DOM Container
    ReactBridge.mount(PhotoStudioWorkspace, props, document.getElementById(MOUNT_ID));
}

export function unmountPhotoStudio() {
const workspace = document.getElementById(WORKSPACE_ID);
    const chatWorkspace = document.getElementById('chat-compose-workspace'); 
    const chatInputWrapper = document.querySelector('.chat-input-wrapper');

    if (workspace) {
        // Reset any inline styles that were applied when mounting the photo studio.
        workspace.removeAttribute('style');
        // 1. [✅ FIX] แสดง Chat Workspace หลัก
        workspace.classList.add('hidden');
        chatWorkspace.classList.remove('hidden');

        // 2. [✅ NEW] แสดง Chat Input Bar
        if (chatInputWrapper) chatInputWrapper.classList.remove('hidden');

        ReactBridge.unmount(document.getElementById(MOUNT_ID));
    }
}

// [NEW] ต้องเพิ่มการจัดการ Key ใน Settings UI ด้วย
export function initKieAiUI() {
    const apiKeyInput = document.getElementById('kieAiApiKey');
    if (apiKeyInput) {
        // โหลดค่า Key ที่บันทึกไว้ใน User Profile
        const profile = UserService.getCurrentUserProfile();
        apiKeyInput.value = profile.apiSettings?.kieAiApiKey || '';

        // บันทึก Key ทันทีที่ผู้ใช้พิมพ์
        apiKeyInput.addEventListener('input', () => {
            const user = UserService.getCurrentUserProfile();
            if (user) {
                user.apiSettings.kieAiApiKey = apiKeyInput.value;
                UserService.saveFullUserProfile(user);
            }
        });
    }
}

export function toggleStudioWorkspace() {
    const chatWorkspace = document.getElementById('chat-compose-workspace');
    const studioWorkspace = document.getElementById(WORKSPACE_ID);
    
    if (chatWorkspace.classList.contains('hidden')) {
        // สถานะปัจจุบันคือ: Studio เปิดอยู่ -> ต้องปิด Studio และเปิด Chat
        unmountPhotoStudio();
        chatWorkspace.classList.remove('hidden');
    } else {
        // สถานะปัจจุบันคือ: Chat เปิดอยู่ -> ต้องเปิด Studio (ใช้ Agent Default)
        // เราจะใช้ Agent ชื่อ 'KieAI Photo Studio' เป็นค่าเริ่มต้น (ถ้าคุณสร้างไว้)
        const defaultAgentName = 'X'; 
        mountPhotoStudio(defaultAgentName);
    }
}