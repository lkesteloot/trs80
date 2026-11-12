/**
 * Helpers shared by the floppy file system decoders: the text that disk structures hold
 * (file names, banners, and the like), and sector ordering.
 */

/**
 * A banner that a DOS's system disks carry, such as "LDOS - The Logical Disk Operating System
 * - Ver 5.3.1", and how to turn it into the DOS's name and version. See "Identifying the DOS"
 * in FLOPPY_FORMATS.md. The name is text, or a {@link DosName} for the TRSDOS family's banners.
 */
export interface DosBanner<Name = string> {
    // What the banner says, usually with the version in a group.
    readonly pattern: RegExp;
    // The name and version, such as "LDOS 5.3.1", from the pattern's match.
    readonly name: (match: RegExpMatchArray) => Name;
}

/**
 * Search the texts for the banners, trying each banner on every text before the next, so
 * that the order of the banners decides between texts that hold different ones. Returns the
 * name and version that the first banner found gives, or undefined if there's none.
 */
export function findDosBanner<Name>(banners: readonly DosBanner<Name>[], texts: readonly string[]): Name | undefined {
    for (const banner of banners) {
        for (const text of texts) {
            const match = text.match(banner.pattern);
            if (match !== null) {
                return banner.name(match);
            }
        }
    }

    return undefined;
}

/**
 * Bytes as Latin-1 text, one character per byte. Not String.fromCharCode(... bytes), which
 * throws on arrays of more than about 100K, and not TextDecoder("latin1"), which browsers
 * treat as Windows-1252, changing bytes 0x80-0x9F.
 */
export function bytesToText(bytes: Uint8Array): string {
    let text = "";
    for (const b of bytes) {
        text += String.fromCharCode(b);
    }
    return text;
}

/**
 * Whether every character of the string is printable ASCII (32 to 126).
 */
export function isPrintable(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 32 || c > 126) {
            return false;
        }
    }
    return true;
}

/**
 * Make a sector translation table: the physical sector index (from 0) of each logical
 * sector on a track, the way cpmtools does for CP/M. The skew is the distance between
 * consecutive logical sectors, which UCSD Pascal calls the interleave.
 */
export function makeSkewTable(sectorsPerTrack: number, skew: number): number[] {
    const table: number[] = [];
    const used = new Set<number>();
    let physical = 0;
    for (let logical = 0; logical < sectorsPerTrack; logical++) {
        // Wrapping can land on a used sector, so take the next free one.
        while (used.has(physical)) {
            physical = (physical + 1) % sectorsPerTrack;
        }
        table.push(physical);
        used.add(physical);
        physical = (physical + skew) % sectorsPerTrack;
    }
    return table;
}
