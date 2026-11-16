/**
 * Decides whether we'll write to a CP/M disk. CP/M doesn't record its disk parameters, so a disk's
 * layout is one of our candidates that read the directory best, and writing with a wrong guess puts
 * data where CP/M won't look. We write only the layouts whose parameters we have from a real system,
 * and refuse (or ask the user to force) where the reading is in doubt. See "Montezuma Micro CP/M
 * 2.2" in FLOPPY_FORMATS.md.
 */

import {assertNever} from "z80-base";
import {Cpm, CPM_FORMATS, type CpmFormat, type CpmLayout, decodeCpmWithLayout, rankCpmCandidates} from "./Cpm.js";
import type {DiskVolume} from "./DiskVolume.js";
import {Density, FloppyDisk, type FloppyDiskGeometry, SectorPosition} from "./FloppyDisk.js";
import {TrsdosWriteAccess, writeProtectionMessage} from "./TrsdosWriteGate.js";

// The name of Montezuma's formats in CPM_FORMATS. Its presets are the only ones whose blank disks we recognize and
// that we can create.
const MONTEZUMA_FORMAT_NAME = "Montezuma Micro";

// The system that Montezuma's presets were verified on.
const MONTEZUMA_SYSTEM = "Montezuma Micro CP/M 2.2 (Model 4)";

// The system that the Model II presets of Lifeboat and Aton were verified on.
const LIFEBOAT_ATON_SYSTEM = "Lifeboat and Aton CP/M 2.2 (Model II)";

// The versions of Montezuma Micro's BIOS that used skew 4.
const MONTEZUMA_SKEW_4_VERSIONS = ["1.26", "1.30"];

// The versions of Montezuma Micro's BIOS that reserved 4 tracks (and only they did).
const MONTEZUMA_RESERVED_4_VERSIONS = ["1.42", "1.44"];

// Bytes in a CP/M directory entry, whose first byte is the user number (0xE5 for an unused slot).
const DIR_ENTRY_SIZE = 32;
const UNUSED_USER = 0xE5;

// What the boot sector of a Montezuma system format that hasn't been SYSGENed says, as ASCII.
const MONTEZUMA_NO_SYSTEM_MESSAGE = "There is NO CP/M";

// Matches the name that CPM_BANNERS makes for a Montezuma Micro BIOS, capturing the version.
const MONTEZUMA_BIOS_NAME = /^Montezuma Micro CP\/M BIOS (\d+\.\d+)$/;

/**
 * A disk parameter block that was verified against a real system, such as the output of Montezuma's
 * PROBE program.
 */
export interface CpmVerifiedLayout {
    // Our name for the layout (a preset), as --cpm-format takes it, such as "mm-ds-system".
    readonly id: string;
    // The vendor's name for the format, or a short description if it has none, such as "Standard DS system".
    readonly name: string;
    // The name of the entry of CPM_FORMATS that the layout is read with, such as "Montezuma Micro".
    readonly formatName: string;
    // The system that the DPB was verified on, which heads the layout's group in the table of presets, such as
    // "Montezuma Micro CP/M 2.2 (Model 4)".
    readonly system: string;
    // The density of the data tracks, for making test disks.
    readonly density: Density;
    // Distance between consecutive logical sectors.
    readonly skew: number;
    // Bytes in a physical sector.
    readonly sectorSize: number;
    readonly sectorsPerTrack: number;
    // Sides that the file system uses.
    readonly sides: number;
    readonly cylinders: number;
    // Reserved tracks (the DPB's OFF). Each side counts as a track.
    readonly reservedTracks: number;
    // The last block number (the DPB's DSM).
    readonly dsm: number;
    // Bytes in an allocation block (from the DPB's BSH). Like dsm, this is checked against what the decoder
    // computes, so that the table and the decoder can't drift apart.
    readonly blockSize: number;
    // The number of directory entries (the DPB's DRM + 1), checked against the decoder like blockSize.
    readonly dirEntries: number;
}

/**
 * The layouts that we'll write: the presets that --cpm-format names. Each is read with the entry of CPM_FORMATS
 * that its formatName gives, and the DSM, block size, and directory size are checked against what the decoder
 * computes, so a drift between this table and the decoder blocks writing. They're grouped by the system whose DPB
 * verified them. The first 15 are Montezuma Micro CP/M 2.2's (the first 12 from the DPBs that PROBE printed, and
 * the 3 after them from the earlier versions' formats), and the rest are the other systems' (see "CP/M
 * presets" in FLOPPY_FORMATS.md). The 1.32 format, FORMAT15 there, is the same as "Standard DS system".
 */
