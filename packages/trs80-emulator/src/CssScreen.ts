import {Trs80Screen} from "./Trs80Screen";
import {configureStylesheet} from "./Stylesheet";
import {clearElement, CSS_PREFIX, SCREEN_BEGIN} from "./Utils";

/**
 * TRS-80 screen based on CSS tricks like setting a background image for each character.
 */
export class CssScreen extends Trs80Screen {
    private readonly node: HTMLElement;

    constructor(parentNode: HTMLElement) {
        super();

        clearElement(parentNode);

        this.node = CssScreen.createScreenNode(parentNode);

        // Make global CSS if necessary.
        configureStylesheet();
    }

    writeChar(address: number, value: number): void {
        const chList = this.node.getElementsByClassName(CSS_PREFIX + "-c" + address);
        if (chList.length > 0) {
            const ch = chList[0] as HTMLSpanElement;
            // It'd be nice to put the character there so that copy-and-paste works.
            /// ch.innerText = String.fromCharCode(value);
            for (let i = 0; i < ch.classList.length; i++) {
                const className = ch.classList[i];
                if (className.startsWith(CSS_PREFIX + "-char-")) {
                    ch.classList.remove(className);
                    // There should only be one.
                    break;
                }
            }
            ch.classList.add(CSS_PREFIX + "-char-" + value);
        }
    }

    getNode(): HTMLElement {
        return this.node;
    }

    setExpandedCharacters(expanded: boolean): void {
        if (expanded) {
            this.node.classList.remove(CSS_PREFIX + "-narrow");
            this.node.classList.add(CSS_PREFIX + "-expanded");
        } else {
            this.node.classList.remove(CSS_PREFIX + "-expanded");
            this.node.classList.add(CSS_PREFIX + "-narrow");
        }
    }

    isExpandedCharacters(): boolean {
        return this.node.classList.contains(CSS_PREFIX + "-expanded");
    }

    /**
     * Create and configure the DOM node that we're rendering into.
     */
    private static createScreenNode(parentNode: HTMLElement): HTMLElement {
        // Make our own sub-node that we have control over.
        const node = document.createElement("div");
        parentNode.appendChild(node);

        node.classList.add(CSS_PREFIX);
        node.classList.add(CSS_PREFIX + "-narrow");

        for (let offset = 0; offset < 1024; offset++) {
            const address = SCREEN_BEGIN + offset;
            const c = document.createElement("span");
            c.classList.add(CSS_PREFIX + "-c" + address);
            if (offset % 2 === 0) {
                c.classList.add(CSS_PREFIX + "-even-column");
            } else {
                c.classList.add(CSS_PREFIX + "-odd-column");
            }
            c.innerText = " ";
            node.appendChild(c);

            // Newlines.
            if (offset % 64 === 63) {
                node.appendChild(document.createElement("br"));
            }
        }

        return node;
    }
}
