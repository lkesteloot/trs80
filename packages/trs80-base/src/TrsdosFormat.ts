/**
 * Writes the file system that a DOS's FORMAT puts on a new, empty data disk: the GAT, the HIT, the
 * directory, and the boot sectors. Together with {@link makeBlankFloppy}, which formats the tracks,
 * this makes a blank disk that the DOS accepts. What each DOS writes was measured on disks that the
 * real DOSes formatted, and for the LDOS line checked against FORMAT's code; see "Blank data disks
 * by DOS" in FLOPPY_FORMATS.md, and "GAT bytes 0xCB-0xCD", "The HIT" and "Directory entries (2.3
 * family)" there for what the fields mean.
 */

import {assertNever} from "z80-base";
import {makeBlankFloppy} from "./DmkBuilder.js";
import type {DmkFloppyDisk} from "./DmkFloppyDisk.js";
import {BYTES_PER_SECTOR, Density, SectorData, SectorPosition} from "./FloppyDisk.js";
import {
    LDOS_DD_TRACK_LAYOUT,
    LDOS_SD_TRACK_LAYOUT,
    LSDOS_DD_TRACK_LAYOUT,
    type TrackLayout,
    TRSDOS_13_TRACK_LAYOUT,
    TRSDOS_23_TRACK_LAYOUT,
} from "./TrackLayout.js";
import {DATA_ADDRESS_MARK, DELETED_DATA_ADDRESS_MARK} from "./TrackBytes.js";
import {hashTrsdosPassword} from "./Trsdos.js";

/**
 * The DOSes whose data disks we can format.
 */
export enum TrsdosFormatDos {
    /**
     * Model I TRSDOS 2.3 (and 2.1 and 2.2, which format the same), single density only.
     */
    TRSDOS_2_3,

    /**
     * Model III TRSDOS 1.3, double density only, with its own incompatible layout.
     */
    TRSDOS_1_3,

    /**
     * LDOS 5.3 for the Model I (single density) and the Model III (double density).
     */
    LDOS_5_3,

    /**
     * TRSDOS 6.2 on the Model 4.
     */
    TRSDOS_6_2,

    /**
     * LS-DOS 6.3 (the 6.3.1 release, whose media block says "631") on the Model 4.
     */
    LSDOS_6_3,
}

/**
 * Convert the enum to a string for the user, such as "LS-DOS 6.3".
 */
export function trsdosFormatDosToString(dos: TrsdosFormatDos): string {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return "TRSDOS 2.3";
        case TrsdosFormatDos.TRSDOS_1_3:
            return "TRSDOS 1.3";
        case TrsdosFormatDos.LDOS_5_3:
            return "LDOS 5.3";
        case TrsdosFormatDos.TRSDOS_6_2:
            return "TRSDOS 6.2";
        case TrsdosFormatDos.LSDOS_6_3:
            return "LS-DOS 6.3";
        default:
            assertNever(dos);
    }
}

/**
 * The name that the user types for a DOS on a command line, such as "lsdos-6.3".
 * {@link parseTrsdosFormatDos} accepts it back.
 */
export function trsdosFormatDosCliName(dos: TrsdosFormatDos): string {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return "trsdos-2.3";
        case TrsdosFormatDos.TRSDOS_1_3:
            return "trsdos-1.3";
        case TrsdosFormatDos.LDOS_5_3:
            return "ldos-5.3";
        case TrsdosFormatDos.TRSDOS_6_2:
            return "trsdos-6.2";
        case TrsdosFormatDos.LSDOS_6_3:
            return "lsdos-6.3";
        default:
            assertNever(dos);
    }
}

/**
 * Every DOS that we can format, in the order of the enum, for listing the choices.
 */
export const TRSDOS_FORMAT_DOSES: readonly TrsdosFormatDos[] = [
    TrsdosFormatDos.TRSDOS_2_3,
    TrsdosFormatDos.TRSDOS_1_3,
    TrsdosFormatDos.LDOS_5_3,
    TrsdosFormatDos.TRSDOS_6_2,
    TrsdosFormatDos.LSDOS_6_3,
];

/**
 * Find the DOS that the user named, ignoring case.
 *
 * @param name what the user typed, such as "ldos-5.3".
 * @return the DOS, or undefined if the name isn't one from {@link trsdosFormatDosCliName}.
 */
export function parseTrsdosFormatDos(name: string): TrsdosFormatDos | undefined {
    const lowerName = name.trim().toLowerCase();
    return TRSDOS_FORMAT_DOSES.find(dos => trsdosFormatDosCliName(dos) === lowerName);
}

/**
 * What to format.
 */
export interface TrsdosFormatOptions {
    /**
     * Which DOS's FORMAT to imitate.
     */
    dos: TrsdosFormatDos;

    /**
     * Which TRS-80 the disk is for: 1, 3 or 4. This only chooses the default density of an LDOS
     * disk (single for the Model I, double otherwise); the DOS decides everything else.
     */
    model?: 1 | 3 | 4 | undefined;

