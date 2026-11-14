// Lighting up a file wherever the page draws it: the map's cells and legend, and the space bar. Each such element
// carries the names of the files it stands for in its data-o attribute, separated by spaces and in upper case.
// A row of the file list carries its file's name in data-fo instead, so that it's lit but never dimmed like the others.

/**
 * The class that the body has while something is lit, which dims everything with a data-o that isn't.
 */
const HIGHLIGHT_MODE_CLASS = "hlmode";

/**
 * The class that a lit element has.
 */
const LIT_CLASS = "hl";

/**
 * The elements that are lit now.
 */
let litElements: Element[] = [];

/**
 * The value that an element's data-o attribute holds for a file.
 *
 * @param fileName the file's name as the disk shows it, such as "HELLO/BAS".
 */
export function ownerKey(fileName: string): string {
    return fileName.toUpperCase();
}

/**
 * Light the elements that stand for some files, and dim the rest. Whatever was lit before goes back to normal.
 *
 * @param fileNames the files' names as the disk shows them, or undefined or empty to light nothing.
 */
export function lightFiles(fileNames: readonly string[] | undefined): void {
    for (const element of litElements) {
        element.classList.remove(LIT_CLASS);
    }
    litElements = [];

    const names = fileNames ?? [];
    for (const name of names) {
        const key = CSS.escape(ownerKey(name));
        litElements.push(...Array.from(document.querySelectorAll("[data-o~=\"" + key + "\"], tr[data-fo~=\"" + key + "\"]")));
    }
    for (const element of litElements) {
        element.classList.add(LIT_CLASS);
    }
    document.body.classList.toggle(HIGHLIGHT_MODE_CLASS, litElements.length > 0);
}
