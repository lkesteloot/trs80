import "../core/preview/preview.css";
import {initTheme} from "../theme.js";
import {Commander} from "./Commander.js";

/**
 * Wire up the page.
 */
function main(): void {
    initTheme("commander-theme", "themeBtn");
    new Commander();
}

main();
