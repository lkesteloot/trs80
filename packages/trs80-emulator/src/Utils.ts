
export const CSS_PREFIX = "trs80-emulator";

// RAM address range of screen.
export const SCREEN_BEGIN = 15 * 1024;
export const SCREEN_END = 16 * 1024;

/**
 * Remove all children from element.
 */
export function clearElement(e: HTMLElement): void {
    while (e.firstChild) {
        e.removeChild(e.firstChild);
    }
}
