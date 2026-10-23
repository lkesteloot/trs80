import * as fs from "fs";
import * as path from "path";
import {exceptionToString, pluralizeWithCount} from "./utils.js";
import {infoJson} from "./report.js";
import {pagerYield} from "./pager.js";
import {AudioFile, Decoder, readWavFile, Tape, WAV_INFO_TAGS} from "trs80-cassette";
import {
    Cpm, decodeFloppyFileSystem, decodeTrs80File, densityToString, findLdosPartitions, getFloppyDetails, isFloppy,
    isHardDisk, MicroDos,
    modelIITrsdosLayoutToString, ModelIITrsdos, type PdriveSettings, TrackGeometry, Trs80Floppy, Trs80HardDisk, Trsdos, TrsdosII,
    UcsdPascal, XenixTar} from "trs80-base";
import {assertNever} from "z80-base";
import {
    captureLogs, type ContentType, contentTypeOf, floppyFormatOf, type FloppyFormat, type InfileJson,
    printInfilesJson, sha256,
} from "./json.js";

/**
 * Return the metadata from the audio file as pairs of the tag's name (its nice name if we know it)
 * and its value.
 */
function getWavFileMetadataEntries(wavFile: AudioFile): [string, string][] {
    const entries: [string, string][] = [];

    for (const [key, value] of wavFile.metadata.entries()) {
        const niceKey = WAV_INFO_TAGS.get(key);
        entries.push([niceKey ?? key, value]);
    }

    return entries;
}

/**
 * Return a list of strings for the metata from the audio file.
 */
function getWavFileMetadata(wavFile: AudioFile): string[] {
    return getWavFileMetadataEntries(wavFile).map(([key, value]) => `${key}: ${value}`);
}

/**
 * Print one-line string description of the input file, and more if verbose.
 */
function printInfoForFile(filename: string, verbose: boolean): void {
    const {base, ext} = path.parse(filename);

    let description: string;
    const verboseLines: string[] = [];
    // One line for each partition of a hard disk, shown whether verbose or not.
    const partitionLines: string[] = [];
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        console.log(filename + ": Can't open file: " + e.message);
        return;
    }

    if (ext.toLowerCase() == ".wav") {
        // Parse a cassette WAV file.
        const wavFile = readWavFile(buffer);
        if (verbose) {
            verboseLines.push(...getWavFileMetadata(wavFile));
        }
        const tape = new Tape(base, wavFile);
        const decoder = new Decoder(tape);
        decoder.decode();
        description = "Audio file with " + pluralizeWithCount(tape.programs.length, "file");
    } else {
        try {
            const trs80File = decodeTrs80File(buffer, { filename });
            description = trs80File.getDescription();
            if (trs80File.error !== undefined) {
                description += " (" + trs80File.error + ")";
            } else {
                const GENERATE_BITCELLS_JS = false;
                if (GENERATE_BITCELLS_JS && trs80File.className === "ScpFloppyDisk") {
                    const bitcells = trs80File.tracks[1].revs[0].bitcells;
                    const parts: string[] = [];
                    parts.push("const bitcells = [\n");
                    for (const bitcell of bitcells) {
                        parts.push("    " + bitcell + ",\n");
                    }
                    parts.push("];\n");
                    fs.writeFileSync("bitcells/bitcells.js", parts.join(""));
                }

                if (isFloppy(trs80File)) {
                    const fileSystem = decodeFloppyFileSystem(trs80File);
                    if (fileSystem !== undefined) {
                        // Users don't care about system files.
                        description += ", " + fileSystem.nameAndVersion +
                            " with " + pluralizeWithCount(fileSystem.getDirEntries(false).length, "file");
                    }

                    if (verbose) {
                        for (const detail of getFloppyDetails(trs80File, fileSystem)) {
                            verboseLines.push(detail.label + ": " + detail.value);
                        }
                    }
                } else if (isHardDisk(trs80File)) {
                    // Users don't care about system files, but do care about each partition.
                    const ldosPartitions = findLdosPartitions(trs80File);
                    ldosPartitions.forEach(({partition, trsdos, diskName}, index) => {
                        const fileCount = pluralizeWithCount(trsdos.getDirEntries(false).length, "file");
                        partitionLines.push(`partition ${index + 1} (${partition.describeLocation()}): ` +
                            [diskName, trsdos.nameAndVersion, fileCount].filter(part => part !== "").join(", "));
                    });
                }
            }
        } catch (e: any) {
            if ("message" in e) {
                description = "Error (" + e.message + ")";
            } else {
                description = "Unknown error during decoding";
            }
        }
    }

    console.log(filename + ": " + description);
    for (const line of partitionLines) {
        console.log("    " + line);
    }
    for (const line of verboseLines) {
        console.log("    " + line);
    }
}

