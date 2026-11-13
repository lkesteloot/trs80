import {el, formatNumber} from "../core/Dom.js";
import {
    availablePreviews, type PreviewFile, PreviewKind, previewKindToString, renderPreview,
} from "../core/preview/Previews.js";

// F3: the full-screen viewer, with the core's previews. In it F2 is hex, F4 the listing, F5 disassembly, and F6
// text (as in the mockup), F7 the picture, and Escape, F3, F10 or "q" closes it.

/**
 * What the viewer shows.
 */
export interface ViewerFile {
    /** The title, such as "View: HELLO/BAS (sample.dmk)". */
    title: string;
    /** The file to preview. */
    file: PreviewFile;
    /** The file's size in bytes. */
    size: number;
}

/**
 * One key of the function-key bar while the viewer is open.
 */
export interface ViewerKey {
    /** The key's number, from 1 to 10. */
    number: number;
    /** What the key is called. */
    label: string;
    /** Whether the key does something now. */
    enabled: boolean;
}

/**
 * The preview that a function key shows, or undefined for a key that doesn't show one.
 *
 * @param number the key's number.
 * @returns the kinds that the key may show, in order of preference.
 */
function kindsOfKey(number: number): PreviewKind[] {
    switch (number) {
        case 2:
            return [PreviewKind.HEX];
        case 4:
            return [PreviewKind.LISTING, PreviewKind.EDTASM];
        case 5:
            return [PreviewKind.DISASSEMBLY];
        case 6:
            return [PreviewKind.TEXT];
        case 7:
            return [PreviewKind.PICTURE];
        default:
            return [];
    }
}

/**
 * The label for a key that shows a preview.
 *
 * @param number the key's number.
 */
function labelOfKey(number: number): string {
    switch (number) {
        case 2:
            return "Hex";
        case 4:
            return "Listing";
        case 5:
            return "Disasm";
        case 6:
            return "Text";
        case 7:
            return "Picture";
        default:
            return "";
    }
}

/**
 * The full-screen viewer of one file.
 */
export class Viewer {
    private readonly container: HTMLElement;
    private current: {view: ViewerFile, kinds: PreviewKind[], kind: PreviewKind, root: HTMLElement,
        kindElement: HTMLElement, bodyElement: HTMLElement} | undefined = undefined;
    private readonly onChange: () => void;

    /**
     * @param container the element that the viewer covers the page with.
     * @param onChange called when the viewer opens, closes, or changes what it shows, so the page can redraw the
     * function-key bar.
     */
    constructor(container: HTMLElement, onChange: () => void) {
        this.container = container;
        this.onChange = onChange;
    }

    /**
     * Whether the viewer is open.
     */
    public get isOpen(): boolean {
        return this.current !== undefined;
    }

    /**
     * Open the viewer on a file, showing its default preview.
     *
     * @param view the file.
     */
    public open(view: ViewerFile): void {
        this.close();
        const kinds = availablePreviews(view.file.trs80File, view.file.binary);
        const kindElement = el("span");
        const bodyElement = el("div", "vbody");
        const root = el("div", "viewer",
            el("div", "vt", el("span", "", view.title), kindElement, el("span", "grow"),
                el("span", "", formatNumber(view.size) + " bytes")),
            bodyElement);
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-label", view.title);
        this.container.append(root);
        this.current = {view, kinds, kind: kinds[0], root, kindElement, bodyElement};
        this.show(kinds[0]);
    }

    /**
     * Close the viewer, if it's open.
     */
    public close(): void {
        if (this.current === undefined) {
            return;
        }
        this.current.root.remove();
        this.current = undefined;
        this.onChange();
    }

    /**
     * Show a preview of the file.
     */
    private show(kind: PreviewKind): void {
        const current = this.current;
        if (current === undefined) {
            return;
        }
        current.kind = kind;
        current.kindElement.textContent = previewKindToString(kind);
        current.bodyElement.replaceChildren(renderPreview(kind, current.view.file));
        this.onChange();
    }

    /**
     * The preview that a key would show for the open file, or undefined if the key doesn't apply to it.
     */
    private kindForKey(number: number): PreviewKind | undefined {
        const kinds = this.current?.kinds ?? [];
        return kindsOfKey(number).find(kind => kinds.includes(kind));
    }

    /**
     * The keys of the function-key bar while the viewer is open.
     */
    public keys(): ViewerKey[] {
        const keys: ViewerKey[] = [];
        for (let number = 1; number <= 10; number++) {
            switch (number) {
                case 1:
                    keys.push({number, label: "Help", enabled: true});
                    break;
                case 3:
                case 10:
                    keys.push({number, label: "Close", enabled: true});
                    break;
                case 2:
                case 4:
                case 5:
                case 6:
                case 7: {
                    // A key shows its own label even when the file has no such preview, dimmed.
                    keys.push({number, label: labelOfKey(number), enabled: this.kindForKey(number) !== undefined});
                    break;
                }
                default:
                    keys.push({number, label: "", enabled: false});
                    break;
            }
        }
        return keys;
    }

    /**
     * Press a function key in the viewer.
     *
     * @param number the key's number.
     * @returns whether the key was one of the viewer's. F1 isn't: the page shows help.
     */
    public pressKey(number: number): boolean {
        switch (number) {
            case 3:
            case 10:
                this.close();
                return true;
            case 2:
            case 4:
            case 5:
            case 6:
            case 7: {
                const kind = this.kindForKey(number);
                if (kind !== undefined) {
                    this.show(kind);
                }
                return true;
            }
            default:
                return false;
        }
    }

    /**
     * Give the viewer a key press.
     *
     * @param event the key event.
     * @returns whether the viewer took the key. Keys it doesn't take (the arrows, Page Up and Down, which scroll
     * the preview) are left to the browser.
     */
    public handleKeydown(event: KeyboardEvent): boolean {
        if (this.current === undefined || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
        }

        if (event.key === "Escape" || event.key === "q" || event.key === "Q") {
            event.preventDefault();
            this.close();
            return true;
        }

        const match = /^F(\d+)$/.exec(event.key);
        if (match !== null) {
            const number = Number(match[1]);
            if (number >= 2 && number <= 10) {
                event.preventDefault();
                return this.pressKey(number);
            }
        }
        return false;
    }
}
