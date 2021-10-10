import * as fs from "fs";
import * as path from "path";
import {Option, program} from "commander";
import {
    CassetteFile,
    CassetteSpeed,
    CmdLoadModuleHeaderChunk,
    CmdProgram,
    CmdProgramBuilder,
    CmdTransferAddressChunk,
    decodeBasicProgram,
    decodeSystemProgram,
    decodeTrs80CassetteFile,
    decodeTrs80File,
    decodeTrsdos,
    Density,
    encodeCmdProgram,
    encodeSystemProgram,
    getTrs80FileExtension,
    HexdumpGenerator,
    isFloppy,
    numberToSide,
    ProgramAnnotation,
    RawBinaryFile,
    Side,
    SystemProgram,
    SystemProgramBuilder,
    TrackGeometry,
    TRS80_SCREEN_BEGIN,
    Trs80File,
    Trsdos,
    TrsdosDirEntry,
    trsdosProtectionLevelToString
} from "trs80-base";
import {concatByteArrays, withCommas} from "teamten-ts-utils";
import {
    binaryAsCasFile,
    BitType,
    casAsAudio,
    concatAudio,
    Decoder,
    DEFAULT_SAMPLE_RATE,
    Program,
    readWavFile,
    Tape,
    writeWavFile
} from "trs80-cassette";
import {version} from "./version.js";
import {addModel3RomEntryPoints, disasmForTrs80, disasmForTrs80Program} from "trs80-disasm";
import {Disasm, instructionsToText} from "z80-disasm";
import chalk from "chalk";
import {
    BasicLevel,
    basicLevelFromString,
    CassettePlayer,
    CGChip,
    Config,
    Keyboard,
    ModelType,
    modelTypeFromString,
    SilentSoundPlayer,
    Trs80,
    Trs80Screen
} from "trs80-emulator";
import http from "http";
import * as url from "url";
import * as ws from "ws";
import {Asm} from "z80-asm";
import {toHex} from "z80-base";

const HELP_TEXT = `
See this page for full documentation:

https://github.com/lkesteloot/trs80/blob/master/packages/trs80-tool/README.md
`

/**
 * Set the chalk color level based on its name. See the --color option.
 * @param levelName
 */
function setColorLevel(levelName: string): void {
    levelName = levelName.toLowerCase();

    switch (levelName) {
        case "auto":
        default:
            // Don't touch the level, let chalk set it.
            break;

        case "off":
            chalk.level = 0;
            break;

        case "16":
            chalk.level = 1;
            break;

        case "256":
            chalk.level = 2;
            break;

        case "16m":
            chalk.level = 3;
            break;
    }
}

/**
 * Return the singular or plural version of a string depending on the count.
 */
function pluralize(count: number, singular: string, plural?: string): string {
    return count === 1 ? singular : plural ?? (singular + "s");
}

/**
 * Return the count and the singular or plural version of a string depending on the count.
 */
function pluralizeWithCount(count: number, singular: string, plural?: string): string {
    return `${withCommas(count)} ${pluralize(count, singular, plural)}`;
}

/**
 * Return the input pathname with the extension replaced.
 * @param pathname input pathname
 * @param extension extension with period.
 */
function replaceExtension(pathname: string, extension: string): string {
    const { dir, name } = path.parse(pathname);
    return path.join(dir, name + extension);
}

/**
 * Super class for files that are nested in another file, such as a floppy or cassette.
 */
abstract class ArchiveFile {
    public readonly filename: string;
    public readonly date: Date | undefined;

    protected constructor(filename: string, date: Date | undefined) {
        this.filename = filename;
        this.date = date;
    }

    public abstract getDirString(): string;
    public abstract getBinary(): Uint8Array;
}

/**
 * Nested file that came from a cassette file.
 */
class WavFile extends ArchiveFile {
    public readonly program: Program;

    constructor(program: Program) {
        super(WavFile.getFilename(program), undefined);
        this.program = program;
    }

    private static getFilename(program: Program): string {
        let extension = ".BIN";
        if (program.isEdtasmProgram()) {
            extension = ".ASM";
        } else if (program.isBasicProgram()) {
            extension = ".BAS";
        } else if (decodeSystemProgram(program.binary) !== undefined) {
            extension = ".3BN";
        }
        return program.getPseudoFilename() + extension;
    }

    public getDirString(): string {
        return this.filename.padEnd(12) + " " +
            withCommas(this.program.binary.length).padStart(8) + "  " +
            this.program.baud + " baud";
    }

    public getBinary(): Uint8Array {
        return this.program.binary;
    }
}

/**
 * Nested file that came from a CAS file.
 */
class CasFile extends ArchiveFile {
    public readonly cassetteFile: CassetteFile;

    constructor(filename: string, cassetteFile: CassetteFile) {
        super(filename, undefined);
        this.cassetteFile = cassetteFile;
    }

    getBinary(): Uint8Array {
        return this.cassetteFile.file.binary;
    }

    getDirString(): string {
        return this.filename.padEnd(14) + " " +
            withCommas(this.cassetteFile.file.binary.length).padStart(8) + "  " +
            (this.cassetteFile.speed === CassetteSpeed.HIGH_SPEED ? "1500" : "500") + " baud";
    }
}

/**
 * Nested file that came from a TRSDOS floppy.
 */
class TrsdosFile extends ArchiveFile {
    public readonly trsdos: Trsdos;
    public readonly file: TrsdosDirEntry;

    constructor(trsdos: Trsdos, file: TrsdosDirEntry) {
        super(file.getFilename("."), file.getDate());
        this.trsdos = trsdos;
        this.file = file;
    }

    public getDirString(): string {
        return this.file.getFilename(".").padEnd(12) + " " +
            withCommas(this.file.getSize()).padStart(8) + " " +
            this.file.getFullDateString() + " " +
            trsdosProtectionLevelToString(this.file.getProtectionLevel(), this.trsdos.version);
    }

    public getBinary(): Uint8Array {
        return this.trsdos.readFile(this.file);
    }
}

/**
 * List of nested files in an archive (floppy or cassette).
 * TODO: I think we can get rid of this and use an array of InputFile objects instead.
 */
class Archive {
    public readonly error: string | undefined;
    public readonly files: ArchiveFile[] = [];
    public readonly tape: Tape | undefined;

    constructor(filename: string) {
        // Read the file.
        let buffer;
        try {
            buffer = fs.readFileSync(filename);
        } catch (e) {
            this.error = "Can't open \"" + filename + "\": " + e.message;
            return;
        }

        if (filename.toLowerCase().endsWith(".wav")) {
            // Decode the cassette.
            const wavFile = readWavFile(buffer.buffer);
            this.tape = new Tape(filename, wavFile);
            const decoder = new Decoder(this.tape);
            decoder.decode();

            for (const program of this.tape.programs) {
                this.files.push(new WavFile(program));
            }
        } else {
            // Decode the floppy or cassette.
            const file = decodeTrs80File(buffer, filename);

            switch (file.className) {
                case "Jv1FloppyDisk":
                case "Jv3FloppyDisk":
                case "DmkFloppyDisk":
                    const trsdos = decodeTrsdos(file);
                    if (trsdos !== undefined) {
                        for (const dirEntry of trsdos.dirEntries) {
                            this.files.push(new TrsdosFile(trsdos, dirEntry));
                        }
                    } else {
                        this.error = "Operating system of floppy is unrecognized.";
                    }
                    break;

                case "Cassette":
                    let counter = 1;
                    const name = path.parse(filename).name;
                    for (const cassetteFile of file.files) {
                        const cassetteFilename = name + "-T" + counter + getTrs80FileExtension(cassetteFile.file);
                        this.files.push(new CasFile(cassetteFilename, cassetteFile));
                        counter += 1;
                    }
                    break;

                default:
                    this.error = "This file type (" + file.className + ") does not have nested files.";
                    break;
            }
        }
    }

