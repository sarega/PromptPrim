import * as UserService from '../user/user.service.js';
import * as AccountHandlers from './account.handlers.js';
import { stateManager } from '../../core/core.state.js';
import { convertCreditsToUSD } from '../user/user.service.js';
import * as BackendAccountDataService from '../billing/backend-account-data.service.js';
import * as StripeBillingService from '../billing/stripe-billing.service.js';
import * as AccountProfileService from './account-profile.service.js';
import { formatTimestamp } from '../../core/core.utils.js';
import { showCustomAlert } from '../../core/core.ui.js';

const modal = document.getElementById('account-modal');
const modalBody = document.getElementById('account-modal-body');
const avatarInput = document.getElementById('account-avatar-input');

const ACCOUNT_AVATAR_SIZE = 256;
const ACCOUNT_AVATAR_OUTPUT_QUALITY = 0.84;
const MAX_ACCOUNT_AVATAR_DATA_URL_LENGTH = 120000;

const ACCOUNT_SECTIONS = Object.freeze([
    { key: 'overview', label: 'Overview', helper: 'Plan, balance, and actions' },
    { key: 'profile', label: 'Profile', helper: 'Identity and avatar' },
    { key: 'security', label: 'Security', helper: 'Password and recovery' },
    { key: 'billing', label: 'Billing', helper: 'Payments and address' },
    { key: 'usage', label: 'Usage', helper: 'Spend and model activity' },
    { key: 'history', label: 'History', helper: 'Credits, bills, and ledger' }
]);

let activeAccountSection = 'overview';
let accountSidebarScrollTop = 0;
let accountEditorState = null;

const PLAN_CATALOG = Object.freeze([
    {
        planCode: 'pro',
        title: 'Pro Plan',
        badge: 'Most Popular',
        description: 'Ready-to-use AI workflow — no setup required.',
        defaultPriceUSD: 10,
        priceSuffix: '/month',
        helper: 'Hosted writing workflow with monthly credits built in.',
        buttonLabel: 'Upgrade to Pro',
        features: [
            '$3 monthly hosted credits',
            'Buy additional Top-up Credits anytime',
            'Full hosted writing workflow',
            'Optimized model routing'
        ]
    },
    {
        planCode: 'studio',
        title: 'Studio Plan',
        badge: 'BYOK',
        description: 'Advanced workspace for users who bring their own API keys.',
        defaultPriceUSD: 8,
        priceSuffix: '/month',
        helper: 'Advanced tools, custom providers, and local connectors.',
        buttonLabel: 'Choose Studio',
        features: [
            'Bring your own API keys',
            'Media Studio image and video tools',
            'Custom providers and model routing',
            'Local Ollama connector'
        ]
    }
]);

const PLAN_COMPARISON_ROWS = Object.freeze([
    ['API setup required', 'No', 'Yes'],
    ['Monthly hosted credits', '$3/month', 'No'],
    ['Top-up credits', 'Yes', 'No'],
    ['Media Studio', 'No', 'Yes'],
    ['Local Ollama', 'No', 'Yes']
]);

function createDefaultAccountEditorState() {
    return {
        profile: {
            displayName: '',
            email: '',
            avatarUrl: '',
            billingName: '',
            billingCompany: '',
            billingPhone: '',
            billingAddressLine1: '',
            billingAddressLine2: '',
            billingCity: '',
            billingState: '',
            billingPostalCode: '',
            billingCountry: ''
        },
        security: {
            recoveryEmail: '',
            nextPassword: '',
            confirmPassword: ''
        }
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function syncAccountEditorState(profileSnapshot = null) {
    const snapshot = profileSnapshot || {};
    const nextState = accountEditorState || createDefaultAccountEditorState();

    nextState.profile.displayName = nextState.profile.displayName || String(snapshot.displayName || '');
    nextState.profile.email = nextState.profile.email || String(snapshot.email || '');
    nextState.profile.avatarUrl = nextState.profile.avatarUrl || String(snapshot.avatarUrl || '');
    nextState.profile.billingName = nextState.profile.billingName || String(snapshot.billingName || '');
    nextState.profile.billingCompany = nextState.profile.billingCompany || String(snapshot.billingCompany || '');
    nextState.profile.billingPhone = nextState.profile.billingPhone || String(snapshot.billingPhone || '');
    nextState.profile.billingAddressLine1 = nextState.profile.billingAddressLine1 || String(snapshot.billingAddressLine1 || '');
    nextState.profile.billingAddressLine2 = nextState.profile.billingAddressLine2 || String(snapshot.billingAddressLine2 || '');
    nextState.profile.billingCity = nextState.profile.billingCity || String(snapshot.billingCity || '');
    nextState.profile.billingState = nextState.profile.billingState || String(snapshot.billingState || '');
    nextState.profile.billingPostalCode = nextState.profile.billingPostalCode || String(snapshot.billingPostalCode || '');
    nextState.profile.billingCountry = nextState.profile.billingCountry || String(snapshot.billingCountry || '');

    nextState.security.recoveryEmail = nextState.security.recoveryEmail || String(snapshot.email || '');
    nextState.security.nextPassword = String(nextState.security.nextPassword || '');
    nextState.security.confirmPassword = String(nextState.security.confirmPassword || '');

    accountEditorState = nextState;
}

function setDraftField(scope, field, value) {
    if (!accountEditorState) {
        accountEditorState = createDefaultAccountEditorState();
    }

    if (!accountEditorState[scope] || typeof accountEditorState[scope] !== 'object') {
        accountEditorState[scope] = {};
    }

    accountEditorState[scope][field] = value;
}

function getDraftField(scope, field, fallback = '') {
    return String(accountEditorState?.[scope]?.[field] ?? fallback ?? '');
}

function clearSecurityDraftFields() {
    if (!accountEditorState) return;
    if (!accountEditorState.security) {
        accountEditorState.security = {};
    }
    accountEditorState.security.nextPassword = '';
    accountEditorState.security.confirmPassword = '';
}

function getAccountProfileDraftPayload() {
    return {
        displayName: getDraftField('profile', 'displayName', ''),
        email: getDraftField('profile', 'email', ''),
        avatarUrl: getDraftField('profile', 'avatarUrl', ''),
        billingName: getDraftField('profile', 'billingName', ''),
        billingCompany: getDraftField('profile', 'billingCompany', ''),
        billingPhone: getDraftField('profile', 'billingPhone', ''),
        billingAddressLine1: getDraftField('profile', 'billingAddressLine1', ''),
        billingAddressLine2: getDraftField('profile', 'billingAddressLine2', ''),
        billingCity: getDraftField('profile', 'billingCity', ''),
        billingState: getDraftField('profile', 'billingState', ''),
        billingPostalCode: getDraftField('profile', 'billingPostalCode', ''),
        billingCountry: getDraftField('profile', 'billingCountry', '')
    };
}

export function showAccountModal() {
    if (!modal) return;
    activeAccountSection = 'overview';
    accountSidebarScrollTop = 0;
    accountEditorState = null;
    clearAccountActionFeedback();
    renderAccountModal().catch((error) => {
        console.error('Could not render the account modal.', error);
    });
    modal.style.display = 'flex';
}

function hideAccountModal() {
    if (!modal) return;
    clearAccountActionFeedback();
    modal.style.display = 'none';
}

function setAccountActionStatus(message = '') {
    const statusNodes = modalBody?.querySelectorAll('[data-account-action-status]');
    if (!statusNodes?.length) return;
    const normalizedMessage = String(message || '').trim();

    statusNodes.forEach((node) => {
        node.textContent = normalizedMessage;
        node.classList.toggle('is-visible', Boolean(normalizedMessage));
    });
}

function clearAccountActionFeedback() {
    const busyButtons = modalBody?.querySelectorAll('[data-account-busy="true"]');
    busyButtons?.forEach((button) => {
        button.removeAttribute('data-account-busy');
        button.classList.remove('is-loading');
        button.disabled = false;
    });

    const busyCards = modalBody?.querySelectorAll('.account-plan-card.is-busy, .account-action-card.is-busy');
    busyCards?.forEach((card) => {
        card.classList.remove('is-busy');
    });

    modalBody?.querySelector('.account-content')?.classList.remove('is-busy');
    setAccountActionStatus('');
}

function beginAccountActionFeedback(actionTarget, message) {
    clearAccountActionFeedback();

    const busyButton = actionTarget instanceof HTMLElement
        ? actionTarget.closest('button')
        : null;
    const busyCard = actionTarget instanceof HTMLElement
        ? actionTarget.closest('.account-plan-card, .account-action-card')
        : null;

    if (busyButton?.classList.contains('btn')) {
        busyButton.dataset.accountBusy = 'true';
        busyButton.classList.add('is-loading');
        busyButton.disabled = true;
    }

    busyCard?.classList.add('is-busy');
    modalBody?.querySelector('.account-content')?.classList.add('is-busy');
    setAccountActionStatus(message);

    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        clearAccountActionFeedback();
    };
}

function getPreservedSidebarScrollTop() {
    const sidebar = modalBody?.querySelector('.account-sidebar');
    if (!sidebar) return accountSidebarScrollTop;
    return sidebar.scrollTop;
}

function wireAccountSidebarScrollState(preservedScrollTop = 0) {
    const sidebar = modalBody?.querySelector('.account-sidebar');
    if (!sidebar) return;

    sidebar.scrollTop = Math.max(Number(preservedScrollTop) || 0, 0);
    accountSidebarScrollTop = sidebar.scrollTop;

    sidebar.addEventListener('scroll', () => {
        accountSidebarScrollTop = sidebar.scrollTop;
    }, { passive: true });
}

function setActiveAccountSection(nextSection) {
    const normalizedSection = String(nextSection || '').trim().toLowerCase();
    if (!ACCOUNT_SECTIONS.some((section) => section.key === normalizedSection)) return;
    activeAccountSection = normalizedSection;
    renderAccountModal().catch((error) => {
        console.error('Could not switch the account section.', error);
    });
}

function getProfileInitial(userName = '') {
    const trimmed = String(userName || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'U';
}

function getSanitizedAvatarUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
    if (/^blob:\S+$/i.test(trimmed)) return trimmed;
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed;
    return '';
}

function renderAvatarPreview(displayName, avatarUrl = '', options = {}) {
    const safeAvatarUrl = getSanitizedAvatarUrl(avatarUrl);
    const sizeClass = options.sizeClass ? ` ${options.sizeClass}` : '';
    const avatarLabel = `${String(displayName || 'User').trim() || 'User'} profile picture`;
    if (safeAvatarUrl) {
        return `
            <div class="account-avatar-preview has-image${sizeClass}">
                <img class="account-avatar-image" src="${escapeHtml(safeAvatarUrl)}" alt="${escapeHtml(avatarLabel)}">
            </div>
        `;
    }

    return `<div class="account-avatar-preview${sizeClass}" aria-hidden="true">${getProfileInitial(displayName)}</div>`;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read the selected image file.'));
        reader.readAsDataURL(file);
    });
}

