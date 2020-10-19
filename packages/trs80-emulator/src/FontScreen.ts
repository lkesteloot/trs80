import {Trs80Screen} from "./Trs80Screen";
import {clearElement, CSS_PREFIX, SCREEN_BEGIN} from "./Utils";
import {configureStylesheet} from "./Stylesheet";

const cssPrefix = CSS_PREFIX + "-font-screen";

/**
 * Map 8-bit TRS-80 values to Unicode values. For TRS-80-only characters like
 * block graphics, we use the characters in the private use area (0xE000). But
 * for anything that's common in Unicode, we use the correct character, which allows
 * the user to copy and paste text.
 *
 * From http://48k.ca/m3unicode.c
 * Linked to from http://48k.ca/fonts.html
 *
 * Comment from the original C file:
    //
    // m3unicode.c - map TRS-80 Model III characters to Unicode (where possible)
    //
    // The Model III always displays characters 00 - BF the same.  Characters
    // C0 - FF can be a mix of Greek letters and miscellaneous glyphs or an
    // alternate character set of halfwidth Katakana.  Thus entries 256 - 319
    // translate the Katakana variant of character codes 192 - 255.
    //
    // Characters without a Unicode version are translated into the private use
    // area as used to the TRS-80 True Type fonts at
    //		http://www.kreativekorp.com/software/fonts/index.shtml#retro
    //
    // There are a few translations you may with to handle differently than the
    // tables.
    //
    // There are 3 characters the tables translates to mathematical symbols
    // but they could be interpreted as Greek letters.
    //
    //	E5 => U+2206 Increment / U+0394 Greek Capital Letter Delta
    //	E0 => U+2126 Ohm Sign / U+03A9 Greek Capital Letter Omega
    //	E3 => U+2211 N-Ary Summation / U+03A3 Greek Capital Letter Sigma
    //
    // Characters F4 F5 F6 are indended to be used all together in order to
    // create a hand pointing to the right.  The table translates each one to
    // its private use equivalent but you may wish to detect three in a row
    // and translate to U+261E White Right-Pointing Index.
 */

