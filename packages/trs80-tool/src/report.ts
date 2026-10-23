import * as fs from "fs";
import * as crypto from "crypto";
import {
    Cpm,
    CpmFile,
    decodeCpm,
    decodeMicroDos,
    decodeModelIITrsdos,
    decodeTrs80File,
    decodeTrsdos,
    decodeTrsdosII,
    decodeUcsdPascal,
    decodeXenixTar,
    Density,
    FloppyDirEntry,
    FloppyDisk,
    findLdosPartitions,
    FloppyFileSystem,
    isFloppy,
    isHardDisk,
    MicroDos,
    MicroDosFile,
    microDosFileTypeToLetter,
    ModelIITrsdos,
    ModelIITrsdosDirEntry,
    modelIITrsdosLayoutToString,
    type Trs80HardDisk,
    TrackGeometry,
    Trsdos,
    TrsdosDirEntry,
    TrsdosII,
    TrsdosIIFile,
    trsdosIIProtectionLevelToString,
    trsdosProtectionLevelToString,
    UcsdPascal,
    UcsdPascalFile,
    ucsdPascalFileKindToString,
    XenixTar,
    XenixTarFile,
} from "trs80-base";
import {LogLevel, MAIN_SINK} from "z80-logger";
import {version} from "./version.js";
import {BUILD_DATE, BUILD_GIT_HASH} from "./build.js";
import {
    formatDate, modelIITrsdosFlagsString, trsdosIIFlagsString, xenixTarModeString, xenixTarTypeLetter,
} from "./utils.js";

// Bump when the structure of the report changes in a way that consumers must know about.
// The trs80-floppy-regress repo keeps a copy of the types below; update it too.
export const REPORT_VERSION = 7;

export type DensityName = "single" | "double";

/**
 * The geometry of one specific track.
 */
export interface TrackGeometryReport {
    firstSector: number;
    lastSector: number;
    sectorSize: number;
    density: DensityName;
}

/**
 * The most common values across the side 0 tracks other than the boot track. These are modal,
 * not exact: individual tracks can differ, especially on damaged or copy-protected disks.
 */
export interface DataTrackGeometryReport {
    sectorSpan: number;
    sectorSize: number;
    density: DensityName;
}

export interface GeometryReport {
    cylinderCount: number;
    sideCount: number;
    // Cylinder 0 side 0, which is often formatted differently than the rest of the disk. Null if
    // nothing on cylinder 0 side 0 could be read.
    bootTrack: TrackGeometryReport | null;
    dataTrack: DataTrackGeometryReport;
}

export interface GatReport {
    name: string;
    date: string;
    autoCommand: string;
    // Hash of the master password; 0x42E0 (17120) is "PASSWORD", the default.
    password: number;
}

/**
 * The parameters of a CP/M file system.
 */
export interface CpmReport {
    // Whose BIOS's layout, e.g., "Montezuma Micro".
    format: string;
    reservedTracks: number;
    sectorSize: number;
    skew: number;
    blockSize: number;
    // Including the directory's blocks.
    blockCount: number;
    dirEntryCount: number;
}

/**
 * The parameters of a UCSD Pascal volume.
 */
export interface UcsdPascalReport {
    // Whose port's layout, e.g., "FMG".
    format: string;
    // Cylinder where the volume starts; the cylinders before it are the boot track.
    firstTrack: number;
    // Distance between consecutive logical sectors on a track.
    interleave: number;
    // How far each track's sector order is rotated from the previous track's.
    trackSkew: number;
    // Number of 512-byte blocks in the volume, from the volume header.
    blockCount: number;
}

/**
 * The operating system we decided the floppy has, and the parameters of its file system.
 */