/**
 * The geometry of one track, for "info --json --verbose".
 */
interface TrackGeometryInfoJson {
    /** The lowest sector number on the track. */
    firstSector: number;
    /** The highest sector number on the track. */
    lastSector: number;
    /** "single" or "double": the most common density of the track's sectors. */
    density: string;
    /** The most common sector size in bytes. */
    sectorSize: number;
}

/**
 * The geometry of the floppy, for "info --json --verbose".
 */
interface GeometryInfoJson {
    /** Number of cylinders. */
    cylinderCount: number;
    /** Number of sides, 1 or 2. */
    sideCount: number;
    /** Cylinder 0, side 0, which is often formatted differently from the rest of the disk. Null if nothing on it could be read. */
    bootTrack: TrackGeometryInfoJson | null;
    /** The most common values across the side 0 tracks other than the boot track. Individual tracks can differ. */
    dataTrack: {
        /** Sectors from the first sector number to the last. */
        sectorSpan: number;
        /** "single" or "double". */
        density: string;
        /** Sector size in bytes. */
        sectorSize: number;
    };
    /** Whether every track has the same layout as the boot track. */
    homogeneous: boolean;
}

/**
 * Details of a TRSDOS (not Model II) file system, for "info --json --verbose".
 */
interface TrsdosInfoJson {
    /** The disk name from the allocation table. Missing if the table couldn't be read. */
    diskName?: string;
    /** The disk date from the allocation table, as the DOS wrote it. Missing if the table couldn't be read. */
    diskDate?: string;
    /** The command that runs at boot. Empty if none. Missing if the table couldn't be read. */
    autoCommand?: string;
    /** The hash of the master password; 17120 (0x42E0) is "PASSWORD", the default. Missing if the table couldn't be read. */
    gatPassword?: number;
    /** What's wrong with the allocation table, if it couldn't be read. */
    gatError?: string;
    /** Number of sides that the file system uses; less than the floppy's if it only uses side 0. */
    allocationSides: number;
    /** The number of the lump (see lumpTerm) that holds the directory. */
    dirLump: number;
    /** What the DOS calls a lump: "cylinder" or "track". */
    lumpTerm: string;
    /** Sectors per granule. */
    sectorsPerGranule: number;
    /** Granules per lump. */
    granulesPerLump: number;
    /** The NEWDOS/80 PDRIVE settings that read the disk, if its lumps aren't cylinders. */
    pdrive?: PdriveSettings;
}

/**
 * Details of a CP/M file system, for "info --json --verbose".
 */
interface CpmInfoJson {
    /** Whose BIOS's layout it is, such as "Montezuma Micro". */
    format: string;
    /** Number of sides that the file system uses; less than the floppy's if it only uses side 0. */
    allocationSides: number;
    /** Number of cylinders that the file system uses, which can differ from the image's. */
    cylinderCount: number;
    /** Number of cylinders reserved for the system. */
    reservedTrackCount: number;
    /** Sector size in bytes. */
    sectorSize: number;
    /** The sector skew. */
    skew: number;
    /** Allocation block size in bytes. */
    blockSize: number;
    /** Number of allocation blocks, including the directory's. */
    blockCount: number;
    /** Number of directory entries. */
    dirEntryCount: number;
}

/**
 * Details of a Percom MicroDOS file system, for "info --json --verbose".
 */
interface MicroDosInfoJson {
    /** The absolute number of the directory's first sector. */
    dirFirstSector: number;
    /** The absolute number of the directory's last sector. */
    dirLastSector: number;
}

/**
 * Details of a UCSD Pascal file system, for "info --json --verbose".
 */
interface UcsdPascalInfoJson {
    /** The volume name. */
    volumeName: string;
    /** Whose port's layout it is, such as "FMG". */
    format: string;
    /** Cylinder where the volume starts; the cylinders before it are the boot track. */
    firstTrack: number;
    /** Distance between consecutive logical sectors on a track. */
    interleave: number;
    /** How far each track's sector order is rotated from the previous track's. */
    trackSkew: number;
    /** Number of 512-byte blocks in the volume. */
    blockCount: number;
}

/**
 * Details of a Model II TRSDOS 1.x or 2.0 file system, for "info --json --verbose".
 */
