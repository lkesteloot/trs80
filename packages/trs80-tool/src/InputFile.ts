import * as fs from "fs";
import * as path from "path";
import {
    CassetteFile,
    CassetteSpeed,
    FileDamage,
    Trs80File,
    Cpm, CpmFile, MicroDos, MicroDosFile, ModelIITrsdos, ModelIITrsdosDirEntry, Trsdos, TrsdosDirEntry, TrsdosII,
    TrsdosIIFile, TrsdosIIFileType, TrsdosIIRecordType, UcsdPascal, UcsdPascalFile, XenixTar, XenixTarFile, decodeFloppyFileSystem,
    decodeTrs80CassetteFile, decodeTrs80File, findLdosPartitions, getTrs80FileExtension, isFloppy, isHardDisk, microDosFileTypeToString, trsdosIIProtectionLevelToString,
    trsdosProtectionLevelToString, ucsdPascalFileKindToString, ucsdPascalTextToHost } from "trs80-base";
import {Decoder, Program, Tape, readWavFile } from "trs80-cassette";
import {assertNever} from "z80-base";
import {
    ToolError, formatDate, jsonDate, modelIITrsdosFlagsString, trsdosIIFlagsString, xenixTarModeString,
    xenixTarTypeLetter,
} from "./utils.js";
import {colorDate} from "./lscolors.js";
import type {ContainerJson, GranuleExtentJson, TrsdosIIFileJson, XenixTarFileJson} from "./json.js";

/**
 * Information about each input file.
 */
export class InputFile {
    // Filename in local (Linux/MacOS) style.
    public readonly filename: string;
    // The raw binary, before decoding.
    public binary: Uint8Array;
    // The decoded program.
    public trs80File: Trs80File;
    // What's wrong with the file, or undefined if nothing is, or if the file didn't come from a floppy.
    public damage: FileDamage | undefined;

    constructor(filename: string, binary: Uint8Array, trs80File: Trs80File, damage?: FileDamage) {
        this.filename = filename;
        this.binary = binary;
        this.trs80File = trs80File;
        this.damage = damage !== undefined && damage.isDamaged() ? damage : undefined;
    }

    /**
     * Set the Trs80File for this input file.
     */
    public setFile(trs80File: Trs80File): void {
        this.trs80File = trs80File;
    }

    /**
     * Optional cassette speed, if applicable.
     */
    public getSpeed(): CassetteSpeed | undefined {
        return undefined;
    }

    /**
     * Optional date, if applicable.
     */
    public getDate(): Date | undefined {
        return undefined;
    }

    /**
     * The date for JSON output (see jsonDate()), or undefined if the file has none. A subclass
     * overrides this to format its date the way getDirExtras() does.
     */
    public getJsonDate(): string | undefined {
        return undefined;
    }

    /**
     * Any extra columns to include in a directory listing.
     */
    public getDirExtras(): string[] {
        return [];
    }

    /**
     * The attributes of the file that depend on the container that it came from, for JSON output.
     * A subclass overrides this to return an object with one field named after its container.
     * The base class is for inputs that weren't in a container, which have none.
     */
    public getJsonContainer(): ContainerJson {
        return {};
    }

    /**
     * The file's contents converted to host text, or undefined if the file isn't a kind that
     * needs conversion. A subclass overrides this (see UcsdPascalInputFile).
     */
    public getHostText(): Uint8Array | undefined {
        return undefined;
    }

    /**
     * The bytes that "extract" writes. Normally the same as the raw binary, but text files that
     * have a host text version (see getHostText()) are converted to it.
     *
     * @param convertText whether to convert text files to host text.
     */
    public getExtractedBinary(convertText: boolean): Uint8Array {
        return (convertText ? this.getHostText() : undefined) ?? this.binary;
    }

    /**
     * Whether a "/" in the filename separates directories, which extract recreates. Only on
     * file systems that have directories; elsewhere a "/" is just a character of the name.
     */
    public hasDirectories(): boolean {
        return false;
    }
}

