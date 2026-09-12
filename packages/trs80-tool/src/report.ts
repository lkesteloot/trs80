import * as fs from "fs";
import * as crypto from "crypto";
import {
    decodeTrs80File,
    decodeTrsdosWithRejections,
    Density,
    FloppyDisk,
    isFloppy,
    Side,
    TrackGeometry,
    Trsdos,
    Trsdos14GatInfo,
    TrsdosDirEntry,
    trsdosProtectionLevelToString,
    trsdosVersionToString,
} from "trs80-base";
import {LogLevel, TRS80_MAIN_SINK} from "trs80-logger";
import {version} from "./version.js";
import {BUILD_DATE, BUILD_GIT_HASH} from "./build.js";

// Bump when the structure of the report changes in a way that consumers must know about.
// The trs80-floppy-regress repo keeps a copy of the types below; update it too.
export const REPORT_VERSION = 1;

export type DensityName = "single" | "double";

export interface TrackGeometryReport {
    trackNumber: number;
    firstSide: number;
    lastSide: number;
    firstSector: number;
    lastSector: number;
    sectorSize: number;
    density: DensityName;
}

export interface GeometryReport {
    trackCount: number;
    sideCount: number;
    homogeneous: boolean;
    firstTrack: TrackGeometryReport;
    lastTrack: TrackGeometryReport;
}

/**
 * Why a particular TRSDOS model was rejected.
 */
export interface RejectionReport {
    model: string;
    reason: string;
}

export interface GatReport {
    name: string;
    date: string;
    autoCommand: string;
    password: number;
    // Model I and 4 only:
    osVersion?: number;
    cylinderCount?: number;
    granulesPerTrack?: number;
    sideCount?: number;
    density?: DensityName;
}

/**
 * The operating system we decided the floppy has, and the parameters of its file system.
 */
export interface OsReport {
    name: string;
    version: string;
    model: string;
    dirTrack: number;
    sideCount: number;
    sectorsPerTrack: number;
    granulesPerTrack: number;
    sectorsPerGranule: number;
    dirEntryLength: number;
    dirEntriesPerSector: number;
    // Exactly one of these:
    gatError?: string;
    gat?: GatReport;
}

/**
 * One file on a floppy. The fields after "isHidden" are missing if an exception
 * occurred while reading the file.
 */
export interface FileReport {
    filename: string;
    size: number;
    date: string;
    protection: string;
    flags: string;
    isSystem: boolean;
    isHidden: boolean;
    dirEntryCount?: number;
    // Track, granule offset, and granule count of each extent.
    extents?: [number, number, number][];
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
    rejections?: RejectionReport[];
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
        trackNumber: trackGeometry.trackNumber,
        firstSide: trackGeometry.firstSide,
        lastSide: trackGeometry.lastSide,
        firstSector: trackGeometry.firstSector,
        lastSector: trackGeometry.lastSector,
        sectorSize: trackGeometry.sectorSize,
        density: densityName(trackGeometry.density),
    };
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
                extents.push([extent.trackNumber, extent.granuleOffset, extent.granuleCount]);
            }
        }
        report.dirEntryCount = extentEntryCount;
        report.extents = extents;

        // Check the health of the sectors.
        const sectorPositions = trsdos.getFileSectorPositions(dirEntry);
        let missingSectors = 0;
        let crcErrorSectors = 0;
        for (const {trackNumber, side, sectorNumber} of sectorPositions) {
            const sector = trsdos.disk.readSector(trackNumber, side, sectorNumber);
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
        const binary = trsdos.readFile(dirEntry);
        report.readSize = binary.length;
        report.sha256 = sha256(binary);
        const trs80File = decodeTrs80File(binary, { filename: dirEntry.getFilename(".") });
        report.type = trs80File.className;
        report.description = trs80File.getDescription();
        if (trs80File.error !== undefined) {
            report.decodeError = trs80File.error;
        }
    } catch (e) {
        report.exception = exceptionToString(e);
    }

    return report;
}

/**
 * Report on the TRSDOS-like file system of the floppy.
 */
function reportFloppy(disk: FloppyDisk, report: Omit<DiskReport, "warnings">): void {
    const geometry = disk.getGeometry();
    report.geometry = {
        trackCount: geometry.numTracks(),
        sideCount: geometry.numSides(),
        homogeneous: geometry.hasHomogenousGeometry(),
        firstTrack: reportTrackGeometry(geometry.firstTrack),
        lastTrack: reportTrackGeometry(geometry.lastTrack),
    };

    // Boot sector, whose third byte is the directory track on most DOSes.
    const bootSector = disk.readSector(geometry.firstTrack.trackNumber, Side.FRONT, geometry.firstTrack.firstSector);
    report.bootSectorPrefix = bootSector === undefined
        ? null
        : Array.from(bootSector.data.subarray(0, 3));

    const { trsdos, rejections } = decodeTrsdosWithRejections(disk);
    report.rejections = rejections.map(r => ({
        model: trsdosVersionToString(r.version),
        reason: r.reason,
    }));
    if (trsdos === undefined) {
        report.os = null;
        return;
    }

    const os: OsReport = {
        name: trsdos.getOperatingSystemName(),
        version: trsdos.getVersion(),
        model: trsdosVersionToString(trsdos.version),
        dirTrack: trsdos.dirTrackNumber,
        sideCount: trsdos.sideCount,
        sectorsPerTrack: trsdos.sectorsPerTrack,
        granulesPerTrack: trsdos.granulesPerTrack,
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
            ... gatInfo instanceof Trsdos14GatInfo ? {
                osVersion: gatInfo.osVersion,
                cylinderCount: gatInfo.cylinderCount,
                granulesPerTrack: gatInfo.granulesPerTrack,
                sideCount: gatInfo.sideCount,
                density: densityName(gatInfo.density),
            } : {},
        };
    }

    report.files = trsdos.getDirEntries(true).map(dirEntry => reportTrsdosFile(trsdos, dirEntry));
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
