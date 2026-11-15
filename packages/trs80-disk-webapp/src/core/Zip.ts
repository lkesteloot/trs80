// A ZIP writer that works synchronously, for a drag's data, which must be ready before the dragstart handler
// returns (so JSZip's generateAsync() can't make it). The files are stored, not compressed: disk files are small.

/** One file to put in a ZIP. */
export interface ZipEntry {
    /** Its path in the ZIP, with "/" between folders. */
    path: string;
    /** Its bytes. */
    bytes: Uint8Array;
    /** Its modification date, or undefined for none (the ZIP records the earliest date it can). */
    date: Date | undefined;
}

/** The CRC-32 of each byte value, for {@link crc32}. */
let crcTable: Uint32Array | undefined = undefined;

/**
 * The CRC-32 that ZIP files use (the polynomial 0xEDB88320, reflected).
 *
 * @param bytes the data.
 */
export function crc32(bytes: Uint8Array): number {
    if (crcTable === undefined) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) !== 0 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            }
            crcTable[n] = c >>> 0;
        }
    }

    let crc = 0xFFFFFFFF;
    for (const byte of bytes) {
        crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * A date as MS-DOS stores it, which is what ZIP files use: local time, to two seconds, from 1980 to 2107.
 *
 * @param date the date, or undefined for the earliest one.
 * @returns the time and the date, each 16 bits.
 */
function dosDateTime(date: Date | undefined): {time: number, date: number} {
    if (date === undefined || date.getFullYear() < 1980) {
        return {time: 0, date: (1 << 5) | 1};
    }
    const year = Math.min(date.getFullYear(), 2107) - 1980;
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
        date: (year << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

/**
 * Make a ZIP file of the entries, stored without compression, with UTF-8 names.
 *
 * @param entries the files, in the order they go in the ZIP.
 */
export function makeZip(entries: readonly ZipEntry[]): Uint8Array {
    const encoder = new TextEncoder();
    const names = entries.map(entry => encoder.encode(entry.path));
    const localSize = entries.reduce((sum, entry, i) => sum + 30 + names[i].length + entry.bytes.length, 0);
    const centralSize = names.reduce((sum, name) => sum + 46 + name.length, 0);
    const zip = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(zip.buffer);
    let pos = 0;
    const u16 = (value: number): void => {
        view.setUint16(pos, value, true);
        pos += 2;
    };
    const u32 = (value: number): void => {
        view.setUint32(pos, value, true);
        pos += 4;
    };
    const append = (bytes: Uint8Array): void => {
        zip.set(bytes, pos);
        pos += bytes.length;
    };

    // Bit 11 of the flags says that the names are UTF-8.
    const UTF8_FLAG = 1 << 11;
    const offsets: number[] = [];
    const crcs = entries.map(entry => crc32(entry.bytes));
    entries.forEach((entry, i) => {
        const {time, date} = dosDateTime(entry.date);
        offsets.push(pos);
        u32(0x04034B50);
        u16(10);            // Version needed: 1.0, for stored files.
        u16(UTF8_FLAG);
        u16(0);             // Stored.
        u16(time);
        u16(date);
        u32(crcs[i]);
        u32(entry.bytes.length);
        u32(entry.bytes.length);
        u16(names[i].length);
        u16(0);             // No extra field.
        append(names[i]);
        append(entry.bytes);
    });

    const centralStart = pos;
    entries.forEach((entry, i) => {
        const {time, date} = dosDateTime(entry.date);
        u32(0x02014B50);
        u16(20);            // Made by: MS-DOS, version 2.0.
        u16(10);
        u16(UTF8_FLAG);
        u16(0);
        u16(time);
        u16(date);
        u32(crcs[i]);
        u32(entry.bytes.length);
        u32(entry.bytes.length);
        u16(names[i].length);
        u16(0);             // No extra field,
        u16(0);             // no comment,
        u16(0);             // first disk,
        u16(0);             // no internal attributes,
        u32(0);             // and no external ones.
        u32(offsets[i]);
        append(names[i]);
    });

    const centralEnd = pos;
    u32(0x06054B50);
    u16(0);             // This disk,
    u16(0);             // and the one the directory starts on.
    u16(entries.length);
    u16(entries.length);
    u32(centralEnd - centralStart);
    u32(centralStart);
    u16(0);             // No comment.

    return zip;
}
