import * as crypto from "crypto";
import {
    FileDamage, SectorPosition, Trs80File, Trs80Floppy,
} from "trs80-base";
import {LogLevel, MAIN_SINK} from "z80-logger";
import {assertNever} from "z80-base";
import {type InputFile, loadInputFile, notContainerError} from "./InputFile.js";
import {outputPathComponents, ToolError} from "./utils.js";

// This file defines the types of the JSON that the --json flags of the "dir", "extract", "sectors",
// and "info" commands print, and the helpers that build them. The comments on the interfaces are the
// documentation of the format. The format is meant to be stable: field names are explicit, raw
// values and their interpretations are in separate fields, and nothing depends on the terminal.
// Optional fields are left out of the JSON when they don't apply.

/**
 * Print a value to standard output as pretty-printed JSON.
 */
export function printJson(value: unknown): void {
    console.log(JSON.stringify(value, undefined, 2));
}

/**
 * The lowercase hexadecimal SHA-256 hash of the bytes.
 */
export function sha256(binary: Uint8Array): string {
    return crypto.createHash("sha256").update(binary).digest("hex");
}

/**
 * The bytes encoded as base64.
 */
export function toBase64(binary: Uint8Array): string {
    return Buffer.from(binary).toString("base64");
}

/**
 * Run a function while capturing the warnings that the libraries log. The normal log sink writes
 * to standard output, which would corrupt the JSON, so during the call warnings are collected and
 * logs of other levels go to standard error. The normal sinks are restored afterward, even if the
 * function throws.
 *
 * @param f the function to run.
 * @return what the function returned, and the warnings it logged.
 */
export function captureLogs<T>(f: () => T): { result: T, warnings: string[] } {
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
        const result = f();
        return { result, warnings };
    } finally {
        MAIN_SINK.delegatedSinks.splice(0, Infinity, ...savedSinks);
    }
}

/**
 * What the bytes of a file decode as, independent of the container that they came from. ("system"
 * deliberately isn't a value, because on floppies it means a file that belongs to the operating
 * system; the cassette SYSTEM format is "systemProgram".)
 */
export type ContentType =
    /** A Basic program (tokenized, or text). */
    "basicProgram" |
    /** A CMD load module: a machine-language program, in the format of TRSDOS. */
    "cmdProgram" |
    /** A machine-language program in the cassette SYSTEM format. */
    "systemProgram" |
    /** A Level 1 Basic program. */
    "level1Program" |
    /** An EDTASM source file. */
    "edtasm" |
    /** The first sector of a floppy, as a file. */
    "bootSector" |
    /** Bytes that we couldn't decode as anything else. */
    "binary" |
    /** A cassette image (CAS file) with one or more files. */
    "cassette" |
    /** A floppy disk image. */
    "floppy" |
    /** A hard disk image. */
    "hardDisk";

/**
 * Which kind of content a decoded file is.
 */
export function contentTypeOf(trs80File: Trs80File): ContentType {
    switch (trs80File.className) {
        case "BasicProgram": return "basicProgram";
        case "CmdProgram": return "cmdProgram";
        case "SystemProgram": return "systemProgram";
        case "Level1Program": return "level1Program";
        case "EdtasmFile": return "edtasm";
        case "BootSector": return "bootSector";
        case "RawBinaryFile": return "binary";
        case "Cassette": return "cassette";
        case "Jv1FloppyDisk":
        case "Jv3FloppyDisk":
        case "DmkFloppyDisk":
        case "HfeFloppyDisk":
        case "ImdFloppyDisk":
        case "ScpFloppyDisk":
            return "floppy";
        case "HdvHardDisk": return "hardDisk";
        default: assertNever(trs80File);
    }
}

/**
 * The format of a floppy disk image file.
 */
export type FloppyFormat = "JV1" | "JV3" | "DMK" | "HFE" | "IMD" | "SCP";

/**
 * The format of the image file that the floppy was decoded from.
 */
export function floppyFormatOf(floppy: Trs80Floppy): FloppyFormat {
    switch (floppy.className) {
        case "Jv1FloppyDisk": return "JV1";
        case "Jv3FloppyDisk": return "JV3";
        case "DmkFloppyDisk": return "DMK";
        case "HfeFloppyDisk": return "HFE";
        case "ImdFloppyDisk": return "IMD";
        case "ScpFloppyDisk": return "SCP";
        default: assertNever(floppy);
    }
}

/**
 * The position of a sector on a floppy.
 */
export interface SectorPositionJson {
    /** Cylinder number, from 0. */
    cylinder: number;
    /** Side, 0 or 1. */
    side: number;
    /** The sector number as written in the sector's ID field. It may start at 0 or 1. */
    sector: number;
}

