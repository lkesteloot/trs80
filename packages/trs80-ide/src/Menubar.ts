/**
 * A menu bar at the top of the webpage with pull-down menus.
 */

// Base class of all menu entries.
export interface MenuEntry {
    // Optional ID for use with getMenuEntryById().
    id?: string;

    // Text to display for this menu item.
    text: string;

    // Injected by the menu builder.
    node?: HTMLElement;
}

// Kind of menu entry that does something.
export interface MenuCommand extends MenuEntry {
    // Action to call when user clicks on this menu item.
    action: (menuCommand: MenuCommand) => void;

    // Optional, whether checked. Defaults to false.
    checked?: boolean;

    // Injected by menu builder.
    setChecked?: (checked: boolean) => void;
}

// Whether this menu entry is a command.
export function isMenuCommand(menuEntry: MenuEntry): menuEntry is MenuCommand {
    return "action" in menuEntry;
}

// Kind of menu entry that has a sub-menu.
export interface MenuParent extends MenuEntry {
    // Menu items, must be non-empty.
    menu: Menu;
}

// Whether this menu entry is a sub-menu.
export function isMenuParent(menuEntry: MenuEntry): menuEntry is MenuParent {
    return "menu" in menuEntry;
}

// List of menu entries for a menu.
type Menu = MenuEntry[];

const MAX_DEPTH = 2;
const OPEN_TIMEOUT_MS = 250;
const ENTRY_BLINK_MS = 70;

// Timer to open a menu when the user hovers over its entry.
let gOpenTimerHandler: number | undefined = undefined;
// Whether we've already hooked up the global (one-time) listeners.
let gRegisteredWindowListeners = false;

// Cancel any ongoing menu opening timer.
function cancelOpenTimer(): void {
    if (gOpenTimerHandler !== undefined) {
        window.clearTimeout(gOpenTimerHandler);
        gOpenTimerHandler = undefined;
    }
}

// Close all menus at the specified depth and below. A depth of 0 means all
// menus, 1 means menus below the top level, etc.
function closeToDepth(depth: number): void {
    for (let i = MAX_DEPTH; i >= depth; i--) {
        const nodes = document.querySelectorAll(".menubar-menu.menubar-depth-" + i + " > .menubar-entry.menubar-open");
        for (const node of nodes) {
            node.classList.remove("menubar-open");
        }
    }
}

// Create an HTML node for this menu and its sub-menus. A depth of 0 means
// the top level, 1 is the level below that, etc.
function createNode(menu: Menu, depth: number): HTMLElement {
    if (depth > MAX_DEPTH) {
        throw new Error("Menu depth " + depth + " > " + MAX_DEPTH);
    }

    // The div for the entire menu.
    const node = document.createElement("div");
    node.classList.add("menubar-menu");
    node.classList.add("menubar-depth-" + depth);
    if (depth === 0) {
        node.classList.add("menubar-open");
    }

    // Make checkmarks visible/invisible for every item in the menu.
    function syncMenuChecked() {
        let anyChecked = false;
        for (const menuEntry of menu) {
            if (isMenuCommand(menuEntry)) {
                const isChecked = menuEntry.checked ?? false;
                if (isChecked) {
                    anyChecked = true;
                }
                menuEntry.node?.classList.toggle("menubar-checked", isChecked);
            }
        }

        node.classList.toggle("menubar-any-checked", anyChecked);
    }

    // Add each entry.
    for (const menuEntry of menu) {
        const entryNode = document.createElement("div");
        entryNode.classList.add("menubar-entry");
        menuEntry.node = entryNode;

        // All entries have a checkmark (possibly hidden) and the entry text.
        const checkmarkNode = document.createElement("div");
        checkmarkNode.classList.add("menubar-checkmark");
        // https://www.compart.com/en/unicode/U+2713
        checkmarkNode.textContent = "\u2713";
        const textNode = document.createElement("div");
        textNode.classList.add("menubar-text");
        textNode.textContent = menuEntry.text;
        entryNode.append(checkmarkNode, textNode);

        if (isMenuCommand(menuEntry)) {
            // Hook up action.
            entryNode.classList.add("menubar-command");

            // Inject function to set whether checked.
            menuEntry.setChecked = (checked: boolean) => {
                menuEntry.checked = checked;
                syncMenuChecked();
            };

            // Handle action click.
            entryNode.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();

                // Blink entry before invoking action.
                entryNode.classList.add("menubar-entry-suppress-hover");
                setTimeout(() => {
                    entryNode.classList.remove("menubar-entry-suppress-hover");
                    setTimeout(() => {
                        closeToDepth(0);
                        menuEntry.action(menuEntry);
                    }, ENTRY_BLINK_MS);
                }, ENTRY_BLINK_MS);
            });
        } else if (isMenuParent(menuEntry)) {
            // Add sub-menu.
            entryNode.classList.add("menubar-parent");

            // Draw right-facing arrow.
            if (depth > 0) {
                const arrowNode = document.createElement("div");
                arrowNode.classList.add("menubar-arrow");
                // https://www.compart.com/en/unicode/U+25BA
                arrowNode.textContent = "\u25BA";
                entryNode.append(arrowNode);
            }

            // Create sub-menu.
            const subNode = createNode(menuEntry.menu, depth + 1);
            entryNode.append(subNode);

            // Hook up click on entry.
            entryNode.addEventListener("click", e => {
                e.preventDefault();
                e.stopPropagation();
                cancelOpenTimer();
                const alreadyOpen = entryNode.classList.contains("menubar-open");
                if (!alreadyOpen || depth === 0) {
                    closeToDepth(depth);
                    if (!alreadyOpen) {
                        entryNode.classList.add("menubar-open");
                    }
                }
            });
        }

        // Hook up hover on entry.
        if (depth > 0) {
            entryNode.addEventListener("mouseenter", e => {
                cancelOpenTimer();
                const alreadyOpen = entryNode.classList.contains("menubar-open");
                if (!alreadyOpen) {
                    gOpenTimerHandler = window.setTimeout(() => {
                        gOpenTimerHandler = undefined;
                        closeToDepth(depth);
                        if (isMenuParent(menuEntry)) {
                            entryNode.classList.add("menubar-open");
                        }
                    }, OPEN_TIMEOUT_MS);
                }
            });
            entryNode.addEventListener("mouseleave", e => {
                cancelOpenTimer();
            });
        }

        node.append(entryNode);
    }

    syncMenuChecked();

    return node;
}

// Get the menu entry for the given ID (see the "id" field in MenuEntry), or
// undefined if not found.
export function getMenuEntryById(menu: Menu, id: string): MenuEntry | undefined {
    for (const menuEntry of menu) {
        if (menuEntry.id === id) {
            return menuEntry;
        }
        if (isMenuParent(menuEntry)) {
            const result = getMenuEntryById(menuEntry.menu, id);
            if (result !== undefined) {
                return result;
            }
        }
    }

    return undefined;
}

// Register the global listeners to do things like close menus when
// the user clicks somewhere on the page.
function registerWindowListeners(): void {
    if (!gRegisteredWindowListeners) {
        window.addEventListener("click", e => {
            const target = e.target;
            if (target instanceof Element) {
                if (!target.classList.contains("menubar-entry")) {
                    e.preventDefault();
                    e.stopPropagation();
                    closeToDepth(0);
                }
            }
        });

        window.addEventListener("blur", () => {
            closeToDepth(0);
        });

        gRegisteredWindowListeners = true;
    }
}

// Create this menu as a top-level pull-down, returning its HTML node.
export function createMenubar(menu: Menu): HTMLElement {
    registerWindowListeners();
    return createNode(menu, 0);
}
