import * as fs from "fs";
import * as crypto from "crypto";
import {
    Cpm,
    CpmFile,
    decodeCpm,
    decodeTrs80File,
    decodeTrsdos,
    Density,
    FloppyDirEntry,
    FloppyDisk,
    FloppyFileSystem,
    isFloppy,
    TrackGeometry,
    Trsdos,
    TrsdosDirEntry,
    trsdosProtectionLevelToString,
} from "trs80-base";
import {LogLevel, TRS80_MAIN_SINK} from "trs80-logger";
import {version} from "./version.js";
import {BUILD_DATE, BUILD_GIT_HASH} from "./build.js";

// Bump when the structure of the report changes in a way that consumers must know about.
// The trs80-floppy-regress repo keeps a copy of the types below; update it too.
export const REPORT_VERSION = 5;

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
    // Cylinder 0 side 0, which is often formatted differently than the rest of the disk.
    bootTrack: TrackGeometryReport;
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
 * The operating system we decided the floppy has, and the parameters of its file system.
 */
export interface OsReport {
    // Name and version, e.g., "LDOS 5.3".
    name: string;
    // TRSDOS family only.
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
}

/**
 * One file on a floppy. The fields after "isHidden" are missing if an exception
 * occurred while reading the file.
 */
export interface FileReport {
    filename: string;
    size: number;
    // Empty if the operating system doesn't record dates.
    date: string;
    // Empty on CP/M, which has attributes (in "flags") instead.
    protection: string;
    flags: string;
    isSystem: boolean;
    isHidden: boolean;
    // CP/M only.
    user?: number;
    dirEntryCount?: number;
    // TRSDOS family only: track, granule offset, and granule count of each extent.
    extents?: [number, number, number][];
    // CP/M only: allocation blocks.
    blocks?: number[];
    sectorCount?: number;
    missingSectors?: number;
    crcErrorSectors?: number;
    readSize?: number;
    sha256?: string;
    // Class name of the decoded contents, such as "CmdProgram".
    type?: string;
    description?: string;
    decodeError?: string;
    exception?: string;
}

/**
 * Everything we could decode from one input file.
 */
export interface DiskReport {
    filename: string;
    size?: number;
    sha256?: string;
    // Class name of the decoded file, such as "DmkFloppyDisk".
    type?: string;
    description?: string;
    decodeError?: string;
    // The rest are for floppies only.
    geometry?: GeometryReport;
    // First three bytes of the boot sector, or null if it can't be read.
    bootSectorPrefix?: number[] | null;
    // Null if no operating system was recognized.
    os?: OsReport | null;
    files?: FileReport[];
    exception?: string;
    // Warnings logged while decoding.
    warnings: string[];
}

/**
 * The full output of "info --json".
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

    // Check the health of the sectors.
    const sectorPositions = fileSystem.getFileSectorPositions(dirEntry);
    let missingSectors = 0;
    let crcErrorSectors = 0;
    for (const sectorPosition of sectorPositions) {
        const sector = fileSystem.disk.readSector(sectorPosition);
        if (sector === undefined) {
            missingSectors += 1;
        } else if (sector.crcError) {
            crcErrorSectors += 1;
        }
    }
    report.sectorCount = sectorPositions.length;
    report.missingSectors = missingSectors;
    report.crcErrorSectors = crcErrorSectors;

    // Read and decode the contents.
    const binary = fileSystem.readFile(dirEntry);
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
 * Report on the file system of the floppy.
 */
function reportFloppy(disk: FloppyDisk, report: Omit<DiskReport, "warnings">): void {
    const geometry = disk.getGeometry();
    report.geometry = {
        cylinderCount: geometry.cylinderCount,
        sideCount: geometry.sideCount,
        bootTrack: reportTrackGeometry(geometry.bootTrack),
        dataTrack: {
            sectorSpan: geometry.modalDataSectorSpan,
            sectorSize: geometry.modalDataSectorSize,
            density: densityName(geometry.modalDataDensity),
        },
    };

    // Boot sector, whose third byte is the directory track on most DOSes.
    const bootSector = disk.readSector(geometry.bootTrack.firstSectorPosition());
    report.bootSectorPrefix = bootSector === undefined
        ? null
        : Array.from(bootSector.data.subarray(0, 3));

    const trsdos = decodeTrsdos(disk);
    if (trsdos !== undefined) {
        reportTrsdos(trsdos, report);
        return;
    }

    // In the order of decodeFloppyFileSystem().
    const cpm = decodeCpm(disk);
    if (cpm !== undefined) {
        reportCpm(cpm, report);
        return;
    }

    report.os = null;
}

/**
 * Report on a TRSDOS-family file system.
 */
function reportTrsdos(trsdos: Trsdos, report: Omit<DiskReport, "warnings">): void {
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
 * Generate a JSON-friendly report of everything we can decode from the file.
 * Never throws; exceptions are recorded in the report.
 */
function reportFile(filename: string): DiskReport {
    const report: Omit<DiskReport, "warnings"> = { filename };

    // Capture warnings into the report, and send everything else to stderr so
    // that stdout stays valid JSON.
    const warnings: string[] = [];
    const savedSinks = TRS80_MAIN_SINK.delegatedSinks.splice(0);
    TRS80_MAIN_SINK.delegatedSinks.push((level, message) => {
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
        }
    } catch (e) {
        report.exception = exceptionToString(e);
    } finally {
        TRS80_MAIN_SINK.delegatedSinks.splice(0, Infinity, ...savedSinks);
    }

    return { ...report, warnings };
}

/**
 * Handle the "info --json" command. Writes a JSON object to stdout.
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
