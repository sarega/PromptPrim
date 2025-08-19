// src/js/modules/admin/admin-user-manager.ui.js
// [CONSOLIDATED FILE] Merged with handlers to fix import issues.

import { showActivityLogModal } from './admin-activity-log.ui.js';
import { showAccountLogModal } from './admin-account-log.ui.js';
import { stateManager } from '../../core/core.state.js';
import * as UserService from '../user/user.service.js';
import { showCustomAlert } from '../../core/core.ui.js';
import { formatTimestamp } from '../../core/core.utils.js';

let selectedUserId = null;

// --- Handler Logic (Moved from handlers.js) ---

function saveUserUpdates(userId) {
    const originalUser = UserService.getUserById(userId);
    if (!originalUser) {
        showCustomAlert(`Error: User ${userId} not found.`, 'Error');
        return;
    }
    
    // 1. Create a deep copy to prevent any data contamination.
    const updatedUser = JSON.parse(JSON.stringify(originalUser));
    
    // 2. Get the new values from the form.
    const newPlan = document.getElementById('detail-user-plan').value;
    const newCredits = parseInt(document.getElementById('detail-user-credits').value, 10);
    
    // 3. Apply changes to the copied object.
    if (updatedUser.plan !== newPlan) {
        updatedUser.logs.push({
            timestamp: Date.now(),
            action: `Admin changed plan from ${updatedUser.plan} to ${newPlan}.`
        });
        updatedUser.plan = newPlan;
    }
    updatedUser.credits.current = newCredits;

    if (updatedUser.plan === 'pro' && updatedUser.credits.current > 0 && updatedUser.planStatus !== 'active') {
        updatedUser.planStatus = 'active';
        updatedUser.gracePeriodStartDate = null;
        updatedUser.logs.push({ timestamp: Date.now(), action: 'Account status reactivated by admin.' });
    }

    // 4. Save the completely new, updated user object.
    UserService.saveFullUserProfile(updatedUser);

    showCustomAlert(`User ${updatedUser.userName} updated successfully!`, 'Success');
    renderUserList();
    renderUserDetail(userId);
}


function handleAddNewUser() {
    const userName = prompt("Enter the new user's name:");
    if (!userName) return;

    const email = prompt(`Enter the email for ${userName}:`);
    if (!email) return;

    const newUser = UserService.addNewUser(userName, email);

    if (newUser) {
        showCustomAlert(`Successfully created user: ${userName} (ID: ${newUser.userId})`, 'User Created');
        renderUserList();
    } else {
        showCustomAlert('Failed to create user. Please check the console.', 'Error');
    }
}


// --- UI Rendering Logic ---

function getUserStatus(user) {
    if (!user || !user.plan) return { text: 'Error', class: 'status-blocked' };
    const credits = user.credits?.current ?? 0;

    if (user.plan === 'master') return { text: 'Master', class: 'status-active' };
    
    if (user.plan === 'free') {
        return credits > 0 ? 
               { text: 'Free', class: 'status-free' } : 
               { text: 'Blocked', class: 'status-blocked' };
    }
    if (user.plan === 'pro') {
        if (user.planStatus === 'active' && credits > 0) return { text: 'Active', class: 'status-active' };
        if (user.planStatus === 'grace_period') return { text: 'Grace Period', class: 'status-grace' };
        return { text: 'Blocked', class: 'status-blocked' };
    }
    return { text: 'Unknown', class: '' };
}

function createUserListItem(user) {
    const item = document.createElement('div');
    item.className = 'user-list-item';
    if (user.userId === selectedUserId) item.classList.add('active');
    item.dataset.userId = user.userId;

    const status = getUserStatus(user);
    const planName = user.plan || 'unknown';
    const currentCredits = user.credits?.current ?? 0;
    
    // [FIX] Call the function via the imported UserService
    const balanceUSD = UserService.convertCreditsToUSD(currentCredits);

    item.innerHTML = `
        <div><span class="status-indicator ${status.class}">${status.text}</span></div>
        <div class="user-name-email">
            ${user.userName || 'N/A'}
            <small>${user.userId} / ${user.email || 'N/A'}</small>
        </div>
        <div>${planName.charAt(0).toUpperCase() + planName.slice(1)}</div>
        <div>$${balanceUSD.toFixed(2)}</div>
        <div class="quick-actions">
             <button class="btn-icon" title="Edit User" data-action="edit">✏️</button>
        </div>
    `;
    return item;
}
export function renderUserList() {
    const container = document.getElementById('user-list-container');
    const searchInput = document.getElementById('user-search-input').value.toLowerCase();
    const planFilter = document.getElementById('user-plan-filter').value;
    if (!container) return;
    const allUsers = UserService.getAllUsers();
    const filteredUsers = allUsers.filter(user => user && user.plan && (planFilter === 'all' || user.plan === planFilter) && (!searchInput || user.userName.toLowerCase().includes(searchInput) || user.email.toLowerCase().includes(searchInput) || user.userId.toLowerCase().includes(searchInput)));
    container.innerHTML = '';
    filteredUsers.forEach(user => container.appendChild(createUserListItem(user)));
}

