// // ===============================================
// // FILE: src/js/modules/workspace/workspace.ui.js (New File)
// // DESCRIPTION: Manages switching between different app workspaces.
// // ===============================================
// // In src/js/modules/workspace/workspace.ui.js
// import { stateManager } from '../../core/core.state.js';

// export function initWorkspaceUI() {
//     const chatWorkspace = document.getElementById('chat-compose-workspace');
//     const studioWorkspace = document.getElementById('agent-asset-studio');
//     const switchToStudioBtn = document.getElementById('switch-workspace-btn');
//     const switchToChatBtn = document.getElementById('switch-back-to-chat-btn');

//     if (!chatWorkspace || !studioWorkspace || !switchToStudioBtn || !switchToChatBtn) {
//         console.error("Workspace switching elements not found. Please check element IDs in index.html. Workspace UI will not be initialized.");
//         return;
//     }

//     switchToStudioBtn.addEventListener('click', () => {
//         chatWorkspace.classList.remove('active');
//         studioWorkspace.classList.add('active');
//         // Notify the rest of the app that the studio is now visible.
//         // This allows main.js to perform lazy initialization of studio components.
//         stateManager.bus.publish('workspace:switchedToStudio');

//     });

//     switchToChatBtn.addEventListener('click', () => {
//         studioWorkspace.classList.remove('active');
//         chatWorkspace.classList.add('active');
//     });

// }