/**
 * Input file that came from an audio file.
 */
export class WavInputFile extends InputFile {
    public readonly program: Program;

    constructor(program: Program) {
        const trs80File = decodeTrs80CassetteFile(program.binary, false);
        const filename = program.getPseudoFilename() + getTrs80FileExtension(trs80File);
        super(filename, program.binary, trs80File);
        this.program = program;
    }

    public override getDirExtras(): string[] {
        return [
            this.program.speed.nominalBaud + " baud",
        ];
    }

    public override getSpeed(): CassetteSpeed | undefined {
        return this.program.speed;
    }

    /**
     * The baud rate, and where on the tape the program was.
     */
    public override getJsonContainer(): ContainerJson {
        return {
            cassette: {
                baud: this.program.speed.nominalBaud,
                track: this.program.trackNumber,
                copy: this.program.copyNumber,
            },
        };
    }
}

/**
 * Input file that came from a CAS file.
 */
export class CasInputFile extends InputFile {
    public readonly cassetteFile: CassetteFile;

    constructor(filename: string, cassetteFile: CassetteFile) {
        super(filename, cassetteFile.binary, cassetteFile.file);
        this.cassetteFile = cassetteFile;
    }

    public override getDirExtras(): string[] {
        return [
            this.cassetteFile.speed.nominalBaud + " baud",
        ];
    }

    public override getSpeed(): CassetteSpeed | undefined {
        return this.cassetteFile.speed;
    }

    /**
     * The baud rate.
     */
    public override getJsonContainer(): ContainerJson {
        return {
            cassette: {
                baud: this.cassetteFile.speed.nominalBaud,
            },
        };
    }
}

/**
 * Input file that came from a TRSDOS floppy, or from a partition of a hard disk.
 */
export class TrsdosInputFile extends InputFile {
    public readonly trsdos: Trsdos;
    public readonly dirEntry: TrsdosDirEntry;
    // The directory that holds the file, ending in "/", or an empty string if it's not in one.
    // Hard disk partitions are directories.
    private readonly directory: string;

    /**
     * @param trsdos the file system that holds the file.
     * @param dirEntry the file's directory entry.
     * @param directory the directory to put the file in, ending in "/", or an empty string for none.
     */
    constructor(trsdos: Trsdos, dirEntry: TrsdosDirEntry, directory = "") {
        const name = dirEntry.getFilename(".");
        const {binary, damage} = trsdos.readFileWithDamage(dirEntry);
        const trs80File = decodeTrs80File(binary, { filename: name });
        super(directory + name, binary, trs80File, damage);
        this.trsdos = trsdos;
        this.dirEntry = dirEntry;
        this.directory = directory;
    }

    /**
     * Only if the file is in a directory (a hard disk partition's).
     */
    public override hasDirectories(): boolean {
        return this.directory !== "";
    }

    public override getDirExtras(): string[] {
        // Pad the dates to line up: "DD/MM/YYYY", plus " HH:MM" on disks with time stamps, where
        // some files have only a date. TRSDOS 1.3's system files have no date.
        const date = this.dirEntry.getFullDateString().padEnd(this.trsdos.hasTimeStamps ? 16 : 10, " ");
        return [
            colorDate(date),
            trsdosProtectionLevelToString(this.dirEntry.getProtectionLevel(), this.trsdos.version),
        ];
    }

    public override getDate(): Date | undefined {
        return this.dirEntry.getDate();
    }

    /**
     * The date, with the time only if the entry has one (only some disks have time stamps).
     * Some entries have just a year, or a year and month, and then that's all we give, rather
     * than make up the rest.
     */
    public override getJsonDate(): string | undefined {
        const date = this.getDate();
        if (date === undefined) {
            return undefined;
        }

        const {month, day} = this.dirEntry;
        if (month === 0) {
            return date.getFullYear().toString().padStart(4, "0");
        }
        if (day === 0) {
            return jsonDate(date, false, false).substring(0, 7);
        }

        const hasTime = this.dirEntry.hour !== undefined && this.dirEntry.minute !== undefined;
        return jsonDate(date, false, hasTime);
    }

