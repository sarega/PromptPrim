import './styles/main.css';
import './styles/auth.css';

import * as AuthService from './js/modules/auth/auth.service.js';

const state = {
    mode: 'signin'
};

function getElements() {
    return {
        title: document.getElementById('auth-title'),
        subtitle: document.getElementById('auth-subtitle'),
        configWarning: document.getElementById('auth-config-warning'),
        status: document.getElementById('auth-status'),
        form: document.getElementById('auth-form'),
        displayNameGroup: document.getElementById('auth-display-name-group'),
        displayNameInput: document.getElementById('auth-display-name'),
        confirmPasswordGroup: document.getElementById('auth-confirm-password-group'),
        confirmPasswordInput: document.getElementById('auth-confirm-password'),
        emailInput: document.getElementById('auth-email'),
        passwordInput: document.getElementById('auth-password'),
        submitButton: document.getElementById('auth-submit-btn'),
        forgotPasswordButton: document.getElementById('auth-forgot-password-btn'),
        modeToggle: document.getElementById('auth-mode-toggle')
    };
}

function redirectToNextPath() {
    window.location.href = AuthService.getAppPageUrl(AuthService.getRequestedNextPath('app.html'));
}

function setStatus(message = '', type = '') {
    const { status } = getElements();
    if (!status) return;

    status.textContent = message;
    status.className = 'auth-notice';
    if (!message) {
        status.classList.add('hidden');
        return;
    }

    if (type === 'error') status.classList.add('is-error');
    if (type === 'success') status.classList.add('is-success');
}

function renderMode() {
    const {
        title,
        subtitle,
        displayNameGroup,
        displayNameInput,
        confirmPasswordGroup,
        confirmPasswordInput,
        emailInput,
        passwordInput,
        submitButton,
        forgotPasswordButton,
        modeToggle
    } = getElements();

    const isSignUp = state.mode === 'signup';
    const isForgot = state.mode === 'forgot';
    const isReset = state.mode === 'reset';
    const isSignIn = state.mode === 'signin';

    if (title) {
        if (isSignUp) title.textContent = 'Create your PromptPrim account';
        else if (isForgot) title.textContent = 'Recover your password';
        else if (isReset) title.textContent = 'Set a new password';
        else title.textContent = 'Sign in to PromptPrim';
    }

    if (subtitle) {
        if (isSignUp) {
            subtitle.textContent = 'Start with hosted auth now. Billing and plan sync will follow in the next phases.';
        } else if (isForgot) {
            subtitle.textContent = 'We will send a recovery link to your email.';
        } else if (isReset) {
            subtitle.textContent = 'Choose a new password for your PromptPrim account.';
        } else {
            subtitle.textContent = 'Use your account to access the hosted app and admin tools.';
        }
    }

    if (displayNameGroup) displayNameGroup.classList.toggle('hidden', !isSignUp);
    if (displayNameInput) {
        displayNameInput.required = isSignUp;
        if (!isSignUp) displayNameInput.value = '';
    }

    if (confirmPasswordGroup) confirmPasswordGroup.classList.toggle('hidden', !isReset);
    if (confirmPasswordInput) {
        confirmPasswordInput.required = isReset;
        if (!isReset) confirmPasswordInput.value = '';
    }

    if (emailInput) {
        emailInput.closest('.auth-field')?.classList.toggle('hidden', isReset);
        emailInput.required = !isReset;
        if (isReset) {
            emailInput.value = '';
        }
    }

    if (passwordInput) {
        passwordInput.closest('.auth-field')?.classList.toggle('hidden', isForgot);
        passwordInput.required = !isForgot;
        passwordInput.autocomplete = isReset ? 'new-password' : 'current-password';
        if (isForgot) passwordInput.value = '';
    }

    if (submitButton) {
        if (isSignUp) submitButton.textContent = 'Create Account';
        else if (isForgot) submitButton.textContent = 'Send Recovery Email';
        else if (isReset) submitButton.textContent = 'Save New Password';
        else submitButton.textContent = 'Sign In';
    }

    if (forgotPasswordButton) {
        forgotPasswordButton.classList.toggle('hidden', !isSignIn);
    }

    if (modeToggle) {
        modeToggle.classList.remove('hidden');
        if (isSignUp) {
            modeToggle.textContent = 'Already have an account? Sign in';
        } else if (isForgot || isReset) {
            modeToggle.textContent = 'Back to sign in';
        } else {
            modeToggle.textContent = 'Need an account? Create one';
        }
    }

    setStatus('');
}