export interface OsReport {
    // Name and version, e.g., "LDOS 5.3".
    name: string;
    // TRSDOS family only, and Model II TRSDOS (the directory's cylinder).
    dirTrack?: number;
    // Sides the file system uses.
    sideCount: number;
    sectorsPerTrack: number;
    // TRSDOS family only.
    granulesPerTrack?: number;
    sectorsPerGranule?: number;
    dirEntryLength?: number;
    dirEntriesPerSector?: number;
    // TRSDOS family only, exactly one of these:
    gatError?: string;
    gat?: GatReport;
    // CP/M only.
    cpm?: CpmReport;
    // UCSD Pascal only.
    ucsdPascal?: UcsdPascalReport;
    // Model II TRSDOS and TRSDOS-II: the name from when the disk was formatted. UCSD Pascal:
    // the volume name. Missing if the disk has none that we could read.
    diskName?: string;
    // Model II TRSDOS only: how the directory cylinder is arranged, "1.x" or "2.0".
    layout?: string;
    // Model II TRSDOS only: directory slots marked in use that we couldn't use, so their files are lost.
    rejectedEntryCount?: number;
    // TRSDOS-II only: number of granules on the disk.
    granuleCount?: number;
    // TRSDOS-II only: names of the subdirectories, such as "SYSTEM/DIR".
    subdirectories?: string[];
    // Xenix tar only: archive members that aren't listed as files (directories, symbolic links, devices).
    skippedMemberCount?: number;
}

/**
 * One file on a floppy. The fields after "isHidden" are missing if an exception
 * occurred while reading the file.
 */
export interface FileReport {
    filename: string;
    size: number;
    // Empty if the operating system doesn't record dates. Model II TRSDOS, TRSDOS-II, UCSD
    // Pascal, and Xenix tar use "DD/MM/YYYY", like TRSDOS, plus " HH:MM" if the system records
    // the time (Xenix tar times are UTC).
    date: string;
    // Empty on CP/M, which has attributes (in "flags") instead, on MicroDOS, which has the type
    // letter in "flags", and on UCSD Pascal, which has the kind in "flags". Model II TRSDOS has
    // the level, 0 to 7, as a digit. TRSDOS-II has the ATTRIB name of the level. Xenix tar has the
    // permission bits in octal, such as "0755".
    protection: string;
    // Model II TRSDOS: "S" (system) and "P" (program), with "-" for the ones not set. TRSDOS-II:
    // "P" or "D" (program or data), "F" or "V" (fixed or variable records), then "S" (system flag)
    // or "-". UCSD Pascal: the kind, such as "Code" or "Text". Xenix tar: the type flag
    // character of the archive member, "0" for a regular file.
    flags: string;
    isSystem: boolean;
    isHidden: boolean;
    // CP/M only.
    user?: number;
    dirEntryCount?: number;
    // TRSDOS family only: track, granule offset, and granule count of each extent. Model II TRSDOS
    // also has them, as cylinder, granule within the cylinder, and granule count.
    extents?: [number, number, number][];
    // CP/M only: allocation blocks.
    blocks?: number[];
    // MicroDOS only: first and last absolute sector, inclusive.
    sectors?: [number, number];
    // MicroDOS only.
    remark?: string;
    // UCSD Pascal only: the file's first block and the block after its last.
    blockRange?: [number, number];
    // TRSDOS-II only: first granule and granule count of each run of the file's block table.
    granuleRuns?: [number, number][];
    // Model II TRSDOS and TRSDOS-II only: logical record length.
    lrl?: number;
    // TRSDOS-II only: the subdirectory file that the entry is in, such as "SYSTEM/DIR".
    subdirectory?: string;
    // TRSDOS-II only: what's wrong with the block tables, if neither could be read.
    blockTableError?: string;
    // Xenix tar only: the owner's user and group IDs.
    uid?: number;
    gid?: number;
    // Xenix tar only: the target of a hard link.
    linkName?: string;
    sectorCount?: number;
    missingSectors?: number;
    crcErrorSectors?: number;
    // Problems with the file's directory entries, if any.
    directoryErrors?: string[];
    readSize?: number;
    sha256?: string;
    // Class name of the decoded contents, such as "CmdProgram".
    type?: string;
    description?: string;
    decodeError?: string;
    exception?: string;
}