    /**
     * The protection level and where the file is on the disk.
     */
    public override getJsonContainer(): ContainerJson {
        // Follow the chain of directory entries to collect all extents.
        const extents: GranuleExtentJson[] = [];
        for (let dirEntry: TrsdosDirEntry | undefined = this.dirEntry; dirEntry !== undefined;
             dirEntry = dirEntry.nextDirEntry) {

            for (const extent of dirEntry.extents) {
                extents.push({
                    cylinder: extent.cylinderNumber,
                    granule: extent.granuleOffset,
                    granuleCount: extent.granuleCount,
                });
            }
        }

        return {
            trsdos: {
                osFile: this.dirEntry.isSystemFile(),
                hidden: this.dirEntry.isHidden(),
                protection: trsdosProtectionLevelToString(this.dirEntry.getProtectionLevel(), this.trsdos.version),
                extents,
            },
        };
    }
}

/**
 * Input file that came from a CP/M floppy.
 */
export class CpmInputFile extends InputFile {
    public readonly cpm: Cpm;
    public readonly cpmFile: CpmFile;
    // Whether to list the user number, which only matters if some files aren't user 0.
    private readonly showUser: boolean;

    constructor(cpm: Cpm, cpmFile: CpmFile, showUser: boolean) {
        const filename = cpmFile.getFilename(".");
        const {binary, damage} = cpm.readFileWithDamage(cpmFile);
        const trs80File = decodeTrs80File(binary, { filename });
        super(filename, binary, trs80File, damage);
        this.cpm = cpm;
        this.cpmFile = cpmFile;
        this.showUser = showUser;
    }

    public override getDirExtras(): string[] {
        const extras: string[] = [];
        if (this.showUser) {
            extras.push(("user " + this.cpmFile.user).padEnd(7));
        }
        extras.push(this.cpmFile.getAttributesString());
        return extras;
    }

    /**
     * The user number, the attributes, and the allocation blocks.
     */
    public override getJsonContainer(): ContainerJson {
        const attributes: string[] = [];
        if (this.cpmFile.isReadOnly()) {
            attributes.push("R/O");
        }
        if (this.cpmFile.isSystemFile()) {
            attributes.push("SYS");
        }
        if (this.cpmFile.extents[0].archived) {
            attributes.push("ARC");
        }

        return {
            cpm: {
                osFile: this.cpmFile.isSystemFile(),
                hidden: this.cpmFile.isHidden(),
                user: this.cpmFile.user,
                attributes,
                blocks: this.cpmFile.getBlocks(),
            },
        };
    }
}

/**
 * Input file that came from a Percom MicroDOS floppy.
 */
export class MicroDosInputFile extends InputFile {
    public readonly microDos: MicroDos;
    public readonly microDosFile: MicroDosFile;

    constructor(microDos: MicroDos, microDosFile: MicroDosFile) {
        const filename = microDosFile.getFilename(".");
        const {binary, damage} = microDos.readFileWithDamage(microDosFile);
        const trs80File = decodeTrs80File(binary, { filename });
        super(filename, binary, trs80File, damage);
        this.microDos = microDos;
        this.microDosFile = microDosFile;
    }

    public override getDirExtras(): string[] {
        return [
            microDosFileTypeToString(this.microDosFile.type).padEnd(5),
            this.microDosFile.remark,
        ];
    }

    /**
     * The file type, the remark, and the range of sectors.
     */
    public override getJsonContainer(): ContainerJson {
        return {
            microDos: {
                osFile: this.microDosFile.isSystemFile(),
                hidden: this.microDosFile.isHidden(),
                type: microDosFileTypeToString(this.microDosFile.type),
                remark: this.microDosFile.remark,
                firstSector: this.microDosFile.firstSector,
                lastSector: this.microDosFile.lastSector,
            },
        };
    }
}