export const CPM_VERIFIED_LAYOUTS: readonly CpmVerifiedLayout[] = [
    {id: "mm-system", name: "Standard system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 1, cylinders: 40, reservedTracks: 2, dsm: 84, blockSize: 2048, dirEntries: 128},
    {id: "mm-data", name: "Standard data", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 40, reservedTracks: 0, dsm: 99, blockSize: 2048, dirEntries: 128},
    {id: "mm-ds-system", name: "Standard DS system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 2, cylinders: 40, reservedTracks: 2, dsm: 174, blockSize: 2048, dirEntries: 128},
    {id: "mm-ds-data", name: "Standard DS data", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 2, cylinders: 40, reservedTracks: 0, dsm: 199, blockSize: 2048, dirEntries: 128},
    {id: "mm-80-system", name: "80T system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 1, cylinders: 80, reservedTracks: 2, dsm: 174, blockSize: 2048, dirEntries: 128},
    {id: "mm-80-data", name: "80T data", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 80, reservedTracks: 0, dsm: 199, blockSize: 2048, dirEntries: 128},
    {id: "mm-80-ds-system", name: "80T DS system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 2, cylinders: 80, reservedTracks: 2, dsm: 354, blockSize: 2048, dirEntries: 128},
    {id: "mm-80-ds-data", name: "80T DS data", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 2, cylinders: 80, reservedTracks: 0, dsm: 399, blockSize: 2048, dirEntries: 128},
    {id: "mm-ext-system", name: "Extended system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 40, reservedTracks: 2, dsm: 94, blockSize: 2048, dirEntries: 128},
    {id: "mm-ext-ds-system", name: "Extended DS system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 2, cylinders: 40, reservedTracks: 2, dsm: 194, blockSize: 2048, dirEntries: 128},
    {id: "mm-ext-80-system", name: "Extended 80T system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 80, reservedTracks: 2, dsm: 194, blockSize: 2048, dirEntries: 128},
    {id: "mm-ext-80-ds-system", name: "Extended 80T DS system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 512, sectorsPerTrack: 10, sides: 2, cylinders: 80, reservedTracks: 2, dsm: 394, blockSize: 2048, dirEntries: 128},
    {id: "mm-1.26-system", name: "Version 1.26 and 1.30 system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 4, sectorSize: 256, sectorsPerTrack: 18, sides: 1, cylinders: 40, reservedTracks: 2, dsm: 84, blockSize: 2048, dirEntries: 128},
    {id: "mm-1.26-ds-system", name: "Version 1.26 and 1.30 DS system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 4, sectorSize: 256, sectorsPerTrack: 18, sides: 2, cylinders: 40, reservedTracks: 2, dsm: 174, blockSize: 2048, dirEntries: 128},
    {id: "mm-1.42-ds-system", name: "Version 1.42 and 1.44 DS system", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 256, sectorsPerTrack: 18, sides: 2, cylinders: 40, reservedTracks: 4, dsm: 170, blockSize: 2048, dirEntries: 128},
    // A Montezuma BIOS 2.32 system disk carries this DPB (SPT 44, DSM 109, no reserved tracks). The double-sided
    // Super Data format (DSM 219) is left out, because its side order hasn't been checked.
    {id: "mm-superdata", name: "Super Data", formatName: MONTEZUMA_FORMAT_NAME, system: MONTEZUMA_SYSTEM, density: Density.DOUBLE, skew: 2, sectorSize: 1024, sectorsPerTrack: 6, sides: 1, cylinders: 40, reservedTracks: 0, dsm: 109, blockSize: 2048, dirEntries: 128},
    // CP/M 1.4 has no DPB on the disk: the layout was measured from the disks, and Omikron's BIOS for the same
    // Model I disks carries the same DPB (SPT 18, BSH 3, DSM 71, DRM 63, OFF 3). Lifeboat's BIOS uses 35 cylinders
    // even when the image has 40, so the preset has 35. See "CP/M presets" in FLOPPY_FORMATS.md.
    {id: "lb-system", name: "35-track system", formatName: "Lifeboat", system: "Lifeboat CP/M 1.4 (Model I)", density: Density.SINGLE, skew: 4, sectorSize: 128, sectorsPerTrack: 18, sides: 1, cylinders: 35, reservedTracks: 3, dsm: 71, blockSize: 1024, dirEntries: 64},
    // PROBE's DPB, which a Montezuma 2.32 system also carries (SPT 40, BSH 3, DSM 194, DRM 63, AL0 F0, OFF 1). Its
    // AL0 reserves 4 blocks, so blocks 2 and 3 must never be allocated.
    {id: "holmes-system", name: "System", formatName: "Holmes Engineering", system: "Holmes Engineering CP/M 2.2 (Model I)", density: Density.DOUBLE, skew: 1, sectorSize: 512, sectorsPerTrack: 10, sides: 1, cylinders: 40, reservedTracks: 1, dsm: 194, blockSize: 1024, dirEntries: 64},
    // The Radio Shack CP/M Plus loader on its system tracks carries the DPB (SPT 32, BSH 3, EXM 0, DSM 155,
    // DRM 63, AL0 C0, OFF 1).
    {id: "cpm3-system", name: "System", formatName: "Digital Research", system: "Radio Shack CP/M Plus (Model 4)", density: Density.DOUBLE, skew: 1, sectorSize: 512, sectorsPerTrack: 8, sides: 1, cylinders: 40, reservedTracks: 1, dsm: 155, blockSize: 1024, dirEntries: 64},
    // Lifeboat 2.24A's STAT DSK: reports 600K, 128 entries, and 2 reserved tracks.
    {id: "lb-m2-system", name: "Lifeboat 2.24A, Aton", formatName: "Lifeboat or Aton", system: LIFEBOAT_ATON_SYSTEM, density: Density.DOUBLE, skew: 3, sectorSize: 1024, sectorsPerTrack: 8, sides: 1, cylinders: 77, reservedTracks: 2, dsm: 299, blockSize: 2048, dirEntries: 128},
    // Aton 2.25B's STAT DSK: reports 1216K, 192 entries, and 2 reserved tracks. Sides alternate track by track, as
    // cpmtools' definition says and the decoder assumes.
    {id: "lb-m2-ds-system", name: "Lifeboat 2.24A, Aton DS", formatName: "Lifeboat or Aton", system: LIFEBOAT_ATON_SYSTEM, density: Density.DOUBLE, skew: 3, sectorSize: 1024, sectorsPerTrack: 8, sides: 2, cylinders: 77, reservedTracks: 2, dsm: 607, blockSize: 2048, dirEntries: 192},
];

/**
 * Whether a preset is one of Montezuma Micro's, which are the only ones whose blank disks we recognize and that
 * we can create.
 */
export function isMontezumaPreset(layout: CpmVerifiedLayout): boolean {
    return layout.formatName === MONTEZUMA_FORMAT_NAME;
}

/**
 * The verified layout that a decoded disk has, or undefined if it has none.
 */
export function findCpmVerifiedLayout(cpm: Cpm): CpmVerifiedLayout | undefined {
    return CPM_VERIFIED_LAYOUTS.find(layout =>
        layout.formatName === cpm.format.name &&
        layout.skew === cpm.format.skew &&
        layout.sectorSize === cpm.sectorSize &&
        layout.sectorsPerTrack === cpm.sectorsPerTrack &&
        layout.sides === cpm.allocationSides &&
        layout.cylinders === cpm.cylinderCount &&
        layout.reservedTracks === cpm.reservedTrackCount &&
        layout.dsm === cpm.blockCount - 1 &&
        layout.blockSize === cpm.format.blockSize &&
        layout.dirEntries === cpm.dirEntryCount);
}

/**
 * The verified layout (preset) with this name, ignoring case, or undefined if there is none.
 */
export function findCpmVerifiedLayoutById(id: string): CpmVerifiedLayout | undefined {
    const wanted = id.trim().toLowerCase();
    return CPM_VERIFIED_LAYOUTS.find(layout => layout.id === wanted);
}

/**
 * The format entry of CPM_FORMATS that a verified layout is read with: the one that its formatName names, with the
 * layout's skew and sector shape.
 */
export function findPresetFormat(layout: CpmVerifiedLayout): CpmFormat | undefined {
    return CPM_FORMATS.find(format =>
        format.name === layout.formatName &&
        format.skew === layout.skew &&
        format.sectorSizes.includes(layout.sectorSize) &&
        format.sectorsPerTrack.includes(layout.sectorsPerTrack) &&
        format.reservedTrackCounts.includes(layout.reservedTracks));
}

/**
 * The layout to read an image with when the user names a verified layout, with no search. The layout's
 * sides, reserved tracks, and cylinders are used as they are, so an image with more cylinders than the layout
 * has is read as if it had only the layout's (the DSM comes from the layout, so nothing past it is used), and one
 * with fewer has its missing sectors reported as missing.
 *
 * @param layout the preset.
 * @param geometry the image's geometry.
 * @returns the layout, or a message saying why the image can't hold this layout.
 */
export function makeCpmLayout(layout: CpmVerifiedLayout, geometry: FloppyDiskGeometry): CpmLayout | string {
    if (geometry.modalDataSectorSize !== layout.sectorSize) {
        return `the image's sectors are ${geometry.modalDataSectorSize} bytes, not ${layout.sectorSize}`;
    }
    if (geometry.modalDataSectorSpan !== layout.sectorsPerTrack) {
        return `the image has ${geometry.modalDataSectorSpan} sectors per track, not ${layout.sectorsPerTrack}`;
    }
    if (layout.sides === 2 && geometry.sideCount < 2) {
        return "the image has only one side";
    }
    const format = findPresetFormat(layout);
    if (format === undefined) {
        // The table and the formats have drifted apart (a bug, which a test catches).
        return "no format matches it";
    }
    // Holmes and Montezuma both have 10 sectors of 512 bytes, numbered from 0 and from 1.
    const dataSectorsFirst = findDataSectorNumbering(geometry, layout.sectorSize);
    if (dataSectorsFirst !== undefined && dataSectorsFirst !== format.firstSectorNumber) {
        return `the image's sectors are numbered from ${dataSectorsFirst}, not ${format.firstSectorNumber}`;
    }

    return {
        geometry,
        format,
        allocationSides: layout.sides,
        reservedTrackCount: layout.reservedTracks,
        cylinderCount: layout.cylinders,
    };
}

/**
 * The number that most of the data tracks' sectors start at, counting only the tracks whose sectors are the data
 * tracks' size (Lifeboat's reserved tracks have bigger sectors, numbered from 0, and its data tracks from 1).
 *
 * @returns the number, or undefined if no track has sectors of that size.
 */
function findDataSectorNumbering(geometry: FloppyDiskGeometry, sectorSize: number): number | undefined {
    const counts = new Map<number, number>();
    for (const track of geometry.trackMap.values()) {
        if (track.modalSectorSize === sectorSize) {
            counts.set(track.coreFirstSectorNumber, (counts.get(track.coreFirstSectorNumber) ?? 0) + 1);
        }
    }
    let best: number | undefined;
    for (const [first, count] of counts) {
        if (best === undefined || count > (counts.get(best) ?? 0)) {
            best = first;
        }
    }
    return best;
}

/**
 * The presets that an image can hold, as makeCpmLayout() sees it, in table order.
 */
export function findCpmLayoutsForGeometry(geometry: FloppyDiskGeometry): CpmVerifiedLayout[] {
    return CPM_VERIFIED_LAYOUTS.filter(layout => typeof makeCpmLayout(layout, geometry) !== "string");
}

/**
 * The capacity of a verified layout, such as "170K": its blocks (DSM + 1) of the layout's block size.
 */
function cpmVerifiedLayoutCapacity(layout: CpmVerifiedLayout): string {
    return `${(layout.dsm + 1)*layout.blockSize/1024}K`;
}

/**
 * A preset's sectors per track and their size, such as "18 × 256", or "5 × 1024 + 512" when the last sector is
 * shorter (Super Data).
 */
function describeSectorShape(layout: CpmVerifiedLayout): string {
    const lastSectorSize = findPresetFormat(layout)?.lastSectorSize;
    return lastSectorSize === undefined ? `${layout.sectorsPerTrack} × ${layout.sectorSize}` :
        `${layout.sectorsPerTrack - 1} × ${layout.sectorSize} + ${lastSectorSize}`;
}

/**
 * The table of presets as lines of text: one header row (the name to give --cpm-format, the format's name, sides,
 * cylinders, sectors per track and their size such as "18 × 256", and capacity), then the presets grouped by the
 * system that verified them, in table order. A group is a heading line (the system, not indented) followed by its
 * rows, with a blank line between groups. Rows are indented by two spaces, like the header, and the columns are
 * lined up across all groups. The lines are meant to be shown as they are (not wrapped). The same table is in
 * site/disk.html, written by hand, so change both together.
 */
export function formatCpmPresetTable(): string[] {
    const rows: string[][] = [["Name", "Format", "Sides", "Cylinders", "Sectors", "Capacity"]];
    for (const layout of CPM_VERIFIED_LAYOUTS) {
        rows.push([layout.id, layout.name, String(layout.sides), String(layout.cylinders),
            describeSectorShape(layout), cpmVerifiedLayoutCapacity(layout)]);
    }

    // Numbers are right-aligned, and the text left-aligned.
    const rightAligned = [false, false, true, true, true, true];
    const widths = rows[0].map((_, column) => Math.max(...rows.map(row => row[column].length)));
    const formatRow = (row: string[]): string => "  " + row.map((cell, column) =>
        rightAligned[column] ? cell.padStart(widths[column]) : cell.padEnd(widths[column])).join("  ").trimEnd();

    const lines = [formatRow(rows[0])];
    let previousSystem: string | undefined;
    CPM_VERIFIED_LAYOUTS.forEach((layout, i) => {
        if (layout.system !== previousSystem) {
            lines.push("", layout.system);
            previousSystem = layout.system;
        }
        lines.push(formatRow(rows[i + 1]));
    });
    return lines;
}

/**
 * The name of a decoded disk's operating system, with its verified layout (preset) if it has one, such as
 * "Montezuma Micro CP/M BIOS 2.25, Standard system (mm-system)". That's how users learn the names.
 */
export function describeCpmWithPreset(cpm: Cpm): string {
    const verified = findCpmVerifiedLayout(cpm);
    return verified === undefined ? cpm.nameAndVersion :
        `${cpm.nameAndVersion}, ${verified.name} (${verified.id})`;
}

/**
 * The reasons we might not let a tool write to a CP/M disk. They're declared in the order that
 * {@link CpmWriteGate.blockers} lists them.
 */
export enum CpmWriteBlockerKind {
    /**
     * No verified layout matches the disk. Not forceable: we don't know where the BIOS keeps blocks.
     */
    UNSUPPORTED_LAYOUT,

    /**
     * The directory has CP/M 3 entries (passwords, a label, or date stamps), which we don't maintain.
     * Not forceable.
     */
    CPM3_ENTRIES,

    /**
     * A sector of the directory is missing or has a CRC error. Not forceable.
     */
    DIRECTORY_UNREADABLE,

    /**
     * The image says it's write-protected, or its format can't be written.
     */
    WRITE_PROTECTED,

    /**
     * Another layout reads the disk as well as the one we chose, and puts blocks in different sectors.
     */
    LAYOUT_DOUBT,

    /**
     * The directory has bad entries or blocks claimed more than once.
     */
    DAMAGE,
}

/**
 * A short lowercase name for a kind of blocker, such as "layout-doubt".
 */
export function cpmWriteBlockerKindToString(kind: CpmWriteBlockerKind): string {
    switch (kind) {
        case CpmWriteBlockerKind.UNSUPPORTED_LAYOUT:
            return "unsupported-layout";
        case CpmWriteBlockerKind.CPM3_ENTRIES:
            return "cpm3-entries";
        case CpmWriteBlockerKind.DIRECTORY_UNREADABLE:
            return "directory-unreadable";
        case CpmWriteBlockerKind.WRITE_PROTECTED:
            return "write-protected";
        case CpmWriteBlockerKind.LAYOUT_DOUBT:
            return "layout-doubt";
        case CpmWriteBlockerKind.DAMAGE:
            return "damage";
        default:
            assertNever(kind);
    }
}

/**
 * The access level that a kind of blocker allows, if it were the only one. Damage is the only one
 * that leaves room for a repair, though we have no CP/M repair.
 */
export function cpmWriteBlockerKindAccess(kind: CpmWriteBlockerKind): TrsdosWriteAccess {
    switch (kind) {
        case CpmWriteBlockerKind.UNSUPPORTED_LAYOUT:
        case CpmWriteBlockerKind.CPM3_ENTRIES:
        case CpmWriteBlockerKind.DIRECTORY_UNREADABLE:
        case CpmWriteBlockerKind.WRITE_PROTECTED:
        case CpmWriteBlockerKind.LAYOUT_DOUBT:
            return TrsdosWriteAccess.READ_ONLY;
        case CpmWriteBlockerKind.DAMAGE:
            return TrsdosWriteAccess.REPAIR_ONLY;
        default:
            assertNever(kind);
    }
}

/**
 * One reason that a CP/M disk isn't fully writable.
 */
export interface CpmWriteBlocker {
    kind: CpmWriteBlockerKind;

    /**
     * One or two complete sentences for the user.
     */
    message: string;

    /**
     * Whether the user may override this blocker (with --force).
     */
    forceable: boolean;
}

/**
 * The result of {@link evaluateCpmWriteGate}.
 */
export interface CpmWriteGate {
    access: TrsdosWriteAccess;

    /**
     * Why the access isn't {@link TrsdosWriteAccess.WRITABLE}, in the order of the
     * {@link CpmWriteBlockerKind} enum. Empty when the disk is writable.
     */
    blockers: CpmWriteBlocker[];
}

/**
 * Whether two candidates put blocks in the same sectors, which is true when they differ at most
 * in the cylinder count and that doesn't change the pointer size or the extent mask. (Directory
 * entries then mean the same thing under both.)
 */
export function sameBlockMapping(a: Cpm, b: Cpm): boolean {
    return a.format === b.format &&
        a.allocationSides === b.allocationSides &&
        a.reservedTrackCount === b.reservedTrackCount &&
        a.wideBlockPointers === b.wideBlockPointers &&
        a.extentMask === b.extentMask;
}

/**
 * Whether the image has every sector of the data layout on side 1 of every cylinder. Montezuma's
 * FORMAT never touches side 1 of a single-sided disk, so a formatted side 1 means a double-sided disk.
 */
function side1IsFullyFormatted(cpm: Cpm): boolean {
    const first = cpm.format.firstSectorNumber;
    for (let cylinder = 0; cylinder < cpm.geometry.cylinderCount; cylinder++) {
        for (let i = 0; i < cpm.sectorsPerTrack; i++) {
            if (!cpm.disk.hasSectorData(SectorPosition.make(cylinder, 1, first + i))) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Whether the image has no sector at all on side 1.
 */
function side1IsEmpty(cpm: Cpm): boolean {
    return cpm.geometry.sectorInfos.every(info => info.sectorPosition.side !== 1);
}

/**
 * Whether the disk's banner names a Montezuma BIOS version that didn't use skew 4.
 */
function bannerRulesOutSkew4(cpm: Cpm): boolean {
    const match = MONTEZUMA_BIOS_NAME.exec(cpm.nameAndVersion);
    return match !== null && !MONTEZUMA_SKEW_4_VERSIONS.includes(match[1]);
}

/**
 * The other readings of the disk that we can't rule out: the candidates in the ranking, other than
 * the given layout, that read as well (the same score and missing sectors) and put blocks in
 * different sectors. These don't count:
 *
 * - A candidate that differs only in its cylinder count, with the same pointer size and extent mask.
 * - A one-side candidate, when the disk uses two sides and the image has every sector of the data
 *   layout on side 1 of every cylinder.
 * - A two-side candidate, when the disk uses one side and the image has no sector at all on side 1, since such an
 *   image can't be a two-sided disk's. (The mirror of the rule above.)
 * - A skew-4 Montezuma candidate, when the disk's banner names a Montezuma BIOS version other than
 *   1.26 and 1.30, the only ones with skew 4.
 *
 * See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.
 *
 * @param cpm the layout that we'd write with.
 * @param ranked every candidate, from rankCpmCandidates().
 */
export function findCpmLayoutDoubts(cpm: Cpm, ranked: Cpm[]): Cpm[] {
    let side1Proven: boolean | undefined;
    let side1Empty: boolean | undefined;
    const bannerExcludesSkew4 = bannerRulesOutSkew4(cpm);

    return ranked.filter(other => {
        if (other.sameLayout(cpm)) {
            return false;
        }
        const tied = other.evaluation.score === cpm.evaluation.score &&
            other.evaluation.missingSectorCount === cpm.evaluation.missingSectorCount;
        if (!tied || sameBlockMapping(cpm, other)) {
            return false;
        }

        const isSkew4Montezuma = other.format.name === MONTEZUMA_FORMAT_NAME && other.format.skew === 4;
        if (bannerExcludesSkew4 && isSkew4Montezuma) {
            return false;
        }

        if (cpm.allocationSides === 1 && other.allocationSides === 2) {
            side1Empty ??= side1IsEmpty(cpm);
            if (side1Empty) {
                return false;
            }
        }

        if (cpm.allocationSides === 2 && other.allocationSides === 1) {
            side1Proven ??= side1IsFullyFormatted(cpm);
            if (side1Proven) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Whether every track of the sides that a layout uses that the image has (every one with a readable sector ID) is
 * numbered from the given first sector number, as the format numbers its sectors. Montezuma's FORMAT numbers from 1,
 * and Model I TRSDOS-family disks from 0, so this keeps a blank TRSDOS disk that we can't decode from reading as a
 * blank CP/M one. (Model III TRSDOS also numbers from 1, so this is only a guard.) A track's own numbering
 * (TrackGeometry.coreFirstSectorNumber) is used, which ignores the stray IDs of copy protection. A side that the layout
 * doesn't use may hold anything.
 */
function sectorsNumberedFrom(geometry: FloppyDiskGeometry, sides: number, firstSectorNumber: number): boolean {
    for (const track of geometry.trackMap.values()) {
        if (track.trackPosition.side < sides && track.coreFirstSectorNumber !== firstSectorNumber) {
            return false;
        }
    }
    return true;
}

/**
 * Whether track 0's first sector reads as the start of a directory: every 32-byte slot in it starts with 0xE5. On a
 * data format that sector holds the first directory slots, and on a system format it holds the boot sector (or the
 * system's first sector), which never looks like that. See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.
 *
 * @returns whether it does, or undefined if the sector can't be read.
 */
function firstSectorLooksLikeDirectory(cpm: Cpm): boolean | undefined {
    const sector = cpm.disk.readSector(SectorPosition.make(0, 0, cpm.format.firstSectorNumber));
    if (sector === undefined) {
        return undefined;
    }
    for (let offset = 0; offset + DIR_ENTRY_SIZE <= sector.data.length; offset += DIR_ENTRY_SIZE) {
        if (sector.data[offset] !== UNUSED_USER) {
            return false;
        }
    }
    return true;
}

/**
 * Whether a system format's reserved tracks say that Montezuma's BIOS wrote them: they have a Montezuma BIOS banner
 * (a SYSGENed disk), or track 0's first sector is the boot sector that FORMAT leaves, which says there's no CP/M on the
 * disk. A system format with a blank directory and neither could be another system's disk with an empty directory,
 * which is all 0xE5 too. See "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md.
 */
function hasMontezumaSystemEvidence(cpm: Cpm): boolean {
    if (MONTEZUMA_BIOS_NAME.test(cpm.nameAndVersion)) {
        return true;
    }
    const sector = cpm.disk.readSector(SectorPosition.make(0, 0, cpm.format.firstSectorNumber));
    if (sector === undefined) {
        return false;
    }
    let text = "";
    for (const byte of sector.data) {
        text += String.fromCharCode(byte);
    }
    return text.includes(MONTEZUMA_NO_SYSTEM_MESSAGE);
}

/**
 * The readings of a disk with a blank directory, in table order: the verified layouts that the image can hold
 * and that every directory slot's user byte is 0xE5 under (so an erased disk counts, though the rest of its
 * entries are left). A blank directory fits many layouts, since it has nothing to tell them apart, so the list is
 * narrowed by what else the disk says (see "Montezuma Micro CP/M 2.2" in FLOPPY_FORMATS.md):
 *
 * - The image's cylinder count must equal the layout's, and the tracks it uses must have their sectors numbered
 *   from the format's first sector number.
 * - Sides: a two-side layout is dropped when the image has no sector on side 1, and a one-side layout when side 1 of
 *   every cylinder has every sector. (The rules of {@link findCpmLayoutDoubts}.)
 * - Data or system: track 0's first sector is the start of the directory on a data format (no reserved tracks),
 *   and the boot sector on a system format, so a layout with reserved tracks is kept only if that sector doesn't
 *   look like a directory, and one without only if it does. A system format must also have Montezuma's boot sector
 *   or a Montezuma BIOS banner, since without them it's no more likely to be Montezuma's than any other
 *   system's.
 * - Banner: if the reserved tracks have a Montezuma BIOS banner, a skew-4 layout is dropped unless the version is
 *   1.26 or 1.30, and the 4-reserved-track layout is dropped unless it's 1.42 or 1.44. For those versions a
 *   two-sided layout must have the 4 reserved tracks (a one-sided disk of these versions reads as the standard
 *   system format, as FLOPPY_FORMATS.md says).
 *
 * Only Montezuma's presets are considered, since the narrowing relies on the evidence of Montezuma's system (its
 * boot sector and banners), and no other system's blank disks are recognized.
 *
 * @param disk the floppy, or an overlay over one.
 * @param geometry the geometry of the whole disk.
 * @param wholeRecords see decodeCpm(). It makes no difference to a blank disk, but the readings are decoded this way.
 */
export function findBlankCpmCandidates(disk: DiskVolume, geometry: FloppyDiskGeometry, wholeRecords: boolean): Cpm[] {
    let candidates: {verified: CpmVerifiedLayout, cpm: Cpm}[] = [];
    for (const verified of CPM_VERIFIED_LAYOUTS) {
        if (!isMontezumaPreset(verified) || verified.cylinders !== geometry.cylinderCount) {
            continue;
        }
        const layout = makeCpmLayout(verified, geometry);
        if (typeof layout === "string" || !sectorsNumberedFrom(geometry, verified.sides, layout.format.firstSectorNumber)) {
            continue;
        }
        const cpm = decodeCpmWithLayout(disk, layout, wholeRecords);
        if (!cpm.isDirectoryBlank()) {
            continue;
        }
        const isDirectory = firstSectorLooksLikeDirectory(cpm);
        const hasReservedTracks = verified.reservedTracks > 0;
        if (isDirectory === undefined || isDirectory === hasReservedTracks) {
            continue;
        }
        if (hasReservedTracks && !hasMontezumaSystemEvidence(cpm)) {
            continue;
        }
        candidates.push({verified, cpm});
    }
    if (candidates.length === 0) {
        return [];
    }

    // Everything but the layout is the same for all the readings, so the first one decides the sides.
    const first = candidates[0].cpm;
    if (side1IsEmpty(first)) {
        candidates = candidates.filter(candidate => candidate.verified.sides === 1);
    } else if (side1IsFullyFormatted(first)) {
        candidates = candidates.filter(candidate => candidate.verified.sides === 2);
    }

    // The banner's version, if a reserved track has one. Readings with fewer reserved tracks may not search as far.
    const bannerVersion = candidates
        .map(candidate => MONTEZUMA_BIOS_NAME.exec(candidate.cpm.nameAndVersion)?.[1])
        .find(version => version !== undefined);
    if (bannerVersion !== undefined) {
        const reserved4 = MONTEZUMA_RESERVED_4_VERSIONS.includes(bannerVersion);
        const skew4 = MONTEZUMA_SKEW_4_VERSIONS.includes(bannerVersion);
        candidates = candidates.filter(candidate => {
            const isReserved4 = candidate.verified.reservedTracks === 4;
            const isSkew4 = candidate.verified.skew === 4;
            const twoSided = candidate.verified.sides === 2;
            const versionAllows = reserved4 ? isReserved4 || !twoSided : !isReserved4;
            return versionAllows && (skew4 || !isSkew4);
        });
    }

    return candidates.map(candidate => candidate.cpm);
}

/**
 * Decode a disk whose directory is blank, such as a freshly formatted Montezuma disk, which {@link decodeCpm}
 * deliberately doesn't recognize (a blank directory is what any operating system's formatted disk looks like).
 *
 * @param disk the floppy.
 * @param wholeRecords see decodeCpm().
 * @returns the first reading of {@link findBlankCpmCandidates}, which has no files, or undefined if there is none.
 * A disk that more than one layout reads is ambiguous, and the write gate says so.
 */
export function decodeBlankCpm(disk: FloppyDisk, wholeRecords = false): Cpm | undefined {
    return findBlankCpmCandidates(disk, disk.getGeometry(), wholeRecords)[0];
}

/**
 * Describe in a few words how another reading differs from the chosen one, such as "one side" or
 * "skew 4".
 */
function describeDifference(cpm: Cpm, other: Cpm): string {
    const parts: string[] = [];
    if (other.format !== cpm.format) {
        parts.push(other.format.skew !== cpm.format.skew ? `skew ${other.format.skew}` : `the ${other.format.name} format`);
    }
    if (other.allocationSides !== cpm.allocationSides) {
        parts.push(other.allocationSides === 1 ? "one side" : "two sides");
    }
    if (other.reservedTrackCount !== cpm.reservedTrackCount) {
        parts.push(`${other.reservedTrackCount} reserved tracks`);
    }
    if (other.cylinderCount !== cpm.cylinderCount) {
        parts.push(`${other.cylinderCount} cylinders`);
    }
    return parts.length === 0 ? "a different layout" : parts.join(" and ");
}

/**
 * A sentence suggesting --cpm-format with the presets that the disk's image can hold, starting with a space, or
 * an empty string if it can hold none.
 */
function suggestCpmFormats(cpm: Cpm): string {
    const ids = findCpmLayoutsForGeometry(cpm.geometry).map(layout => layout.id);
    return ids.length === 0 ? "" :
        ` If you know the disk's format, name it with --cpm-format (this image fits ${ids.join(", ")}).`;
}

/**
 * What a caller of evaluateCpmWriteGate() can tell it.
 */
export interface CpmWriteGateOptions {
    /**
     * Whether the layout was settled earlier (a session remembers the layout of a disk it has changed, undone, or
     * redone, and the user may have forced past a doubt then), so that other readings that tie aren't a
     * LAYOUT_DOUBT. False or missing for a layout that was just detected.
     */
    layoutSettled?: boolean | undefined;
}

/**
 * Decide whether we'll write to a CP/M disk, and what blocks us otherwise. Ranks the layouts of
 * the disk itself (to look for doubts), reads the directory, and changes nothing.
 *
 * @param cpm the decoded file system, on a floppy or an overlay over one. Decode it with whole records.
 * @param options what the caller knows that the disk doesn't say.
 */
export function evaluateCpmWriteGate(cpm: Cpm, options: CpmWriteGateOptions = {}): CpmWriteGate {
    const blockers: CpmWriteBlocker[] = [];

    const verified = findCpmVerifiedLayout(cpm);
    const unsupported = verified === undefined;
    if (unsupported) {
        blockers.push({
            kind: CpmWriteBlockerKind.UNSUPPORTED_LAYOUT,
            message: `Writing ${cpm.nameAndVersion} disks with this layout (${cpm.summary()}) isn't supported yet. ` +
                `Only the layouts that --cpm-format lists can be written, since only their disk parameter blocks have been checked on the real systems.` +
                suggestCpmFormats(cpm),
            forceable: false,
        });
    }

    if (cpm.hasCpm3Entries()) {
        blockers.push({
            kind: CpmWriteBlockerKind.CPM3_ENTRIES,
            message: "The directory has CP/M 3 entries (passwords, a label, or date stamps), which can't be written yet.",
            forceable: false,
        });
    }

    if (!cpm.dirSectorsReadable()) {
        blockers.push({
            kind: CpmWriteBlockerKind.DIRECTORY_UNREADABLE,
            message: "A sector of the directory is missing or has a CRC error, so the directory can't be rewritten safely.",
            forceable: false,
        });
    }

    if (cpm.disk instanceof FloppyDisk) {
        const protectionMessage = writeProtectionMessage(cpm.disk);
        if (protectionMessage !== undefined) {
            blockers.push({kind: CpmWriteBlockerKind.WRITE_PROTECTED, message: protectionMessage, forceable: true});
        }
    }

    // Other readings matter only for a layout that we can write, and not when the caller says the layout is settled.
    if (!unsupported && options.layoutSettled !== true) {
        // A blank directory scores the same under every layout, so ranking can't find the doubts. Ask which blank
        // readings the disk's other evidence leaves.
        const blank = cpm.isDirectoryBlank();
        const doubts = blank ?
            findBlankCpmCandidates(cpm.disk, cpm.geometry, true).filter(other => !other.sameLayout(cpm)) :
            findCpmLayoutDoubts(cpm, rankCpmCandidates(cpm.disk, cpm.geometry, true));
        if (doubts.length > 0) {
            const differences = Array.from(new Set(doubts.map(other => describeDifference(cpm, other))));
            const readings = differences.map(difference => {
                const presetIds = doubts
                    .filter(other => describeDifference(cpm, other) === difference)
                    .map(other => findCpmVerifiedLayout(other)?.id)
                    .filter(id => id !== undefined);
                return presetIds.length === 0 ? difference : `${difference} (${presetIds.join(" or ")})`;
            });
            const chosenId = verified.id;
            blockers.push({
                kind: CpmWriteBlockerKind.LAYOUT_DOUBT,
                message: `The disk reads equally well with ${readings.join(", or with ")}, and nothing on it tells ` +
                    `the readings apart. Writing with the wrong one would put data where CP/M won't look. ` +
                    `The reading in use is ${chosenId}; --cpm-format settles it.`,
                forceable: true,
            });
        }
    }

    const {badEntryCount, duplicateBlockCount} = cpm.evaluation;
    if (badEntryCount > 0 || duplicateBlockCount > 0) {
        const problems: string[] = [];
        if (badEntryCount > 0) {
            problems.push(badEntryCount === 1 ? "1 bad directory entry" : `${badEntryCount} bad directory entries`);
        }
        if (duplicateBlockCount > 0) {
            problems.push(duplicateBlockCount === 1 ? "1 block claimed twice" : `${duplicateBlockCount} blocks claimed twice`);
        }
        blockers.push({
            kind: CpmWriteBlockerKind.DAMAGE,
            message: `The directory is damaged (${problems.join(" and ")}). Writing to it won't make that worse, ` +
                `because free space is computed conservatively, but the damage stays.`,
            forceable: true,
        });
    }

    let access = TrsdosWriteAccess.WRITABLE;
    for (const blocker of blockers) {
        const kindAccess = cpmWriteBlockerKindAccess(blocker.kind);
        // The enum is declared from least to most restrictive.
        if (kindAccess > access) {
            access = kindAccess;
        }
    }

    return {access, blockers};
}
