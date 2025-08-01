// [NEW FILE] src/js/core/core.theme.js

/** Applies the selected theme to the document. */
function applyTheme(theme) {
    document.body.classList.remove('dark-mode', 'light-mode');
    const lightThemeSheet = document.getElementById('hljs-light-theme');
    const darkThemeSheet = document.getElementById('hljs-dark-theme');
    
    let isDark = theme === 'dark';
    if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    document.body.classList.toggle('dark-mode', isDark);
    if (lightThemeSheet) lightThemeSheet.disabled = isDark;
    if (darkThemeSheet) darkThemeSheet.disabled = !isDark;
}

/** Initializes a theme switcher component. */
export function initThemeSwitcher(containerId) {
    const themeSwitcher = document.getElementById(containerId);
    if (!themeSwitcher) return;

    const themeRadios = themeSwitcher.querySelectorAll('input[type="radio"]');
    const savedTheme = localStorage.getItem('theme') || 'system';
    
    themeRadios.forEach(radio => {
        if (radio.value === savedTheme) radio.checked = true;
        radio.addEventListener('change', (event) => {
            const selectedTheme = event.target.value;
            localStorage.setItem('theme', selectedTheme);
            applyTheme(selectedTheme);
        });
    });

    applyTheme(savedTheme);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem('theme') || 'system') === 'system') {
            applyTheme('system');
        }
    });
}