/**
 * Input file that came from a UCSD Pascal floppy.
 */
export class UcsdPascalInputFile extends InputFile {
    public readonly ucsdPascal: UcsdPascal;
    public readonly file: UcsdPascalFile;

    constructor(ucsdPascal: UcsdPascal, file: UcsdPascalFile) {
        const filename = file.getFilename(".");
        const {binary, damage} = ucsdPascal.readFileWithDamage(file);
        const trs80File = decodeTrs80File(binary, { filename });
        super(filename, binary, trs80File, damage);
        this.ucsdPascal = ucsdPascal;
        this.file = file;
    }

    /**
     * The file's date (blank if the entry has none, padded to line up) and its kind, such as "Code" or "Text".
     */
    public override getDirExtras(): string[] {
        const date = this.getDate();
        return [
            colorDate((date === undefined ? "" : formatDate(date, false, false)).padEnd(10, " ")),
            ucsdPascalFileKindToString(this.file.kind),
        ];
    }

    public override getDate(): Date | undefined {
        return this.file.getDate();
    }

    /**
     * The date, without a time.
     */
    public override getJsonDate(): string | undefined {
        const date = this.getDate();
        return date === undefined ? undefined : jsonDate(date, false, false);
    }

    /**
     * The kind of file and where it is on the disk.
     */
    public override getJsonContainer(): ContainerJson {
        return {
            ucsdPascal: {
                osFile: this.file.isSystemFile(),
                hidden: this.file.isHidden(),
                kind: ucsdPascalFileKindToString(this.file.kind),
                firstBlock: this.file.firstBlock,
                nextBlock: this.file.nextBlock,
            },
        };
    }

    /**
     * For a text file, the plain host text (see ucsdPascalTextToHost()). Other files have none.
     */
    public override getHostText(): Uint8Array | undefined {
        return this.file.isText() ? ucsdPascalTextToHost(this.binary) : undefined;
    }
}

/**
 * Input file that came from a Tandy Model II TRSDOS 1.x or 2.0 floppy.
 */
export class ModelIITrsdosInputFile extends InputFile {
    public readonly modelIITrsdos: ModelIITrsdos;
    public readonly dirEntry: ModelIITrsdosDirEntry;

    constructor(modelIITrsdos: ModelIITrsdos, dirEntry: ModelIITrsdosDirEntry) {
        const filename = dirEntry.getFilename(".");
        const {binary, damage} = modelIITrsdos.readFileWithDamage(dirEntry);
        const trs80File = decodeTrs80File(binary, { filename });
        super(filename, binary, trs80File, damage);
        this.modelIITrsdos = modelIITrsdos;
        this.dirEntry = dirEntry;
    }

    /**
     * The date last updated (blank if the entry has none, padded to line up), the flags
     * (S for system, P for program), and the protection level.
     */
    public override getDirExtras(): string[] {
        const date = this.getDate();
        return [
            colorDate((date === undefined ? "" : formatDate(date, false, false)).padEnd(10, " ")),
            modelIITrsdosFlagsString(this.dirEntry),
            "level " + this.dirEntry.protectionLevel,
        ];
    }

    public override getDate(): Date | undefined {
        return this.dirEntry.getDate();
    }

    /**
     * The date, without a time.
     */
    public override getJsonDate(): string | undefined {
        const date = this.getDate();
        return date === undefined ? undefined : jsonDate(date, false, false);
    }

