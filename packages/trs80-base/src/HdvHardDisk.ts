import {TRS80_BASE_LOGGER} from "z80-logger";
import {
    HARD_DISK_SECTOR_SIZE,
    HARD_DISK_SECTORS_PER_TRACK,
    HardDisk,
    type HardDiskGeometry,
} from "./HardDisk.js";

/**
 * The size of the header that precedes the sectors.
 */
const HEADER_SIZE = 256;

/**
 * The bytes that start every HDV file.
 */
const MAGIC_0 = 0x56;
const MAGIC_1 = 0xCB;

/**
 * The header versions that we read: 1.0, written by xtrs and FreHD, and 1.1, written by David
 * Keil's emulator.
 */
const VERSION_1_0 = 0x10;
const VERSION_1_1 = 0x11;

/**
 * The number of bytes in a track.
 */
const TRACK_SIZE = HARD_DISK_SECTORS_PER_TRACK * HARD_DISK_SECTOR_SIZE;

/**
 * Human-readable names of the DOSes that the header's auto-boot field can select, indexed by its value.
 * Reed's spec defines 0-3, and FreHD's boot ROM adds the Model I's 4 and 5.
 */
const BOOT_DOS_NAMES = [
    "LS-DOS", "Model III LDOS", "CP/M", "Model III NEWDOS/80", "Model I LDOS", "Model I NEWDOS/80",
];

/**
 * Returns the name of the DOS that the header's auto-boot field selects, such as "LS-DOS", or a
 * generic description for a value that the format doesn't define.
 */
export function hdvBootDosToString(bootDos: number): string {
    return BOOT_DOS_NAMES[bootDos] ?? `DOS type ${bootDos}`;
}

/**
 * Hard disk in the HDV format (version 1) that xtrs, FreHD, and sdltrs use: a 256-byte header, then
 * 256-byte sectors in cylinder order. Within a cylinder, they go head by head. See "Hard disk
 * images" in FLOPPY_FORMATS.md for the header and for where we deviate from the published format.
 */
export class HdvHardDisk extends HardDisk {
    public readonly className = "HdvHardDisk";

    /**
     * The format version from the header: 0x10 or 0x11.
     */
    public readonly headerVersion: number;

    /**
     * Whether the header says the image is write-protected.
     */
    public readonly writeProtected: boolean;

    /**
     * The DOS that the header says to boot (see hdvBootDosToString() for the values), or undefined
     * if the header doesn't ask for auto-boot.
     */
    public readonly autoBootDos: number | undefined;

    private readonly geometry: HardDiskGeometry;

    /**
     * Use decodeHdvHardDisk() to make one from a file.
     */
    constructor(binary: Uint8Array, headerVersion: number, writeProtected: boolean,
                autoBootDos: number | undefined, geometry: HardDiskGeometry) {

        super(binary, undefined);
        this.headerVersion = headerVersion;
        this.writeProtected = writeProtected;
        this.autoBootDos = autoBootDos;
        this.geometry = geometry;
    }

    /**
     * The geometry, and whether the header asks to auto-boot or is write-protected.
     */
    public getDescription(): string {
        let description = `HDV hard disk, ${this.geometry.cylinderCount} cylinders, ${this.geometry.headCount} heads`;
        if (this.autoBootDos !== undefined) {
            description += `, auto-boots ${hdvBootDosToString(this.autoBootDos)}`;
        }
        if (this.writeProtected) {
            description += ", write-protected";
        }
        return description;
    }

    /**
     * The geometry, which comes from the header's heads and the file's length.
     */
    public getGeometry(): HardDiskGeometry {
        return this.geometry;
    }

    /**
     * Read a sector, which is a view of the file's bytes. The sector must be inside the file, so
     * the sectors that a truncated last cylinder is missing are undefined.
     */
    public readSector(cylinder: number, head: number, sector: number): Uint8Array | undefined {
        const geometry = this.geometry;
        if (cylinder < 0 || cylinder >= geometry.cylinderCount ||
            head < 0 || head >= geometry.headCount ||
            sector < 0 || sector >= geometry.sectorsPerTrack) {

            return undefined;
        }

        const sectorIndex = (cylinder*geometry.headCount + head)*geometry.sectorsPerTrack + sector;
        const offset = HEADER_SIZE + sectorIndex*geometry.sectorSize;
        const end = offset + geometry.sectorSize;
        if (end > this.binary.length) {
            return undefined;
        }

        return this.binary.subarray(offset, end);
    }
}

/**
 * Decode an HDV hard disk image, or return undefined if the file isn't one that we can read.
 * The header's cylinder count and checksum are ignored, because the images in circulation get them
 * wrong; the cylinder count comes from the file's length. Images in the 8-inch FreHD's "F48"
 * variant, which changes the sector size, are not supported.
 */
export function decodeHdvHardDisk(binary: Uint8Array): HdvHardDisk | undefined {
    if (binary.length < HEADER_SIZE + TRACK_SIZE || binary[0] !== MAGIC_0 || binary[1] !== MAGIC_1) {
        return undefined;
    }

    const headerVersion = binary[2];
    if (headerVersion !== VERSION_1_0 && headerVersion !== VERSION_1_1) {
        return undefined;
    }

    // Byte 4 is the number of header blocks, and byte 6 the media type (0 for a hard disk). Byte 5
    // is supposed to be 4, but FreHD's firmware writes 1, so don't check it.
    if (binary[4] !== 1 || binary[6] !== 0) {
        return undefined;
    }

    const flags = binary[8];
    if ((flags & 0x02) !== 0) {
        TRS80_BASE_LOGGER.warn("HDV: F48 hard disk images are not supported");
        return undefined;
    }

    const dataLength = binary.length - HEADER_SIZE;
    if (dataLength % HARD_DISK_SECTOR_SIZE !== 0) {
        return undefined;
    }

    // The heads are stored directly, or else as the sectors per cylinder (0 meaning 256).
    let headCount = binary[26];
    if (headCount === 0) {
        const sectorsPerCylinder = binary[29] === 0 ? 256 : binary[29];
        if (sectorsPerCylinder % HARD_DISK_SECTORS_PER_TRACK !== 0) {
            return undefined;
        }
        headCount = sectorsPerCylinder / HARD_DISK_SECTORS_PER_TRACK;
    }

    // A file can end partway through its last cylinder; count that cylinder.
    const cylinderSize = headCount*TRACK_SIZE;
    const cylinderCount = Math.ceil(dataLength / cylinderSize);

    const writeProtected = (binary[7] & 0x80) !== 0;
    const autoBootDos = (flags & 0x01) !== 0 ? binary[11] : undefined;

    return new HdvHardDisk(binary, headerVersion, writeProtected, autoBootDos, {
        cylinderCount,
        headCount,
        sectorsPerTrack: HARD_DISK_SECTORS_PER_TRACK,
        sectorSize: HARD_DISK_SECTOR_SIZE,
    });
}