    /**
     * Single or double density. Defaults to what the DOS and model use: TRSDOS 2.3 is single only,
     * TRSDOS 1.3 double only, and the LDOS line takes either (a double-density LDOS disk for the
     * Model I, whose cylinder 0 is single density, isn't supported).
     */
    density?: Density | undefined;

    /**
     * Cylinders: 35 to 40 for TRSDOS 2.3 and 1.3, 35 to 80 for LDOS 5.3, and 35 to 96 for TRSDOS 6
     * and LS-DOS 6.
     */
    cylinders: number;

    /**
     * Sides, 1 or 2. TRSDOS 2.3 and 1.3 use only 1.
     */
    sides: number;

    /**
     * The disk's name, up to eight letters and digits starting with a letter, in any case. Defaults
     * to "DATADISK", which LS-DOS 6.3's FORMAT uses when the user types nothing.
     */
    name?: string | undefined;

    /**
     * The date to put in the GAT, as FORMAT does with today's: "MM/DD/YY" in local time. Defaults
     * to now.
     */
    date?: Date | undefined;

    /**
     * The master password: up to eight letters and digits starting with a letter, or empty for none.
     * Defaults to "PASSWORD", which FORMAT uses when the user types nothing.
     */
    masterPassword?: string | undefined;

    /**
     * The DOS's own data-disk boot sectors, each 256 bytes, which are what makes the disk the
     * formatter's own (the first one is also how some tools recognize the DOS). TRSDOS 2.3 needs one,
     * for cylinder 0 sector 0; TRSDOS 1.3 needs two, for sectors 1 and 2 (the second just holds a
     * message); the LDOS line needs two, for sectors 0 and 1 (identical on the Model III and 4, and
     * different on the Model I). They're copied as given except that the directory cylinder is
     * patched in (byte 2, or byte 1 for TRSDOS 1.3), so they can come from a disk with another size.
     * The boot step rate stays what the source disk had.
     *
     * Without them we write a boot sector of our own: it only prints a message and halts, and has the
     * directory cylinder where a DOS looks for it. The DOS and the other tools still recognize the
     * disk from its GAT, but not by its boot sector, and a DOS that checks the boot sector's code before
     * writing may treat the disk as another DOS's. Pass --dos to the tool in that case.
     */
    bootSectors?: Uint8Array[] | undefined;
}

/**
 * The name when the user gives none (from LS-DOS 6.3's FORMAT).
 */
const DEFAULT_DISK_NAME = "DATADISK";

/**
 * The master password when the user gives none (from LS-DOS 6.3's FORMAT).
 */
const DEFAULT_MASTER_PASSWORD = "PASSWORD";

/**
 * Length of the disk name in the GAT.
 */
const NAME_LENGTH = 8;

/**
 * Where the fields of the 2.3 family's GAT are.
 */
const GAT_LOCKOUT_OFFSET = 0x60;
const GAT_END_OF_ALLOCATION = 0xCB;
const GAT_CYLINDER_EXCESS_OFFSET = 0xCC;
const GAT_DISK_TYPE_OFFSET = 0xCD;
const GAT_PASSWORD_OFFSET = 0xCE;
const GAT_NAME_OFFSET = 0xD0;
const GAT_DATE_OFFSET = 0xD8;
const GAT_AUTO_OFFSET = 0xE0;
const GAT_MEDIA_BLOCK_OFFSET = 0xF5;

/**
 * The most entry sectors that the HIT can address. With the GAT and the HIT sectors, a directory
 * is at most this plus two sectors, and DIR/SYS says no more than that.
 */
const MAX_DIRECTORY_SECTORS = 34;

/**
 * How many sectors BOOT/SYS claims, on every DOS here.
 */
const BOOT_SYS_SECTOR_COUNT = 5;

/**
 * What the DOS puts in front of a new directory's first four sectors in the HIT: BOOT/SYS's hash.
 */
const BOOT_SYS_HIT_BYTE = 0xA2;

/**
 * Other HIT bytes: DIR/SYS's hash on the LDOS line, and the wrong one that TRSDOS 2.x stores. See
 * "The HIT" in FLOPPY_FORMATS.md.
 */
const DIR_SYS_HIT_BYTE = 0xC4;
const DIR_SYS_HIT_BYTE_TRSDOS_2 = 0x2C;

/**
 * The directory cylinder of TRSDOS 2.3 and 1.3, which don't choose one.
 */
const FIXED_DIRECTORY_CYLINDER = 17;

/**
 * Directory entries' attribute bytes: system, invisible, in use, and a protection level of 6
 * (execute) for BOOT/SYS and 5 (read) for DIR/SYS.
 */
const BOOT_SYS_ATTRIBUTES = 0x5E;
const DIR_SYS_ATTRIBUTES = 0x5D;

/**
 * The data address marks for a directory sector on a single-density Model I TRSDOS 2.x disk, for
 * the LDOS line's, and for an ordinary sector.
 */
const TRSDOS_2_DIRECTORY_MARK = 0xFA;
const LDOS_DIRECTORY_MARK = DELETED_DATA_ADDRESS_MARK;
const NORMAL_MARK = DATA_ADDRESS_MARK;