interface ModelIITrsdosInfoJson {
    /** The name from when the disk was formatted. Missing if there's none we could read. */
    diskName?: string;
    /** How the directory cylinder is arranged: "1.x" or "2.0". */
    layout: string;
    /** The cylinder that holds the directory. */
    dirCylinder: number;
    /** Number of directory slots marked in use that we couldn't use, so their files are lost. */
    rejectedEntryCount: number;
}

/**
 * Details of a TRSDOS-II 4.x file system, for "info --json --verbose".
 */
interface TrsdosIIInfoJson {
    /** The name from when the disk was formatted. */
    diskName: string;
    /** The version of the DOS, such as "4.0", or an empty string if we don't know. */
    version: string;
    /** Number of sides that the file system uses. */
    sideCount: number;
    /** Number of granules on the disk. */
    granuleCount: number;
    /** The names of the subdirectories, such as "SYSTEM/DIR". */
    subdirectories: string[];
}

/**
 * Details of a Xenix tar file system, for "info --json --verbose".
 */
interface XenixTarInfoJson {
    /** Number of archive members that are listed as files. */
    memberCount: number;
    /** Number of archive members that aren't listed (directories, symbolic links, devices). */
    skippedMemberCount: number;
}

/**
 * The operating system of a floppy.
 */
interface OsInfoJson {
    /** Name and version, such as "LDOS 5.3". */
    name: string;
    /** Number of files, not counting the operating system's own. */
    fileCount: number;
    /** With "--verbose" and for this file system only: details. At most one of these is present. */
    trsdos?: TrsdosInfoJson;
    /** See trsdos. */
    cpm?: CpmInfoJson;
    /** See trsdos. */
    microDos?: MicroDosInfoJson;
    /** See trsdos. */
    ucsdPascal?: UcsdPascalInfoJson;
    /** See trsdos. */
    modelIITrsdos?: ModelIITrsdosInfoJson;
    /** See trsdos. */
    trsdosII?: TrsdosIIInfoJson;
    /** See trsdos. */
    xenixTar?: XenixTarInfoJson;
}

/**
 * What "info --json" says about a floppy.
 */
interface FloppyInfoJson {
    /** The format of the image file. */
    format: FloppyFormat;
    /** The operating system, or null if we didn't recognize one. */
    os: OsInfoJson | null;
    /** With "--verbose": the layout of the disk. */
    geometry?: GeometryInfoJson;
}

/**
 * One partition of a hard disk, for "info --json".
 */
interface PartitionInfoJson {
    /** The partition's number, from 1, in disk order. */
    number: number;
    /** The first physical cylinder of the partition. */
    cylinderOffset: number;
    /** The first physical head of the partition. */
    headOffset: number;
    /** The number of cylinders in the partition. */
    cylinderCount: number;
    /** The number of heads in the partition. */
    headCount: number;
    /** The partition's operating system. */
    os: OsInfoJson;
}

/**
 * What "info --json" says about a hard disk.
 */
interface HardDiskInfoJson {
    /** Number of cylinders. */
    cylinderCount: number;
    /** Number of heads. */
    headCount: number;
    /** The LDOS and LS-DOS partitions that we found, in disk order. Other kinds of partitions aren't listed. */
    partitions: PartitionInfoJson[];
}

/**
 * What "info --json" says about a CAS or WAV file.
 */
interface CassetteInfoJson {
    /** Number of files on the tape. */
    fileCount: number;
    /** WAV files with "--verbose": the tags in the file's metadata, by name. */
    metadata?: { [tag: string]: string };
}

/**
 * The JSON for one input file of "info --json".
 */
interface InfoJson extends InfileJson {
    /** Length in bytes of the input file. Missing if it couldn't be read. */
    size?: number;
    /** SHA-256 of the input file, in lowercase hexadecimal. Missing if it couldn't be read. */
    sha256?: string;
    /** What the input file decodes as ("audio" for WAV files). Missing if it couldn't be read or decoded. */
    contentType?: ContentType | "audio";
    /** A short description of the input file, such as "Basic program". Missing if it couldn't be read or decoded. */
    description?: string;
    /** Floppy images only. */
    floppy?: FloppyInfoJson;
    /** Hard disk images only. */
    hardDisk?: HardDiskInfoJson;
    /** CAS and WAV files only. */
    cassette?: CassetteInfoJson;
}

/**
 * Convert a track's geometry to JSON.
 */