    /**
     * Get the file for the given filename, which should have a dot separator for the extension.
     */
    public getFileByFilename(filename: string): ArchiveFile | undefined {
        filename = filename.toUpperCase();

        for (const file of this.files) {
            if (file.filename === filename) {
                return file;
            }
        }

        return undefined;
    }
}

/**
 * Information about each input file.
 */
class InputFile {
    public readonly filename: string;
    public readonly trs80File: Trs80File;
    public readonly baud: number | undefined;
    public readonly date: Date | undefined;

    constructor(filename: string, trs80File: Trs80File, baud?: number, date?: Date) {
        this.filename = filename;
        this.trs80File = trs80File;
        this.baud = baud;
        this.date = date;
    }

    /**
     * Return a new InputFile but with the file replaced by the parameter.
     */
    public withFile(trs80File: Trs80File): InputFile {
        return new InputFile(this.filename, trs80File, this.baud, this.date);
    }
}

/**
 * Print one-line string description of the input file, and more if verbose.
 */
function printInfoForFile(filename: string, verbose: boolean): void {
    const {base, ext} = path.parse(filename);

    let description: string;
    const verboseLines: string[] = [];
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e) {
        console.log(filename + ": Can't open file: " + e.message);
        return;
    }

    if (ext.toLowerCase() == ".wav") {
        // Parse a cassette WAV file.
        const wavFile = readWavFile(buffer.buffer);
        const tape = new Tape(base, wavFile);
        const decoder = new Decoder(tape);
        decoder.decode();
        description = "Audio file with " + pluralizeWithCount(tape.programs.length, "file");
    } else {
        try {
            const trs80File = decodeTrs80File(buffer, filename);
            if (trs80File.error !== undefined) {
                description = trs80File.error;
            } else {
                description = trs80File.getDescription();

                if (isFloppy(trs80File)) {
                    const trsdos = decodeTrsdos(trs80File);
                    if (trsdos !== undefined) {
                        description += ", " + trsdos.getOperatingSystemName() + " " + trsdos.getVersion() +
                            " with " + pluralizeWithCount(trsdos.dirEntries.length, "file");
                    }

                    if (verbose) {
                        function getTrackGeometryInfo(trackGeometry: TrackGeometry): string {
                            return [`sectors ${trackGeometry.firstSector} to ${trackGeometry.lastSector}`,
                                `sides ${trackGeometry.firstSide} to ${trackGeometry.lastSide}`,
                                `${trackGeometry.density === Density.SINGLE ? "single" : "double"} density`,
                                `${trackGeometry.sectorSize} bytes per sector`].join(", ");
                        }

                        const geometry = trs80File.getGeometry();
                        const firstTrack = geometry.firstTrack;
                        const lastTrack = geometry.lastTrack;
                        if (geometry.hasHomogenousGeometry()) {
                            verboseLines.push(`Tracks ${firstTrack.trackNumber} to ${lastTrack.trackNumber}, ` +
                                getTrackGeometryInfo(firstTrack));
                        } else {
                            verboseLines.push(
                                `Tracks ${firstTrack.trackNumber} to ${lastTrack.trackNumber}`,
                                `On track ${firstTrack.trackNumber}, ` + getTrackGeometryInfo(firstTrack),
                                `On remaining tracks, ` + getTrackGeometryInfo(lastTrack));
                        }

                        if (trsdos !== undefined) {
                            if (trsdos.gatInfo.name !== "") {
                                verboseLines.push("Floppy name: " + trsdos.gatInfo.name);
                            }
                            if (trsdos.gatInfo.date !== "") {
                                verboseLines.push("Floppy date: " + trsdos.gatInfo.date);
                            }
                            if (trsdos.gatInfo.autoCommand !== "") {
                                verboseLines.push("Auto command: " + trsdos.gatInfo.autoCommand);
                            }
                        }
                    }
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
    for (const line of verboseLines) {
        console.log("    " + line);
    }
}

/**
 * Handle the "dir" command.
 */
function dir(infile: string): void {
    const archive = new Archive(infile);
    if (archive.error !== undefined) {
        console.log(archive.error);
    } else {
        if (archive.files.length === 0) {
            console.log("No files");
        } else {
            for (const file of archive.files) {
                console.log(file.getDirString());
            }
        }
    }
}

/**
 * Handle the "info" command.
 */
function info(infiles: string[], verbose: boolean): void {
    for (const infile of infiles) {
        printInfoForFile(infile, verbose);
    }
}

/**
 * Handle the "extract" command.
 */
function extract(infile: string, outfile: string): void {
    const archive = new Archive(infile);
    if (archive.error !== undefined) {
        console.log(archive.error);
        process.exit(1);
    } else {
        // See if outfile is an existing directory.
        if (fs.existsSync(outfile) && fs.statSync(outfile).isDirectory()) {
            // Extract all files to this directory.
            for (const file of archive.files) {
                const binary = file.getBinary();
                const outPathname = path.join(outfile, file.filename);
                fs.writeFileSync(outPathname, binary);
                if (file.date !== undefined) {
                    fs.utimesSync(outPathname, file.date, file.date);
                }
                console.log("Extracted " + file.filename + " to " + outPathname);
            }
        } else {
            // Break apart outfile.
            const { base, ext } = path.parse(outfile);

            // See if it's a JSON file.
            if (ext.toLowerCase() === ".json") {
                // Output metadata to JSON file.
                const fullData: any = {
                    programs: [],
                    version: 1,
                };
                if (archive.tape !== undefined) {
                    fullData.sampleRate = archive.tape.sampleRate;
                }
                for (let i = 0; i < archive.files.length; i++) {
                    const file = archive.files[i];
                    const programData: any = {
                        name: file.filename,
                    };
                    fullData.programs.push(programData);

                    if (file instanceof WavFile) {
                        const program = file.program;

                        programData.trackNumber = program.trackNumber;
                        programData.copyNumber = program.copyNumber;
                        programData.startFrame = program.startFrame;
                        programData.endFrame = program.endFrame;
                        programData.speed = program.baud;
                        programData.length = program.binary.length;

                        // Decode various formats.
                        programData.type = "unknown";

                        // Analyze system program.
                        const fileBinary = file.getBinary();
                        const systemProgram = decodeSystemProgram(fileBinary);
                        if (systemProgram !== undefined) {
                            programData.type = "systemProgram";
                            programData.filename = systemProgram.filename;
                            programData.chunkCount = systemProgram.chunks.length;

                            // Check for checksum errors.
                            let checksumErrors = 0;
                            for (const chunk of systemProgram.chunks) {
                                if (!chunk.isChecksumValid()) {
                                    checksumErrors += 1;
                                }
                            }

                            programData.checksumErrorCount = checksumErrors;
                        }

                        // Label Basic program.
                        const basicProgram = decodeBasicProgram(fileBinary);
                        if (basicProgram !== undefined) {
                            programData.type = "basic";
                        }

                        // Warn about bit errors.
                        programData.errorCount = program.countBitErrors();
                        programData.errors = [];
                        for (const bitData of program.bitData) {
                            if (bitData.bitType === BitType.BAD) {
                                programData.errors.push(Math.round((bitData.startFrame + bitData.endFrame) / 2));
                            }
                        }

                        // See if it's a duplicate.
                        let isDuplicate = false;
                        for (let j = 0; j < i; j++) {
                            const otherProgram = (archive.files[j] as WavFile).program;
                            if (program.sameBinaryAs(otherProgram)) {
                                isDuplicate = true;
                                break;
                            }
                        }
                        programData.isDuplicate = isDuplicate;
                    }

                    if (file instanceof TrsdosFile) {
                        programData.date = file.file.getFullDateString();
                        programData.timestamp = file.file.getDate().getTime();
                        programData.protectionLevel = trsdosProtectionLevelToString(file.file.getProtectionLevel(),
                            file.trsdos.version);
                        programData.size = file.file.getSize();
                        programData.isSystemFile = file.file.isSystemFile();
                        programData.isExtendedEntry = file.file.isExtendedEntry();
                        programData.isHidden = file.file.isHidden();
                        programData.isActive = file.file.isActive();
                    }
                }

                fs.writeFileSync(outfile, JSON.stringify(fullData, undefined, 2));
                console.log("Generated " + outfile);
            } else {
                // Output file contents to file.
                const file = archive.getFileByFilename(base);
                if (file === undefined) {
                    // TODO: Look by name and different extension.
                    console.log("Can't find file " + base);
                } else {
                    const binary = file.getBinary();
                    fs.writeFileSync(outfile, binary);
                    if (file.date !== undefined) {
                        fs.utimesSync(outfile, file.date, file.date);
                    }
                    console.log("Extracted " + file.filename + " to " + outfile);
                }
            }
        }
    }
}

/**
 * Disassemble a program.
 *
 * @param trs80File program to disassemble.
 * @param entryPoints additional entry points in binary.
 */
function disassemble(trs80File: CmdProgram | SystemProgram, entryPoints: number[]):
    [binary: Uint8Array, description: string] {

    const disasm = disasmForTrs80Program(trs80File);
    for (const entryPoint of entryPoints) {
        disasm.addEntryPoint(entryPoint);
    }
    const instructions = disasm.disassemble()
    const text = instructionsToText(instructions).join("\n") + "\n";
    const outBinary = new TextEncoder().encode(text);
    const description = "Disassembled " + (trs80File.className === "CmdProgram" ? "CMD program" : "system program");

    return [outBinary, description];
}

/**
 * Handle the "convert" command.
 *
 * @param inFilenames list of input filenames.
 * @param outFilename single output filename or directory.
 * @param baud optional new baud rate.
 * @param start optional start address of system file.
 * @param entryPoints additional entry points in binary.
 */
function convert(inFilenames: string[], outFilename: string, baud: number | undefined,
                 start: number | "auto" | undefined, entryPoints: number[]): void {

    const inFiles: InputFile[] = [];
    const outputIsDirectory = fs.existsSync(outFilename) && fs.statSync(outFilename).isDirectory();

    // Read all input files into an internal data structure, expanding archives like cassettes and floppies.
    for (const inFilename of inFilenames) {
        const { base, name, ext } = path.parse(inFilename);

        let buffer;
        try {
            buffer = fs.readFileSync(inFilename);
        } catch (e) {
            console.log("Can't open \"" + inFilename + "\": " + e.message);
            process.exit(1);
        }

        if (ext.toLowerCase() == ".wav") {
            // Parse a cassette WAV file.
            const wavFile = readWavFile(buffer.buffer);
            const tape = new Tape(base, wavFile);
            const decoder = new Decoder(tape);
            decoder.decode();
            for (const program of tape.programs) {
                const trs80File = decodeTrs80CassetteFile(program.binary);
                const filename = name + "-" + program.getPseudoFilename() + getTrs80FileExtension(trs80File);
                inFiles.push(new InputFile(filename, trs80File, program.baud));
            }
        } else {
            const trs80File = decodeTrs80File(buffer, inFilename);
            if (trs80File.error !== undefined) {
                console.log("Can't open \"" + inFilename + "\": " + trs80File.error);
                process.exit(1);
            }

            if (isFloppy(trs80File)) {
                const trsdos = decodeTrsdos(trs80File);
                if (trsdos === undefined) {
                    // Should probably fail here. Having the floppy disk itself is probably not
                    // what the user wants.
                    inFiles.push(new InputFile(base, trs80File));
                } else {
                    // Expand floppy.
                    for (const dirEntry of trsdos.dirEntries) {
                        const trsdosFilename = dirEntry.getFilename(".");
                        const trsdosBinary = trsdos.readFile(dirEntry);
                        // Don't decode if we're going to just write files to disk anyway.
                        const trsdosTrs80File = outputIsDirectory
                            ? new RawBinaryFile(trsdosBinary)
                            : decodeTrs80File(trsdosBinary, trsdosFilename);
                        inFiles.push(new InputFile(trsdosFilename, trsdosTrs80File, undefined, dirEntry.getDate()));
                    }
                }
            } else if (trs80File.className === "Cassette") {
                // Expand .CAS file.
                let counter = 1;
                for (const cassetteFile of trs80File.files) {
                    const filename = name + "-T" + counter + getTrs80FileExtension(cassetteFile.file);
                    const baud = cassetteFile.speed === CassetteSpeed.LOW_SPEED ? 500 : 1500;
                    inFiles.push(new InputFile(filename, cassetteFile.file, baud));
                    counter++;
                }
            } else {
                inFiles.push(new InputFile(base, trs80File));
            }
        }
    }

    // Update start address if requested.
    if (start !== undefined) {
        for (let i = 0; i < inFiles.length; i++) {
            const trs80File = inFiles[i].trs80File;
            let newTrs80File: Trs80File | undefined;

            if (trs80File.className === "SystemProgram") {
                if (start === "auto") {
                    if (trs80File.entryPointAddress === 0) {
                        const guessAddress = trs80File.guessEntryAddress();
                        if (guessAddress !== undefined) {
                            newTrs80File = trs80File.withEntryPointAddress(guessAddress);
                        }
                    }
                } else {
                    newTrs80File = trs80File.withEntryPointAddress(start);
                }
            }

            if (newTrs80File !== undefined) {
                inFiles[i] = inFiles[i].withFile(newTrs80File);
            }
        }
    }

    // If output is existing directory, put all input files there.
    if (outputIsDirectory) {
        for (const infile of inFiles) {
            const outpath = path.join(outFilename, infile.filename);
            fs.writeFileSync(outpath, infile.trs80File.binary);
            if (infile.date !== undefined) {
                fs.utimesSync(outpath, infile.date, infile.date);
            }
            console.log("Wrote " + outpath + " (" +
                pluralizeWithCount(infile.trs80File.binary.length, "byte") + ")");
        }
    } else {
        // Output is a file. Its extension will help us determine how to convert the input files.
        const outExt = path.parse(outFilename).ext.toLowerCase();
        if (outExt === "") {
            console.log("No file extension on output file \"" + outFilename + "\", don't know how to convert");
            process.exit(1);
        }

        // See if input is a single file.
        if (inFiles.length === 1) {
            // Convert individual file.
            const infile = inFiles[0];
            const inName = path.parse(infile.filename).name;
            let outBinary: Uint8Array;
            let description: string;

            switch (infile.trs80File.className) {
                case "RawBinaryFile":
                    console.log("Cannot convert unknown file type of " + infile.filename);
                    process.exit(1);
                    break;

                case "BasicProgram":
                    switch (outExt) {
                        case ".bas":
                            // Write as-is.
                            outBinary = infile.trs80File.binary;
                            description = "Basic file (tokenized)";
                            break;

                        case ".asc":
                            // Convert to ASCII.
                            outBinary = Buffer.from(infile.trs80File.asAscii());
                            description = "Basic file (plain text)";
                            break;

                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = (baud ?? infile.baud) ?? 500;
                            outBinary = binaryAsCasFile(infile.trs80File.asCassetteBinary(), outBaud);
                            description = "Basic file in " + (outBaud >= 1500 ? "high" : "low") + " speed CAS file";
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = (baud ?? infile.baud) ?? 500;
                            const cas = binaryAsCasFile(infile.trs80File.asCassetteBinary(), outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            description = "Basic file in " + baud + " baud WAV file";
                            break;
                        }

                        default:
                            console.log("Can't convert a Basic program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;

                case "Jv1FloppyDisk":
                case "Jv3FloppyDisk":
                case "DmkFloppyDisk":
                case "Cassette":
                    console.log("Files of type \"" + infile.trs80File.getDescription + "\" are not yet supported");
                    process.exit(1);
                    break;

                case "SystemProgram":
                    switch (outExt) {
                        case ".3bn":
                            // Write as-is.
                            outBinary = infile.trs80File.binary;
                            description = infile.trs80File.getDescription();
                            break;

                        case ".cmd": {
                            // Convert to CMD program.
                            const cmdProgram = infile.trs80File.toCmdProgram(inName.toUpperCase());
                            outBinary = cmdProgram.binary;
                            description = cmdProgram.getDescription();
                            break;
                        }

                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = (baud ?? infile.baud) ?? 500;
                            outBinary = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            description = infile.trs80File.getDescription() + " in " +
                                (outBaud >= 1500 ? "high" : "low") + " speed CAS file";
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = (baud ?? infile.baud) ?? 500;
                            const cas = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            description = infile.trs80File.getDescription() + " in " + outBaud + " baud WAV file";
                            break;
                        }

                        case ".lst":
                            [outBinary, description] = disassemble(infile.trs80File, entryPoints);
                            break;

                        default:
                            console.log("Can't convert a system program program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;

                case "CmdProgram":
                    switch (outExt) {
                        case ".cmd":
                            // Write as-is.
                            outBinary = infile.trs80File.binary;
                            description = infile.trs80File.getDescription();
                            break;

                        case ".3bn": {
                            // Convert to system program.
                            const systemProgram = infile.trs80File.toSystemProgram(inName.toUpperCase());
                            outBinary = systemProgram.binary;
                            description = systemProgram.getDescription();
                            break;
                        }

                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = (baud ?? infile.baud) ?? 500;
                            const systemProgram = infile.trs80File.toSystemProgram(inName.toUpperCase());
                            const sysBinary = systemProgram.binary;
                            outBinary = binaryAsCasFile(sysBinary, outBaud);
                            description = systemProgram.getDescription() + " in " +
                                (outBaud >= 1500 ? "high" : "low") + " speed CAS file";
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = (baud ?? infile.baud) ?? 500;
                            const systemProgram = infile.trs80File.toSystemProgram(inName.toUpperCase());
                            const sysBinary = systemProgram.binary;
                            const cas = binaryAsCasFile(sysBinary, outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            description = systemProgram.getDescription() + " in " + outBaud + " baud WAV file";
                            break;
                        }

                        case ".lst":
                            [outBinary, description] = disassemble(infile.trs80File, entryPoints);
                            break;

                        default:
                            console.log("Can't convert a CMD program to " + outExt.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;
            }

            fs.writeFileSync(outFilename, outBinary);
            console.log("Wrote " + outFilename + ": " + description);
        } else {
            // Make archive.
            if (outExt === ".cas" || outExt === ".wav") {
                // Make the individual cas files and their baud rate.
                const outCasFiles: {cas: Uint8Array, baud: number}[] = [];
                for (const inFile of inFiles) {
                    // Convert to cassette format if necessary.
                    let outBinary: Uint8Array;
                    let description: string;
                    switch (inFile.trs80File.className) {
                        case "RawBinaryFile":
                        case "SystemProgram":
                            // Keep as-is.
                            outBinary = inFile.trs80File.binary;
                            description = inFile.trs80File.getDescription();
                            break;
                        case "BasicProgram":
                            outBinary = inFile.trs80File.asCassetteBinary();
                            description = inFile.trs80File.getDescription();
                            break;
                        case "Jv1FloppyDisk":
                        case "Jv3FloppyDisk":
                        case "DmkFloppyDisk":
                        case "Cassette":
                            // Shouldn't happen, we split up archives.
                            console.log(`Can't put ${inFile.trs80File.getDescription()} into a ${outExt.toUpperCase()} file`);
                            process.exit(1);
                            break;
                        case "CmdProgram": {
                            // Convert to system program first.
                            const inName = path.parse(inFile.filename).name;
                            const systemProgram = inFile.trs80File.toSystemProgram(inName.toUpperCase());
                            outBinary = systemProgram.binary;
                            description = systemProgram.getDescription();
                            break;
                        }
                    }

                    const outBaud = (baud ?? inFile.baud) ?? 500;
                    outCasFiles.push({cas: binaryAsCasFile(outBinary, outBaud), baud: outBaud});
                    console.log("In output file: " + description);
                }

                if (outExt === ".cas") {
                    fs.writeFileSync(outFilename, concatByteArrays(outCasFiles.map(outCas => outCas.cas)));
                    console.log("Wrote " + outFilename + ": CAS file with " +
                        pluralizeWithCount(outCasFiles.length, "file"));
                } else {
                    // outExt == ".wav"
                    const audioParts: Int16Array[] = [];

                    for (const outCas of outCasFiles) {
                        // One second of silence before each program.
                        audioParts.push(new Int16Array(DEFAULT_SAMPLE_RATE));

                        // Convert program to audio.
                        audioParts.push(casAsAudio(outCas.cas, outCas.baud, DEFAULT_SAMPLE_RATE));

                        // One second of silence after each program.
                        audioParts.push(new Int16Array(DEFAULT_SAMPLE_RATE));
                    }

                    const wavBinary = writeWavFile(concatAudio(audioParts), DEFAULT_SAMPLE_RATE);
                    fs.writeFileSync(outFilename, wavBinary);
                    console.log("Wrote " + outFilename + ": WAV file with " +
                        pluralizeWithCount(outCasFiles.length, "file"));
                }
            } else {
                // TODO handle floppy.
                console.log("Can't put multiple files into " + outExt.toUpperCase());
            }
        }
    }
}

/**
 * Handle the "sectors" command.
 */
function sectors(filename: string, showContents: boolean): void {
    // Read the file.
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e) {
        console.log("Can't open \"" + filename + "\": " + e.message);
        return;
    }

    // Decode the floppy or cassette.
    const file = decodeTrs80File(buffer, filename);
    if (!isFloppy(file)) {
        console.log("Not a recognized floppy file: " + filename);
        return;
    }

    if (file.error !== undefined) {
        console.log(filename + ": " + file.error);
        return;
    }

    console.log(filename + ": " + file.getDescription());

    const geometry = file.getGeometry();
    const minSectorNumber = Math.min(geometry.firstTrack.firstSector, geometry.lastTrack.firstSector);
    const maxSectorNumber = Math.max(geometry.firstTrack.lastSector, geometry.lastTrack.lastSector);

    const usedLetters = new Set<string>();

    const CHALK_FOR_LETTER: { [letter: string]: chalk.Chalk } = {
        "-": chalk.gray,
        "C": chalk.red,
        "X": chalk.yellow,
        "S": chalk.reset,
        "D": chalk.reset,
    };

    const LEGEND_FOR_LETTER: { [letter: string]: string } = {
        "-": "Missing sector",
        "C": "CRC error",
        "X": "Deleted sector",
        "S": "Single density",
        "D": "Double density",
    }

    for (let sideNumber = 0; sideNumber < geometry.numSides(); sideNumber++) {
        const side = numberToSide(sideNumber);
        const sideName = side === Side.FRONT ? "Front" : "Back";
        const lineParts: string[] = [sideName.padStart(6, " ") + "  "];
        for (let sectorNumber = minSectorNumber; sectorNumber <= maxSectorNumber; sectorNumber++) {
            lineParts.push(sectorNumber.toString().padStart(3, " "));
        }
        console.log(lineParts.join(""));

        for (let trackNumber = geometry.firstTrack.trackNumber; trackNumber <= geometry.lastTrack.trackNumber; trackNumber++) {
            const lineParts: string[] = [trackNumber.toString().padStart(6, " ") + "  "];
            for (let sectorNumber = minSectorNumber; sectorNumber <= maxSectorNumber; sectorNumber++) {
                const sectorData = file.readSector(trackNumber, side, sectorNumber);
                let text: string;
                if (sectorData === undefined) {
                    text = "-";
                } else if (sectorData.crcError) {
                    text = "C";
                } else if (sectorData.deleted) {
                    text = "X";
                } else if (sectorData.density === Density.SINGLE) {
                    text = "S";
                } else {
                    text = "D";
                }

                usedLetters.add(text);
                const color = CHALK_FOR_LETTER[text] ?? chalk.reset;
                lineParts.push("".padEnd(3 - text.length, " ") + color(text));
            }
            console.log(lineParts.join(""));
        }

        console.log("");
    }

    if (usedLetters.size > 0) {
        const legendLetters = Array.from(usedLetters.values());
        legendLetters.sort();

        console.log("Legend:");
        for (const legendLetter of legendLetters) {
            const explanation = LEGEND_FOR_LETTER[legendLetter] ?? "Unknown";
            const color = CHALK_FOR_LETTER[legendLetter] ?? chalk.reset;
            console.log("    " + color(legendLetter) + ": " + explanation);
        }
    }

    if (showContents) {
        // Dump each sector.
        for (let trackNumber = geometry.firstTrack.trackNumber; trackNumber <= geometry.lastTrack.trackNumber; trackNumber++) {
            const trackGeometry = geometry.getTrackGeometry(trackNumber);
            for (const side of trackGeometry.sides()) {
                for (let sectorNumber = trackGeometry.firstSector; sectorNumber <= trackGeometry.lastSector; sectorNumber++) {
                    let header = `Track ${trackNumber}, side ${side}, sector ${sectorNumber}: `;

                    const sector = file.readSector(trackNumber, side, sectorNumber);
                    if (sector === undefined) {
                        header += "missing";
                    } else {
                        header += (sector.density === Density.SINGLE ? "single" : "double") + " density" +
                            (sector.deleted ? ", marked as deleted" : "");
                    }
                    console.log(header);

                    if (sector !== undefined) {
                        hexdumpBinary(sector.data, false, []);
                    }

                    console.log("");
                }
            }
        }
    }
}

/**
 * Represents a span of characters in the hexdump with a single set of classes.
 */
class HexdumpSpan {
    public text: string;
    public readonly classes: string[];

    constructor(text: string, classes: string[]) {
        this.text = text;
        this.classes = classes;
    }
}

/**
 * Hexdump generator for console output.
 */
class ConsoleHexdumpGenerator extends HexdumpGenerator<HexdumpSpan[], HexdumpSpan> {
    constructor(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]) {
        super(binary, collapse, annotations);
    }

    protected newLine(): HexdumpSpan[] {
        return [];
    }

    protected getLineText(line: HexdumpSpan[]): string {
        return line.map(span => span.text).join("");
    }

    protected newSpan(line: HexdumpSpan[], text: string, ...cssClass: string[]): HexdumpSpan {
        const span = new HexdumpSpan(text, cssClass);
        line.push(span);
        return span;
    }

    protected addTextToSpan(span: HexdumpSpan, text: string): void {
        span.text += text;
    }
}

/**
 * Hex dump a binary array.
 */
function hexdumpBinary(binary: Uint8Array, collapse: boolean, annotations: ProgramAnnotation[]): void {
    const hexdump = new ConsoleHexdumpGenerator(binary, collapse, annotations);
    for (const line of hexdump.generate()) {
        console.log(line.map(span => {
            if (span.classes.indexOf("outside-annotation") >= 0) {
                if (chalk.level === 0) {
                    // Hide altogether.
                    return "".padEnd(span.text.length, " ");
                } else {
                    return chalk.dim(span.text);
                }
            } else {
                if (span.classes.indexOf("ascii-unprintable") >= 0) {
                    return chalk.dim(span.text);
                }
                return span.text;
            }
        }).join(""));
    }
}

/**
 * Handle the "hexdump" command.
 */
function hexdump(filename: string, collapse: boolean): void {
    // Read the file.
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e) {
        console.log("Can't open \"" + filename + "\": " + e.message);
        return;
    }

    // Decode the floppy or cassette.
    const file = decodeTrs80File(buffer, filename);
    if (file.error !== undefined) {
        console.log(filename + ": " + file.error);
        return;
    }

    hexdumpBinary(file.binary, collapse, file.annotations);
}

/**
 * Handle the "disasm" command.
 */
function disasm(filename: string, org: number | undefined, entryPoints: number[]) {
    // Read the file.
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e) {
        console.log("Can't open \"" + filename + "\": " + e.message);
        return;
    }

    // Create and configure the disassembler.
    let disasm: Disasm;
    const ext = path.extname(filename).toUpperCase();
    if (ext === ".CMD" || ext === ".3BN") {
        const trs80File = decodeTrs80File(buffer, filename);
        if (trs80File.className !== "CmdProgram" && trs80File.className !== "SystemProgram") {
            console.log("Can't parse program in " + filename);
            return;
        }
        disasm = disasmForTrs80Program(trs80File);
    } else if (ext === ".ROM" || ext === ".BIN") {
        disasm = disasmForTrs80();
        disasm.addChunk(buffer, org ?? 0);
        if (org !== undefined || entryPoints.length === 0) {
            disasm.addEntryPoint(org ?? 0);
        }
        addModel3RomEntryPoints(disasm);
    } else {
        console.log("Can't disassemble files of type " + ext);
        return;
    }

    // Add extra entry points, if any.
    for (const entryPoint of entryPoints) {
        disasm.addEntryPoint(entryPoint);
    }

    const instructions = disasm.disassemble()
    const text = instructionsToText(instructions).join("\n");
    console.log(text);
}

function connectXray(trs80: Trs80, keyboard: Keyboard): void {
    const host = "0.0.0.0";
    const port = 8080;

    function serveFile(res: http.ServerResponse, filename: string, mimetype: string): void {
        let contents;
        console.log("Serving " + filename);

        try {
            contents = fs.readFileSync("xray/" + filename);
        } catch (e) {
            console.log("Exception reading: " + e.message);
            res.writeHead(404);
            res.end("File not found");
            return;
        }

        res.setHeader("Content-Type", mimetype);
        res.writeHead(200);
        res.end(contents);
    }

    function requestListener(req: http.IncomingMessage, res: http.ServerResponse) {
        console.log(req.url);
        if (req.url === undefined) {
            console.log("Got undefined URL");
            return;
        }

        const { pathname } = url.parse(req.url); // TODO deprecated

        switch (pathname) {
            case "/":
            case "/index.html":
                serveFile(res, "index.html", "text/html");
                break;

            case "/trs_xray.js":
                serveFile(res, "trs_xray.js", "text/javascript");
                break;

            case "/trs_xray.css":
                serveFile(res, "trs_xray.css", "text/css");
                break;

            case "/channel":
                console.log("/channel was fetched");
                break;

            default:
                console.log("URL unknown: " + req.url);
                res.writeHead(404);
                res.end("File not found");
                break;
        }
    }

    function sendUpdate(ws: ws.WebSocket) {
        const regs = trs80.z80.regs;
        const info = {
            context: {
                system_name: "trs80-tool",
                model: 3, // TODO get from config.
                running: trs80.started,
                alt_single_step_mode: false,
            },
            breakpoints: [],
            registers: {
                pc: regs.pc,
                sp: regs.sp,
                af: regs.af,
                bc: regs.bc,
                de: regs.de,
                hl: regs.hl,
                af_prime: regs.afPrime,
                bc_prime: regs.bcPrime,
                de_prime: regs.dePrime,
                hl_prime: regs.hlPrime,
                ix: regs.ix,
                iy: regs.iy,
                i: regs.i,
                r_1: regs.r,
                r_2: regs.r7 & 0x7F,
                z80_t_state_counter: trs80.tStateCount,
                z80_clockspeed: trs80.clockHz,
                z80_iff1: regs.iff1,
                z80_iff2: regs.iff2,
                z80_interrupt_mode: regs.im,
            },
        };

        ws.send(JSON.stringify(info));
    }

    function sendMemory(ws: ws.WebSocket): void {
        // TODO parse non-force version.
        const MEM_SIZE = 0x10000; // TODO auto-detect.
        const memory = Buffer.alloc(MEM_SIZE + 2);
        for (let i = 0; i < MEM_SIZE; i++) {
            memory[i + 2] = trs80.readMemory(i);
        }
        // TODO first two bytes are start address in big-endian.
        ws.send(memory, {
            binary: true,
        });
    }

    const wss = new ws.WebSocketServer({ noServer: true });
    wss.on("connection", ws => {
        console.log("wss connection");

        ws.on("message", message => {
            const command = message.toString();
            const parts = command.split("/");

            if (parts[0] === "action") {
                switch (parts[1]) {
                    case "refresh":
                        sendUpdate(ws);
                        break;

                    case "step":
                        trs80.step();
                        sendUpdate(ws);
                        break;

                    case "continue":
                        trs80.start();
                        sendUpdate(ws);
                        break;

                    case "stop":
                        trs80.stop();
                        sendUpdate(ws);
                        break;

                    case "soft_reset":
                    case "hard_reset":
                        trs80.reset(); // TODO handle soft/hard distinction.
                        break;

                    case "key_event": {
                        const press = parts[2] === "1";
                        const what = parts[3] === "1";
                        const key = parts[4];
                        keyboard.keyEvent(key, press);
                        break;
                    }

                    case "get_memory":
                        sendMemory(ws);
                        break;

                    default:
                        console.log("Unknown command " + command);
                        break;
                }
            } else {
                console.log("Unknown command: " + command);
            }
        });

        setInterval(() => {
            if (trs80.started) {
                sendUpdate(ws);
                sendMemory(ws);
            }
        }, 100);
    });

    const server = http.createServer(requestListener);
    server.on("upgrade", (request, socket, head) => {
        if (request.url === undefined) {
            console.log("upgrade URL is undefined");
            return;
        }
        const { pathname } = url.parse(request.url); // TODO deprecated
        console.log("upgrade", request.url, pathname, head.toString());

        if (pathname === '/channel') {
            console.log("upgrade channel");
            wss.handleUpgrade(request, socket, head, ws => {
                console.log("upgrade handled", head);
                wss.emit("connection", ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    server.listen(port, host, () => {
        console.log(`Server is running on http://${host}:${port}`);
    });
}


/**
 * Handle the "run" command.
 */
function run(programFile: string | undefined, xray: boolean, config: Config) {
    // Size of screen.
    const WIDTH = 64;
    const HEIGHT = 16;

    /**
     * Class to update a VT-100 screen.
     */
    class Vt100Control {
        // Cursor position, 1-based, relative to where it was when we started the program.
        private row: number = 1;
        private col: number = 1;
        private savedRow: number = 1;
        private savedCol: number = 1;

        /**
         * Save the current position, and think of it as being at the specified location.
         */
        public saveCursorPositionAs(row: number, col: number): void {
            process.stdout.write("\x1b7");
            this.savedRow = row;
            this.savedCol = col;
        }

        /**
         * Restore the position to where it was when {@link saveCursorPositionAs} was called.
         */
        public restoreCursorPosition(): void {
            process.stdout.write("\x1b8");
            this.row = this.savedRow;
            this.col = this.savedCol;
        }

        /**
         * Move cursor to specified location.
         *
         * @param row 1-based line number.
         * @param col 1-base column number.
         */
        public moveTo(row: number, col: number): void {
            if (row < this.row) {
                process.stdout.write("\x1b[" + (this.row - row) + "A");
            } else if (row > this.row) {
                process.stdout.write("\x1b[" + (row - this.row) + "B");
            }

            if (col < this.col) {
                process.stdout.write("\x1b[" + (this.col - col) + "D");
            } else if (col > this.col) {
                process.stdout.write("\x1b[" + (col - this.col) + "C");
            }

            this.row = row;
            this.col = col;
        }

        /**
         * Inform us that the cursor has moved forward count character.
         */
        public advancedCol(count: number = 1): void {
            this.col += count;
        }

        /**
         * Inform us that the cursor has moved down count rows and reset back to the left column.
         */
        public advancedRow(count: number = 1): void {
            this.row += count;
            this.col = 1;
        }
    }

    /**
     * Screen implementation for an ANSI TTY.
     */
    class TtyScreen extends Trs80Screen {
        // Cache of what we've drawn already.
        private readonly drawnScreen = new Uint8Array(WIDTH*HEIGHT);
        private readonly vt100Control = new Vt100Control();
        private lastCursorIndex: number | undefined = undefined;
        private lastUnderscoreIndex = 0;

        constructor() {
            super();
            this.drawFrame();
            this.vt100Control.saveCursorPositionAs(HEIGHT + 3, 1);

            // Update cursor periodically. Have to do this on a timer since the memory location
            // can be updated anytime.
            setInterval(() => this.checkCursorPosition(false), 10);
        }

        public exit(): void {
            this.vt100Control.moveTo(HEIGHT + 3, 1);
        }

        /**
         * Draw the frame around the screen.
         */
        private drawFrame(): void {
            // Draw frame.
            const color = chalk.green;
            process.stdout.write(color("+" + "-".repeat(WIDTH) + "+\n"));
            for (let row = 0; row < HEIGHT; row++) {
                process.stdout.write(color("|" + " ".repeat(WIDTH) + "|\n"));
            }
            process.stdout.write(color("+" + "-".repeat(WIDTH) + "+\n"));
            this.vt100Control.advancedRow(HEIGHT + 2);
        }

        setConfig(config: Config) {
            // Nothing.
        }

        writeChar(address: number, value: number) {
            const index = address - TRS80_SCREEN_BEGIN;
            if (index >= 0 && index < WIDTH * HEIGHT) {
                this.updateScreen(false);
            }
        }

        /**
         * Redraw any characters that have changed since the old screen.
         */
        private updateScreen(force: boolean): void {
            let row = 1;
            let col = 1;

            for (let i = 0; i < WIDTH*HEIGHT; i++) {
                // Draw a space at the current cursor.
                let value = i === this.lastCursorIndex ? 32 : trs80.readMemory(i + TRS80_SCREEN_BEGIN);
                if (config.modelType === ModelType.MODEL1) {
                    // Level 2 used the letters from values 0 to 31.
                    if (value < 32) {
                        value += 64;
                    } else if (config.cgChip === CGChip.ORIGINAL && value >= 96 && value < 128) {
                        value -= 64;
                    }
                }

                if (force || value !== this.drawnScreen[i]) {
                    // Keep track of where we saw our last underscore, for Level 1 support.
                    if (value === 95) {
                        this.lastUnderscoreIndex = i;
                    }

                    // Replace non-ASCII.
                    const ch = value < 32 || value >= 127 ? chalk.gray("?") : String.fromCodePoint(value);

                    // Draw at location.
                    this.vt100Control.moveTo(row + 1, col + 1);
                    process.stdout.write(ch);
                    this.vt100Control.advancedCol();

                    this.drawnScreen[i] = value;
                }

                col += 1;
                if (col === WIDTH + 1) {
                    col = 1;
                    row += 1;
                }
            }
        }

        /**
         * Redraw from memory.
         */
        public redraw(): void {
            this.vt100Control.restoreCursorPosition();
            this.vt100Control.moveTo(1, 1);
            this.drawFrame();
            this.updateScreen(true);
        }

        /**
         * Check RAM for the cursor position and update it.
         *
         * @param forceUpdate force the position update even if it hasn't changed in simulation.
         */
        private checkCursorPosition(forceUpdate: boolean): void {
            // Figure out where the cursor is.
            let cursorIndex;
            if (config.basicLevel === BasicLevel.LEVEL1) {
                // We don't know where the cursor position is stored in Level 1. Guess based on the last
                // underscore we saw.
                cursorIndex = this.lastUnderscoreIndex;
            } else {
                // Get cursor position from RAM.
                const cursorAddress = trs80.readMemory(0x4020) | (trs80.readMemory(0x4021) << 8);
                cursorIndex = cursorAddress - TRS80_SCREEN_BEGIN;
            }

            // Ignore bad values.
            if (cursorIndex < 0 || cursorIndex >= WIDTH*HEIGHT) {
                return;
            }

            this.lastCursorIndex = cursorIndex;
            this.updateScreen(false);

            // 1-based.
            const row = Math.floor(cursorIndex / WIDTH) + 1;
            const col = cursorIndex % WIDTH + 1;

            // Adjust for frame.
            this.vt100Control.moveTo(row + 1, col + 1);
        }
    }

    /**
     * Screen that does nothing.
     */
    class NopScreen extends Trs80Screen {
        setConfig(config: Config) {
            // Nothing.
        }

        writeChar(address: number, value: number) {
            // Nothing.
        }
    }

    /**
     * Keyboard implementation for a TTY. Puts the TTY into raw mode.
     */
    class TtyKeyboard extends Keyboard {
        constructor(screen: TtyScreen) {
            super();

            process.stdin.setRawMode(true);
            process.stdin.on("data", (buffer) => {
                if (buffer.length > 0) {
                    const key = buffer[0];
                    if (key === 0x03) {
                        // Ctrl-C.
                        screen.exit();
                        process.exit();
                    } else if (key === 0x0C) {
                        // Ctrl-L.
                        screen.redraw();
                    } else {
                        let keyName: string;

                        switch (key) {
                            case 8:
                            case 127:
                                keyName = "Backspace";
                                break;

                            case 10:
                            case 13:
                                keyName = "Enter";
                                break;

                            case 27:
                                keyName = "Escape";
                                break;

                            default:
                                keyName = String.fromCodePoint(key);
                                break;
                        }

                        this.keyEvent(keyName, true);
                        this.keyEvent(keyName, false);
                    }
                }
            });
        }
    }

    // Load file if specified.
    let trs80File: Trs80File | undefined = undefined;
    if (programFile !== undefined) {
        let buffer;
        try {
            buffer = fs.readFileSync(programFile);
        } catch (e) {
            console.log(programFile + ": Can't open file: " + e.message);
            return;
        }

        trs80File = decodeTrs80File(buffer, programFile);
        if (trs80File.error !== undefined) {
            console.log(programFile + ": " + trs80File.error);
            return;
        }
    }

    let screen;
    let keyboard;
    if (xray) {
        screen = new NopScreen();
        keyboard = new Keyboard();
    } else {
        screen = new TtyScreen();
        keyboard = new TtyKeyboard(screen);
    }

    const cassette = new CassettePlayer();
    const soundPlayer = new SilentSoundPlayer();
    const trs80 = new Trs80(config, screen, keyboard, cassette, soundPlayer);
    trs80.reset();
    trs80.start();

    if (trs80File !== undefined) {
        trs80.runTrs80File(trs80File);
    }

    if (xray) {
        connectXray(trs80, keyboard);
    }
}

/**
 * Handle the "asm" command.
 */
function asm(srcPathname: string, outPathname: string, baud: number, lstPathname: string | undefined): void {
    // Get the lines for a file.
    function loadFile(filename: string): string[] | undefined {
        try {
            return fs.readFileSync(filename, "utf-8").split(/\r?\n/);
        } catch (e) {
            // File not found.
            return undefined;
        }
    }

    const { name } = path.parse(srcPathname);

    // Assemble program.
    const asm = new Asm(loadFile);
    const sourceFile = asm.assembleFile(srcPathname);
    if (sourceFile === undefined) {
        console.log("Cannot read file " + srcPathname);
        return;
    }

    // Generate listing.
    if (lstPathname !== undefined) {
        const lstFd = fs.openSync(lstPathname, "w");

        for (const line of sourceFile.assembledLines) {
            if (line.binary.length !== 0) {
                // Show four bytes at a time.
                let displayAddress = line.address;
                for (let i = 0; i < line.binary.length; i += 4) {
                    let result = toHex(displayAddress, 4) + ":";
                    for (let j = 0; j < 4 && i + j < line.binary.length; j++) {
                        result += " " + toHex(line.binary[i + j], 2);
                        displayAddress++;
                    }
                    if (i === 0) {
                        result = result.padEnd(24, " ") + line.line;
                    }
                    fs.writeSync(lstFd, result + "\n");
                }
            } else {
                fs.writeSync(lstFd, " ".repeat(24) + line.line + "\n");
            }
            if (line.error !== undefined) {
                fs.writeSync(lstFd, "error: " + line.error + "\n");
            }
        }

        fs.closeSync(lstFd);
    }

    // Show errors.
    let errorCount = 0;
    for (const line of sourceFile.assembledLines) {
        if (line.error !== undefined) {
            console.log(chalk.gray(line.line));
            console.log(chalk.red("error: " + line.error));
            console.log();
            errorCount += 1;
        }
    }

    // Don't generate output if we have errors.
    if (errorCount !== 0) {
        console.log(errorCount + " errors");
        process.exit(1);
    }

    // Generate output.
    const binaryParts: Uint8Array[] = [];
    const extension = path.parse(outPathname).ext.toUpperCase();
    switch (extension) {
        case ".CMD": {
            // Convert to CMD file.
            let entryPointAddress: number | undefined = undefined;
            const builder = new CmdProgramBuilder();
            for (const line of sourceFile.assembledLines) {
                if (line.binary.length > 0 && entryPointAddress === undefined) {
                    entryPointAddress = line.address;
                }
                builder.addBytes(line.address, line.binary);
            }
            const chunks = [
                CmdLoadModuleHeaderChunk.fromFilename(name),
                ... builder.getChunks(),
                CmdTransferAddressChunk.fromEntryPointAddress(entryPointAddress ?? 0),
            ]
            let binary = encodeCmdProgram(chunks);
            binaryParts.push(binary);
            break;
        }

        case ".3BN":
        case ".CAS":
        case ".WAV": {
            // Convert to 3BN file.
            let entryPointAddress: number | undefined = undefined;
            const builder = new SystemProgramBuilder();
            for (const line of sourceFile.assembledLines) {
                if (line.binary.length > 0 && entryPointAddress === undefined) {
                    entryPointAddress = line.address;
                }
                builder.addBytes(line.address, line.binary);
            }
            const chunks = builder.getChunks();
            let binary = encodeSystemProgram(name, chunks, entryPointAddress ?? 0);

            if (extension === ".CAS" || extension === ".WAV") {
                // Convert to CAS.
                binary = binaryAsCasFile(binary, baud);

                if (extension === ".WAV") {
                    // Convert to WAV.
                    const audio = casAsAudio(binary, baud, DEFAULT_SAMPLE_RATE);
                    binary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                }
            }

            binaryParts.push(binary);
            break;
        }

        default:
            console.log("Unknown output type: " + outPathname);
            return;
    }

    // Write output.
    const binFd = fs.openSync(outPathname, "w");
    for (const part of binaryParts) {
        fs.writeSync(binFd, part);
    }
    fs.closeSync(binFd);
}

function main() {
    program
        .storeOptionsAsProperties(false)
        .name("trs80-tool")
        .addHelpText("after", HELP_TEXT)
        .version(version)
        .addOption(new Option("--color <color>", "color output")
            .choices(["off", "16", "256", "16m", "auto"])
            .default("auto"));
    program
        .command("dir <infile>")
        .description("list files in the infile", {
            infile: "WAV, CAS, JV1, JV3, or DMK file (TRSDOS floppies only)",
        })
        .action(infile => {
            dir(infile);
        });
    program
        .command("info <infiles...>")
        .description("show information about each file", {
            infile: "any TRS-80 file",
        })
        .option("--verbose", "output more information about each file")
        .action((infiles, options) => {
            info(infiles, options.verbose);
        });
    program
        .command("convert <files...>")
        .description("convert one or more infiles to one outfile", {
            infile: "WAV, CAS, CMD, 3BN, or BAS file",
            outfile: "WAV, CAS, CMD, 3BN, BAS, or LST file",
        })
        .option("--baud <baud>", "output baud rate (250, 500, 1000, or 1500)")
        .option("--start <address>", "new start address of system program, or \"auto\" to guess")
        .option("--entry <addresses>", "add entry points of binary (comma-separated), for LST output")
        .action((files, options) => {
            const baud = options.baud !== undefined ? parseInt(options.baud) : undefined;
            const start = options.start !== undefined ? options.start === "auto" ? "auto" : parseInt(options.start) : undefined;
            const entryPoints = options.entry !== undefined ? (options.entry as string).split(",").map(x => parseInt(x)) : [];
            if (files.length < 2) {
                console.log("Must specify at least one infile and exactly one outfile");
                process.exit(1);
            }
            const infiles = files.slice(0, files.length - 1);
            const outfile = files[files.length - 1];
            convert(infiles, outfile, baud, start, entryPoints);
        });
    program
        .command("sectors <infiles...>")
        .description("show a sector map for each floppy file", {
            infile: "any TRS-80 floppy file",
        })
        .option("--contents", "show the contents of the sectors")
        .action((infiles, options) => {
            setColorLevel(program.opts().color);
            for (const infile of infiles) {
                sectors(infile, options.contents);
            }
        });
    program
        .command("hexdump <infile>")
        .description("display an annotated hexdump of infile", {
            infile: "WAV, CAS, CMD, 3BN, BAS, JV1, JV3, or DMK",
        })
        .option("--no-collapse", "collapse consecutive identical lines")
        .action((infile, options) => {
            setColorLevel(program.opts().color);
            hexdump(infile, options.collapse);
        });
    program
        .command("asm <infile> <outfile>")
        .description("assemble a program", {
            infile: "ASM file",
            outfile: "CMD, 3BN, CAS, or WAV file",
        })
        .option("--baud <baud>", "baud rate for CAS and WAV file (250, 500, 1000, 1500), defaults to 500")
        .option("--listing <filename>", "generate listing file")
        .action((infile, outfile, options) => {
            setColorLevel(program.opts().color);
            const baud = options.baud === undefined ? 500 : parseInt(options.baud);
            if (baud !== 250 && baud !== 500 && baud !== 1000 && baud !== 1500) {
                console.log("Invalid baud rate: " + options.baud);
                process.exit(1);
            }
            asm(infile, outfile, baud, options.listing);
        });
    program
        .command("disasm <infile>")
        .description("disassemble a program", {
            infile: "CMD, 3BN, ROM, or BIN",
        })
        .option('--org <address>', "where to assume the binary is loaded")
        .option("--entry <addresses>", "add entry points of binary (comma-separated)")
        .action((infile, options) => {
            setColorLevel(program.opts().color);
            const org = options.org === undefined ? undefined : parseInt(options.org);
            const entryPoints = options.entry !== undefined ? (options.entry as string).split(",").map(x => parseInt(x)) : [];
            disasm(infile, org, entryPoints);
        });
    program
        .command("run [program]")
        .description("run a TRS-80 emulator", {
            program: "optional program file to run"
        })
        .option("--xray", "run an xray debug server")
        .option("--model <model>", "which model (1, 3, 4), defaults to 3")
        .option("--level <level>", "which level (1 or 2), defaults to 2")
        .action((program, options) => {
            const modelName = options.model ?? "3";
            const levelName = options.level ?? "2";

            const modelType = modelTypeFromString(modelName);
            if (modelType === undefined) {
                console.log("Invalid model: " + modelName);
                process.exit(1);
            }
            const basicLevel = basicLevelFromString(levelName);
            if (basicLevel === undefined) {
                console.log("Invalid Basic level: " + levelName);
                process.exit(1);
            }

            if (basicLevel === BasicLevel.LEVEL1 && modelType !== ModelType.MODEL1) {
                console.log("Can only run Level 1 Basic with Model I");
                process.exit(1);
            }

            const config = Config.makeDefault()
                .withModelType(modelType)
                .withBasicLevel(basicLevel);
            if (!config.isValid()) {
                // Kinda generic!
                console.log("Invalid model and Basic level configuration");
                process.exit(1);
            }

            run(program, options.xray, config);
        });
    program
        .parse();
}

main();