/**
 * The data address mark of TRSDOS 1.3's boot sectors, which it writes like deleted data.
 */
const TRSDOS_13_BOOT_MARK = DELETED_DATA_ADDRESS_MARK;

/**
 * The Model I and III video memory, and the Model 4's, where the boot sector we write puts its message.
 */
const MODEL_3_VIDEO = 0x3C00 + 8*64 + 16;
const MODEL_4_VIDEO = 0xF800 + 11*80 + 24;

/**
 * Where the ROM loads a boot sector: the Model I's at 4200H, the Model III's and 4's at 4300H.
 */
const SINGLE_DENSITY_LOAD_ADDRESS = 0x4200;
const DOUBLE_DENSITY_LOAD_ADDRESS = 0x4300;

/**
 * The message in a boot sector that we write ourselves.
 */
const SYNTHETIC_BOOT_MESSAGE = "Data disk, can't boot";

/**
 * Whether a name or password is acceptable: letters and digits, starting with a letter.
 */
const NAME_PATTERN = /^[A-Z][A-Z0-9]*$/;

/**
 * Format a date as FORMAT writes it into the GAT: "MM/DD/YY".
 */
function formatGatDate(date: Date): string {
    const twoDigits = (n: number): string => String(n).padStart(2, "0");
    return `${twoDigits(date.getMonth() + 1)}/${twoDigits(date.getDate())}/${twoDigits(date.getFullYear() % 100)}`;
}

/**
 * Put ASCII text into a buffer.
 */
function writeText(bytes: Uint8Array, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
        bytes[offset + i] = text.charCodeAt(i);
    }
}

/**
 * Pad and uppercase a password the way the DOS does before hashing it.
 *
 * @throws Error if the DOS wouldn't accept the password.
 */
function normalizePassword(password: string): string {
    // This is where the rules live, so that both hashes reject the same passwords.
    hashTrsdosPassword(password);
    return password.toUpperCase().replace(/ +$/, "").padEnd(8, " ");
}

/**
 * Hash a password the way TRSDOS 1.3 does, which differs from the 2.3 family's (see
 * {@link hashTrsdosPassword}). The algorithm is in "Password hashes" in FLOPPY_FORMATS.md. "PASSWORD"
 * hashes to 0x8FD3 and no password to 0x5CEF.
 *
 * @param password one to eight letters and digits, starting with a letter, in any case; or empty for none.
 * @return the 16-bit hash.
 * @throws Error if the DOS wouldn't accept the password.
 */
export function hashTrsdos13Password(password: string): number {
    const padded = normalizePassword(password);

    let hi = 0xFF;
    let lo = 0xFF;
    for (let i = padded.length - 1; i >= 0; i--) {
        const c = padded.charCodeAt(i);
        const t = lo ^ ((lo & 7) << 5);
        const x = ((t - ((c << 8) | hi))*4) & 0xFFFF;
        const newHi = (t ^ (x >> 8) ^ c) & 0xFF;
        const newLo = ((x & 0xFF) ^ (((x*2) & 0xFFFF) >> 8) ^ hi) & 0xFF;
        hi = newHi;
        lo = newLo;
    }

    return (hi << 8) | lo;
}

/**
 * The checked, filled-in options, and what follows from them.
 */
interface FormatPlan {
    dos: TrsdosFormatDos;
    layout: TrackLayout;
    cylinders: number;
    sides: number;
    bootSectors: Uint8Array[] | undefined;

    /**
     * The 8-character name, the 8-character date, and the 16-bit password hash.
     */
    name: string;
    date: string;
    passwordHash: number;

    /**
     * Sectors on one track, and in a granule, and granules on one side of a cylinder.
     */
    sectorsPerTrack: number;
    sectorsPerGranule: number;
    granulesPerSide: number;

    /**
     * The cylinder that the directory is on.
     */
    directoryCylinder: number;
}

/**
 * The track layout for a DOS in a density, or a message if there's none.
 */
function chooseLayout(dos: TrsdosFormatDos, density: Density): TrackLayout | string {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return density === Density.SINGLE ? TRSDOS_23_TRACK_LAYOUT : "TRSDOS 2.3 formats only single density.";
        case TrsdosFormatDos.TRSDOS_1_3:
            return density === Density.DOUBLE ? TRSDOS_13_TRACK_LAYOUT : "TRSDOS 1.3 formats only double density.";
        case TrsdosFormatDos.LDOS_5_3:
            return density === Density.SINGLE ? LDOS_SD_TRACK_LAYOUT : LDOS_DD_TRACK_LAYOUT;
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return density === Density.SINGLE ? LDOS_SD_TRACK_LAYOUT : LSDOS_DD_TRACK_LAYOUT;
        default:
            assertNever(dos);
    }
}

/**
 * The density to use when the options don't say.
 */
function defaultDensity(options: TrsdosFormatOptions): Density {
    switch (options.dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return Density.SINGLE;
        case TrsdosFormatDos.TRSDOS_1_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return Density.DOUBLE;
        case TrsdosFormatDos.LDOS_5_3:
            return options.model === 1 ? Density.SINGLE : Density.DOUBLE;
        default:
            assertNever(options.dos);
    }
}

