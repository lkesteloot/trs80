/**
 * A menu bar at the top of the webpage with pull-down menus.
 */

// Base class of all menu entries.
export interface MenuEntry {
    // Optional ID for use with getMenuEntryById().
    id?: string;

    // Injected by the menu builder.
    node?: HTMLElement;
    parent?: MenuEntry | undefined;
}

// Kind of menu entry that does something.
export interface MenuCommand extends MenuEntry {
    // Text to display for this menu item.
    text: string;

    // Action to call when user clicks on this menu item.
    action: (menuCommand: MenuCommand) => void;

    // Optional, hotkey. The format is "Shift-Alt-Ctrl-Cmd-F", where
    // all the modifiers are optional and can be in any order. The key
    // can also be a function key, like "F8", or other keyboard
    // key like "Tab", "Enter", "Backspace", "Space", or "Left". On
    // non-Mac platforms the "Cmd" modifier is replaced by "Ctrl".
    hotkey?: string;

    // Optional, whether checked. Defaults to false.
    checked?: boolean;

    // Injected by menu builder.
    setChecked?: (checked: boolean) => void;
}

// Whether this menu entry is a command.
export function isMenuCommand(menuEntry: MenuEntry): menuEntry is MenuCommand {
    return "action" in menuEntry;
}

// A visual separator in vertical menus.
export interface MenuSeparator extends MenuEntry {
    separator: true;
}

// Whether this menu entry is a separator.
export function isMenuSeparator(menuEntry: MenuEntry): menuEntry is MenuSeparator {
    return "separator" in menuEntry;
}

// Kind of menu entry that has a sub-menu.
export interface MenuParent extends MenuEntry {
    // Text to display for this menu item.
    text: string;

    // Menu items, must be non-empty.
    menu: Menu;
}

// Whether this menu entry is a sub-menu.
export function isMenuParent(menuEntry: MenuEntry): menuEntry is MenuParent {
    return "menu" in menuEntry;
}

// List of menu entries for a menu.
export type Menu = (MenuCommand | MenuSeparator | MenuParent)[];

const MAX_DEPTH = 2;
const OPEN_TIMEOUT_MS = 250;
const ENTRY_BLINK_MS = 70;
const FLASH_MS = 150;

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