/**
 * Convert a sector position to JSON.
 */
export function sectorPositionToJson(position: SectorPosition): SectorPositionJson {
    return {
        cylinder: position.cylinderNumber,
        side: position.side,
        sector: position.sectorNumber,
    };
}

/**
 * What's wrong with a file that came from a floppy.
 */
export interface DamageJson {
    /** Sectors of the file that couldn't be read. They are zero-filled in the file's contents. */
    missingSectors: SectorPositionJson[];
    /** Sectors of the file that were read with a data CRC error, so their data may be wrong. */
    crcErrorSectors: SectorPositionJson[];
    /** Problems with the file's directory entries, as short lowercase phrases. */
    directoryErrors: string[];
}

/**
 * Convert the damage to a file to JSON.
 */
export function damageToJson(damage: FileDamage): DamageJson {
    return {
        missingSectors: damage.missingSectors.map(sectorPositionToJson),
        crcErrorSectors: damage.crcErrorSectors.map(sectorPositionToJson),
        directoryErrors: damage.directoryErrors,
    };
}

/**
 * A run of granules that a TRSDOS-family file occupies.
 */
export interface GranuleExtentJson {
    /** Cylinder of the run's first granule. */
    cylinder: number;
    /** The granule within that cylinder where the run starts. */
    granule: number;
    /** Number of granules in the run, which continue into the following cylinders. */
    granuleCount: number;
}

/**
 * The attributes of a file that came from a CAS or WAV file (missing for other inputs).
 */
export interface CassetteFileJson {
    /** Nominal baud rate: 250, 500, or 1500. */
    baud: number;
    /** WAV files only: the number of the track (a group of copies of the same file) on the tape, from 1. */
    track?: number;
    /** WAV files only: which copy of the file this is within its track, from 1. */
    copy?: number;
}

/**
 * The attributes of a file that came from a TRSDOS (not Model II) floppy.
 */
export interface TrsdosFileJson {
    /** Whether the file belongs to the operating system (what "--system" includes). */
    osFile: boolean;
    /** Whether the operating system leaves the file out of its directory listing. */
    hidden: boolean;
    /** The protection level, as the DOS names it, such as "FULL" or "EXEC". */
    protection: string;
    /** The runs of granules, including those in the file's extended directory entries. */
    extents: GranuleExtentJson[];
}

/**
 * The attributes of a file that came from a CP/M floppy.
 */
export interface CpmFileJson {
    /** Whether the file has the SYS attribute (what "--system" includes). */
    osFile: boolean;
    /** Whether DIR leaves out the file. */
    hidden: boolean;
    /** The user number, 0 to 15. */
    user: number;
    /** The attributes that are set, from "R/O", "SYS", and "ARC". */
    attributes: string[];
    /** The file's allocation blocks, in order. */
    blocks: number[];
}

/**
 * The attributes of a file that came from a Percom MicroDOS floppy.
 */
export interface MicroDosFileJson {
    /** Whether the file belongs to the operating system (what "--system" includes). */
    osFile: boolean;
    /** Whether the operating system leaves the file out of its directory listing. */
    hidden: boolean;
    /** The file type, such as "Basic" or "Data". */
    type: string;
    /** The free-form remark in the directory entry. */
    remark: string;
    /** The absolute number of the file's first sector. */
    firstSector: number;
    /** The absolute number of the file's last sector. */
    lastSector: number;
}

/**
 * The attributes of a file that came from a UCSD Pascal floppy.
 */
export interface UcsdPascalFileJson {
    /** Whether the file belongs to the operating system (what "--system" includes). */
    osFile: boolean;
    /** Whether the operating system leaves the file out of its directory listing. */
    hidden: boolean;
    /** The kind of file, such as "Code" or "Text". */
    kind: string;
    /** The file's first 512-byte block. */
    firstBlock: number;
    /** The block after the file's last. */
    nextBlock: number;
}

/**
 * The attributes of a file that came from a Model II TRSDOS 1.x or 2.0 floppy.
 */
export interface ModelIITrsdosFileJson {
    /** Whether the file has the system flag (what "--system" includes). */
    osFile: boolean;
    /** Whether the operating system leaves the file out of its directory listing. */
    hidden: boolean;
    /** Whether the file has the program flag (it's a load module). */
    program: boolean;
    /** The protection level, 0 to 7. */
    protectionLevel: number;
    /** The logical record length, 1 to 256. */
    lrl: number;
    /** The runs of granules. */
    extents: GranuleExtentJson[];
}

/**
 * A run of granules that a TRSDOS-II file occupies.
 */
export interface GranuleRunJson {
    /** The number of the first granule. */
    startGranule: number;
    /** The number of granules in the run. */
    count: number;
}

