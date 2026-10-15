import * as fs from "fs";
import * as path from "path";
import {
    CassetteFile,
    CassetteSpeed,
    FileDamage,
    Trs80File,
    Cpm, CpmFile, MicroDos, MicroDosFile, ModelIITrsdos, ModelIITrsdosDirEntry, Trsdos, TrsdosDirEntry, TrsdosII,
    TrsdosIIFile, Ucsd, UcsdFile, XenixTar, XenixTarFile, decodeFloppyFileSystem, decodeTrs80CassetteFile,
    decodeTrs80File, getTrs80FileExtension, isFloppy, microDosFileTypeToString, trsdosIIProtectionLevelToString,
    trsdosProtectionLevelToString, ucsdFileKindToString, ucsdTextToHost } from "trs80-base";
import {Decoder, Program, Tape, readWavFile } from "trs80-cassette";
import {assertNever} from "z80-base";
import {ToolError, formatDate, modelIITrsdosFlagsString, trsdosIIFlagsString, xenixTarModeString} from "./utils.js";
import {colorDate} from "./lscolors.js";

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
     * Any extra columns to include in a directory listing.
     */
    public getDirExtras(): string[] {
        return [];
    }

    /**
     * The bytes that "extract" writes. Normally the same as the raw binary; a subclass overrides
     * this to convert the file to host format.
     *
     * @param convertText whether to convert text files to host text (see UcsdInputFile).
     */
    public getExtractedBinary(convertText: boolean): Uint8Array {
        return this.binary;
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
}

/**
 * Input file that came from a TRSDOS floppy.
 */
export class TrsdosInputFile extends InputFile {
    public readonly trsdos: Trsdos;
    public readonly dirEntry: TrsdosDirEntry;

    constructor(trsdos: Trsdos, dirEntry: TrsdosDirEntry) {
        const filename = dirEntry.getFilename(".");
        const {binary, damage} = trsdos.readFileWithDamage(dirEntry);
        const trs80File = decodeTrs80File(binary, { filename });
        super(filename, binary, trs80File, damage);
        this.trsdos = trsdos;
        this.dirEntry = dirEntry;
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
}

/**
 * Input file that came from a UCSD p-System floppy.
 */
export class UcsdInputFile extends InputFile {
    public readonly ucsd: Ucsd;
    public readonly file: UcsdFile;

    constructor(ucsd: Ucsd, file: UcsdFile) {
        const filename = file.getFilename(".");
        const {binary, damage} = ucsd.readFileWithDamage(file);
        const trs80File = decodeTrs80File(binary, { filename });
        super(filename, binary, trs80File, damage);
        this.ucsd = ucsd;
        this.file = file;
    }

    /**
     * The file's date (blank if the entry has none, padded to line up) and its kind, such as "Code" or "Text".
     */
    public override getDirExtras(): string[] {
        const date = this.getDate();
        return [
            colorDate((date === undefined ? "" : formatDate(date, false, false)).padEnd(10, " ")),
            ucsdFileKindToString(this.file.kind),
        ];
    }

    public override getDate(): Date | undefined {
        return this.file.getDate();
    }

    /**
     * For a text file, the plain host text (see ucsdTextToHost()) unless convertText is false.
     * Other files, and the binary itself, are always the raw bytes.
     */
    public override getExtractedBinary(convertText: boolean): Uint8Array {
        return convertText && this.file.isText() ? ucsdTextToHost(this.binary) : this.binary;
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
     * Tar names are paths, such as "usr/bin/vi".
     */
    public override hasDirectories(): boolean {
        return true;
    }
}

/**
 * Result of loading an input file.
 */
interface LoadedInput {
    // The contained files if the input was a container, otherwise just the input itself.
    inFiles: InputFile[];
    // Whether the input was a container (a floppy, CAS file, or WAV file) that we expanded.
    isContainer: boolean;
}

/**
 * Load the file and, if it can contain other files (floppies, cassettes, and wav files),
 * expand it.
 *
 * @param inFilename the file to load.
 * @param includeSystemFiles whether to include system files from floppies.
 * @param cpmWholeRecords whether CP/M files keep their whole 128-byte records instead of
 * ending text files at their Ctrl-Z.
 * @return the contained files and whether the input was a container. If it wasn't, the
 * result is the single input file.
 */
function loadInputFile(inFilename: string, includeSystemFiles: boolean, cpmWholeRecords: boolean): LoadedInput {
    const inFiles: InputFile[] = [];
    let isContainer = true;

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
            } else if (fileSystem instanceof Ucsd) {
                for (const file of fileSystem.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new UcsdInputFile(fileSystem, file));
                }
            } else if (fileSystem instanceof XenixTar) {
                for (const file of fileSystem.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new XenixTarInputFile(fileSystem, file));
                }
            } else {
                assertNever(fileSystem);
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

    return { inFiles, isContainer };
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
 * Load the file, which must be a container (a floppy, CAS file, or WAV file), and return
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
        throw new ToolError("Can't extract from \"" + inFilename +
            "\": it's not a floppy image, CAS file, or WAV file that can be read");
    }

    return inFiles;
}