function trackGeometryToJson(trackGeometry: TrackGeometry): TrackGeometryInfoJson {
    return {
        firstSector: trackGeometry.firstSectorNumber,
        lastSector: trackGeometry.lastSectorNumber,
        density: densityToString(trackGeometry.modalDensity),
        sectorSize: trackGeometry.modalSectorSize,
    };
}

/**
 * The details of a file system for "--verbose", in the field named after it. These are the
 * values that the text version shows (plus a few that it doesn't).
 *
 * @param fileSystem the file system.
 */
function fileSystemDetailsToJson(fileSystem: NonNullable<ReturnType<typeof decodeFloppyFileSystem>>):
    Pick<OsInfoJson, "trsdos" | "cpm" | "microDos" | "ucsdPascal" | "modelIITrsdos" | "trsdosII" | "xenixTar"> {

    if (fileSystem instanceof Trsdos) {
        const gatInfo = fileSystem.getGatInfo();
        const trsdos: TrsdosInfoJson = {
            allocationSides: fileSystem.allocationSides,
            dirLump: fileSystem.dirLumpNumber,
            lumpTerm: fileSystem.lumpTerm,
            sectorsPerGranule: fileSystem.sectorsPerGranule,
            granulesPerLump: fileSystem.granulesPerLump,
        };
        if (typeof gatInfo === "string") {
            trsdos.gatError = gatInfo;
        } else {
            trsdos.diskName = gatInfo.name;
            trsdos.diskDate = gatInfo.date;
            trsdos.autoCommand = gatInfo.autoCommand;
            trsdos.gatPassword = gatInfo.password;
        }
        const pdriveSettings = fileSystem.getPdriveSettings();
        if (pdriveSettings !== undefined) {
            trsdos.pdrive = pdriveSettings;
        }
        return { trsdos };
    } else if (fileSystem instanceof Cpm) {
        return {
            cpm: {
                format: fileSystem.format.name,
                allocationSides: fileSystem.allocationSides,
                cylinderCount: fileSystem.cylinderCount,
                reservedTrackCount: fileSystem.reservedTrackCount,
                sectorSize: fileSystem.sectorSize,
                skew: fileSystem.format.skew,
                blockSize: fileSystem.format.blockSize,
                blockCount: fileSystem.blockCount,
                dirEntryCount: fileSystem.format.dirEntryCount,
            },
        };
    } else if (fileSystem instanceof MicroDos) {
        return { microDos: { dirFirstSector: 20, dirLastSector: 29 } };
    } else if (fileSystem instanceof UcsdPascal) {
        return {
            ucsdPascal: {
                volumeName: fileSystem.volumeName,
                format: fileSystem.format.name,
                firstTrack: fileSystem.format.firstTrack,
                interleave: fileSystem.format.interleave,
                trackSkew: fileSystem.format.trackSkew,
                blockCount: fileSystem.blockCount,
            },
        };
    } else if (fileSystem instanceof ModelIITrsdos) {
        const modelIITrsdos: ModelIITrsdosInfoJson = {
            layout: modelIITrsdosLayoutToString(fileSystem.layout),
            dirCylinder: fileSystem.dirCylinder,
            rejectedEntryCount: fileSystem.rejectedEntryCount,
        };
        if (fileSystem.diskName !== undefined) {
            modelIITrsdos.diskName = fileSystem.diskName;
        }
        return { modelIITrsdos };
    } else if (fileSystem instanceof TrsdosII) {
        return {
            trsdosII: {
                diskName: fileSystem.diskName,
                version: fileSystem.nameAndVersion.replace(/^TRSDOS-II ?/, ""),
                sideCount: fileSystem.sideCount,
                granuleCount: fileSystem.granuleCount,
                subdirectories: fileSystem.subdirectories,
            },
        };
    } else if (fileSystem instanceof XenixTar) {
        return {
            xenixTar: {
                memberCount: fileSystem.files.length,
                skippedMemberCount: fileSystem.skippedMemberCount,
            },
        };
    } else {
        assertNever(fileSystem);
    }
}

/**
 * Convert what we know about a floppy to JSON.
 *
 * @param floppy the decoded floppy image.
 * @param verbose whether to include the layout of the disk and the details of the file system.
 */