/**
 * The range of cylinder counts that a DOS formats, as the lowest and the highest.
 */
function cylinderRange(dos: TrsdosFormatDos): {min: number, max: number} {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
        case TrsdosFormatDos.TRSDOS_1_3:
            return {min: 35, max: 40};
        case TrsdosFormatDos.LDOS_5_3:
            return {min: 35, max: 80};
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return {min: 35, max: 96};
        default:
            assertNever(dos);
    }
}

/**
 * Whether a DOS can use both sides of a disk.
 */
function supportsTwoSides(dos: TrsdosFormatDos): boolean {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
        case TrsdosFormatDos.TRSDOS_1_3:
            return false;
        case TrsdosFormatDos.LDOS_5_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return true;
        default:
            assertNever(dos);
    }
}

/**
 * How many boot sectors a DOS writes to cylinder 0.
 */
function bootSectorCount(dos: TrsdosFormatDos): number {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return 1;
        case TrsdosFormatDos.TRSDOS_1_3:
        case TrsdosFormatDos.LDOS_5_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            return 2;
        default:
            assertNever(dos);
    }
}

/**
 * Check the options and work out what follows from them.
 *
 * @return the plan, or a message saying what's wrong with the options.
 */
function makePlan(options: TrsdosFormatOptions): FormatPlan | string {
    const dos = options.dos;
    const dosName = trsdosFormatDosToString(dos);

    const density = options.density ?? defaultDensity(options);
    if (dos === TrsdosFormatDos.LDOS_5_3 && options.model === 1 && density === Density.DOUBLE) {
        return "A double-density LDOS disk for the Model I has a single-density cylinder 0, which isn't supported.";
    }
    const layout = chooseLayout(dos, density);
    if (typeof layout === "string") {
        return layout;
    }

    const {min, max} = cylinderRange(dos);
    if (!Number.isInteger(options.cylinders) || options.cylinders < min || options.cylinders > max) {
        return `${dosName} formats ${min} to ${max} cylinders, not ${options.cylinders}.`;
    }
    if (options.sides !== 1 && options.sides !== 2) {
        return `A disk has 1 or 2 sides, not ${options.sides}.`;
    }
    if (options.sides === 2 && !supportsTwoSides(dos)) {
        return `${dosName} formats only one side.`;
    }

    // The name and password are checked the way FORMAT does.
    const name = (options.name ?? DEFAULT_DISK_NAME).toUpperCase().replace(/ +$/, "");
    if (name.length > NAME_LENGTH || !NAME_PATTERN.test(name)) {
        return `Invalid disk name "${options.name}": a name is up to ${NAME_LENGTH} letters and digits, ` +
            `starting with a letter.`;
    }
    const password = options.masterPassword ?? DEFAULT_MASTER_PASSWORD;
    let passwordHash: number;
    try {
        passwordHash = dos === TrsdosFormatDos.TRSDOS_1_3 ? hashTrsdos13Password(password) : hashTrsdosPassword(password);
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }

    const bootSectors = options.bootSectors;
    if (bootSectors !== undefined) {
        if (bootSectors.length !== bootSectorCount(dos)) {
            return `${dosName} needs ${bootSectorCount(dos)} boot sector(s), not ${bootSectors.length}.`;
        }
        if (bootSectors.some(bootSector => bootSector.length !== BYTES_PER_SECTOR)) {
            return `A boot sector is ${BYTES_PER_SECTOR} bytes.`;
        }
    }

    // Granules are 5 sectors in single density and 6 in double, except TRSDOS 1.3's 3. The directory is
    // in the middle (the LDOS line) or at 17.
    const sectorsPerGranule = dos === TrsdosFormatDos.TRSDOS_1_3 ? 3 : density === Density.SINGLE ? 5 : 6;
    const directoryCylinder = dos === TrsdosFormatDos.TRSDOS_2_3 || dos === TrsdosFormatDos.TRSDOS_1_3 ?
        FIXED_DIRECTORY_CYLINDER : options.cylinders >> 1;

    return {
        dos,
        layout,
        cylinders: options.cylinders,
        sides: options.sides,
        bootSectors,
        name: name.padEnd(NAME_LENGTH, " "),
        date: formatGatDate(options.date ?? new Date()),
        passwordHash,
        sectorsPerTrack: layout.sectorCount,
        sectorsPerGranule,
        granulesPerSide: layout.sectorCount/sectorsPerGranule,
        directoryCylinder,
    };
}

/**
 * Writes sectors to the new disk.
 */
class SectorWriter {
    private readonly disk: DmkFloppyDisk;
    private readonly density: Density;

    /**
     * @param disk the disk to write to.
     * @param density the density of its sectors.
     */
    constructor(disk: DmkFloppyDisk, density: Density) {
        this.disk = disk;
        this.density = density;
    }