/**
 * The physical layout of a hard disk.
 */
export interface HardDiskReport {
    cylinderCount: number;
    headCount: number;
    // The version byte of the HDV header.
    headerVersion: number;
}

/**
 * The fields that describe a file system and its files: those of a floppy's report, and of each
 * partition of a hard disk's.
 */
export interface FileSystemReport {
    // Null if no operating system was recognized.
    os?: OsReport | null;
    files?: FileReport[];
}

/**
 * One partition of a hard disk, which holds a file system of its own. The cylinders and heads
 * are physical ones on the disk, counted from 0.
 */
export interface PartitionReport extends FileSystemReport {
    cylinderOffset: number;
    headOffset: number;
    cylinderCount: number;
    headCount: number;
    // Null if no operating system was recognized.
    os: OsReport | null;
}

/**
 * Everything we could decode from one input file.
 */
export interface DiskReport extends FileSystemReport {
    filename: string;
    size?: number;
    sha256?: string;
    // Class name of the decoded file, such as "DmkFloppyDisk".
    type?: string;
    description?: string;
    decodeError?: string;
    // For floppies only.
    geometry?: GeometryReport;
    // First three bytes of the boot sector, or null if it can't be read.
    bootSectorPrefix?: number[] | null;
    // For hard disks only. The top-level "os" and "files" are missing for them; each partition has its own.
    hardDisk?: HardDiskReport;
    partitions?: PartitionReport[];
    exception?: string;
    // Warnings logged while decoding.
    warnings: string[];
}

/**
 * The full output of "info --report".
 */
export interface ReportOutput {
    reportVersion: number;
    tool: {
        version: string;
        gitHash: string;
        buildDate: number;
    };
    reports: DiskReport[];
}

/**
 * Hex SHA-256 of the binary.
 */
function sha256(binary: Uint8Array): string {
    return crypto.createHash("sha256").update(binary).digest("hex");
}

/**
 * Convert an exception to a string for the report.
 */