export function renderUserDetail(userId) {
    selectedUserId = userId;
    const detailSection = document.getElementById('user-detail-section');
    if (!detailSection) return;
    // [ADD THIS] Set the userId on the dataset for the listener
    detailSection.dataset.userId = userId;

    const user = UserService.getUserById(userId);
    if (!user) {
        detailSection.classList.add('hidden');
        return;
    }
    let masterPlanSection = '';
    if (user.plan === 'master') {
        const endDate = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
        const daysRemaining = endDate ? Math.ceil((endDate - Date.now()) / (1000 * 60 * 60 * 24)) : 'N/A';
        const statusText = daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expired';

        masterPlanSection = `
            <div class="form-group" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <label>Master Subscription</label>
                <input type="text" value="${endDate ? endDate.toLocaleDateString() : 'Not set'} (${statusText})" readonly class="read-only-display">
                <button class="btn btn-small" data-action="extend-sub" style="margin-top: 5px;">Extend 30 Days</button>
            </div>
        `;
    }
    // --- Calculations for display ---
    const balanceUSD = UserService.convertCreditsToUSD(user.credits.current);
    const tokenUsage = user.credits.tokenUsage || { prompt: 0, completion: 0 };
    const totalTokenSpend = tokenUsage.prompt + tokenUsage.completion;

    // --- HTML Structure ---
    detailSection.innerHTML = `
        <h4>Details for ${user.userName} (${user.userId})</h4>
        <div class="user-detail-grid">
            <div>
                <div class="form-group">
                    <label>Plan</label>
                    <select id="detail-user-plan">
                        <option value="free" ${user.plan === 'free' ? 'selected' : ''}>Free</option>
                        <option value="pro" ${user.plan === 'pro' ? 'selected' : ''}>Pro</option>
                        <option value="master" ${user.plan === 'master' ? 'selected' : ''}>Master</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Current Credits</label>
                    <input type="number" id="detail-user-credits" value="${user.credits.current}">
                </div>
                 <div class="form-group">
                    <label>Money Refill (USD)</label>
                    <div class="refill-presets">
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="10">$10</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="30">$30</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="50">$50</button>
                        <button class="btn btn-small btn-secondary" data-action="refill" data-amount="100">$100</button>
                    </div>
                </div>
                 <button id="detail-save-user-btn" class="btn">Save User Profile</button>
                <div>
                    ${masterPlanSection}
                    </div>                 
            </div>
            <div>
                <div class="form-group">
                    <label>Balance (USD Value)</label>
                    <input type="text" value="$${balanceUSD.toFixed(4)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Usage (USD Value)</label>
                    <input type="text" value="$${(user.credits.totalUsedUSD || 0).toFixed(6)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Refilled (USD)</label>
                    <input type="text" value="$${(user.credits.totalRefilledUSD || 0).toFixed(2)}" readonly class="read-only-display">
                </div>
                <div class="form-group">
                    <label>Total Usage Cost (USD)</label>
                    <input type="text" value="$${(user.credits.totalUsedUSD || 0).toFixed(6)}" readonly class="read-only-display">
                </div>
                <button id="view-activity-log-btn" class="btn btn-secondary">View Activity Log</button>
                <button id="view-account-log-btn" class="btn btn-secondary">View Account Log</button>
            </div>
        </div>
        `;
    detailSection.classList.remove('hidden');

    renderUserList();
}

export function initAdminUserManagerUI() {
    renderUserList();
    document.getElementById('user-search-input')?.addEventListener('input', renderUserList);
    document.getElementById('user-plan-filter')?.addEventListener('change', renderUserList);
    
    document.getElementById('user-list-container')?.addEventListener('click', (e) => {
        const userItem = e.target.closest('.user-list-item');
        if (!userItem) return;
        const userId = userItem.dataset.userId;
        renderUserDetail(userId);
    });

    document.getElementById('add-new-user-btn')?.addEventListener('click', handleAddNewUser);

    const detailSection = document.getElementById('user-detail-section');
    if (detailSection) {
        detailSection.addEventListener('click', (e) => {
            const target = e.target;
            const currentUserId = detailSection.dataset.userId;
            if (!currentUserId) return;

            if (target.id === 'detail-save-user-btn') {
                saveUserUpdates(currentUserId);
            }
            if (target.dataset.action === 'refill') {
                const amount = parseInt(target.dataset.amount, 10);
                UserService.refillCredits(currentUserId, amount);
            }
            if (target.id === 'view-activity-log-btn') {
                showActivityLogModal(currentUserId); 
            }
            
            // [ADD THIS] เพิ่มเงื่อนไขสำหรับปุ่ม Extend Subscription
            if (target.dataset.action === 'extend-sub') {
                UserService.extendMasterSubscription(currentUserId);
            }
        });
    }

    stateManager.bus.subscribe('user:settingsUpdated', () => {
        console.log("Admin UI received 'user:settingsUpdated' event. Re-rendering user list.");
        renderUserList();
        if (selectedUserId) {
            renderUserDetail(selectedUserId);
        }
    });
}

// ประกาศตัวแปรสำหรับ Modal ใหม่
const accountLogModal = document.getElementById('account-log-modal');
const accountLogModalBody = document.getElementById('account-log-body');
const accountLogModalTitle = document.getElementById('account-log-title');
let accountLogCurrentUserId = null;


// [IMPORTANT] สร้างฟังก์ชัน init เพื่อผูก Event Listener ทั้งหมด
// export function initAccountLogUI() {
//     // 1. ผูก Event กับปุ่ม "View Account Log" ที่อยู่ใน Detail Panel
//     const detailSection = document.getElementById('user-detail-section');
//     detailSection?.addEventListener('click', (e) => {
//         if (e.target.id === 'view-account-log-btn') {
//             const userId = e.currentTarget.dataset.userId;
//             if (userId) showAccountLogModal(userId);
//         }
//     });

//     // 2. ผูก Event กับปุ่มใน Modal
//     accountLogModal?.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', hideAccountLogModal));
//     accountLogModal?.querySelector('#export-account-log-csv-btn')?.addEventListener('click', exportAccountLogToCSV);
// }