    /**
     * The flags, the protection level, the record length, and where the file is on the disk.
     */
    public override getJsonContainer(): ContainerJson {
        return {
            modelIITrsdos: {
                osFile: this.dirEntry.isSystemFile(),
                hidden: this.dirEntry.isHidden(),
                program: this.dirEntry.isProgram(),
                protectionLevel: this.dirEntry.protectionLevel,
                lrl: this.dirEntry.lrl,
                extents: this.dirEntry.extents.map(extent => ({
                    cylinder: extent.cylinder,
                    granule: extent.granule,
                    granuleCount: extent.granuleCount,
                })),
            },
        };
    }
}

/**
 * Input file that came from a TRSDOS-II 4.x floppy.
 */
export class TrsdosIIInputFile extends InputFile {
    public readonly trsdosII: TrsdosII;
    public readonly file: TrsdosIIFile;

    constructor(trsdosII: TrsdosII, file: TrsdosIIFile) {
        const filename = file.getFilename(".");
        const {binary, damage} = trsdosII.readFileWithDamage(file);
        const trs80File = decodeTrs80File(binary, { filename });
        super(filename, binary, trs80File, damage);
        this.trsdosII = trsdosII;
        this.file = file;
    }

    /**
     * The date last modified (blank if the entry has none, padded to line up), the flags
     * (program or data, fixed or variable records, system), and the protection level.
     */
    public override getDirExtras(): string[] {
        const date = this.getDate();
        return [
            colorDate((date === undefined ? "" : formatDate(date, false, true)).padEnd(16, " ")),
            trsdosIIFlagsString(this.file),
            trsdosIIProtectionLevelToString(this.file.getProtectionLevel()).padEnd(6),
        ];
    }

    public override getDate(): Date | undefined {
        return this.file.getDate();
    }

    /**
     * The date, with the time.
     */
    public override getJsonDate(): string | undefined {
        const date = this.getDate();
        return date === undefined ? undefined : jsonDate(date, false, true);
    }

    /**
     * The flags, the protection level, the record length, and where the file is on the disk.
     */
    public override getJsonContainer(): ContainerJson {
        const fileTypeValue = this.file.getFileType();
        let program: boolean;
        switch (fileTypeValue) {
            case TrsdosIIFileType.PROGRAM: program = true; break;
            case TrsdosIIFileType.DATA: program = false; break;
            default: assertNever(fileTypeValue);
        }

        const recordTypeValue = this.file.getRecordType();
        let fixedRecords: boolean;
        switch (recordTypeValue) {
            case TrsdosIIRecordType.FIXED: fixedRecords = true; break;
            case TrsdosIIRecordType.VARIABLE: fixedRecords = false; break;
            default: assertNever(recordTypeValue);
        }

        const trsdosII: TrsdosIIFileJson = {
            osFile: this.file.isSystemFile(),
            hidden: this.file.isHidden(),
            protection: trsdosIIProtectionLevelToString(this.file.getProtectionLevel()),
            program,
            fixedRecords,
            lrl: this.file.lrl,
            subdirectory: this.file.subdirectory,
            granuleRuns: this.file.extents.map(extent => ({
                startGranule: extent.startGranule,
                count: extent.count,
            })),
        };
        if (this.file.blockTableError !== undefined) {
            trsdosII.blockTableError = this.file.blockTableError;
        }

        return { trsdosII };
    }
}

/**
 * Input file that came from a Xenix floppy that holds a tar archive. Its filename is the path
 * within the archive and can contain "/".
 */
export class XenixTarInputFile extends InputFile {
    public readonly xenixTar: XenixTar;
    public readonly file: XenixTarFile;

    constructor(xenixTar: XenixTar, file: XenixTarFile) {
        const filename = file.getFilename(".");
        const {binary, damage} = xenixTar.readFileWithDamage(file);
        const trs80File = decodeTrs80File(binary, { filename });
        super(filename, binary, trs80File, damage);
        this.xenixTar = xenixTar;
        this.file = file;
    }

    /**
     * The modification time in UTC, the permission bits in octal, and the owner's user and group IDs.
     */
    public override getDirExtras(): string[] {
        const date = this.getDate();
        return [
            colorDate((date === undefined ? "" : formatDate(date, true, true)).padEnd(16, " ")),
            xenixTarModeString(this.file),
            this.file.uid + "/" + this.file.gid,
        ];
    }