function exceptionToString(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

function densityName(density: Density): DensityName {
    return density === Density.SINGLE ? "single" : "double";
}

/**
 * JSON-friendly version of the track geometry.
 */
function reportTrackGeometry(trackGeometry: TrackGeometry): TrackGeometryReport {
    return {
        firstSector: trackGeometry.firstSectorNumber,
        lastSector: trackGeometry.lastSectorNumber,
        sectorSize: trackGeometry.modalSectorSize,
        density: densityName(trackGeometry.modalDensity),
    };
}

/**
 * Fill in the parts of a file's report that don't depend on the operating system: the
 * health of its sectors and what its contents decode as.
 */
function reportFileContents<T extends FloppyDirEntry>(fileSystem: FloppyFileSystem<T>, dirEntry: T,
                                                      report: FileReport): void {

    // Read the contents, noting the health of the sectors.
    const sectorPositions = fileSystem.getFileSectorPositions(dirEntry);
    const {binary, damage} = fileSystem.readFileWithDamage(dirEntry);
    report.sectorCount = sectorPositions.length;
    report.missingSectors = damage.missingSectors.length;
    report.crcErrorSectors = damage.crcErrorSectors.length;
    if (damage.directoryErrors.length > 0) {
        report.directoryErrors = damage.directoryErrors;
    }

    // Decode the contents.
    report.readSize = binary.length;
    report.sha256 = sha256(binary);
    const trs80File = decodeTrs80File(binary, { filename: dirEntry.getFilename(".") });
    report.type = trs80File.className;
    report.description = trs80File.getDescription();
    if (trs80File.error !== undefined) {
        report.decodeError = trs80File.error;
    }
}

/**
 * Report on one file within a TRSDOS floppy.
 */
function reportTrsdosFile(trsdos: Trsdos, dirEntry: TrsdosDirEntry): FileReport {
    const report: FileReport = {
        filename: dirEntry.getFilename("/"),
        size: dirEntry.getSize(),
        date: dirEntry.getFullDateString().trim(),
        protection: trsdosProtectionLevelToString(dirEntry.getProtectionLevel(), trsdos.version),
        flags: dirEntry.getFlagsString(),
        isSystem: dirEntry.isSystemFile(),
        isHidden: dirEntry.isHidden(),
    };

    try {
        // Follow the chain of directory entries to collect all extents.
        const extents: [number, number, number][] = [];
        let extentEntryCount = 0;
        for (let d: TrsdosDirEntry | undefined = dirEntry; d !== undefined; d = d.nextDirEntry) {
            extentEntryCount += 1;
            for (const extent of d.extents) {
                extents.push([extent.cylinderNumber, extent.granuleOffset, extent.granuleCount]);
            }
        }
        report.dirEntryCount = extentEntryCount;
        report.extents = extents;

        reportFileContents(trsdos, dirEntry, report);
    } catch (e) {
        report.exception = exceptionToString(e);
    }

    return report;
}

/**
 * Report on one file within a CP/M floppy.
 */
function reportCpmFile(cpm: Cpm, file: CpmFile): FileReport {
    const report: FileReport = {
        filename: file.getFilename("."),
        size: file.getSize(),
        date: "",
        protection: "",
        flags: file.getAttributesString(),
        isSystem: file.isSystemFile(),
        isHidden: file.isHidden(),
        user: file.user,
    };

    try {
        report.dirEntryCount = file.extents.length;
        report.blocks = file.getBlocks();

        reportFileContents(cpm, file, report);
    } catch (e) {
        report.exception = exceptionToString(e);
    }

    return report;
}

/**
 * Report on one file within a Percom MicroDOS floppy.
 */
function reportMicroDosFile(microDos: MicroDos, file: MicroDosFile): FileReport {
    const report: FileReport = {
        filename: file.getFilename("."),
        size: file.getSize(),
        date: "",
        protection: "",
        flags: microDosFileTypeToLetter(file.type),
        isSystem: file.isSystemFile(),
        isHidden: file.isHidden(),
        sectors: [file.firstSector, file.lastSector],
        remark: file.remark,
    };

    try {
        reportFileContents(microDos, file, report);
    } catch (e) {
        report.exception = exceptionToString(e);
    }

    return report;
}

/**
 * Report on one file within a UCSD Pascal floppy.
 */
function reportUcsdPascalFile(ucsdPascal: UcsdPascal, file: UcsdPascalFile): FileReport {
    const date = file.getDate();
    const report: FileReport = {
        filename: file.getFilename("."),
        size: file.getSize(),
        date: date === undefined ? "" : formatDate(date, false, false),
        protection: "",
        flags: ucsdPascalFileKindToString(file.kind),
        isSystem: file.isSystemFile(),
        isHidden: file.isHidden(),
        blockRange: [file.firstBlock, file.nextBlock],
    };

    try {
        reportFileContents(ucsdPascal, file, report);
    } catch (e) {
        report.exception = exceptionToString(e);
    }

    return report;
}

/**
 * Report on one file within a Model II TRSDOS floppy.
 */
function reportModelIITrsdosFile(modelIITrsdos: ModelIITrsdos, dirEntry: ModelIITrsdosDirEntry): FileReport {
    const date = dirEntry.getDate();
    const report: FileReport = {
        filename: dirEntry.getFilename("."),
        size: dirEntry.getSize(),
        date: date === undefined ? "" : formatDate(date, false, false),
        protection: dirEntry.protectionLevel.toString(),
        flags: modelIITrsdosFlagsString(dirEntry),
        isSystem: dirEntry.isSystemFile(),
        isHidden: dirEntry.isHidden(),
        extents: dirEntry.extents.map(extent => [extent.cylinder, extent.granule, extent.granuleCount]),
        lrl: dirEntry.lrl,
    };

    try {
        reportFileContents(modelIITrsdos, dirEntry, report);
    } catch (e) {
        report.exception = exceptionToString(e);
    }

    return report;
}

/**
 * Report on one file within a TRSDOS-II floppy.
 */
function reportTrsdosIIFile(trsdosII: TrsdosII, file: TrsdosIIFile): FileReport {
    const date = file.getDate();
    const report: FileReport = {
        filename: file.getFilename("."),
        size: file.getSize(),
        date: date === undefined ? "" : formatDate(date, false, true),
        protection: trsdosIIProtectionLevelToString(file.getProtectionLevel()),
        flags: trsdosIIFlagsString(file),
        isSystem: file.isSystemFile(),
        isHidden: file.isHidden(),
        granuleRuns: file.extents.map(extent => [extent.startGranule, extent.count]),
        lrl: file.lrl,
        subdirectory: file.subdirectory,
    };
    if (file.blockTableError !== undefined) {
        report.blockTableError = file.blockTableError;
    }

    try {
        reportFileContents(trsdosII, file, report);
    } catch (e) {
        report.exception = exceptionToString(e);
    }

    return report;
}

/**
 * Report on one member of a Xenix tar floppy.
 */
function reportXenixTarFile(xenixTar: XenixTar, file: XenixTarFile): FileReport {
    const date = file.getDate();
    const report: FileReport = {
        filename: file.getFilename("."),
        size: file.getSize(),
        // Unix times are real points in time, so report them in UTC.
        date: date === undefined ? "" : formatDate(date, true, true),
        protection: xenixTarModeString(file),
        flags: xenixTarTypeLetter(file),
        isSystem: file.isSystemFile(),
        isHidden: file.isHidden(),
        uid: file.uid,
        gid: file.gid,
    };
    if (file.linkName !== "") {
        report.linkName = file.linkName;
    }

    try {
        reportFileContents(xenixTar, file, report);
    } catch (e) {
        report.exception = exceptionToString(e);
    }

    return report;
}

/**
 * Report on the file system of the floppy.
 */
function reportFloppy(disk: FloppyDisk, report: Omit<DiskReport, "warnings">): void {
    const geometry = disk.getGeometry();
    report.geometry = {
        cylinderCount: geometry.cylinderCount,
        sideCount: geometry.sideCount,
        bootTrack: geometry.bootTrack === undefined ? null : reportTrackGeometry(geometry.bootTrack),
        dataTrack: {
            sectorSpan: geometry.modalDataSectorSpan,
            sectorSize: geometry.modalDataSectorSize,
            density: densityName(geometry.modalDataDensity),
        },
    };

    // Boot sector, whose third byte is the directory track on most DOSes. Null if there's no boot track.
    const bootSector = geometry.bootTrack === undefined
        ? undefined
        : disk.readSector(geometry.bootTrack.firstSectorPosition());
    report.bootSectorPrefix = bootSector === undefined
        ? null
        : Array.from(bootSector.data.subarray(0, 3));

    // In the order of decodeFloppyFileSystem().
    const trsdosII = decodeTrsdosII(disk);
    if (trsdosII !== undefined) {
        reportTrsdosII(trsdosII, report);
        return;
    }

    const modelIITrsdos = decodeModelIITrsdos(disk);
    if (modelIITrsdos !== undefined) {
        reportModelIITrsdos(modelIITrsdos, report);
        return;
    }

    const trsdos = decodeTrsdos(disk);
    if (trsdos !== undefined) {
        reportTrsdos(trsdos, report);
        return;
    }

    const cpm = decodeCpm(disk);
    if (cpm !== undefined) {
        reportCpm(cpm, report);
        return;
    }

    const xenixTar = decodeXenixTar(disk);
    if (xenixTar !== undefined) {
        reportXenixTar(xenixTar, report);
        return;
    }

    const microDos = decodeMicroDos(disk);
    if (microDos !== undefined) {
        reportMicroDos(microDos, report);
        return;
    }

    const ucsdPascal = decodeUcsdPascal(disk);
    if (ucsdPascal !== undefined) {
        reportUcsdPascal(ucsdPascal, report);
        return;
    }

    report.os = null;
}

/**
 * Report on a TRSDOS-family file system, on a floppy or in a partition of a hard disk.
 */
function reportTrsdos(trsdos: Trsdos, report: FileSystemReport): void {
    const os: OsReport = {
        name: trsdos.nameAndVersion,
        dirTrack: trsdos.dirLumpNumber,
        sideCount: trsdos.allocationSides,
        sectorsPerTrack: trsdos.geometry.modalDataSectorSpan,
        granulesPerTrack: trsdos.granulesPerLump,
        sectorsPerGranule: trsdos.sectorsPerGranule,
        dirEntryLength: trsdos.dirEntryLength,
        dirEntriesPerSector: trsdos.dirEntriesPerSector,
    };
    report.os = os;

    const gatInfo = trsdos.getGatInfo();
    if (typeof gatInfo === "string") {
        os.gatError = gatInfo;
    } else {
        os.gat = {
            name: gatInfo.name,
            date: gatInfo.date,
            autoCommand: gatInfo.autoCommand,
            password: gatInfo.password,
        };
    }

    report.files = trsdos.getDirEntries(true).map(dirEntry => reportTrsdosFile(trsdos, dirEntry));
}

/**
 * Report on a CP/M file system.
 */
function reportCpm(cpm: Cpm, report: Omit<DiskReport, "warnings">): void {
    report.os = {
        name: cpm.nameAndVersion,
        sideCount: cpm.allocationSides,
        sectorsPerTrack: cpm.sectorsPerTrack,
        cpm: {
            format: cpm.format.name,
            reservedTracks: cpm.reservedTrackCount,
            sectorSize: cpm.sectorSize,
            skew: cpm.format.skew,
            blockSize: cpm.format.blockSize,
            blockCount: cpm.blockCount,
            dirEntryCount: cpm.format.dirEntryCount,
        },
    };

    report.files = cpm.getDirEntries(true).map(file => reportCpmFile(cpm, file));
}

/**
 * Report on a Percom MicroDOS file system.
 */
function reportMicroDos(microDos: MicroDos, report: Omit<DiskReport, "warnings">): void {
    report.os = {
        name: microDos.nameAndVersion,
        sideCount: 1,
        sectorsPerTrack: 10,
    };

    report.files = microDos.getDirEntries(true).map(file => reportMicroDosFile(microDos, file));
}

/**
 * Report on a UCSD Pascal file system.
 */
function reportUcsdPascal(ucsdPascal: UcsdPascal, report: Omit<DiskReport, "warnings">): void {
    report.os = {
        name: ucsdPascal.nameAndVersion,
        sideCount: 1,
        sectorsPerTrack: ucsdPascal.format.sectorsPerTrack,
        diskName: ucsdPascal.volumeName,
        ucsdPascal: {
            format: ucsdPascal.format.name,
            firstTrack: ucsdPascal.format.firstTrack,
            interleave: ucsdPascal.format.interleave,
            trackSkew: ucsdPascal.format.trackSkew,
            blockCount: ucsdPascal.blockCount,
        },
    };

    report.files = ucsdPascal.getDirEntries(true).map(file => reportUcsdPascalFile(ucsdPascal, file));
}

/**
 * Report on a Model II TRSDOS file system.
 */
function reportModelIITrsdos(modelIITrsdos: ModelIITrsdos, report: Omit<DiskReport, "warnings">): void {
    const geometry = modelIITrsdos.disk.getGeometry();
    const os: OsReport = {
        name: modelIITrsdos.nameAndVersion,
        dirTrack: modelIITrsdos.dirCylinder,
        sideCount: geometry.sideCount,
        sectorsPerTrack: geometry.modalDataSectorSpan,
        layout: modelIITrsdosLayoutToString(modelIITrsdos.layout),
        rejectedEntryCount: modelIITrsdos.rejectedEntryCount,
    };
    if (modelIITrsdos.diskName !== undefined) {
        os.diskName = modelIITrsdos.diskName;
    }
    report.os = os;

    report.files = modelIITrsdos.getDirEntries(true).map(file => reportModelIITrsdosFile(modelIITrsdos, file));
}

/**
 * Report on a TRSDOS-II file system.
 */
function reportTrsdosII(trsdosII: TrsdosII, report: Omit<DiskReport, "warnings">): void {
    const geometry = trsdosII.disk.getGeometry();
    report.os = {
        name: trsdosII.nameAndVersion,
        sideCount: trsdosII.sideCount,
        sectorsPerTrack: geometry.modalDataSectorSpan,
        diskName: trsdosII.diskName,
        granuleCount: trsdosII.granuleCount,
        subdirectories: trsdosII.subdirectories,
    };

    report.files = trsdosII.getDirEntries(true).map(file => reportTrsdosIIFile(trsdosII, file));
}

/**
 * Report on a Xenix tar file system.
 */
function reportXenixTar(xenixTar: XenixTar, report: Omit<DiskReport, "warnings">): void {
    const geometry = xenixTar.disk.getGeometry();
    report.os = {
        name: xenixTar.nameAndVersion,
        sideCount: geometry.sideCount,
        sectorsPerTrack: geometry.modalDataSectorSpan,
        skippedMemberCount: xenixTar.skippedMemberCount,
    };

    report.files = xenixTar.getDirEntries(true).map(file => reportXenixTarFile(xenixTar, file));
}

/**
 * Report on a hard disk: its geometry, and the file system of each LDOS or LS-DOS partition.
 */
function reportHardDisk(disk: Trs80HardDisk, report: Omit<DiskReport, "warnings">): void {
    const geometry = disk.getGeometry();
    report.hardDisk = {
        cylinderCount: geometry.cylinderCount,
        headCount: geometry.headCount,
        headerVersion: disk.headerVersion,
    };

    report.partitions = findLdosPartitions(disk).map(({partition, trsdos}) => {
        const partitionReport: PartitionReport = {
            cylinderOffset: partition.cylinderOffset,
            headOffset: partition.headOffset,
            cylinderCount: partition.cylinderCount,
            headCount: partition.headCount,
            os: null,
        };
        reportTrsdos(trsdos, partitionReport);
        return partitionReport;
    });
}

/**
 * Generate a JSON-friendly report of everything we can decode from the file.
 * Never throws; exceptions are recorded in the report.
 */
function reportFile(filename: string): DiskReport {
    const report: Omit<DiskReport, "warnings"> = { filename };

    // Capture warnings into the report, and send everything else to stderr so
    // that stdout stays valid JSON.
    const warnings: string[] = [];
    const savedSinks = MAIN_SINK.delegatedSinks.splice(0);
    MAIN_SINK.delegatedSinks.push((level, message) => {
        if (level === LogLevel.WARN) {
            warnings.push(message);
        } else {
            console.error(message);
        }
    });

    try {
        const binary = fs.readFileSync(filename);
        report.size = binary.length;
        report.sha256 = sha256(binary);

        const trs80File = decodeTrs80File(binary, { filename });
        report.type = trs80File.className;
        report.description = trs80File.getDescription();
        if (trs80File.error !== undefined) {
            report.decodeError = trs80File.error;
        }

        if (isFloppy(trs80File)) {
            reportFloppy(trs80File, report);
        } else if (isHardDisk(trs80File)) {
            reportHardDisk(trs80File, report);
        }
    } catch (e) {
        report.exception = exceptionToString(e);
    } finally {
        MAIN_SINK.delegatedSinks.splice(0, Infinity, ...savedSinks);
    }

    return { ...report, warnings };
}

/**
 * Handle the "info --report" command. Writes a JSON object to stdout.
 */
export function infoJson(infiles: string[]): void {
    const output: ReportOutput = {
        reportVersion: REPORT_VERSION,
        tool: {
            version,
            gitHash: BUILD_GIT_HASH,
            buildDate: BUILD_DATE,
        },
        reports: infiles.map(reportFile),
    };

    console.log(JSON.stringify(output, undefined, 2));
}