    /**
     * Write a whole sector with a data address mark.
     *
     * @param cylinder the cylinder.
     * @param side the side.
     * @param sectorNumber the number in the sector's ID field.
     * @param bytes the data, which is zero-padded to a sector.
     * @param dataAddressMark the mark to write before the data.
     */
    public write(cylinder: number, side: number, sectorNumber: number, bytes: Uint8Array, dataAddressMark: number): void {
        const data = new Uint8Array(BYTES_PER_SECTOR);
        data.set(bytes.subarray(0, BYTES_PER_SECTOR));
        const sectorPosition = SectorPosition.make(cylinder, side, sectorNumber);
        const sectorData = new SectorData(data, sectorPosition, this.density);
        sectorData.dataAddressMark = dataAddressMark;
        this.disk.writeSector(sectorPosition, sectorData);
    }
}

/**
 * Make the boot sector that we write when the caller gives none. It starts the way a real one does,
 * so that the directory cylinder is where the DOS looks, then prints a message directly to video
 * memory (on both the Model III's and the Model 4's) and halts. It works wherever the ROM loads it,
 * since it doesn't call the ROM.
 *
 * @param prefix the bytes that begin the sector, holding the directory cylinder.
 * @param loadAddress where the ROM loads the boot sector.
 */
function makeSyntheticBootSector(prefix: number[], loadAddress: number): Uint8Array {
    const message = SYNTHETIC_BOOT_MESSAGE;
    // The code is 26 bytes: two copies of the message to video memory, then a halt.
    const codeLength = 26;
    const messageAddress = loadAddress + prefix.length + codeLength;
    const copyMessage = (video: number): number[] => [
        0x21, messageAddress & 0xFF, messageAddress >> 8,   // LD HL,message
        0x11, video & 0xFF, video >> 8,                     // LD DE,video
        0x01, message.length, 0x00,                         // LD BC,length
        0xED, 0xB0,                                         // LDIR
    ];
    const code = [
        0xF3,                                               // DI
        ...copyMessage(MODEL_3_VIDEO),
        ...copyMessage(MODEL_4_VIDEO),
        0x76,                                               // HALT
        0x18, 0xFD,                                         // JR back to the HALT
    ];

    const bytes = new Uint8Array(BYTES_PER_SECTOR);
    bytes.set([...prefix, ...code]);
    writeText(bytes, prefix.length + code.length, message);
    return bytes;
}

/**
 * A copy of a boot sector with the directory cylinder patched in.
 */
function patchDirectoryCylinder(bootSector: Uint8Array, offset: number, directoryCylinder: number): Uint8Array {
    const copy = new Uint8Array(bootSector);
    copy[offset] = directoryCylinder;
    return copy;
}

/**
 * What differs between the DOSes that use the 2.3 family's file system on a new data disk.
 */
interface Family23Params {
    /**
     * GAT byte 0xCB.
     */
    osVersion: number;

    /**
     * Whether the GAT has the LDOS fields at 0xCC and 0xCD.
     */
    hasLdosFields: boolean;

    /**
     * Whether 0xCD says "new date style" (bit 3).
     */
    newDateStyle: boolean;

    /**
     * The three characters after the 0x03 in the media block, or undefined for a DOS without a media
     * block.
     */
    mediaTag: string | undefined;

    /**
     * Whether FORMAT writes a copy of the GAT to cylinder 0 sector 3 and a system information
     * sector to sector 2.
     */
    hasGatCopyAndSystemInfo: boolean;

    /**
     * Whether the system information sector has an empty AUTO command at 0x20.
     */
    systemInfoHasAuto: boolean;

    /**
     * Whether the GAT's AUTO area (0xE0) holds an empty command and spaces, rather than zeros.
     */
    autoIsBlankCommand: boolean;

    /**
     * The HIT byte of DIR/SYS.
     */
    dirSysHitByte: number;

    /**
     * The data address mark of the directory's sectors.
     */
    directoryMark: number;

    /**
     * Bytes 16 to 19 (the update and access password hashes) of the BOOT/SYS and DIR/SYS entries.
     */
    bootSysHashes: number[];
    dirSysHashes: number[];

    /**
     * Whether the entries' unused extents are all 0xFF, or just two bytes and then zeros.
     */
    bootSysFullTail: boolean;
    dirSysFullTail: boolean;
}

/**
 * The 2.3 family's parameters for a DOS.
 */
