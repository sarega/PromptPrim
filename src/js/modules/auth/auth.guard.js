import * as AuthService from './auth.service.js';

function getCurrentPageName() {
    const path = window.location.pathname || '';
    const pageName = path.split('/').filter(Boolean).pop();
    return pageName || 'app.html';
}

export async function ensurePageAccess({ requireAdmin = false } = {}) {
    if (!AuthService.isSupabaseEnabled()) {
        document.body.dataset.authMode = 'local';
        return {
            mode: 'local',
            redirected: false,
            session: null,
            user: null
        };
    }

    document.body.dataset.authMode = 'supabase';

    const { data, error } = await AuthService.getSession();
    if (error) throw error;

    const session = data?.session || null;
    const user = session?.user || null;
    if (!user) {
        window.location.href = AuthService.getAuthPageUrl(getCurrentPageName());
        return {
            mode: 'supabase',
            redirected: true,
            session: null,
            user: null
        };
    }

    if (requireAdmin && !AuthService.isAdminUser(user)) {
        window.location.href = AuthService.getAppPageUrl('app.html');
        return {
            mode: 'supabase',
            redirected: true,
            session,
            user
        };
    }

    return {
        mode: 'supabase',
        redirected: false,
        session,
        user
    };
}