function loadImageFromSource(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not process the selected image.'));
        image.src = source;
    });
}

async function convertAvatarFileToDataUrl(file) {
    if (!(file instanceof File) || !String(file.type || '').startsWith('image/')) {
        throw new Error('Please choose a PNG, JPG, WEBP, or GIF image.');
    }

    const rawDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageFromSource(rawDataUrl);
    const sourceSize = Math.min(image.naturalWidth || image.width || 0, image.naturalHeight || image.height || 0);
    if (!sourceSize) {
        throw new Error('The selected image looks invalid.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = ACCOUNT_AVATAR_SIZE;
    canvas.height = ACCOUNT_AVATAR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Could not prepare the image for upload.');
    }

    const sourceX = Math.max(((image.naturalWidth || image.width) - sourceSize) / 2, 0);
    const sourceY = Math.max(((image.naturalHeight || image.height) - sourceSize) / 2, 0);
    context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        ACCOUNT_AVATAR_SIZE,
        ACCOUNT_AVATAR_SIZE
    );

    let optimizedDataUrl = canvas.toDataURL('image/webp', ACCOUNT_AVATAR_OUTPUT_QUALITY);
    if (!optimizedDataUrl || optimizedDataUrl === 'data:,') {
        optimizedDataUrl = canvas.toDataURL('image/jpeg', ACCOUNT_AVATAR_OUTPUT_QUALITY);
    }
    if (optimizedDataUrl.length > MAX_ACCOUNT_AVATAR_DATA_URL_LENGTH) {
        optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
    }
    if (optimizedDataUrl.length > MAX_ACCOUNT_AVATAR_DATA_URL_LENGTH) {
        throw new Error('That image is still too large after compression. Please choose a smaller file.');
    }

    return optimizedDataUrl;
}

async function handleAvatarSelection(file) {
    const previousAvatarUrl = getDraftField('profile', 'avatarUrl', '');
    const avatarUrl = await convertAvatarFileToDataUrl(file);
    setDraftField('profile', 'avatarUrl', avatarUrl);
    await renderAccountModal();

    const saved = await AccountHandlers.handleSaveAccountProfile(
        { avatarUrl },
        {
            silentSuccess: true,
            errorTitle: 'Photo Save Failed'
        }
    );

    if (!saved) {
        setDraftField('profile', 'avatarUrl', previousAvatarUrl);
        await renderAccountModal();
        return false;
    }

    return true;
}

async function handleAvatarRemoval() {
    const previousAvatarUrl = getDraftField('profile', 'avatarUrl', '');
    setDraftField('profile', 'avatarUrl', '');
    await renderAccountModal();

    const saved = await AccountHandlers.handleSaveAccountProfile(
        { avatarUrl: '' },
        {
            silentSuccess: true,
            errorTitle: 'Photo Remove Failed'
        }
    );

    if (!saved) {
        setDraftField('profile', 'avatarUrl', previousAvatarUrl);
        await renderAccountModal();
    }
}