    public override getDate(): Date | undefined {
        return this.file.getDate();
    }

    /**
     * The date with the time, in UTC.
     */
    public override getJsonDate(): string | undefined {
        const date = this.getDate();
        return date === undefined ? undefined : jsonDate(date, true, true);
    }

    /**
     * The permissions, the owner, the type of the member, and which part of the file it holds.
     */
    public override getJsonContainer(): ContainerJson {
        const xenixTar: XenixTarFileJson = {
            osFile: this.file.isSystemFile(),
            hidden: this.file.isHidden(),
            mode: xenixTarModeString(this.file),
            uid: this.file.uid,
            gid: this.file.gid,
            typeFlag: xenixTarTypeLetter(this.file),
        };
        if (this.file.linkName !== "") {
            xenixTar.linkName = this.file.linkName;
        }
        const extent = this.file.extent;
        if (extent !== undefined) {
            xenixTar.extent = {
                part: extent.number,
                partCount: extent.count,
                fileSize: extent.fileSize,
            };
        }

        return { xenixTar };
    }

    /**
     * Tar names are paths, such as "usr/bin/vi".
     */
    public override hasDirectories(): boolean {
        return true;
    }
}

/**
 * Result of loading an input file.
 */
export interface LoadedInput {
    // The contained files if the input was a container, otherwise just the input itself.
    inFiles: InputFile[];
    // Whether the input was a container (a floppy, hard disk, CAS file, or WAV file) that we expanded.
    isContainer: boolean;
    // The name and version of the floppy's operating system (the first partition's, for a hard
    // disk), or undefined if the input wasn't a floppy or hard disk.
    os: string | undefined;
}

/**
 * Load the file and, if it can contain other files (floppies, hard disks, cassettes, and wav files),
 * expand it. The files of each partition of a hard disk are in a directory named for the partition,
 * usually its disk name, such as "HARDA/" (see makeDirectoryNames() in trs80-base).
 *
 * @param inFilename the file to load.
 * @param includeSystemFiles whether to include system files from floppies and hard disks.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of
 * ending text files at their Ctrl-Z.
 * @return the contained files, whether the input was a container (if it wasn't, the result is
 * the single input file), and the operating system of a floppy or hard disk.
 * @throws ToolError if the file can't be read or decoded.
 */