function family23Params(dos: TrsdosFormatDos): Family23Params {
    switch (dos) {
        case TrsdosFormatDos.TRSDOS_2_3:
            return {
                osVersion: 0x21,
                hasLdosFields: false,
                newDateStyle: false,
                mediaTag: undefined,
                hasGatCopyAndSystemInfo: false,
                systemInfoHasAuto: false,
                autoIsBlankCommand: true,
                dirSysHitByte: DIR_SYS_HIT_BYTE_TRSDOS_2,
                directoryMark: TRSDOS_2_DIRECTORY_MARK,
                bootSysHashes: [0x60, 0x7F, 0x1F, 0xB2],
                dirSysHashes: [0xA7, 0x1D, 0xF9, 0xE5],
                bootSysFullTail: false,
                dirSysFullTail: false,
            };
        case TrsdosFormatDos.LDOS_5_3:
            return {
                osVersion: 0x53,
                hasLdosFields: true,
                newDateStyle: true,
                mediaTag: undefined,
                hasGatCopyAndSystemInfo: true,
                systemInfoHasAuto: false,
                autoIsBlankCommand: true,
                dirSysHitByte: DIR_SYS_HIT_BYTE,
                directoryMark: LDOS_DIRECTORY_MARK,
                bootSysHashes: [0xAE, 0x01, 0x00, 0x00],
                dirSysHashes: [0xAE, 0x01, 0x96, 0x42],
                bootSysFullTail: true,
                dirSysFullTail: true,
            };
        case TrsdosFormatDos.TRSDOS_6_2:
            return {
                osVersion: 0x62,
                hasLdosFields: true,
                newDateStyle: false,
                mediaTag: "LSI",
                hasGatCopyAndSystemInfo: true,
                systemInfoHasAuto: true,
                autoIsBlankCommand: false,
                dirSysHitByte: DIR_SYS_HIT_BYTE,
                directoryMark: LDOS_DIRECTORY_MARK,
                bootSysHashes: [0xF6, 0x37, 0xF5, 0x9C],
                dirSysHashes: [0xF6, 0x37, 0x96, 0x42],
                bootSysFullTail: true,
                dirSysFullTail: false,
            };
        case TrsdosFormatDos.LSDOS_6_3:
            return {
                osVersion: 0x63,
                hasLdosFields: true,
                newDateStyle: true,
                mediaTag: "631",
                hasGatCopyAndSystemInfo: true,
                systemInfoHasAuto: true,
                autoIsBlankCommand: false,
                dirSysHitByte: DIR_SYS_HIT_BYTE,
                directoryMark: LDOS_DIRECTORY_MARK,
                bootSysHashes: [0xF4, 0x71, 0x00, 0x00],
                dirSysHashes: [0xF4, 0x71, 0x96, 0x42],
                bootSysFullTail: true,
                dirSysFullTail: false,
            };
        case TrsdosFormatDos.TRSDOS_1_3:
            throw new Error("TRSDOS 1.3 doesn't use the 2.3 family's file system");
        default:
            assertNever(dos);
    }
}

/**
 * Build a BOOT/SYS or DIR/SYS directory entry. Both are system, invisible files with no password and
 * one extent.
 *
 * @param attributes byte 0.
 * @param name the 11-character name.
 * @param hashes bytes 16 to 19.
 * @param sectorCount the file's size in sectors.
 * @param cylinder the extent's cylinder.
 * @param granuleByte the extent's granule offset (always 0 here) and granule count minus one.
 * @param fullTail whether the unused extents are filled with 0xFF, or only the first two bytes are
 * and the rest zero.
 */
function makeSystemEntry(attributes: number, name: string, hashes: number[], sectorCount: number,
                         cylinder: number, granuleByte: number, fullTail: boolean): Uint8Array {

    const entry = new Uint8Array(32);
    entry[0] = attributes;
    writeText(entry, 5, name);
    entry.set(hashes, 16);
    entry[20] = sectorCount & 0xFF;
    entry[21] = sectorCount >> 8;
    entry[22] = cylinder;
    entry[23] = granuleByte;
    entry.fill(0xFF, 24, fullTail ? 32 : 26);
    return entry;
}

/**
 * Build the GAT sector (which is also the first sector of the directory) of a 2.3 family disk.
 */
function makeGat23(plan: FormatPlan, params: Family23Params): Uint8Array {
    const gat = new Uint8Array(BYTES_PER_SECTOR);
    const granulesPerCylinder = plan.granulesPerSide*plan.sides;
    const freeByte = (0xFF << granulesPerCylinder) & 0xFF;

    // Every cylinder's granules are free (and the unused bits set), and past the disk's end all is
    // used. Then the lockout table gets a copy of the free table, before the boot granule and the
    // directory are marked used.
    gat.fill(0xFF, 0, GAT_END_OF_ALLOCATION);
    gat.fill(freeByte, 0, plan.cylinders);
    gat.fill(freeByte, GAT_LOCKOUT_OFFSET, GAT_LOCKOUT_OFFSET + plan.cylinders);
    gat[0] |= 0x01;
    gat[plan.directoryCylinder] = 0xFF;

    gat[GAT_END_OF_ALLOCATION] = params.osVersion;
    if (params.hasLdosFields) {
        gat[GAT_CYLINDER_EXCESS_OFFSET] = plan.cylinders - 35;
        const density = plan.layout.density === Density.DOUBLE ? 0x40 : 0;
        const twoSided = plan.sides === 2 ? 0x20 : 0;
        const newDateStyle = params.newDateStyle ? 0x08 : 0;
        gat[GAT_DISK_TYPE_OFFSET] = 0x80 | density | twoSided | newDateStyle | (plan.granulesPerSide - 1);
    }
    gat[GAT_PASSWORD_OFFSET] = plan.passwordHash & 0xFF;
    gat[GAT_PASSWORD_OFFSET + 1] = plan.passwordHash >> 8;
    writeText(gat, GAT_NAME_OFFSET, plan.name);
    writeText(gat, GAT_DATE_OFFSET, plan.date);

    if (params.autoIsBlankCommand) {
        // An empty AUTO command: a carriage return, then spaces.
        gat.fill(0x20, GAT_AUTO_OFFSET, BYTES_PER_SECTOR);
        gat[GAT_AUTO_OFFSET] = 0x0D;
    }

    if (params.mediaTag !== undefined) {
        // The media block: 0x03, the DOS's tag, and a copy of the end of the drive control table
        // that describes the disk. See "The media block, 0xF5-0xFF" in FLOPPY_FORMATS.md.
        const doubleDensity = plan.layout.density === Density.DOUBLE;
        const mediaBlock = [
            0x03, ...Array.from(params.mediaTag, ch => ch.charCodeAt(0)),
            // Flags 1: double density and a bit that's always set.
            (doubleDensity ? 0x40 : 0) | 0x04,
            // Flags 2: double-density capable, two sided, and drive select for the second drive.
            0x40 | (plan.sides === 2 ? 0x20 : 0) | 0x02,
            // Current cylinder, highest cylinder, sectors per track minus one, granules per track
            // minus one over sectors per granule minus one, and directory cylinder.
            0x00,
            plan.cylinders - 1,
            plan.sectorsPerTrack - 1,
            ((plan.granulesPerSide - 1) << 5) | (plan.sectorsPerGranule - 1),
            plan.directoryCylinder,
        ];
        gat.set(mediaBlock, GAT_MEDIA_BLOCK_OFFSET);
    }

    return gat;
}