function renderBackendUsageRows(usageEvents = []) {
    if (!Array.isArray(usageEvents) || usageEvents.length === 0) {
        return '<p class="account-empty-copy">No backend usage recorded yet.</p>';
    }

    const rows = usageEvents.map((entry) => `
        <tr>
            <td>${formatTimestamp(entry.timestamp)}</td>
            <td>${entry.model || '-'}</td>
            <td>${entry.totalTokens.toLocaleString()}</td>
            <td style="text-align: right;">$${entry.providerCostUSD.toFixed(6)}</td>
            <td style="text-align: right;">$${entry.chargedUSD.toFixed(6)}</td>
            <td>${entry.status}</td>
        </tr>
    `).join('');

    return `
        <div class="item-list-scrollable account-table-wrapper">
            <table class="activity-log-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Model</th>
                        <th>Total Tokens</th>
                        <th style="text-align: right;">Provider Cost</th>
                        <th style="text-align: right;">Charged</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderBackendLedgerRows(walletLedger = []) {
    if (!Array.isArray(walletLedger) || walletLedger.length === 0) {
        return '<p class="account-empty-copy">No backend wallet events recorded yet.</p>';
    }

    const rows = walletLedger.map((entry) => {
        const sign = entry.direction === 'credit' ? '+' : '-';
        return `
            <tr>
                <td>${formatTimestamp(entry.timestamp)}</td>
                <td>${entry.type || '-'}</td>
                <td style="text-align: right;">${sign}$${entry.deltaUSD.toFixed(6)}</td>
                <td>${entry.notes || '-'}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="item-list-scrollable account-table-wrapper">
            <table class="activity-log-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Type</th>
                        <th style="text-align: right;">Amount</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderBackendBillingPurchaseRows(billingPurchases = []) {
    if (!Array.isArray(billingPurchases) || billingPurchases.length === 0) {
        return '<p class="account-empty-copy">No payment history is recorded yet.</p>';
    }

    const rows = billingPurchases.map((entry) => {
        const reference = entry.stripeInvoiceId
            || entry.stripeCheckoutSessionId
            || entry.stripeSubscriptionId
            || entry.providerReferenceId
            || '-';
        const creditLabel = entry.grantedMicrocredits > 0
            ? `$${entry.grantedUSD.toFixed(2)}`
            : '-';

        return `
            <tr>
                <td>${formatTimestamp(entry.timestamp)}</td>
                <td>${escapeHtml(entry.displayName)}</td>
                <td>${escapeHtml(entry.status || '-')}</td>
                <td style="text-align: right;">$${entry.amountUSD.toFixed(2)}</td>
                <td style="text-align: right;">${creditLabel}</td>
                <td>${escapeHtml(reference)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="item-list-scrollable account-table-wrapper">
            <table class="activity-log-table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Item</th>
                        <th>Status</th>
                        <th style="text-align: right;">Amount</th>
                        <th style="text-align: right;">Credits</th>
                        <th>Reference</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function formatCreditUSD(microcredits = 0, digits = 2) {
    return `$${convertCreditsToUSD(Number(microcredits) || 0).toFixed(digits)}`;
}

function formatNullableTimestamp(timestamp, fallback = 'Not set') {
    if (!timestamp) return fallback;
    return formatTimestamp(timestamp) || fallback;
}

function getPlanDisplayLabel(planCode = 'free', isAdmin = false) {
    if (isAdmin) return 'Admin';
    if (planCode === 'studio') return 'Studio Plan';
    if (planCode === 'pro') return 'Pro Plan';
    return 'Free';
}

function getPlanDescription(planCode = 'free', accountStatus = 'free', isAdmin = false) {
    if (isAdmin) {
        return 'Platform-managed administrator account with Studio-level BYOK tools.';
    }
    if (accountStatus === 'paid_suspended') {
        return 'Paid access is suspended. Renew Pro or activate Studio Access Pass to restore hosted access. Studio remains BYOK-only.';
    }
    if (planCode === 'studio') {
        return 'Advanced BYOK workspace with custom providers, Media Studio, and local Ollama. Hosted credits are not used in Studio.';
    }
    if (planCode === 'pro') {
        return 'Ready-to-use hosted writing workflow. Includes $3 monthly credits and supports extra Top-up Credits.';
    }
    return 'Trial-only hosted text access with $0.20 credit for 7 days.';
}

function getCurrentPlanStripDetail(context) {
    if (context.isAdmin) {
        return 'Platform admin access with Studio-level tools.';
    }

    if (context.effectiveAccountStatus === 'paid_suspended') {
        if (context.effectivePlanCode === 'pro') {
            return 'Subscription expired • Renew Pro or use Studio Access Pass to restore hosted access';
        }
        if (context.effectivePlanCode === 'studio') {
            return 'Subscription expired • Reactivate to restore Studio BYOK access';
        }
        return 'Access is suspended • Reactivate to continue using paid features';
    }

    if (context.effectivePlanCode === 'pro') {
        return 'Includes $3 monthly credits • Renews every billing cycle';
    }

    if (context.effectivePlanCode === 'studio') {
        return 'Using your own API keys • No hosted credits';
    }

    return `Trial access only • $0.20 credit expires ${formatNullableTimestamp(context.trialExpiresAt, 'in 7 days')}`;
}

function canPurchaseTopupsForContext(context) {
    return !context.isAdmin && context.effectiveAccountStatus === 'pro_active';
}

function getTopupBalanceHelper(context) {
    if (context.effectiveAccountStatus === 'paid_suspended') {
        return 'Stored until you renew Pro or activate Studio Access Pass';
    }
    if (context.effectivePlanCode === 'studio' || context.effectiveAccountStatus === 'studio_active') {
        return 'Stored wallet balance. Studio does not spend hosted credits';
    }
    if (context.effectivePlanCode === 'free') {
        return 'Top-up purchases unlock on Pro only';
    }
    return 'Persistent across billing cycles';
}

function getTopupUnavailableCopy(context) {
    if (context.isAdmin) {
        return 'Not applicable for the platform admin account.';
    }
    if (context.effectiveAccountStatus === 'paid_suspended') {
        return 'Top-up Credits remain stored, but you need to renew Pro or activate Studio Access Pass before buying or using them again.';
    }
    if (context.effectivePlanCode === 'studio' || context.effectiveAccountStatus === 'studio_active') {
        return 'Studio Plan is strict BYOK. It never purchases or burns PromptPrim Top-up Credits for normal model usage.';
    }
    return 'Free is trial-only. Upgrade to Pro to purchase Top-up Credits.';
}

function renderTopupButtons(offerings = []) {
    return offerings.map((offering) => `
        <button
            class="btn btn-small btn-secondary"
            data-action="checkout-offering"
            data-offering-key="${offering.offeringKey}"
            data-offering-kind="${offering.kind}"
        >
            ${offering.displayName}
        </button>
    `).join('');
}

function renderLocalTopupPresetButtons() {
    const refillPresets = [5, 10, 30, 50, 100];
    return refillPresets.map((amount) => (
        `<button class="btn btn-small btn-secondary" data-action="refill" data-amount="${amount}">$${amount}</button>`
    )).join('');
}

function renderTopupActions(context, refillOfferings = []) {
    if (context.isAdmin) {
        return '<p class="account-empty-copy">Not applicable.</p>';
    }

    if (canPurchaseTopupsForContext(context)) {
        if (context.isBackendManaged) {
            return refillOfferings.length > 0
                ? renderTopupButtons(refillOfferings)
                : '<p class="account-empty-copy">Stripe Top-up Credit offerings are not configured yet.</p>';
        }
        return renderLocalTopupPresetButtons();
    }

    return `<p class="account-empty-copy">${getTopupUnavailableCopy(context)}</p>`;
}

function renderCurrentPlanStrip(context) {
    const recommendation = !context.isAdmin && context.effectivePlanCode === 'free'
        ? '<div class="account-current-plan-recommendation">Recommended next step: Pro Plan for hosted AI without API setup.</div>'
        : '';

    return `
        <div class="account-current-plan-strip">
            <div class="account-current-plan-label">Current Plan</div>
            <div class="account-current-plan-main">
                <div class="account-current-plan-copy">
                    <div class="account-current-plan-value">${escapeHtml(context.currentPlanLabel)}</div>
                    <p class="account-current-plan-detail">${escapeHtml(getCurrentPlanStripDetail(context))}</p>
                </div>
                <div class="account-current-plan-meta">
                    <span class="account-plan-pill ${context.effectiveAccountStatus === 'paid_suspended' ? 'is-suspended' : 'is-current'}">${escapeHtml(context.backendStatusLabel || 'Local Mode')}</span>
                </div>
            </div>
            ${recommendation}
        </div>
    `;
}

function renderPlanComparisonTable() {
    const rows = PLAN_COMPARISON_ROWS.map(([label, proValue, studioValue]) => `
        <tr>
            <th scope="row">${escapeHtml(label)}</th>
            <td>${escapeHtml(proValue)}</td>
            <td>${escapeHtml(studioValue)}</td>
        </tr>
    `).join('');

    return `
        <div class="account-plan-compare-card">
            <div class="account-plan-compare-title">Quick Comparison</div>
            <div class="account-plan-compare-wrapper">
                <table class="account-plan-compare-table">
                    <thead>
                        <tr>
                            <th>Feature</th>
                            <th>Pro</th>
                            <th>Studio</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function getBillingStatusSummary(context) {
    if (context.isAdmin) {
        return 'Admin workspace';
    }

    if (context.effectiveAccountStatus === 'paid_suspended') {
        return 'Subscription expired • Reactivation required';
    }

    if (context.effectivePlanCode === 'pro') {
        return 'Active subscription • Renews monthly';
    }

    if (context.effectivePlanCode === 'studio') {
        return 'Active subscription • BYOK mode';
    }

    return 'No active subscription';
}

function getBillingStatusHelper(context) {
    if (context.effectiveAccountStatus === 'paid_suspended') {
        return 'Renew Pro, subscribe to Studio, or use Studio Access Pass to restore paid access.';
    }

    if (context.effectivePlanCode === 'pro') {
        return 'Hosted writing workflow with monthly credits and optional Top-up Credits.';
    }

    if (context.effectivePlanCode === 'studio') {
        return 'BYOK workspace with Media Studio, custom providers, and local Ollama.';
    }

    return 'Free stays in trial mode until you upgrade.';
}

function renderTopupCard(context) {
    let description = '';
    let body = '';

    if (context.isAdmin) {
        description = 'Not applicable for the platform admin account.';
        body = '<button type="button" class="btn btn-secondary btn-small" disabled>Admin Account</button>';
    } else if (context.effectiveAccountStatus === 'paid_suspended') {
        description = 'Stored Top-up Credits unlock again after you renew Pro or activate Studio Access Pass.';
        body = '<button type="button" class="btn btn-secondary btn-small" disabled>Reactivate Access First</button>';
    } else if (context.effectivePlanCode === 'pro' && context.effectiveAccountStatus === 'pro_active') {
        description = 'Add more credits when your monthly balance runs low.';
        body = `<div class="account-action-stack">${context.refillButtonsHTML}</div>`;
    } else if (context.effectivePlanCode === 'studio' || context.effectiveAccountStatus === 'studio_active') {
        description = 'Studio uses your own API keys. Hosted credits are not available.';
        body = '<button type="button" class="btn btn-secondary btn-small" disabled>Studio Is BYOK</button>';
    } else {
        description = 'Upgrade to Pro to purchase additional credits.';
        body = '<button type="button" class="btn btn-secondary btn-small" disabled>Upgrade to Pro</button>';
    }

    return `
        <div class="account-action-card">
            <h5>Top-up Credits</h5>
            <p>${escapeHtml(description)}</p>
            ${body}
        </div>
    `;
}

function renderBillingStatusCard(context) {
    const canManageBilling = Boolean(context.billingSnapshot.hasStripeCustomer);

    return `
        <div class="account-action-card">
            <h5>Billing Status</h5>
            <p>${escapeHtml(getBillingStatusSummary(context))}</p>
            <p class="account-inline-muted">${escapeHtml(getBillingStatusHelper(context))}</p>
            <button type="button" class="btn btn-secondary btn-small" ${canManageBilling ? 'data-action="manage-billing"' : 'disabled'}>Manage Billing</button>
        </div>
    `;
}

function renderReactivateAccessSection(context) {
    if (context.isAdmin || context.effectiveAccountStatus !== 'paid_suspended') {
        return '';
    }

    const canActivateAccessPass = context.topupCreditBalanceMicrocredits >= UserService.ACCESS_PASS_COST_MICROCREDITS;
    const actionHTML = canActivateAccessPass
        ? '<button type="button" class="btn" data-action="activate-access-pass">Activate with $7 (30 days)</button>'
        : `<p class="account-empty-copy">Studio Access Pass needs at least $7.00 in Top-up Credits. Current balance: ${formatCreditUSD(context.topupCreditBalanceMicrocredits)}.</p>`;

    return renderSectionCard('Reactivate Access', 'Your subscription has expired. You can continue using your account by:', `
        <div class="account-reactivation-list">
            <div>Subscribe to Studio ($8/month)</div>
            <div>Upgrade to Pro ($10/month)</div>
            <div>Use $7 from your balance for 30-day Studio Access</div>
        </div>
        <div class="account-form-actions">
            ${actionHTML}
        </div>
    `);
}

function renderPlanChoiceSection(context) {
    return renderSectionCard('Choose Your Plan', 'Upgrade your account for more AI power and creative tools.', `
        <div class="account-action-status" data-account-action-status aria-live="polite"></div>
        ${renderCurrentPlanStrip(context)}
        <div class="account-plan-grid account-plan-grid--upgrade">
            ${context.planCatalogHTML}
        </div>
        ${renderPlanComparisonTable()}
    `);
}

function renderBillingActionsSection(context) {
    return `
        ${renderSectionCard('Billing Actions', 'Manage credits, subscriptions, and access.', `
            <div class="account-action-grid">
                ${renderTopupCard(context)}
                ${renderBillingStatusCard(context)}
            </div>
        `)}
        ${renderReactivateAccessSection(context)}
        <div class="account-billing-footnote">
            Top-up credits are available for Pro users only. Monthly credits reset every billing cycle and do not roll over.
        </div>
    `;
}

function getPlanOfferingByPlanCode(subscriptionOfferings = [], planCode = '') {
    const normalizedPlanCode = String(planCode || '').trim().toLowerCase();
    return subscriptionOfferings.find((offering) => String(offering.planCode || '').trim().toLowerCase() === normalizedPlanCode) || null;
}

function renderPlanCardAction(plan, context) {
    const isCurrentPlan = context.effectivePlanCode === plan.planCode && context.effectiveAccountStatus !== 'paid_suspended';
    const isSuspendedCurrentPlan = context.effectivePlanCode === plan.planCode && context.effectiveAccountStatus === 'paid_suspended';
    const isBackendManaged = context.isBackendManaged;
    const offering = getPlanOfferingByPlanCode(context.subscriptionOfferings, plan.planCode);

    if (context.isAdmin) {
        return '<button type="button" class="btn btn-secondary" disabled>Admin Workspace</button>';
    }

    if (isCurrentPlan) {
        return '<button type="button" class="btn btn-secondary" disabled>Current Plan</button>';
    }

    if (isBackendManaged) {
        if (!offering?.checkoutReady) {
            return '<button type="button" class="btn btn-secondary" disabled>Not Configured</button>';
        }

        const actionLabel = isSuspendedCurrentPlan
            ? `Renew ${plan.title.replace(/\s+Plan$/, '')}`
            : plan.buttonLabel;
        const buttonClass = plan.planCode === 'pro' ? 'btn' : 'btn btn-secondary';

        return `
            <button
                type="button"
                class="${buttonClass}"
                data-action="checkout-offering"
                data-offering-key="${offering.offeringKey}"
                data-offering-kind="${offering.kind}"
            >
                ${actionLabel}
            </button>
        `;
    }

    const localLabel = isSuspendedCurrentPlan
        ? `Renew ${plan.title.replace(/\s+Plan$/, '')}`
        : plan.buttonLabel;
    const localButtonClass = plan.planCode === 'pro' ? 'btn' : 'btn btn-secondary';

    return `<button type="button" class="${localButtonClass}" data-action="switch-plan" data-plan="${plan.planCode}">${localLabel}</button>`;
}

function renderPlanCatalog(context) {
    return PLAN_CATALOG.map((plan) => {
        const offering = getPlanOfferingByPlanCode(context.subscriptionOfferings, plan.planCode);
        const isCurrentPlan = context.effectivePlanCode === plan.planCode && context.effectiveAccountStatus !== 'paid_suspended';
        const isSuspendedCurrentPlan = context.effectivePlanCode === plan.planCode && context.effectiveAccountStatus === 'paid_suspended';
        const isRecommended = plan.planCode === 'pro';
        const priceUSD = offering?.amountUSD ?? plan.defaultPriceUSD;
        const priceLabel = `$${priceUSD.toFixed(2)}`;
        const statusPill = isCurrentPlan
            ? '<span class="account-plan-pill is-current">Current Plan</span>'
            : (isSuspendedCurrentPlan
                ? '<span class="account-plan-pill is-suspended">Needs Renewal</span>'
                : (isRecommended
                    ? `<span class="account-plan-pill is-recommended">${escapeHtml(plan.badge)}</span>`
                    : `<span class="account-plan-pill">${escapeHtml(plan.badge)}</span>`));

        return `
            <article class="account-plan-card ${isCurrentPlan ? 'is-current' : ''} ${isRecommended ? 'is-recommended' : ''} ${plan.planCode === 'studio' ? 'is-secondary' : 'is-primary'}">
                <div class="account-plan-card-header">
                    <div>
                        <h5>${escapeHtml(plan.title)}</h5>
                    </div>
                    ${statusPill}
                </div>
                <p class="account-plan-card-summary">${escapeHtml(plan.description)}</p>
                <div class="account-plan-price-row">
                    <div class="account-plan-price">${priceLabel}</div>
                    <div class="account-plan-price-suffix">${escapeHtml(plan.priceSuffix)}</div>
                </div>
                <div class="account-plan-helper">${escapeHtml(plan.helper)}</div>
                <div class="account-plan-cta">
                    ${renderPlanCardAction(plan, context)}
                </div>
                <ul class="account-plan-feature-list">
                    ${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}
                </ul>
            </article>
        `;
    }).join('');
}

function renderSectionNav() {
    return ACCOUNT_SECTIONS.map((section) => `
        <button
            type="button"
            class="account-section-btn ${activeAccountSection === section.key ? 'is-active' : ''}"
            data-account-section="${section.key}"
        >
            <span class="account-section-btn-label">${section.label}</span>
            <span class="account-section-btn-helper">${section.helper}</span>
        </button>
    `).join('');
}

function renderHeroBlock(context) {
    const {
        user,
        accountProfile,
        isAdmin,
        currentPlanLabel,
        backendStatusLabel,
        balanceUSD,
        totalCreditBalanceMicrocredits,
        isBackendManaged
    } = context;

    const displayName = getDraftField('profile', 'displayName', accountProfile?.displayName || user.userName || 'User');
    const email = getDraftField('profile', 'email', accountProfile?.email || user.email || 'No email available');
    const avatarUrl = getDraftField('profile', 'avatarUrl', accountProfile?.avatarUrl || user.avatarUrl || user.billingProfile?.avatarUrl || '');

    return `
        <section class="account-hero-card">
            <div class="account-hero-main">
                <div class="account-avatar-stack">
                    ${renderAvatarPreview(displayName, avatarUrl)}
                    <div class="account-avatar-actions">
                        <button type="button" class="btn btn-secondary btn-small" data-action="pick-avatar">${avatarUrl ? 'Change Photo' : 'Upload Photo'}</button>
                        ${avatarUrl ? '<button type="button" class="btn btn-secondary btn-small" data-action="clear-avatar">Remove</button>' : ''}
                    </div>
                </div>
                <div class="account-hero-copy">
                    <div class="account-hero-eyebrow">PromptPrim Account</div>
                    <h4>${escapeHtml(displayName)}</h4>
                    <p>${escapeHtml(email)}</p>
                    <div class="account-badge-row">
                        <span class="account-badge">${currentPlanLabel}</span>
                        <span class="account-badge is-muted">${backendStatusLabel || 'Local Mode'}</span>
                        ${isBackendManaged ? '<span class="account-badge is-muted">Supabase Sync</span>' : '<span class="account-badge is-muted">Local Profile</span>'}
                        ${isAdmin ? '<span class="account-badge is-accent">Platform Admin</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="account-hero-side">
                <div class="account-hero-stat-label">Total Credit Balance</div>
                <div class="account-hero-stat-value">$${balanceUSD.toFixed(2)}</div>
                <div class="account-hero-stat-meta">${Math.floor(totalCreditBalanceMicrocredits).toLocaleString()} microcredits</div>
            </div>
        </section>
    `;
}

function renderMetricCard(label, value, helper = '') {
    return `
        <div class="account-metric-card">
            <div class="account-metric-label">${label}</div>
            <div class="account-metric-value">${value}</div>
            ${helper ? `<div class="account-metric-helper">${helper}</div>` : ''}
        </div>
    `;
}

function renderField(label, value, helper = '') {
    return `
        <div class="form-group">
            <label>${label}</label>
            <input type="text" value="${value}" readonly>
            ${helper ? `<p>${helper}</p>` : ''}
        </div>
    `;
}

function renderEditableField({
    label,
    value = '',
    helper = '',
    scope = 'profile',
    field = '',
    type = 'text',
    placeholder = '',
    readonly = false
}) {
    return `
        <div class="form-group">
            <label>${escapeHtml(label)}</label>
            <input
                type="${escapeHtml(type)}"
                value="${escapeHtml(value)}"
                ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''}
                ${readonly ? 'readonly' : ''}
                data-account-draft-scope="${escapeHtml(scope)}"
                data-account-draft-field="${escapeHtml(field)}"
            >
            ${helper ? `<p>${escapeHtml(helper)}</p>` : ''}
        </div>
    `;
}

function renderSectionCard(title, subtitle, body) {
    return `
        <section class="account-section-card">
            <div class="account-section-card-header">
                <h4>${title}</h4>
                ${subtitle ? `<p>${subtitle}</p>` : ''}
            </div>
            <div class="account-section-card-body">
                ${body}
            </div>
        </section>
    `;
}

function renderPlaceholderCard(title, text, actionLabel = 'Coming next') {
    return renderSectionCard(
        title,
        '',
        `
            <div class="account-placeholder-card">
                <p>${text}</p>
                <button type="button" class="btn btn-secondary btn-small" disabled>${actionLabel}</button>
            </div>
        `
    );
}

function renderOverviewSection(context) {
    const {
        currentPlanLabel,
        currentPlanDescription,
        monthlyCreditBalanceMicrocredits,
        topupCreditBalanceMicrocredits,
        totalCreditBalanceMicrocredits,
        trialExpiresAt,
        monthlyCreditExpiresAt,
        accessPassExpiresAt,
        backendStatusLabel,
        backendUsageSummaryHTML
    } = context;

    const metricsHTML = `
        <div class="account-metric-grid">
            ${renderMetricCard('Current Plan', currentPlanLabel, currentPlanDescription)}
            ${renderMetricCard('Monthly Credits (Pro)', formatCreditUSD(monthlyCreditBalanceMicrocredits), monthlyCreditExpiresAt ? `Expires ${formatNullableTimestamp(monthlyCreditExpiresAt)}` : 'No active monthly grant')}
            ${renderMetricCard('Top-up Credits', formatCreditUSD(topupCreditBalanceMicrocredits), context.topupBalanceHelper)}
            ${renderMetricCard('Total Balance', formatCreditUSD(totalCreditBalanceMicrocredits), backendStatusLabel || 'Local mode')}
        </div>
    `;

    const timelineHTML = `
        <div class="account-timeline-grid">
            <div class="account-timeline-item">
                <span class="label">Trial Ends</span>
                <strong>${formatNullableTimestamp(trialExpiresAt, 'Not applicable')}</strong>
            </div>
            <div class="account-timeline-item">
                <span class="label">Monthly Credits Expire</span>
                <strong>${formatNullableTimestamp(monthlyCreditExpiresAt, 'Not applicable')}</strong>
            </div>
            <div class="account-timeline-item">
                <span class="label">Studio Access Pass</span>
                <strong>${formatNullableTimestamp(accessPassExpiresAt, 'Not active')}</strong>
            </div>
        </div>
    `;

    return `
        ${renderSectionCard('Overview', 'Your current PromptPrim plan, balance, and next actions.', metricsHTML)}
        ${renderSectionCard('Credits & Access', 'Monthly credits are used first, then Top-up Credits.', timelineHTML)}
        ${renderPlanChoiceSection(context)}
        ${renderBillingActionsSection(context)}
        ${backendUsageSummaryHTML}
    `;
}

function renderProfileSection(context) {
    const { user, isBackendManaged, currentPlanLabel, accountProfile } = context;
    const displayName = getDraftField('profile', 'displayName', accountProfile?.displayName || user.userName || '');
    const email = getDraftField('profile', 'email', accountProfile?.email || user.email || '');
    const avatarUrl = getDraftField('profile', 'avatarUrl', accountProfile?.avatarUrl || user.avatarUrl || user.billingProfile?.avatarUrl || '');
    const billingName = getDraftField('profile', 'billingName', accountProfile?.billingName || displayName);
    const billingCompany = getDraftField('profile', 'billingCompany', accountProfile?.billingCompany || '');
    const billingPhone = getDraftField('profile', 'billingPhone', accountProfile?.billingPhone || '');

    return `
        ${renderSectionCard('Profile', 'Identity details and account ownership.', `
            <div class="account-profile-grid">
                <div class="account-profile-sidebar">
                    <div class="account-profile-photo-card">
                        ${renderAvatarPreview(displayName, avatarUrl, { sizeClass: 'is-large' })}
                        <h5>${escapeHtml(displayName || 'User')}</h5>
                        <p>${currentPlanLabel}</p>
                        <div class="account-avatar-actions">
                            <button type="button" class="btn btn-secondary btn-small" data-action="pick-avatar">${avatarUrl ? 'Change Photo' : 'Upload Photo'}</button>
                            ${avatarUrl ? '<button type="button" class="btn btn-secondary btn-small" data-action="clear-avatar">Remove</button>' : ''}
                        </div>
                        <p class="account-inline-note">PromptPrim stores a compact square avatar here now. We can move it to Storage later without changing this layout.</p>
                    </div>
                </div>
                <div class="account-profile-fields">
                    <div class="account-form-grid">
                        ${renderEditableField({
                            label: 'Display Name',
                            value: displayName,
                            field: 'displayName',
                            helper: isBackendManaged
                                ? 'This updates both your PromptPrim profile and Supabase display name.'
                                : 'Local profile field.',
                            placeholder: 'Your display name'
                        })}
                        ${renderEditableField({
                            label: 'Email',
                            value: email,
                            type: 'email',
                            field: 'email',
                            helper: isBackendManaged
                                ? 'Changing email may require confirmation from your new inbox.'
                                : 'Primary login email.',
                            placeholder: 'name@example.com'
                        })}
                        ${renderEditableField({
                            label: 'Photo URL',
                            value: avatarUrl,
                            field: 'avatarUrl',
                            helper: 'Optional override if you prefer a hosted image URL instead of an uploaded avatar.',
                            placeholder: 'https://...'
                        })}
                        ${renderField('User ID', accountProfile?.userId || user.userId || '', 'PromptPrim account identifier.')}
                        ${renderField('Auth Source', isBackendManaged ? 'Supabase' : 'Local', isBackendManaged ? 'Hosted auth and billing state sync from Supabase.' : 'Browser-local testing profile.')}
                    </div>
                </div>
            </div>
        `)}
        ${renderSectionCard('Profile Details', 'Billing identity fields are available now even before Stripe is connected.', `
            <div class="account-form-grid">
                ${renderEditableField({
                    label: 'Billing Name',
                    value: billingName,
                    field: 'billingName',
                    helper: 'Shown on future bills and account paperwork.',
                    placeholder: 'Full billing name'
                })}
                ${renderEditableField({
                    label: 'Company',
                    value: billingCompany,
                    field: 'billingCompany',
                    helper: 'Optional company or organization name.',
                    placeholder: 'Company name'
                })}
                ${renderEditableField({
                    label: 'Phone',
                    value: billingPhone,
                    field: 'billingPhone',
                    helper: 'Optional contact phone for billing support.',
                    placeholder: '+66 ...'
                })}
            </div>
            <div class="account-form-actions">
                <button type="button" class="btn" data-action="save-profile">Save Profile</button>
            </div>
        `)}
    `;
}

function renderSecuritySection(context) {
    const { isBackendManaged, accountProfile } = context;
    const recoveryEmail = getDraftField('security', 'recoveryEmail', accountProfile?.email || '');
    const nextPassword = getDraftField('security', 'nextPassword', '');
    const confirmPassword = getDraftField('security', 'confirmPassword', '');
    return `
        ${renderSectionCard('Security', 'Password, recovery, and sign-in safety.', `
            <div class="account-action-grid">
                <div class="account-action-card">
                    <h5>Password</h5>
                    <p>${isBackendManaged ? 'Supabase-authenticated account. Set a new password here.' : 'Local testing account.'}</p>
                    <div class="account-security-fields">
                        ${renderEditableField({
                            label: 'New Password',
                            value: nextPassword,
                            type: 'password',
                            scope: 'security',
                            field: 'nextPassword',
                            helper: 'At least 8 characters.',
                            placeholder: 'New password'
                        })}
                        ${renderEditableField({
                            label: 'Confirm Password',
                            value: confirmPassword,
                            type: 'password',
                            scope: 'security',
                            field: 'confirmPassword',
                            helper: 'Repeat the new password.',
                            placeholder: 'Confirm password'
                        })}
                    </div>
                    <button type="button" class="btn btn-secondary btn-small" ${isBackendManaged ? 'data-action="change-password"' : 'disabled'}>Change Password</button>
                </div>
                <div class="account-action-card">
                    <h5>Recovery</h5>
                    <p>Send a password recovery email to the address you want to use for account recovery.</p>
                    ${renderEditableField({
                        label: 'Recovery Email',
                        value: recoveryEmail,
                        type: 'email',
                        scope: 'security',
                        field: 'recoveryEmail',
                        helper: 'The reset link will open PromptPrim auth in recovery mode.',
                        placeholder: 'name@example.com'
                    })}
                    <button type="button" class="btn btn-secondary btn-small" ${isBackendManaged ? 'data-action="send-recovery-email"' : 'disabled'}>Send Recovery Email</button>
                </div>
            </div>
        `)}
        ${renderSectionCard('Sessions & Security Log', 'Account session controls are the next SaaS hardening step.', `
            <div class="account-placeholder-card">
                <p>Current password, recovery flow, and identity changes are now handled here. Device/session history can be layered in next without changing the account layout again.</p>
                <button type="button" class="btn btn-secondary btn-small" disabled>Coming next</button>
            </div>
        `)}
    `;
}

function renderBillingSection(context) {
    const {
        accountProfile,
        billingSnapshot,
        currentPlanLabel,
        backendStatusLabel,
        backendBillingPurchasesHTML
    } = context;
    const billingName = getDraftField('profile', 'billingName', accountProfile?.billingName || '');
    const billingCompany = getDraftField('profile', 'billingCompany', accountProfile?.billingCompany || '');
    const billingPhone = getDraftField('profile', 'billingPhone', accountProfile?.billingPhone || '');
    const billingAddressLine1 = getDraftField('profile', 'billingAddressLine1', accountProfile?.billingAddressLine1 || '');
    const billingAddressLine2 = getDraftField('profile', 'billingAddressLine2', accountProfile?.billingAddressLine2 || '');
    const billingCity = getDraftField('profile', 'billingCity', accountProfile?.billingCity || '');
    const billingState = getDraftField('profile', 'billingState', accountProfile?.billingState || '');
    const billingPostalCode = getDraftField('profile', 'billingPostalCode', accountProfile?.billingPostalCode || '');
    const billingCountry = getDraftField('profile', 'billingCountry', accountProfile?.billingCountry || '');

    const subscription = billingSnapshot.subscription;
    const subscriptionBody = subscription
        ? `
            <div class="account-form-grid">
                ${renderField('Active Plan', getPlanDisplayLabel(subscription.planCode || 'free'), currentPlanLabel)}
                ${renderField('Subscription Status', String(subscription.status || 'incomplete'), backendStatusLabel || '')}
                ${renderField('Current Period Start', formatNullableTimestamp(subscription.currentPeriodStart, 'Not available'))}
                ${renderField('Current Period End', formatNullableTimestamp(subscription.currentPeriodEnd, 'Not available'))}
            </div>
        `
        : '<p class="account-empty-copy">No active Stripe subscription is connected yet.</p>';

    return `
        ${renderSectionCard('Subscription', 'Your active plan and renewal state.', subscriptionBody)}
        ${renderPlanChoiceSection(context)}
        ${renderBillingActionsSection(context)}
        ${renderSectionCard('Billing Identity & Address', 'These details can be saved now and reused later when Stripe is live.', `
            <div class="account-form-grid">
                ${renderEditableField({
                    label: 'Billing Name',
                    value: billingName,
                    field: 'billingName',
                    helper: 'Name used for invoices and account ownership.',
                    placeholder: 'Full billing name'
                })}
                ${renderEditableField({
                    label: 'Company',
                    value: billingCompany,
                    field: 'billingCompany',
                    helper: 'Optional company or organization.',
                    placeholder: 'Company'
                })}
                ${renderEditableField({
                    label: 'Phone',
                    value: billingPhone,
                    field: 'billingPhone',
                    helper: 'Optional billing contact number.',
                    placeholder: '+66 ...'
                })}
                ${renderEditableField({
                    label: 'Country',
                    value: billingCountry,
                    field: 'billingCountry',
                    helper: 'Country or region.',
                    placeholder: 'Thailand'
                })}
                ${renderEditableField({
                    label: 'Address Line 1',
                    value: billingAddressLine1,
                    field: 'billingAddressLine1',
                    helper: 'Street address or billing line 1.',
                    placeholder: '123 Main Street'
                })}
                ${renderEditableField({
                    label: 'Address Line 2',
                    value: billingAddressLine2,
                    field: 'billingAddressLine2',
                    helper: 'Apartment, suite, or building.',
                    placeholder: 'Suite / Floor / Apt'
                })}
                ${renderEditableField({
                    label: 'City',
                    value: billingCity,
                    field: 'billingCity',
                    helper: 'City or district.',
                    placeholder: 'Bangkok'
                })}
                ${renderEditableField({
                    label: 'State / Province',
                    value: billingState,
                    field: 'billingState',
                    helper: 'State, province, or region.',
                    placeholder: 'Bangkok'
                })}
                ${renderEditableField({
                    label: 'Postal Code',
                    value: billingPostalCode,
                    field: 'billingPostalCode',
                    helper: 'ZIP or postal code.',
                    placeholder: '10110'
                })}
            </div>
            <div class="account-form-actions">
                <button type="button" class="btn" data-action="save-billing-profile">Save Billing Details</button>
            </div>
        `)}
        ${renderSectionCard('Payment Settings', 'Cards, invoices, billing address, and Stripe portal live here.', `
            <div class="account-action-grid">
                <div class="account-action-card">
                    <h5>Manage Billing</h5>
                    <p>${billingSnapshot.hasStripeCustomer ? 'Open the Stripe customer portal to manage payment method and invoices.' : 'This appears after the first successful checkout creates a Stripe customer.'}</p>
                    <button type="button" class="btn btn-secondary btn-small" ${billingSnapshot.hasStripeCustomer ? 'data-action="manage-billing"' : 'disabled'}>Open Billing Portal</button>
                </div>
                <div class="account-action-card">
                    <h5>Billing Address</h5>
                    <p>Your saved billing identity now lives above, and payment-method sync will slot in here once Stripe is connected.</p>
                    <button type="button" class="btn btn-secondary btn-small" disabled>Edit Billing Address</button>
                </div>
            </div>
        `)}
        ${renderSectionCard('Recent Payments', 'Stripe subscriptions and Top-up Credits recorded for this account.', backendBillingPurchasesHTML)}
    `;
}

function renderUsageSection(context) {
    const { backendUsageHTML, user, totalCreditBalanceMicrocredits, monthlyCreditBalanceMicrocredits, topupCreditBalanceMicrocredits } = context;

    return `
        ${renderSectionCard('Usage Stats', 'A quick summary of hosted usage and current credit mix.', `
            <div class="account-metric-grid">
                ${renderMetricCard('Current Balance', formatCreditUSD(totalCreditBalanceMicrocredits), `${Math.floor(totalCreditBalanceMicrocredits).toLocaleString()} microcredits`)}
                ${renderMetricCard('Monthly Credits', formatCreditUSD(monthlyCreditBalanceMicrocredits), 'Used first for Pro accounts')}
                ${renderMetricCard('Top-up Credits', formatCreditUSD(topupCreditBalanceMicrocredits), context.topupBalanceHelper)}
                ${renderMetricCard('Total Usage', `$${Number(user.credits?.totalUsedUSD || 0).toFixed(4)}`, 'Historical hosted usage')}
            </div>
        `)}
        ${renderSectionCard('Recent Usage', 'Latest hosted model activity.', backendUsageHTML || '<p class="account-empty-copy">No usage history available yet.</p>')}
    `;
}

function renderHistorySection(context) {
    const { backendLedgerHTML, backendBillingPurchasesHTML, billingSnapshot } = context;
    return `
        ${renderSectionCard('Wallet & Credit History', 'Monthly grants, Top-up Credits, usage deductions, and access pass events.', backendLedgerHTML || '<p class="account-empty-copy">No wallet history available yet.</p>')}
        ${renderSectionCard('Bills & Payments', billingSnapshot.hasStripeCustomer
            ? 'Recorded Stripe purchases, subscriptions, and invoice-linked events.'
            : 'Billing records appear here after the first successful hosted purchase.', backendBillingPurchasesHTML)}
    `;
}

function renderSectionContent(context) {
    switch (activeAccountSection) {
        case 'profile':
            return renderProfileSection(context);
        case 'security':
            return renderSecuritySection(context);
        case 'billing':
            return renderBillingSection(context);
        case 'usage':
            return renderUsageSection(context);
        case 'history':
            return renderHistorySection(context);
        case 'overview':
        default:
            return renderOverviewSection(context);
    }
}

export async function renderAccountModal() {
    const preservedSidebarScrollTop = getPreservedSidebarScrollTop();
    const user = UserService.getCurrentUserProfile();
    if (!modalBody || !user) {
        modalBody.innerHTML = '<p>Could not load user data.</p>';
        return;
    }

    const isAdmin = UserService.isAdminProfile(user);
    const isBackendManaged = UserService.isBackendManagedProfile(user);
    let accountProfile = null;
    let billingSnapshot = {
        offerings: [],
        subscription: null,
        hasStripeCustomer: false,
        profile: null,
        wallet: null
    };

    try {
        accountProfile = await AccountProfileService.fetchEditableAccountProfile(user);
    } catch (error) {
        console.error('Could not load editable account profile.', error);
    }

    syncAccountEditorState(accountProfile || {
        displayName: user.userName || '',
        email: user.email || '',
        avatarUrl: user.avatarUrl || user.billingProfile?.avatarUrl || '',
        billingName: user.billingProfile?.billingName || user.userName || '',
        billingCompany: user.billingProfile?.billingCompany || '',
        billingPhone: user.billingProfile?.billingPhone || '',
        billingAddressLine1: user.billingProfile?.billingAddressLine1 || '',
        billingAddressLine2: user.billingProfile?.billingAddressLine2 || '',
        billingCity: user.billingProfile?.billingCity || '',
        billingState: user.billingProfile?.billingState || '',
        billingPostalCode: user.billingProfile?.billingPostalCode || '',
        billingCountry: user.billingProfile?.billingCountry || ''
    });

    if (isBackendManaged && StripeBillingService.isStripeBillingAvailable()) {
        try {
            billingSnapshot = await StripeBillingService.fetchBillingSnapshot();
        } catch (error) {
            console.error('Could not load Stripe billing snapshot.', error);
        }
    }

    const effectivePlanCode = String(
        billingSnapshot.profile?.planCode
        || user.backendAccount?.planCode
        || user.plan
        || 'free'
    ).trim().toLowerCase() || 'free';

    let effectiveAccountStatus = String(
        billingSnapshot.profile?.accountStatus
        || user.backendAccount?.accountStatus
        || UserService.getEffectiveAccountStatus(user)
    ).trim().toLowerCase() || 'free';

    const localCreditBuckets = UserService.getCreditBucketSummary(user);
    const monthlyCreditBalanceMicrocredits = Number(
        billingSnapshot.wallet?.monthlyCreditBalanceMicrocredits
        ?? localCreditBuckets.monthlyMicrocredits
        ?? 0
    ) || 0;
    const topupCreditBalanceMicrocredits = Number(
        billingSnapshot.wallet?.topupCreditBalanceMicrocredits
        ?? localCreditBuckets.topupMicrocredits
        ?? 0
    ) || 0;
    const totalCreditBalanceMicrocredits = Number(
        billingSnapshot.wallet?.balanceMicrocredits
        ?? localCreditBuckets.totalMicrocredits
        ?? (monthlyCreditBalanceMicrocredits + topupCreditBalanceMicrocredits)
    ) || 0;
    const trialExpiresAt = billingSnapshot.profile?.trialExpiresAt
        || user.backendAccount?.trialEndsAt
        || user.trialEndsAt
        || null;
    const accessPassExpiresAt = billingSnapshot.profile?.accessPassExpiresAt
        || user.backendAccount?.accessPassExpiresAt
        || user.accessPassExpiresAt
        || null;

    if (
        effectiveAccountStatus === 'studio_active'
        && accessPassExpiresAt
        && Number.isFinite(new Date(accessPassExpiresAt).getTime())
        && new Date(accessPassExpiresAt).getTime() <= Date.now()
    ) {
        effectiveAccountStatus = 'paid_suspended';
    }

    const monthlyCreditExpiresAt = billingSnapshot.wallet?.monthlyCreditExpiresAt
        || localCreditBuckets.monthlyExpiresAt
        || null;
    const currentPlanLabel = getPlanDisplayLabel(effectivePlanCode, isAdmin);
    const currentPlanDescription = getPlanDescription(effectivePlanCode, effectiveAccountStatus, isAdmin);
    const backendStatusLabel = effectiveAccountStatus
        ? effectiveAccountStatus.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
        : null;
    const balanceUSD = convertCreditsToUSD(totalCreditBalanceMicrocredits);

    const subscriptionOfferings = billingSnapshot.offerings.filter((offering) => offering.kind === 'subscription' && offering.checkoutReady);
    const refillOfferings = billingSnapshot.offerings.filter((offering) => offering.kind === 'topup' && offering.checkoutReady);
    const topupPolicyContext = {
        user,
        isAdmin,
        isBackendManaged,
        effectivePlanCode,
        effectiveAccountStatus,
        topupCreditBalanceMicrocredits,
        subscriptionOfferings
    };
    const topupBalanceHelper = getTopupBalanceHelper(topupPolicyContext);
    const refillButtonsHTML = renderTopupActions(topupPolicyContext, refillOfferings);
    const planCatalogHTML = renderPlanCatalog(topupPolicyContext);

    let backendUsageHTML = '<p class="account-empty-copy">No backend usage recorded yet.</p>';
    let backendLedgerHTML = '<p class="account-empty-copy">No backend wallet events recorded yet.</p>';
    let backendBillingPurchasesHTML = '<p class="account-empty-copy">No payment history is recorded yet.</p>';
    let backendUsageSummaryHTML = renderSectionCard('Recent Usage Snapshot', 'Latest hosted activity at a glance.', '<p class="account-empty-copy">No backend usage recorded yet.</p>');

    if (isBackendManaged && BackendAccountDataService.isBackendAccountDataAvailable(user)) {
        try {
            const backendSnapshot = await BackendAccountDataService.fetchBackendAccountSnapshot(user, { limit: 10 });
            backendUsageHTML = renderBackendUsageRows(backendSnapshot.usageEvents);
            backendLedgerHTML = renderBackendLedgerRows(backendSnapshot.walletLedger);
            backendBillingPurchasesHTML = renderBackendBillingPurchaseRows(backendSnapshot.billingPurchases);
            backendUsageSummaryHTML = renderSectionCard(
                'Recent Usage Snapshot',
                'Latest hosted model calls and charges.',
                backendUsageHTML
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Could not load backend account history.';
            backendUsageHTML = `<p class="account-empty-copy">${errorMessage}</p>`;
            backendLedgerHTML = `<p class="account-empty-copy">${errorMessage}</p>`;
            backendBillingPurchasesHTML = `<p class="account-empty-copy">${errorMessage}</p>`;
            backendUsageSummaryHTML = renderSectionCard('Recent Usage Snapshot', 'Latest hosted model calls and charges.', backendUsageHTML);
        }
    }

    const context = {
        user,
        accountProfile,
        isAdmin,
        isBackendManaged,
        billingSnapshot,
        currentPlanLabel,
        currentPlanDescription,
        effectivePlanCode,
        effectiveAccountStatus,
        backendStatusLabel,
        balanceUSD,
        totalCreditBalanceMicrocredits,
        monthlyCreditBalanceMicrocredits,
        topupCreditBalanceMicrocredits,
        trialExpiresAt,
        monthlyCreditExpiresAt,
        accessPassExpiresAt,
        planCatalogHTML,
        refillButtonsHTML,
        topupBalanceHelper,
        subscriptionOfferings,
        refillOfferings,
        backendUsageHTML,
        backendLedgerHTML,
        backendBillingPurchasesHTML,
        backendUsageSummaryHTML
    };

    modalBody.innerHTML = `
        <div class="account-workspace">
            <aside class="account-sidebar">
                ${renderHeroBlock(context)}
                <nav class="account-section-nav" aria-label="Account sections">
                    ${renderSectionNav()}
                </nav>
            </aside>
            <section class="account-content">
                ${renderSectionContent(context)}
            </section>
        </div>
    `;

    wireAccountSidebarScrollState(preservedSidebarScrollTop);
}

export function initAccountUI() {
    stateManager.bus.subscribe('ui:showAccountModal', showAccountModal);

    avatarInput?.addEventListener('change', async (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement)) return;

        const selectedFile = input.files?.[0] || null;
        if (!selectedFile) return;

        try {
            await handleAvatarSelection(selectedFile);
        } catch (error) {
            showCustomAlert(
                error instanceof Error ? error.message : 'Could not process the selected profile picture.',
                'Photo Upload Failed'
            );
        } finally {
            input.value = '';
        }
    });

    modal?.addEventListener('input', (e) => {
        const inputTarget = e.target;
        if (!(inputTarget instanceof HTMLInputElement || inputTarget instanceof HTMLTextAreaElement || inputTarget instanceof HTMLSelectElement)) {
            return;
        }

        const scope = String(inputTarget.dataset.accountDraftScope || '').trim();
        const field = String(inputTarget.dataset.accountDraftField || '').trim();
        if (!scope || !field) return;
        setDraftField(scope, field, inputTarget.value);
    });

    modal?.addEventListener('click', async (e) => {
        const target = e.target;

        if (target.matches('.modal-close-btn')) {
            hideAccountModal();
            return;
        }

        const actionTarget = e.target.closest('[data-action], [data-account-section]');
        if (!actionTarget) return;

        if (actionTarget.dataset.accountSection) {
            setActiveAccountSection(actionTarget.dataset.accountSection);
            return;
        }

        const action = actionTarget.dataset.action;
        if (action === 'switch-plan') {
            AccountHandlers.handlePlanChange(actionTarget.dataset.plan);
        } else if (action === 'refill') {
            AccountHandlers.handleSelfRefill(parseInt(actionTarget.dataset.amount, 10));
        } else if (action === 'checkout-offering') {
            const releaseFeedback = beginAccountActionFeedback(actionTarget, 'Preparing secure Stripe checkout...');
            try {
                await AccountHandlers.handleCheckoutOffering(
                    actionTarget.dataset.offeringKey,
                    actionTarget.dataset.offeringKind
                );
            } finally {
                releaseFeedback();
            }
        } else if (action === 'manage-billing') {
            const releaseFeedback = beginAccountActionFeedback(actionTarget, 'Opening Stripe customer portal...');
            try {
                await AccountHandlers.handleManageBilling();
            } finally {
                releaseFeedback();
            }
        } else if (action === 'activate-access-pass') {
            const releaseFeedback = beginAccountActionFeedback(actionTarget, 'Activating Studio Access Pass...');
            try {
                await AccountHandlers.handleActivateAccessPass();
            } finally {
                releaseFeedback();
            }
        } else if (action === 'pick-avatar') {
            if (!avatarInput) {
                showCustomAlert('Profile photo upload is not available in this build.', 'Photo Upload');
                return;
            }
            avatarInput.value = '';
            avatarInput.click();
        } else if (action === 'clear-avatar') {
            await handleAvatarRemoval();
        } else if (action === 'save-profile') {
            await AccountHandlers.handleSaveAccountProfile(getAccountProfileDraftPayload(), {
                successTitle: 'Profile Saved',
                successMessage: 'Your profile details have been updated.'
            });
        } else if (action === 'save-billing-profile') {
            await AccountHandlers.handleSaveAccountProfile(getAccountProfileDraftPayload(), {
                successTitle: 'Billing Details Saved',
                successMessage: 'Your billing identity and address have been updated.'
            });
        } else if (action === 'change-password') {
            const changed = await AccountHandlers.handleChangePassword({
                nextPassword: getDraftField('security', 'nextPassword', ''),
                confirmPassword: getDraftField('security', 'confirmPassword', '')
            });
            if (changed) {
                clearSecurityDraftFields();
                renderAccountModal().catch((error) => {
                    console.error('Could not refresh the account modal after password update.', error);
                });
            }
        } else if (action === 'send-recovery-email') {
            await AccountHandlers.handleSendRecoveryEmail(getDraftField('security', 'recoveryEmail', ''));
        }
    });

    stateManager.bus.subscribe('user:settingsUpdated', () => {
        if (modal && modal.style.display === 'flex') {
            renderAccountModal().catch((error) => {
                console.error('Could not refresh the account modal.', error);
            });
        }
    });
}
