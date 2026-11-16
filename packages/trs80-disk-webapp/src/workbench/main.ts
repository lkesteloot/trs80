import "../core/preview/preview.css";
import {createSiteSwitcher} from "trs80-site";
import {initTheme} from "../theme.js";
import {Workbench} from "./Workbench.js";

/**
 * Wire up the page.
 */
function main(): void {
    const siteSwitcher = document.getElementById("site-switcher") as HTMLElement;
    siteSwitcher.append(createSiteSwitcher("disk"));
    initTheme("disk-theme", "themeBtn");
    new Workbench();
}

main();
