/**
 * Helpers shared by the floppy file system decoders: the text that disk structures hold
 * (file names, banners, and the like), and sector ordering.
 */

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