function floppyToInfoJson(floppy: Trs80Floppy, verbose: boolean): FloppyInfoJson {
    const fileSystem = decodeFloppyFileSystem(floppy);
    const json: FloppyInfoJson = {
        format: floppyFormatOf(floppy),
        os: fileSystem === undefined ? null : {
            name: fileSystem.nameAndVersion,
            // Users don't care about system files.
            fileCount: fileSystem.getDirEntries(false).length,
        },
    };

    if (verbose) {
        const geometry = floppy.getGeometry();
        json.geometry = {
            cylinderCount: geometry.cylinderCount,
            sideCount: geometry.sideCount,
            bootTrack: geometry.bootTrack === undefined ? null : trackGeometryToJson(geometry.bootTrack),
            dataTrack: {
                sectorSpan: geometry.modalDataSectorSpan,
                density: densityToString(geometry.modalDataDensity),
                sectorSize: geometry.modalDataSectorSize,
            },
            homogeneous: geometry.homogeneous,
        };

        if (fileSystem !== undefined && json.os !== null) {
            Object.assign(json.os, fileSystemDetailsToJson(fileSystem));
        }
    }

    return json;
}

/**
 * Convert what we know about a hard disk to JSON.
 *
 * @param hardDisk the decoded hard disk image.
 * @param verbose whether to include the details of each partition's file system.
 */
function hardDiskToInfoJson(hardDisk: Trs80HardDisk, verbose: boolean): HardDiskInfoJson {
    const geometry = hardDisk.getGeometry();
    return {
        cylinderCount: geometry.cylinderCount,
        headCount: geometry.headCount,
        partitions: findLdosPartitions(hardDisk).map(({partition, trsdos}, index) => {
            const os: OsInfoJson = {
                name: trsdos.nameAndVersion,
                // Users don't care about system files.
                fileCount: trsdos.getDirEntries(false).length,
            };
            if (verbose) {
                Object.assign(os, fileSystemDetailsToJson(trsdos));
            }
            return {
                number: index + 1,
                cylinderOffset: partition.cylinderOffset,
                headOffset: partition.headOffset,
                cylinderCount: partition.cylinderCount,
                headCount: partition.headCount,
                os,
            };
        }),
    };
}

/**
 * Decode one input file and convert what we know about it to JSON. Never throws because of the contents
 * of the file; problems are in the "error" field.
 */
function infoFileToJson(filename: string, verbose: boolean): Omit<InfoJson, "warnings"> {
    const {base, ext} = path.parse(filename);

    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        return { infile: filename, error: "Can't open file: " + e.message };
    }

    const json: Omit<InfoJson, "warnings"> = {
        infile: filename,
        size: buffer.length,
        sha256: sha256(buffer),
    };

    try {
        if (ext.toLowerCase() === ".wav") {
            // Parse a cassette WAV file.
            const wavFile = readWavFile(buffer);
            const tape = new Tape(base, wavFile);
            const decoder = new Decoder(tape);
            decoder.decode();
            json.contentType = "audio";
            json.description = "Audio file with " + pluralizeWithCount(tape.programs.length, "file");
            json.cassette = { fileCount: tape.programs.length };
            if (verbose) {
                json.cassette.metadata = Object.fromEntries(getWavFileMetadataEntries(wavFile));
            }
        } else {
            const trs80File = decodeTrs80File(buffer, { filename });
            json.contentType = contentTypeOf(trs80File);
            json.description = trs80File.getDescription();
            if (trs80File.error !== undefined) {
                json.error = trs80File.error;
            } else if (trs80File.className === "Cassette") {
                json.cassette = { fileCount: trs80File.files.length };
            } else if (isFloppy(trs80File)) {
                json.floppy = floppyToInfoJson(trs80File, verbose);
            } else if (isHardDisk(trs80File)) {
                json.hardDisk = hardDiskToInfoJson(trs80File, verbose);
            }
        }
    } catch (e: unknown) {
        json.error = exceptionToString(e);
    }

    return json;
}

/**
 * Handle the "info --json" command: print one JSON object for all the input files.
 */
function printInfoJson(infiles: string[], verbose: boolean): void {
    printInfilesJson(infiles.map((infile): InfoJson => {
        const {result, warnings} = captureLogs(() => infoFileToJson(infile, verbose));
        return { ...result, warnings };
    }));
}

/**
 * Handle the "info" command.
 *
 * @param verbose whether to include more information about each file.
 * @param json whether to print one JSON object instead of text.
 * @param report whether to print the detailed report for regression testing instead (see report.ts).
 */
export async function info(infiles: string[], verbose: boolean, json: boolean, report: boolean): Promise<void> {
    if (report) {
        infoJson(infiles);
        return;
    }

    if (json) {
        printInfoJson(infiles, verbose);
        return;
    }

    for (const infile of infiles) {
        printInfoForFile(infile, verbose);
        await pagerYield();
    }
}