/**
 * The attributes of a file that came from a TRSDOS-II 4.x floppy.
 */
export interface TrsdosIIFileJson {
    /** Whether the file has the system flag (what "--system" includes). */
    osFile: boolean;
    /** Whether the operating system leaves the file out of its directory listing. */
    hidden: boolean;
    /** The name of the file's protection level, as ATTRIB shows it, such as "KILL". */
    protection: string;
    /** Whether the file is a program (a load module) rather than data. */
    program: boolean;
    /** Whether the records are fixed-length rather than variable-length. */
    fixedRecords: boolean;
    /** The logical record length. */
    lrl: number;
    /** The subdirectory file that the entry is in, such as "SYSTEM/DIR". */
    subdirectory: string;
    /** The runs of granules, from the file's block table. */
    granuleRuns: GranuleRunJson[];
    /** What's wrong with the block tables, if neither could be read. */
    blockTableError?: string;
}

/**
 * Which part of a file that's split across the disks of a set an archive member holds.
 */
export interface XenixTarExtentJson {
    /** The number of this part, from 1. */
    part: number;
    /** The number of parts the file is split into. */
    partCount: number;
    /** The size in bytes of the whole file, all parts together. */
    fileSize: number;
}

/**
 * The attributes of a file that came from a Xenix tar floppy.
 */
export interface XenixTarFileJson {
    /** Always false: tar has no system files. */
    osFile: boolean;
    /** Always false: tar has no hidden files. */
    hidden: boolean;
    /** The permission bits in octal, always four digits, such as "0755". */
    mode: string;
    /** The owner's user ID. */
    uid: number;
    /** The owner's group ID. */
    gid: number;
    /** The type flag of the archive member: "0" for a regular file, "1" for a hard link. */
    typeFlag: string;
    /** The target of a hard link. */
    linkName?: string;
    /** Present if the member holds only a part of the file. */
    extent?: XenixTarExtentJson;
}

/**
 * The attributes that depend on the container that a file came from. At most one is present,
 * named after the container, and none is for a file that wasn't in a container.
 */
export interface ContainerJson {
    /** The file came from a CAS or WAV file. */
    cassette?: CassetteFileJson;
    /** The file came from a TRSDOS (not Model II) floppy. */
    trsdos?: TrsdosFileJson;
    /** The file came from a CP/M floppy. */
    cpm?: CpmFileJson;
    /** The file came from a Percom MicroDOS floppy. */
    microDos?: MicroDosFileJson;
    /** The file came from a UCSD Pascal floppy. */
    ucsdPascal?: UcsdPascalFileJson;
    /** The file came from a Model II TRSDOS 1.x or 2.0 floppy. */
    modelIITrsdos?: ModelIITrsdosFileJson;
    /** The file came from a TRSDOS-II 4.x floppy. */
    trsdosII?: TrsdosIIFileJson;
    /** The file came from a Xenix tar floppy. */
    xenixTar?: XenixTarFileJson;
}

/**
 * The text version of a UCSD Pascal text file, converted to the host's format (ASCII, with newlines
 * and without the padding of the disk format).
 */
export interface HostTextJson {
    /** Length in bytes of the converted text. */
    size: number;
    /** SHA-256 of the converted text, in lowercase hexadecimal. */
    sha256: string;
    /** "extract" only: the converted text, in base64. */
    contents?: string;
}

/**
 * One file, as listed by "dir --json" and extracted by "extract --json". The file's contents are
 * what is stored on the disk or tape, after any decoding that the container does (such as stopping
 * CP/M text files at their Ctrl-Z, unless "--cpm-records").
 */
export interface FileJson extends ContainerJson {
    /** The file's name as decoded, with "." between the name and extension. On Xenix tar it's a path with "/". */
    name: string;
    /** Length in bytes of the file's contents. */
    size: number;
    /** SHA-256 of the file's contents, in lowercase hexadecimal. */
    sha256: string;
    /** What the file's contents decode as. */
    contentType: ContentType;
    /** A short description of the contents, such as "Basic program". */
    description: string;
    /** Missing if the contents decoded without an error. */
    error?: string;
    /**
     * The date recorded in the directory, as "YYYY-MM-DD" or, if the time is recorded too,
     * "YYYY-MM-DDTHH:MM". These have no time zone, except those that end in "Z", which are UTC.
     * Some TRSDOS entries record only the year or only the year and month, and then it's just "YYYY"
     * or "YYYY-MM". Missing if the file has no date.
     */
    date?: string;
    /** Missing if the file isn't damaged (or if it didn't come from a floppy). */
    damage?: DamageJson;
    /** UCSD Pascal text files only. */
    hostText?: HostTextJson;
    /** "extract" only: the file's contents, in base64. */
    contents?: string;
    /**
     * "extract" only: the path of the file that "extract" would write in the output directory, with "/" between
     * the components. It doesn't include the renaming that "extract" does to avoid overwriting a file
     * of the same name in lowercase.
     */
    outputName?: string;
}

