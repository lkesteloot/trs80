import {SITE_APPS, SITE_HOME_PATH, SITE_NAME, type SiteApp, type SiteAppId, isSiteTool} from "./SiteApps.js";
import "./site.css";

/**
 * Make a span with a class and optional text.
 */
function makeSpan(className: string, text?: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = className;
    if (text !== undefined) {
        span.textContent = text;
    }
    return span;
}

/**
 * Make one menu item for an app. The current app gets a checkmark and isn't a link.
 */
function makeItem(app: SiteApp, isCurrent: boolean): HTMLElement {
    let item: HTMLElement;
    if (isCurrent) {
        item = document.createElement("div");
        item.className = "trs80-site-item trs80-site-item-current";
        item.setAttribute("aria-current", "page");
        item.setAttribute("aria-disabled", "true");
    } else {
        const link = document.createElement("a");
        link.className = "trs80-site-item";
        link.href = app.path;
        item = link;
    }
    item.setAttribute("role", "menuitem");
    item.append(
        makeSpan("trs80-site-check", isCurrent ? "✓" : undefined),
        makeSpan("trs80-site-name", app.name),
        makeSpan("trs80-site-description", app.description));
    return item;
}

/**
 * Create the "my-trs-80 / app" header with a drop-down menu of all the apps on the site.
 *
 * @param current the app that the page is showing.
 */
export function createSiteSwitcher(current: SiteAppId): HTMLElement {
    const currentApp = SITE_APPS.find(app => app.id === current);
    if (currentApp === undefined) {
        throw new Error("Unknown site app " + current);
    }

    const switcher = document.createElement("div");
    switcher.className = "trs80-site-switcher";

    const home = document.createElement("a");
    home.className = "trs80-site-home";
    home.href = SITE_HOME_PATH;
    home.textContent = SITE_NAME;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "trs80-site-current";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.append(currentApp.name, makeSpan("trs80-site-chevron", "▾"));

    const menu = document.createElement("div");
    menu.className = "trs80-site-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    for (const app of SITE_APPS) {
        if (isSiteTool(app)) {
            const separator = document.createElement("div");
            separator.className = "trs80-site-separator";
            separator.setAttribute("role", "separator");
            menu.append(separator);
        }
        menu.append(makeItem(app, app.id === current));
    }

    switcher.append(home, makeSpan("trs80-site-slash", "/"), button, menu);

    /** The links in the menu, in order (the current item isn't one). */
    const getLinks = (): HTMLAnchorElement[] => Array.from(menu.querySelectorAll("a.trs80-site-item"));

    /** Open or close the menu. */
    const setOpen = (open: boolean): void => {
        menu.hidden = !open;
        button.setAttribute("aria-expanded", open ? "true" : "false");
    };

    /** Whether the menu is showing. */
    const isOpen = (): boolean => !menu.hidden;

    /** Focus the link at the given offset from the focused one, wrapping around. */
    const moveFocus = (delta: number): void => {
        const links = getLinks();
        if (links.length === 0) {
            return;
        }
        const index = links.indexOf(document.activeElement as HTMLAnchorElement);
        let newIndex: number;
        if (index === -1) {
            newIndex = delta > 0 ? 0 : links.length - 1;
        } else {
            newIndex = (index + delta + links.length) % links.length;
        }
        links[newIndex].focus();
    };

    button.addEventListener("click", () => {
        setOpen(!isOpen());
    });

    button.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            // Handle it ourselves so that the click handler doesn't toggle it back closed.
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
            getLinks()[0]?.focus();
        } else if (event.key === "ArrowUp" && isOpen()) {
            event.preventDefault();
            event.stopPropagation();
            moveFocus(-1);
        }
    });

    // The keys handled in the menu don't go on to the page, whose own shortcuts (Disk Commander's
    // arrow keys and Enter, the emulator's keyboard) would also act on them.
    menu.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            moveFocus(1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            moveFocus(-1);
        } else if (event.key === "Enter" || event.key === " ") {
            // Let a link follow itself, but keep the page from seeing the key.
            event.stopPropagation();
        }
    });

    switcher.addEventListener("keydown", event => {
        if (event.key === "Escape" && isOpen()) {
            event.stopPropagation();
            setOpen(false);
            button.focus();
        }
    });

    switcher.addEventListener("focusout", event => {
        const newTarget = event.relatedTarget;
        if (isOpen() && newTarget instanceof Node && !switcher.contains(newTarget)) {
            setOpen(false);
        }
    });

    document.addEventListener("pointerdown", event => {
        if (isOpen() && event.target instanceof Node && !switcher.contains(event.target)) {
            setOpen(false);
        }
    });

    return switcher;
}
