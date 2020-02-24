import {Trs80Screen} from "./Trs80Screen";
import css from "./css";
import {clearElement, CSS_PREFIX, SCREEN_BEGIN} from "./Utils";

export class CssScreen extends Trs80Screen {
    private readonly node: HTMLElement;

    constructor(parentNode: HTMLElement) {
        super();

        clearElement(parentNode);

        this.node = CssScreen.createScreenNode(parentNode);

        // Make global CSS if necessary.
        CssScreen.configureStyle();
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

    /**
     * Make a global stylesheet for all TRS-80 emulators on this page.
     */
    private static configureStyle(): void {
        const styleId = CSS_PREFIX + "-style";
        if (document.getElementById(styleId) !== null) {
            // Already created.
            return;
        }

        // Image is 512x480
        // 10 rows of glyphs, but last two are different page.
        // Use first 8 rows.
        // 32 chars across (32*8 = 256)
        // For thin font:
        //     256px wide.
        //     Chars are 8px wide (256/32 = 8)
        //     Chars are 24px high (480/2/10 = 24), with doubled rows.
        const lines: string[] = [];
        for (let ch = 0; ch < 256; ch++) {
            lines.push(`.${CSS_PREFIX}-narrow .${CSS_PREFIX}-char-${ch} { background-position: ${-(ch%32)*8}px ${-Math.floor(ch/32)*24}px; }`);
            lines.push(`.${CSS_PREFIX}-expanded .${CSS_PREFIX}-char-${ch} { background-position: ${-(ch%32)*16}px ${-Math.floor(ch/32+10)*24}px; }`);
        }

        const node = document.createElement("style");
        node.id = styleId;
        node.innerHTML = css + "\n\n" + lines.join("\n");
        document.head.appendChild(node);
    }
}
