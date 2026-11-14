import "../core/preview/preview.css";
import {initTheme} from "../theme.js";
import {Commander} from "./Commander.js";

/**
 * Label the theme button with the theme that it switches to, now and whenever the theme changes.
 */
function labelThemeButton(): void {
    const button = document.getElementById("themeBtn");
    if (button === null) {
        return;
    }

    const update = (): void => {
        button.textContent = document.documentElement.dataset.theme === "light" ? "[Dark]" : "[Light]";
    };
    update();
    new MutationObserver(update).observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]});
}

/**
 * Wire up the page.
 */
function main(): void {
    initTheme("commander-theme", "themeBtn");
    labelThemeButton();
    new Commander();
}

main();