export function loadInputFile(inFilename: string, includeSystemFiles: boolean, cpmWholeRecords: boolean): LoadedInput {
    const inFiles: InputFile[] = [];
    let isContainer = true;
    let os: string | undefined = undefined;

    const { base, ext } = path.parse(inFilename);

    let buffer;
    try {
        buffer = fs.readFileSync(inFilename);
    } catch (e: any) {
        throw new ToolError("Can't open \"" + inFilename + "\": " + e.message);
    }

    if (ext.toLowerCase() === ".wav") {
        // Parse a cassette WAV file.
        const wavFile = readWavFile(buffer);
        const tape = new Tape(base, wavFile);
        const decoder = new Decoder(tape);
        decoder.decode();
        for (const program of tape.programs) {
            inFiles.push(new WavInputFile(program));
        }
    } else {
        const trs80File = decodeTrs80File(buffer, { filename: inFilename });
        if (trs80File.error !== undefined) {
            throw new ToolError("Can't open \"" + inFilename + "\": " + trs80File.error);
        }

        if (isFloppy(trs80File)) {
            const fileSystem = decodeFloppyFileSystem(trs80File, cpmWholeRecords);
            if (fileSystem === undefined) {
                throw new ToolError("Can't find a DOS directory on \"" + inFilename + "\"");
            }

            os = fileSystem.nameAndVersion;

            // Expand floppy.
            if (fileSystem instanceof Trsdos) {
                for (const dirEntry of fileSystem.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new TrsdosInputFile(fileSystem, dirEntry));
                }
            } else if (fileSystem instanceof Cpm) {
                const cpmFiles = fileSystem.getDirEntries(includeSystemFiles);
                const showUser = cpmFiles.some(cpmFile => cpmFile.user !== 0);
                for (const cpmFile of cpmFiles) {
                    inFiles.push(new CpmInputFile(fileSystem, cpmFile, showUser));
                }
            } else if (fileSystem instanceof MicroDos) {
                for (const microDosFile of fileSystem.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new MicroDosInputFile(fileSystem, microDosFile));
                }
            } else if (fileSystem instanceof ModelIITrsdos) {
                for (const dirEntry of fileSystem.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new ModelIITrsdosInputFile(fileSystem, dirEntry));
                }
            } else if (fileSystem instanceof TrsdosII) {
                for (const file of fileSystem.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new TrsdosIIInputFile(fileSystem, file));
                }
            } else if (fileSystem instanceof UcsdPascal) {
                for (const file of fileSystem.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new UcsdPascalInputFile(fileSystem, file));
                }
            } else if (fileSystem instanceof XenixTar) {
                for (const file of fileSystem.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new XenixTarInputFile(fileSystem, file));
                }
            } else {
                assertNever(fileSystem);
            }
        } else if (isHardDisk(trs80File)) {
            const ldosPartitions = findLdosPartitions(trs80File);
            if (ldosPartitions.length === 0) {
                throw new ToolError("Can't find a DOS directory on \"" + inFilename + "\"");
            }

            os = ldosPartitions[0].trsdos.nameAndVersion;

            // Expand each partition into a directory.
            for (const {trsdos, directoryName} of ldosPartitions) {
                for (const dirEntry of trsdos.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new TrsdosInputFile(trsdos, dirEntry, directoryName + "/"));
                }
            }
        } else if (trs80File.className === "Cassette") {
            // Expand .CAS file.
            let counter = 1;
            for (const cassetteFile of trs80File.files) {
                const filename = "T" + counter + getTrs80FileExtension(cassetteFile.file);
                inFiles.push(new CasInputFile(filename, cassetteFile));
                counter++;
            }
        } else {
            isContainer = false;
            inFiles.push(new InputFile(base, buffer, trs80File));
        }
    }

    return { inFiles, isContainer, os };
}

/**
 * Load the file. If the file can contain other files (floppies, cassettes, and wav files),
 * then expand the file and return the contained files. Otherwise just return the file.
 *
 * @param inFilename the file to load.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of
 * ending text files at their Ctrl-Z.
 */
export function expandFile(inFilename: string, includeSystemFiles: boolean, cpmWholeRecords: boolean): InputFile[] {
    return loadInputFile(inFilename, includeSystemFiles, cpmWholeRecords).inFiles;
}

/**
 * The error for an input that "extract" can't use because it isn't a container.
 */
export function notContainerError(inFilename: string): ToolError {
    return new ToolError("Can't extract from \"" + inFilename +
        "\": it's not a floppy image, hard disk image, CAS file, or WAV file that can be read");
}

/**
 * Load the file, which must be a container (a floppy, hard disk, CAS file, or WAV file), and return
 * the files it contains. Unlike expandFile(), this never returns the input itself: if
 * the decoder doesn't recognize the input as a container (for example a truncated floppy
 * image that decodes as a raw binary), it throws.
 *
 * @param inFilename the container file to load.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of
 * ending text files at their Ctrl-Z.
 * @throws ToolError if the file can't be read or isn't a container.
 */
export function expandContainer(inFilename: string, includeSystemFiles: boolean, cpmWholeRecords: boolean): InputFile[] {
    const { inFiles, isContainer } = loadInputFile(inFilename, includeSystemFiles, cpmWholeRecords);
    if (!isContainer) {
        throw notContainerError(inFilename);
    }

    return inFiles;
}
