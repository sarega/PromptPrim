// src/js/modules/kieai/kieai.ui.js
import { ReactBridge } from '../../react-entry.jsx';
import PhotoStudioWorkspace from '../../react-components/PhotoStudioWorkspace.jsx';
import * as KieAIHandlers from './kieai.handlers.js';
import * as UserService from '../user/user.service.js';

const WORKSPACE_ID = 'kieai-studio-workspace';
const MOUNT_ID = 'photo-studio-root';
let mediaStudioSidePanelSnapshot = null;

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

function getMediaStudioVisibleModels() {
    const allModels = KieAIHandlers.getKieAiModels();
    return Array.isArray(allModels)
        ? allModels.filter((model) => {
            const id = String(model?.id || '').toLowerCase();
            const apiId = String(model?.modelApiId || '').toLowerCase();
            return !id.includes('suno') && !apiId.includes('suno/');
        })
        : [];
}

function ensureWorkspaceDOM() {
    let workspace = document.getElementById(WORKSPACE_ID);
    if (!workspace) {
        workspace = document.createElement('div');
        workspace.id = WORKSPACE_ID;
        workspace.className = 'workspace hidden';
        (document.querySelector('#main-chat-panel .main-content-wrapper') || document.querySelector('.main-view-container'))?.appendChild(workspace);
        
        // Create the inner div for React to mount into
        const reactRoot = document.createElement('div');
        reactRoot.id = MOUNT_ID;
        workspace.appendChild(reactRoot);
    }
    return workspace;
}

function setEmbeddedPhotoStudioMode(isActive) {
    const mainContentWrapper = document.querySelector('#main-chat-panel .main-content-wrapper');
    if (mainContentWrapper) {
        mainContentWrapper.classList.toggle('photo-studio-active', !!isActive);
    }
}

function captureAndHideSidePanelsForMediaStudio() {
    if (mediaStudioSidePanelSnapshot) return;

    const appWrapper = document.querySelector('.app-wrapper');
    const sessionsPanel = document.getElementById('sessions-panel') || document.querySelector('.sessions-panel');
    const studioPanel = document.getElementById('studio-panel');
    const leftOverlay = document.getElementById('mobile-overlay');
    const rightOverlay = document.getElementById('right-sidebar-overlay');

    mediaStudioSidePanelSnapshot = {
        appWrapper: {
            sidebarCollapsed: !!appWrapper?.classList.contains('sidebar-collapsed'),
            rightSidebarCollapsed: !!appWrapper?.classList.contains('right-sidebar-collapsed'),
            withRightCollapsed: !!appWrapper?.classList.contains('with-right-collapsed'),
        },
        sessionsPanel: {
            isOpen: !!sessionsPanel?.classList.contains('is-open'),
        },
        studioPanel: {
            collapsed: !!studioPanel?.classList.contains('collapsed'),
            open: !!studioPanel?.classList.contains('open'),
        },
        overlays: {
            leftActive: !!leftOverlay?.classList.contains('active'),
            rightActive: !!rightOverlay?.classList.contains('active'),
        },
        bodyOverflow: document.body.style.overflow || '',
    };

    // Hide left sessions panel across desktop/mobile.
    appWrapper?.classList.add('sidebar-collapsed');
    sessionsPanel?.classList.remove('is-open');
    leftOverlay?.classList.remove('active');

    // Hide right studio panel across desktop/mobile.
    studioPanel?.classList.add('collapsed');
    studioPanel?.classList.remove('open');
    appWrapper?.classList.add('with-right-collapsed');
    appWrapper?.classList.add('right-sidebar-collapsed');
    rightOverlay?.classList.remove('active');

    // Right sidebar mobile overlay may have locked body scrolling.
    document.body.style.overflow = '';
}

function restoreSidePanelsAfterMediaStudio() {
    if (!mediaStudioSidePanelSnapshot) return;

    const snapshot = mediaStudioSidePanelSnapshot;
    mediaStudioSidePanelSnapshot = null;

    const appWrapper = document.querySelector('.app-wrapper');
    const sessionsPanel = document.getElementById('sessions-panel') || document.querySelector('.sessions-panel');
    const studioPanel = document.getElementById('studio-panel');
    const leftOverlay = document.getElementById('mobile-overlay');
    const rightOverlay = document.getElementById('right-sidebar-overlay');

    if (appWrapper) {
        appWrapper.classList.toggle('sidebar-collapsed', snapshot.appWrapper.sidebarCollapsed);
        appWrapper.classList.toggle('right-sidebar-collapsed', snapshot.appWrapper.rightSidebarCollapsed);
        appWrapper.classList.toggle('with-right-collapsed', snapshot.appWrapper.withRightCollapsed);
    }

    sessionsPanel?.classList.toggle('is-open', snapshot.sessionsPanel.isOpen);
    studioPanel?.classList.toggle('collapsed', snapshot.studioPanel.collapsed);
    studioPanel?.classList.toggle('open', snapshot.studioPanel.open);
    leftOverlay?.classList.toggle('active', snapshot.overlays.leftActive);
    rightOverlay?.classList.toggle('active', snapshot.overlays.rightActive);
    document.body.style.overflow = snapshot.bodyOverflow;
}

export function mountPhotoStudio(agentName) {
    const workspace = ensureWorkspaceDOM();
    const chatWorkspace = document.getElementById('chat-compose-workspace');

    // Embedded mode: keep the app frame (header/status/sidebars) visible and
    // switch only the main content area.
    workspace.removeAttribute('style');
    if (chatWorkspace) chatWorkspace.classList.remove('hidden');
    captureAndHideSidePanelsForMediaStudio();
    setEmbeddedPhotoStudioMode(true);
    workspace.classList.remove('hidden');

    // Present the workspace with the newer generic label while remaining
    // compatible with existing projects that still use the legacy agent name.
    const displayAgentName = typeof agentName === 'string'
        ? agentName.replace(/^Visual Studio\b/, 'Media Studio')
        : agentName;
    
    const props = {
        agentName: displayAgentName,
        models: getMediaStudioVisibleModels(),
        onGenerate: KieAIHandlers.handleGenerationRequest,
    };    
// 2. Mount React Component ลงใน DOM Container
    ReactBridge.mount(PhotoStudioWorkspace, props, document.getElementById(MOUNT_ID));
}

export function unmountPhotoStudio() {
    const workspace = document.getElementById(WORKSPACE_ID);
    const chatWorkspace = document.getElementById('chat-compose-workspace'); 

    if (workspace) {
        workspace.removeAttribute('style');
        setEmbeddedPhotoStudioMode(false);
        workspace.classList.add('hidden');
        if (chatWorkspace) chatWorkspace.classList.remove('hidden');
        restoreSidePanelsAfterMediaStudio();

        ReactBridge.unmount(document.getElementById(MOUNT_ID));
    }
}

// [NEW] ต้องเพิ่มการจัดการ Key ใน Settings UI ด้วย
export function initKieAiUI() {
    const apiKeyInput = document.getElementById('kieAiApiKey');
    if (apiKeyInput) {
        // โหลดค่า Key ที่บันทึกไว้ใน User Profile
        const profile = UserService.getCurrentUserProfile();
        apiKeyInput.value = profile?.apiSettings?.kieAiApiKey || '';

        // บันทึก Key ทันทีที่ผู้ใช้พิมพ์
        apiKeyInput.addEventListener('input', () => {
            UserService.updateApiSettings({ kieAiApiKey: apiKeyInput.value });
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