/**
 * Write the boot sectors to cylinder 0 of a 2.3 family disk: the caller's, or our own.
 */
function writeBootSectors23(plan: FormatPlan, writer: SectorWriter): void {
    const directoryCylinder = plan.directoryCylinder;
    const doubleDensity = plan.layout.density === Density.DOUBLE;
    const loadAddress = doubleDensity ? DOUBLE_DENSITY_LOAD_ADDRESS : SINGLE_DENSITY_LOAD_ADDRESS;
    const first = plan.layout.firstSectorNumber;

    const given = plan.bootSectors?.map(bootSector => patchDirectoryCylinder(bootSector, 2, directoryCylinder));
    // Without real ones, the LDOS line gets the same sector in both places, as the Model 4's does.
    const synthetic = makeSyntheticBootSector([0x00, 0xFE, directoryCylinder], loadAddress);
    const bootSectors = given ?? [synthetic, synthetic];

    const count = plan.dos === TrsdosFormatDos.TRSDOS_2_3 ? 1 : 2;
    for (let i = 0; i < count; i++) {
        writer.write(0, 0, first + i, bootSectors[i], NORMAL_MARK);
    }
}

/**
 * Format a disk with the 2.3 family's file system: TRSDOS 2.3, LDOS 5.3, TRSDOS 6.2 and LS-DOS 6.3.
 */
function writeFileSystem23(plan: FormatPlan, disk: DmkFloppyDisk): void {
    const params = family23Params(plan.dos);
    const writer = new SectorWriter(disk, plan.layout.density);
    const first = plan.layout.firstSectorNumber;
    const directoryCylinder = plan.directoryCylinder;
    const sectorsPerCylinder = plan.sectorsPerTrack*plan.sides;
    const granulesPerCylinder = plan.granulesPerSide*plan.sides;

    writeBootSectors23(plan, writer);

    const gat = makeGat23(plan, params);
    if (params.hasGatCopyAndSystemInfo) {
        // The system information sector holds the release number, and some DOSes an empty AUTO
        // command. See "The system information sector" in FLOPPY_FORMATS.md.
        const systemInfo = new Uint8Array(BYTES_PER_SECTOR);
        systemInfo[0] = params.osVersion;
        if (params.systemInfoHasAuto) {
            systemInfo[0x20] = 0x0D;
        }
        writer.write(0, 0, first + 2, systemInfo, NORMAL_MARK);
        writer.write(0, 0, first + 3, gat, NORMAL_MARK);
    }

    // The directory: the GAT, the HIT, BOOT/SYS and DIR/SYS in the first entry of the next two
    // sectors, then empty sectors, all with the directory's data address mark. The directory
    // covers every sector of the cylinder, though DIR/SYS says no more than the HIT can address.
    const hit = new Uint8Array(BYTES_PER_SECTOR);
    hit[0] = BOOT_SYS_HIT_BYTE;
    hit[1] = params.dirSysHitByte;
    const bootSys = makeSystemEntry(BOOT_SYS_ATTRIBUTES, "BOOT    SYS", params.bootSysHashes,
        BOOT_SYS_SECTOR_COUNT, 0, 0, params.bootSysFullTail);
    const dirSys = makeSystemEntry(DIR_SYS_ATTRIBUTES, "DIR     SYS", params.dirSysHashes,
        Math.min(sectorsPerCylinder, MAX_DIRECTORY_SECTORS), directoryCylinder, granulesPerCylinder - 1,
        params.dirSysFullTail);
    for (let i = 0; i < sectorsPerCylinder; i++) {
        const side = Math.floor(i/plan.sectorsPerTrack);
        const sectorNumber = first + i % plan.sectorsPerTrack;
        let bytes: Uint8Array;
        switch (i) {
            case 0: bytes = gat; break;
            case 1: bytes = hit; break;
            case 2: bytes = bootSys; break;
            case 3: bytes = dirSys; break;
            default: bytes = new Uint8Array(BYTES_PER_SECTOR); break;
        }
        writer.write(directoryCylinder, side, sectorNumber, bytes, params.directoryMark);
    }
}