const M3_TO_UNICODE: number[] = [
    // Special characters, highly ad-hoc.
    0x20,   0xa3,   0x7c,   0xe9,   0xdc,   0xc5,   0xac,   0xf6,
    0xd8,   0xf9,   0xf1,   0x60, 0x0101, 0xe00d,   0xc4,   0xc3,
    0xd1,   0xd6,   0xd8,   0xd5,   0xdf,   0xfc,   0xf5,   0xe6,
    0xe4,   0xe0, 0x0227, 0xe01b,   0xc9,   0xc6,   0xc7, 0x02dc,

    // ASCII range.  Identity map of 20 .. 7e with special case for 7f.
    0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27,
    0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f,
    0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
    0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f,
    0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47,
    0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f,
    0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57,
    0x58, 0x59, 0x5a, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f,
    0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67,
    0x68, 0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6e, 0x6f,
    0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77,
    0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e, 0xb1,

    // Graphics characters.  Trivial map of 80 .. BF to E080 .. E0BF.
    0xe080, 0xe081, 0xe082, 0xe083, 0xe084, 0xe085, 0xe086, 0xe087,
    0xe088, 0xe089, 0xe08a, 0xe08b, 0xe08c, 0xe08d, 0xe08e, 0xe08f,
    0xe090, 0xe091, 0xe092, 0xe093, 0xe094, 0xe095, 0xe096, 0xe097,
    0xe098, 0xe099, 0xe09a, 0xe09b, 0xe09c, 0xe09d, 0xe09e, 0xe09f,
    0xe0a0, 0xe0a1, 0xe0a2, 0xe0a3, 0xe0a4, 0xe0a5, 0xe0a6, 0xe0a7,
    0xe0a8, 0xe0a9, 0xe0aa, 0xe0ab, 0xe0ac, 0xe0ad, 0xe0ae, 0xe0af,
    0xe0b0, 0xe0b1, 0xe0b2, 0xe0b3, 0xe0b4, 0xe0b5, 0xe0b6, 0xe0b7,
    0xe0b8, 0xe0b9, 0xe0ba, 0xe0bb, 0xe0bc, 0xe0bd, 0xe0be, 0xe0bf,

    // Special characters.  Mostly ad-hoc, but contiguous stretch for
    // the lowercase Greek letters.
    0x2660, 0x2665, 0x2666, 0x2663, 0x263a, 0x2639, 0x2264, 0x2265,
    0x03b1, 0x03b2, 0x03b3, 0x03b4, 0x03b5, 0x03b6, 0x03b7, 0x03b8,
    0x03b9, 0x03ba, 0x03bc, 0x03bd, 0x03be, 0x03bf, 0x03c0, 0x03c1,
    0x03c2, 0x03c3, 0x03c4, 0x03c5, 0x03c6, 0x03c7, 0x03c8, 0x03c9,
    0x2126, 0x221a,   0xf7, 0x2211, 0x2248, 0x2206, 0x2307, 0x2260,
    0x2301, 0xe0e9, 0x237e, 0x221e, 0x2713,   0xa7, 0x2318,   0xa9,
    0xa4,   0xb6,   0xa2,   0xae, 0xe0f4, 0xe0f5, 0xe0f6, 0x211e,
    0x2105, 0x2642, 0x2640, 0xe0fb, 0xe0fc, 0xe0fd, 0xe0fe, 0x2302,

    // Halfwidth Katakana.  Trivial map of C1 .. FF to FF61 .. FF9F
    //   with special case for C0 (Yen sign).
    0xa5, 0xff61, 0xff62, 0xff63, 0xff64, 0xff65, 0xff66, 0xff67,
    0xff68, 0xff69, 0xff6a, 0xff6b, 0xff6c, 0xff6d, 0xff6e, 0xff6f,
    0xff70, 0xff71, 0xff72, 0xff73, 0xff74, 0xff75, 0xff76, 0xff77,
    0xff78, 0xff79, 0xff7a, 0xff7b, 0xff7c, 0xff7d, 0xff7e, 0xff7f,
    0xff80, 0xff81, 0xff82, 0xff83, 0xff84, 0xff85, 0xff86, 0xff87,
    0xff88, 0xff89, 0xff8a, 0xff8b, 0xff8c, 0xff8d, 0xff8e, 0xff8f,
    0xff90, 0xff91, 0xff92, 0xff93, 0xff94, 0xff95, 0xff96, 0xff97,
    0xff98, 0xff99, 0xff9a, 0xff9b, 0xff9c, 0xff9d, 0xff9e, 0xff9f
];

/**
 * TRS-80 screen based on a web font.
 */
export class FontScreen extends Trs80Screen {
    private readonly node: HTMLElement;

    constructor(parentNode: HTMLElement, thumbnail: boolean) {
        super();

        clearElement(parentNode);

        this.node = FontScreen.createScreenNode(parentNode, thumbnail);

        // Make global CSS if necessary.
        configureStylesheet();
    }

    writeChar(address: number, value: number): void {
        const chList = this.node.getElementsByClassName(cssPrefix + "-c" + address);
        if (chList.length > 0) {
            const ch = chList[0] as HTMLSpanElement;
            ch.innerText = String.fromCharCode(M3_TO_UNICODE[value]);
        }
    }

    getNode(): HTMLElement {
        return this.node;
    }

    setExpandedCharacters(expanded: boolean): void {
        super.setExpandedCharacters(expanded);
        if (expanded) {
            this.node.classList.remove(cssPrefix + "-narrow");
            this.node.classList.add(cssPrefix + "-expanded");
        } else {
            this.node.classList.remove(cssPrefix + "-expanded");
            this.node.classList.add(cssPrefix + "-narrow");
        }
    }

    /**
     * Create and configure the DOM node that we're rendering into.
     */
    private static createScreenNode(parentNode: HTMLElement, thumbnail: boolean): HTMLElement {
        // Make our own sub-node that we have control over.
        const node = document.createElement("div");
        parentNode.appendChild(node);

        node.classList.add(cssPrefix);
        node.classList.add(cssPrefix + "-narrow");
        if (thumbnail) {
            node.classList.add(cssPrefix + "-thumbnail");
        }

        for (let offset = 0; offset < 1024; offset++) {
            const address = SCREEN_BEGIN + offset;
            const c = document.createElement("span");
            c.classList.add(cssPrefix + "-c" + address);
            if (offset % 2 === 0) {
                c.classList.add(cssPrefix + "-even-column");
            } else {
                c.classList.add(cssPrefix + "-odd-column");
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