function setFormDisabled(disabled) {
    const {
        form,
        displayNameInput,
        confirmPasswordInput,
        emailInput,
        passwordInput,
        submitButton,
        forgotPasswordButton,
        modeToggle
    } = getElements();

    form?.querySelectorAll('input').forEach((input) => {
        input.disabled = disabled;
    });
    if (displayNameInput) displayNameInput.disabled = disabled;
    if (emailInput) emailInput.disabled = disabled;
    if (passwordInput) passwordInput.disabled = disabled;
    if (confirmPasswordInput) confirmPasswordInput.disabled = disabled;
    if (submitButton) submitButton.disabled = disabled;
    if (forgotPasswordButton) forgotPasswordButton.disabled = disabled;
    if (modeToggle) modeToggle.disabled = disabled;
}

async function handleSubmit(event) {
    event.preventDefault();
    const {
        displayNameInput,
        confirmPasswordInput,
        emailInput,
        passwordInput,
        submitButton
    } = getElements();

    const email = String(emailInput?.value || '').trim();
    const password = String(passwordInput?.value || '');
    const displayName = String(displayNameInput?.value || '').trim();

    if (state.mode === 'forgot') {
        if (!email) {
            setStatus('Email is required.', 'error');
            return;
        }
    } else if (state.mode === 'reset') {
        const confirmation = String(confirmPasswordInput?.value || '');
        if (!password || password.length < 8) {
            setStatus('Please enter a new password with at least 8 characters.', 'error');
            return;
        }
        if (password !== confirmation) {
            setStatus('Password confirmation does not match.', 'error');
            return;
        }
    } else if (!email || !password) {
        setStatus('Email and password are required.', 'error');
        return;
    }

    setFormDisabled(true);
    const originalLabel = submitButton?.textContent || '';
    if (submitButton) {
        if (state.mode === 'signup') submitButton.textContent = 'Creating...';
        else if (state.mode === 'forgot') submitButton.textContent = 'Sending...';
        else if (state.mode === 'reset') submitButton.textContent = 'Saving...';
        else submitButton.textContent = 'Signing in...';
    }

    try {
        if (state.mode === 'signup') {
            const { data, error } = await AuthService.signUpWithPassword({ email, password, displayName });
            if (error) throw error;

            if (data?.session?.user) {
                setStatus('Account created. Redirecting...', 'success');
                redirectToNextPath();
                return;
            }

            setStatus('Account created. Check your email to confirm your address, then sign in.', 'success');
            state.mode = 'signin';
            renderMode();
            return;
        }

        if (state.mode === 'forgot') {
            const { error } = await AuthService.requestPasswordRecovery(email, AuthService.getRequestedNextPath('app.html'));
            if (error) throw error;

            setStatus('Recovery email sent. Check your inbox for the reset link.', 'success');
            state.mode = 'signin';
            renderMode();
            return;
        }

        if (state.mode === 'reset') {
            const { error } = await AuthService.updateCurrentUser({ password });
            if (error) throw error;

            setStatus('Password updated. Redirecting...', 'success');
            redirectToNextPath();
            return;
        }

        const { error } = await AuthService.signInWithPassword({ email, password });
        if (error) throw error;

        setStatus('Signed in. Redirecting...', 'success');
        redirectToNextPath();
    } catch (error) {
        setStatus(error?.message || 'Authentication failed.', 'error');
    } finally {
        setFormDisabled(false);
        if (submitButton) submitButton.textContent = originalLabel;
    }
}

async function initializeAuthPage() {
    const { configWarning, form, modeToggle, forgotPasswordButton } = getElements();

    if (!AuthService.isSupabaseEnabled()) {
        configWarning?.classList.remove('hidden');
        setFormDisabled(true);
        return;
    }

    if (AuthService.isRecoveryFlowUrl()) {
        state.mode = 'reset';
    }

    const { data } = await AuthService.getSession();
    if (data?.session?.user && state.mode !== 'reset') {
        redirectToNextPath();
        return;
    }

    form?.addEventListener('submit', handleSubmit);
    modeToggle?.addEventListener('click', () => {
        if (state.mode === 'signin') state.mode = 'signup';
        else state.mode = 'signin';
        renderMode();
    });
    forgotPasswordButton?.addEventListener('click', () => {
        state.mode = 'forgot';
        renderMode();
    });

    AuthService.onAuthStateChange((_event, session) => {
        if (session?.user && state.mode !== 'reset') {
            redirectToNextPath();
        }
    });

    renderMode();
}

document.addEventListener('DOMContentLoaded', initializeAuthPage);