/**
 * Format a disk with TRSDOS 1.3's file system: a GAT and a HIT in the first two sectors of the
 * directory cylinder, then sixteen sectors of 48-byte entries, none of which are used. There are no
 * BOOT/SYS and DIR/SYS entries; the HIT holds the system file table, which is empty. See "Cylinders,
 * sides, and allocation" and "TRSDOS 1.3 system files" in FLOPPY_FORMATS.md.
 */
function writeFileSystem13(plan: FormatPlan, disk: DmkFloppyDisk): void {
    const writer = new SectorWriter(disk, plan.layout.density);
    const first = plan.layout.firstSectorNumber;
    const directoryCylinder = plan.directoryCylinder;

    // The boot sectors.
    const synthetic = makeSyntheticBootSector([0xFE, directoryCylinder], DOUBLE_DENSITY_LOAD_ADDRESS);
    const given = plan.bootSectors?.map((bootSector, i) =>
        i === 0 ? patchDirectoryCylinder(bootSector, 1, directoryCylinder) : bootSector);
    const bootSectors = given ?? [synthetic];
    bootSectors.forEach((bootSector, i) => writer.write(0, 0, first + i, bootSector, TRSDOS_13_BOOT_MARK));

    // The GAT: a byte per cylinder with a bit per used granule (so the unused bits are clear), the
    // boot granule and the directory cylinder used. The track existence table is all zeros, and
    // the AUTO command is empty. The master password uses 1.3's own hash.
    const gat = new Uint8Array(BYTES_PER_SECTOR);
    gat[0] = 0x01;
    gat[directoryCylinder] = (1 << plan.granulesPerSide) - 1;
    gat[GAT_PASSWORD_OFFSET] = plan.passwordHash & 0xFF;
    gat[GAT_PASSWORD_OFFSET + 1] = plan.passwordHash >> 8;
    writeText(gat, GAT_NAME_OFFSET, plan.name);
    writeText(gat, GAT_DATE_OFFSET, plan.date);
    writer.write(directoryCylinder, 0, first, gat, NORMAL_MARK);

    // The HIT is empty, and the system file table at 0xE0 has no files.
    const hit = new Uint8Array(BYTES_PER_SECTOR);
    hit.fill(0xFF, 0xE0, BYTES_PER_SECTOR);
    writer.write(directoryCylinder, 0, first + 1, hit, NORMAL_MARK);

    // The entry sectors are empty, and end with the filler that the format wrote there.
    const tail = plan.layout.sectorTail;
    const emptyEntries = new Uint8Array(BYTES_PER_SECTOR);
    emptyEntries.set(tail, BYTES_PER_SECTOR - tail.length);
    for (let i = 2; i < plan.sectorsPerTrack; i++) {
        writer.write(directoryCylinder, 0, first + i, emptyEntries, NORMAL_MARK);
    }
}

/**
 * Make a DMK disk image that is a new, empty data disk as a DOS's FORMAT leaves it: every track
 * formatted the way that DOS formats, a GAT with all granules free except the boot granule and the
 * directory cylinder, a HIT, a directory, and the DOS's boot sectors. The result decodes as that DOS
 * (from its GAT) and can be written with {@link TrsdosWriter}. The directory cylinder is where FORMAT
 * puts it: the middle one for the LDOS line (cylinders divided by two), and 17 for TRSDOS 2.3 and 1.3.
 *
 * What each DOS writes, and how it was checked, is in "Blank data disks by DOS" in FLOPPY_FORMATS.md.
 *
 * @param options what to format.
 * @return the disk, writable and not write-protected, or a message saying what's wrong with the options.
 */
export function formatTrsdosDataDisk(options: TrsdosFormatOptions): DmkFloppyDisk | string {
    const plan = makePlan(options);
    if (typeof plan === "string") {
        return plan;
    }

    const disk = makeBlankFloppy(plan.layout, plan.cylinders, plan.sides);
    if (disk === undefined) {
        return `${trsdosFormatDosToString(plan.dos)} tracks don't fit on a disk of ${plan.cylinders} cylinders and ` +
            `${plan.sides} side(s).`;
    }

    switch (plan.dos) {
        case TrsdosFormatDos.TRSDOS_1_3:
            writeFileSystem13(plan, disk);
            break;
        case TrsdosFormatDos.TRSDOS_2_3:
        case TrsdosFormatDos.LDOS_5_3:
        case TrsdosFormatDos.TRSDOS_6_2:
        case TrsdosFormatDos.LSDOS_6_3:
            writeFileSystem23(plan, disk);
            break;
        default:
            assertNever(plan.dos);
    }

    return disk;
}