/**
 * What "extract --json" adds to each file.
 */
export interface ExtractJsonOptions {
    /** Whether "--lowercase" was given. */
    lowercase: boolean;
    /** Whether "--mark-damaged" was given. */
    markDamaged: boolean;
}

/**
 * Convert an input file to JSON.
 *
 * @param inFile the file.
 * @param forExtract options if this is for "extract", which adds the contents and the output
 * name to the result. Undefined for "dir".
 */
export function fileToJson(inFile: InputFile, forExtract: ExtractJsonOptions | undefined): FileJson {
    const json: FileJson = {
        name: inFile.filename,
        size: inFile.binary.length,
        sha256: sha256(inFile.binary),
        contentType: contentTypeOf(inFile.trs80File),
        description: inFile.trs80File.getDescription(),
    };
    if (inFile.trs80File.error !== undefined) {
        json.error = inFile.trs80File.error;
    }

    const date = inFile.getJsonDate();
    if (date !== undefined) {
        json.date = date;
    }
    if (inFile.damage !== undefined) {
        json.damage = damageToJson(inFile.damage);
    }

    Object.assign(json, inFile.getJsonContainer());

    const hostText = inFile.getHostText();
    if (hostText !== undefined) {
        json.hostText = {
            size: hostText.length,
            sha256: sha256(hostText),
        };
        if (forExtract !== undefined) {
            json.hostText.contents = toBase64(hostText);
        }
    }

    if (forExtract !== undefined) {
        json.contents = toBase64(inFile.binary);
        json.outputName = outputPathComponents(inFile.filename, inFile.hasDirectories(),
            inFile.damage !== undefined, forExtract.lowercase, forExtract.markDamaged).join("/");
    }

    return json;
}

/**
 * The fields common to the entries of the "infiles" array at the top of every command's JSON.
 */
export interface InfileJson {
    /** The path of the input file as given on the command line. */
    infile: string;
    /** Missing if the input was read without a problem. Otherwise the input couldn't be read, decoded, or isn't the right kind. */
    error?: string;
    /** Warnings that the decoders logged while reading the input. */
    warnings: string[];
}

/**
 * The top level of every command's JSON, with one entry for each input file, in the order given
 * (and repeated if the file was repeated).
 */
export interface InfilesJson<T extends InfileJson> {
    infiles: T[];
}

/**
 * Print the JSON for a command, and set the exit code to 1 if any of the input files had an error.
 */
export function printInfilesJson<T extends InfileJson>(infiles: T[]): void {
    const output: InfilesJson<T> = { infiles };
    printJson(output);
    if (infiles.some(infile => infile.error !== undefined)) {
        process.exitCode = 1;
    }
}

/**
 * The JSON for one input file of "dir --json" and "extract --json".
 */
export interface FilesInfileJson extends InfileJson {
    /**
     * The name and version of the floppy's operating system, or of the first partition's on a hard disk,
     * whose files are in a directory for each partition, usually named for the partition's disk ("HARDA/"). Missing if the input isn't a floppy
     * or hard disk.
     */
    os?: string;
    /**
     * The files in the input, in directory order. If the input isn't a container (a floppy, CAS file, or
     * WAV file), "dir" lists the input itself as the only file. Empty if the input had an error.
     */
    files: FileJson[];
}

/**
 * Load an input file and convert the files in it to JSON. A ToolError becomes the entry's error.
 *
 * @param inFilename the file to load.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records.
 * @param forExtract options if this is for "extract", which needs the input to be a container, and
 * adds the contents to each file. Undefined for "dir".
 */
export function filesInfileJson(inFilename: string, includeSystemFiles: boolean, cpmWholeRecords: boolean,
                                forExtract: ExtractJsonOptions | undefined): FilesInfileJson {

    const {result, warnings} = captureLogs((): Omit<FilesInfileJson, "warnings"> => {
        try {
            const {inFiles, isContainer, os} = loadInputFile(inFilename, includeSystemFiles, cpmWholeRecords);
            if (forExtract !== undefined && !isContainer) {
                throw notContainerError(inFilename);
            }

            const files = inFiles.map(inFile => fileToJson(inFile, forExtract));
            return os === undefined ? { infile: inFilename, files } : { infile: inFilename, os, files };
        } catch (e) {
            if (!(e instanceof ToolError)) {
                throw e;
            }
            return { infile: inFilename, files: [], error: e.message };
        }
    });

    return { ...result, warnings };
}
