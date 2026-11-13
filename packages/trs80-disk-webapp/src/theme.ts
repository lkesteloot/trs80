/**
 * Whether the page is currently showing the dark theme, from the explicit choice on the root element
 * or else from the system's preference.
 */
function isDark(): boolean {
    const theme = document.documentElement.dataset.theme;
    if (theme !== undefined) {
        return theme === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Restore the theme saved under the given localStorage key, if any, and make the button with the given
 * id switch between light and dark, saving the choice. Without a saved choice the page keeps its
 * default: the CSS's prefers-color-scheme rule, or whatever data-theme the HTML sets.
 */
export function initTheme(storageKey: string, buttonId: string): void {
    try {
        const theme = localStorage.getItem(storageKey);
        if (theme === "light" || theme === "dark") {
            document.documentElement.dataset.theme = theme;
        }
    } catch (e) {
        // Storage may be blocked. Use the default.
    }

    document.getElementById(buttonId)?.addEventListener("click", () => {
        const theme = isDark() ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(storageKey, theme);
        } catch (e) {
            // Storage may be blocked. The choice lasts until the page is closed.
        }
    });
}