// Whether any menu is open.
function isAnyMenuOpen(): boolean {
    const menus = document.querySelectorAll(".menubar-entry.menubar-open");
    return menus.length > 0;
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

// Find the root entry for this menu entry. The root entry will be on the top-level menu bar.
function getRoot(menuEntry: MenuEntry): MenuEntry {
    return menuEntry.parent === undefined ? menuEntry : getRoot(menuEntry.parent);
}

// Info about a specific key and its modifiers.
class HotkeyInfo {
    public readonly ctrlKey: boolean;
    public readonly altKey: boolean;
    public readonly shiftKey: boolean;
    public readonly metaKey: boolean;
    public readonly key: string;

    constructor(ctrlKey: boolean, altKey: boolean, shiftKey: boolean, metaKey: boolean, key: string) {
        this.ctrlKey = ctrlKey;
        this.altKey = altKey;
        this.shiftKey = shiftKey;
        this.metaKey = metaKey;
        this.key = key;
    }

    // To a string that can be used as a key in a map.
    public toCanonical(): string {
        const parts: string[] = [];

        if (this.ctrlKey) {
            parts.push("Ctrl");
        }
        if (this.altKey) {
            parts.push("Alt");
        }
        if (this.shiftKey) {
            parts.push("Shift");
        }
        if (this.metaKey) {
            parts.push("Cmd");
        }

        parts.push(this.key);

        return parts.join("-");
    }

    // To a string that can be shown to the user in a menu entry.
    // https://github.com/Zenexer/internet-reference/blob/main/Mac%20Keyboard%20Symbols.md
    public toMenuString(): string {
        const parts: string[] = [];

        if (this.ctrlKey) {
            parts.push("\u2303");
        }
        if (this.altKey) {
            parts.push("\u2325"); // TODO use \u2387 (Alt) on non-Mac.
        }
        if (this.shiftKey) {
            parts.push("\u21E7");
        }
        if (this.metaKey) {
            parts.push("\u2318");
        }

        parts.push(this.key); // TODO make mixed-case.

        return parts.join("");
    }

    // From a user-supplied string in the menu definition.
    static fromHotkey(hotkey: string): HotkeyInfo {
        const parts = hotkey.toUpperCase().split("-");

        let ctrlKey = false;
        let altKey = false;
        let shiftKey = false;
        let metaKey = false;
        let key = parts[parts.length - 1];

        for (let i = 0; i < parts.length - 1; i++) {
            switch (parts[i]) {
                case "CTRL":
                case "CTL":
                case "CONTROL":
                    ctrlKey = true;
                    break;
                case "ALT":
                    altKey = true;
                    break;
                case "SHIFT":
                    shiftKey = true;
                    break;
                case "CMD":
                case "COMMAND":
                case "META":
                    metaKey = true; // TODO on non-Mac, set ctrlKey.
                    break;
            }
        }

        return new HotkeyInfo(ctrlKey, altKey, shiftKey, metaKey, key);
    }

    // From a keyboard event.
    static fromKeyboardEvent(e: KeyboardEvent): HotkeyInfo {
        return new HotkeyInfo(e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, e.key.toUpperCase());
    }
}

// Map from a hotkey canonical representation to its command.
const gHotkeyMap = new Map<string,MenuCommand>();

// Register a hotkey and its command.
function registerHotkey(hotkey: string, menuCommand: MenuCommand): HotkeyInfo {
    const hotkeyInfo = HotkeyInfo.fromHotkey(hotkey);
    const canonical = hotkeyInfo.toCanonical();
    gHotkeyMap.set(canonical, menuCommand);
    return hotkeyInfo;
}

// If the key has been registered, call its action and return true.
function dispatchHotkey(e: KeyboardEvent): boolean {
    const hotkeyInfo = HotkeyInfo.fromKeyboardEvent(e);
    const canonical = hotkeyInfo.toCanonical();
    const menuCommand = gHotkeyMap.get(canonical);
    if (menuCommand !== undefined) {
        // Flash the root entry.
        const root = getRoot(menuCommand);
        root.node?.classList.add("menubar-flash");
        setTimeout(() => {
            root.node?.classList.remove("menubar-flash");
        }, FLASH_MS);

        // Call the action handler.
        menuCommand.action(menuCommand);
        return true;
    }
    return false;
}

// Create an HTML node for this menu and its sub-menus. A depth of 0 means
// the top level, 1 is the level below that, etc.
function createNode(menu: Menu, depth: number, parent: MenuEntry | undefined): HTMLElement {
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
        menuEntry.parent = parent;

        const entryNode = document.createElement("div");
        entryNode.classList.add("menubar-entry");
        menuEntry.node = entryNode;

        if (isMenuCommand(menuEntry) || isMenuParent(menuEntry)) {
            // All entries have a checkmark (possibly hidden) and the entry text.
            const checkmarkNode = document.createElement("div");
            checkmarkNode.classList.add("menubar-checkmark");
            // https://www.compart.com/en/unicode/U+2713
            checkmarkNode.textContent = "\u2713";
            const textNode = document.createElement("div");
            textNode.classList.add("menubar-text");
            textNode.textContent = menuEntry.text;
            entryNode.append(checkmarkNode, textNode);
        }

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

            if (menuEntry.hotkey !== undefined) {
                const hotkeyInfo = registerHotkey(menuEntry.hotkey, menuEntry);

                const hotkeyNode = document.createElement("div");
                hotkeyNode.classList.add("menubar-hotkey");
                hotkeyNode.textContent = hotkeyInfo.toMenuString();
                entryNode.append(hotkeyNode);
            }
        } else if (isMenuSeparator(menuEntry)) {
            entryNode.classList.add("menubar-separator");
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
            const subNode = createNode(menuEntry.menu, depth + 1, menuEntry);
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
            entryNode.addEventListener("mouseenter", () => {
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
            entryNode.addEventListener("mouseleave", () => {
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
            if (isAnyMenuOpen() && target instanceof Element && !target.classList.contains("menubar-entry")) {
                e.preventDefault();
                e.stopPropagation();
                closeToDepth(0);
            }
        });

        window.addEventListener("blur", () => {
            closeToDepth(0);
        });

        // Handle hotkeys.
        window.addEventListener("keydown", e => {
            const handled = dispatchHotkey(e);
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        gRegisteredWindowListeners = true;
    }
}

// Create this menu as a top-level pull-down, returning its HTML node.
export function createMenubar(menu: Menu): HTMLElement {
    registerWindowListeners();
    return createNode(menu, 0, undefined);
}
