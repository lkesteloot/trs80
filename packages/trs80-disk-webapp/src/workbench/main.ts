import "../core/preview/preview.css";
import {initTheme} from "../theme.js";
import {Workbench} from "./Workbench.js";

/**
 * Wire up the page.
 */
function main(): void {
    initTheme("disk-theme", "themeBtn");
    new Workbench();
}

main();
