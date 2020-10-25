/**
 * Convert a number to a string.
 *
 * @param n number to convert
 * @param base base of the number
 * @param size zero-pad to this many digits
 */
export function pad(n: number, base: number, size: number): string {
    let s = n.toString(base);

    if (base === 16) {
        // I prefer upper case hex.
        s = s.toUpperCase();
    }

    while (s.length < size) {
        s = "0" + s;
    }

    return s;
}

/**
 * Generate the string version of a number, in base 10, with commas for thousands groups.
 */
export function withCommas(n: number | string): string {
    let s = typeof n === "number" ? n.toString(10) : n;

    if (s.length > 4) {
        for (let i = s.length - 3; i > 0; i -= 3) {
            s = s.substring(0, i) + "," + s.substring(i);
        }
    }

    return s;
}

/**
 * Converts a Uint8Array to base64. Not super efficient, don't use on a huge array.
 */
export function base64EncodeUint8Array(array: Uint8Array): string {
    let s = "";
    array.forEach(c => s += String.fromCharCode(c));
    return btoa(s);
}

/**
 * Remove all children from element.
 */
export function clearElement(e: HTMLElement): void {
    while (e.firstChild) {
        e.removeChild(e.firstChild);
    }
}

/**
 * Flash the node as if a photo were taken.
 */
export function flashNode(node: HTMLElement): void {
    // Position a semi-transparent white div over the screen, and reduce its transparency over time.
    const oldNodePosition = node.style.position;
    node.style.position = "relative";

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.backgroundColor = "#ffffff";

    // Fade out.
    let opacity = 1;
    const updateOpacity = () => {
        overlay.style.opacity = opacity.toString();
        opacity -= 0.05;
        if (opacity >= 0) {
            window.requestAnimationFrame(updateOpacity);
        } else {
            node.removeChild(overlay);
            node.style.position = oldNodePosition;
        }
    };
    updateOpacity();
    node.appendChild(overlay);
}
