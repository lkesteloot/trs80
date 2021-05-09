import * as fs from "fs";
import * as path from "path";
import {program} from "commander";
import {
    decodeBasicProgram,
    decodeSystemProgram,
    decodeTrs80CassetteFile,
    decodeTrs80File,
    decodeTrsdos, getTrs80FileExtension,
    isFloppy,
    Trs80File,
    Trsdos,
    TrsdosDirEntry,
    trsdosProtectionLevelToString
} from "trs80-base";
import {concatByteArrays, withCommas} from "teamten-ts-utils";
import {
    BitType,
    concatAudio,
    Decoder,
    DEFAULT_SAMPLE_RATE,
    makeSilence,
    Program,
    readWavFile,
    Tape,
    writeWavFile,
    wrapHighSpeed, wrapLowSpeed, binaryAsCasFile, casAsAudio
} from "trs80-cassette";
import {version} from "./version.js";

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
    return `${count} ${pluralize(count, singular, plural)}`;
}

/**
 * Super class for files that are nested in another file, such as a floppy or cassette.
 */
abstract class ArchiveFile {
    public readonly filename: string;
    public readonly date: Date | undefined;

    constructor(filename: string, date: Date | undefined) {
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
            this.file.getDateString() + " " +
            trsdosProtectionLevelToString(this.file.getProtectionLevel());
    }

    public getBinary(): Uint8Array {
        return this.trsdos.readFile(this.file);
    }
}

/**
 * List of nested files in an archive (floppy or cassette).
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
            // Decode the floppy.
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
                        this.error = "Can only handle TRSDOS floppies.";
                    }
                    break;

                case "Cassette":
                    const tape = Tape.fromCas(filename, file);
                    for (const program of tape.programs) {
                        this.files.push(new WavFile(program));
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

    constructor(filename: string, trs80File: Trs80File, baud?: number) {
        this.filename = filename;
        this.trs80File = trs80File;
        this.baud = baud;
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
        for (const file of archive.files) {
            console.log(file.getDirString());
        }
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
            const { dir, base, name, ext } = path.parse(outfile);

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
                        programData.date = file.file.getDateString();
                        programData.timestamp = file.file.getDate().getTime();
                        programData.protectionLevel = trsdosProtectionLevelToString(file.file.getProtectionLevel());
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
 * Convert WAV file in Tape format.
 */
function convertTape(tape: Tape, outfile: string, baud: number | undefined): void {
    if (outfile.toLowerCase().endsWith(".wav")) {
        // Generate clean WAV file.
        const wavFileParts: Int16Array[] = [];
        for (const program of tape.programs) {
            if (wavFileParts.length > 0) {
                // Insert some silence between the recordings.
                wavFileParts.push(makeSilence(2, DEFAULT_SAMPLE_RATE));
            }
            wavFileParts.push(program.asAudio(baud));
        }

        fs.writeFileSync(outfile, writeWavFile(concatAudio(wavFileParts), DEFAULT_SAMPLE_RATE));
        console.log("Generated " + outfile + " with " + pluralizeWithCount(tape.programs.length, "program"));
    } else if (outfile.toLowerCase().endsWith(".cas")) {
        // Output CAS version of WAV file.
        const casFileParts: Uint8Array[] = [];
        for (const program of tape.programs) {
            casFileParts.push(program.asCasFile(baud));
        }
        fs.writeFileSync(outfile, concatByteArrays(casFileParts));
        console.log("Generated " + outfile + " with " + pluralizeWithCount(tape.programs.length, "program"));
    } else {
        console.log("Can only convert WAV files to WAV and CAS files.");
        process.exit(1);
    }
}

/**
 * Handle the "convert" command.
 */
function convert(infilenames: string[], outFilename: string, baud: number | undefined): void {
    const infiles: InputFile[] = [];

    // Read all input files into an internal data structure, expanding archives like cassettes and floppies.
    for (const infilename of infilenames) {
        const { base, name, ext } = path.parse(infilename);

        let buffer;
        try {
            buffer = fs.readFileSync(infilename);
        } catch (e) {
            console.log("Can't open \"" + infilename + "\": " + e.message);
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
                infiles.push(new InputFile(filename, trs80File, program.baud));
            }
        } else {
            const trs80File = decodeTrs80File(buffer, infilename);
            if (trs80File.error !== undefined) {
                console.log("Can't open \"" + infilename + "\": " + trs80File.error);
                process.exit(1);
            }

            if (isFloppy(trs80File)) {
                const trsdos = decodeTrsdos(trs80File);
                if (trsdos === undefined) {
                    // Should probably fail here. Having the floppy disk itself is probably not
                    // what the user wants.
                    infiles.push(new InputFile(base, trs80File));
                } else {
                    for (const dirEntry of trsdos.dirEntries) {
                        const trsdosFilename = dirEntry.getFilename(".");
                        const trsdosBinary = trsdos.readFile(dirEntry);
                        const trsdosTrs80File = decodeTrs80File(trsdosBinary, trsdosFilename);
                        infiles.push(new InputFile(trsdosFilename, trsdosTrs80File));
                    }
                }
            } else {
                infiles.push(new InputFile(base, trs80File));
            }
        }
    }

    if (false) {
        for (const infile of infiles) {
            console.log(infile.filename, infile.trs80File.className);
        }
    }

    // If output is existing directory, put all input files there.
    if (fs.existsSync(outFilename) && fs.statSync(outFilename).isDirectory()) {
        for (const infile of infiles) {
            const outpath = path.join(outFilename, infile.filename);
            console.log("Writing " + outpath);
            fs.writeFileSync(outpath, infile.trs80File.binary);
        }
    } else {
        // Output is a file. Its extension will help us determine how to convert the input files.
        const outext = path.parse(outFilename).ext.toLowerCase();
        if (outext === "") {
            console.log("No file extension on output file \"" + outFilename + "\", don't know how to convert");
            process.exit(1);
        }

        // See if input is a single file.
        if (infiles.length === 1) {
            // Convert individual file.
            const infile = infiles[0];
            let outBinary: Uint8Array = new Uint8Array(0); // TODO delete init.

            switch (infile.trs80File.className) {
                case "RawBinaryFile":
                    console.log("Cannot convert unknown file type of " + infile.filename);
                    process.exit(1);
                    break;

                case "BasicProgram":
                    switch (outext) {
                        case ".bas":
                            // Write as-is.
                            outBinary = infile.trs80File.binary;
                            break;

                        case ".asc":
                            // Convert to ASCII.
                            outBinary = Buffer.from(infile.trs80File.asAscii());
                            break;

                        case ".cas": {
                            // Encode in CAS file.
                            const outBaud = (baud ?? infile.baud) ?? 500;
                            outBinary = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            break;
                        }

                        case ".wav": {
                            // Encode in WAV file.
                            const outBaud = (baud ?? infile.baud) ?? 500;
                            const cas = binaryAsCasFile(infile.trs80File.binary, outBaud);
                            const audio = casAsAudio(cas, outBaud, DEFAULT_SAMPLE_RATE);
                            outBinary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                            break;
                        }

                        default:
                            console.log("Can't convert a Basic program to " + outext.toUpperCase());
                            process.exit(1);
                            break;
                    }
                    break;

                case "Jv1FloppyDisk":
                    break;

                case "Jv3FloppyDisk":
                    break;

                case "DmkFloppyDisk":
                    break;

                case "Cassette":
                    break;

                case "SystemProgram":
                    break;

                case "CmdProgram":
                    break;
            }

            fs.writeFileSync(outFilename, outBinary);
        } else {
            // Make archive.
        }
    }

/*

    // Read the file.
    let buffer;
    try {
        buffer = fs.readFileSync(infile);
    } catch (e) {
        process.exit(1);
        return;
    }

    if (infile.toLowerCase().endsWith(".wav")) {
        // Decode the cassette.
        const wavFile = readWavFile(buffer.buffer);
        const tape = new Tape(infile, wavFile);
        const decoder = new Decoder(tape);
        decoder.decode();
        convertTape(tape, outfile, baud);
    } else {
        const file = decodeTrs80File(buffer, infile);
        switch (file.className) {
            case "BasicProgram":
                break;

            case "Cassette":
                convertTape(Tape.fromCas(infile, file), outfile, baud);
                break;

            case "SystemProgram":
                break;

            case "CmdProgram":
                if (outfile.toLowerCase().endsWith(".3bn")) {
                    let filename = outfile;
                    // Strip directory.
                    let i = filename.lastIndexOf("/");
                    if (i >= 0) {
                        filename = filename.substring(i + 1);
                    }
                    // Strip extension.
                    i = filename.lastIndexOf(".");
                    if (i >= 0) {
                        filename = filename.substring(0, i);
                    }
                    // Upper case, for kicks.
                    filename = filename.toUpperCase();

                    fs.writeFileSync(outfile, file.toSystemProgram(filename).binary);
                    console.log("Converted " + infile + " to " + outfile);
                }
                break;

            default:
                console.log("Can't convert files of type " + file.className);
                process.exit(1);
                break;
        }
    }*/
}

/**
 * Handle the "hexdump" command.
 */
function hexdump(infile: string): void {

}

export function main() {
    program
        .storeOptionsAsProperties(false)
        .name("trs80-tool")
        .version(version);
    program
        .command("dir <infile>")
        .description("list files in the infile", {
            infile: "WAV, CAS, JV1, JV3, or DMK file (TRSDOS floppies only)",
        })
        .action(infile => {
            dir(infile);
        });
    program
        .command("extract <infile> <outfile>")
        .description("extract files in the infile", {
            infile: "WAV, CAS, JV1, JV3, or DMK file (TRSDOS floppies only)",
            outfile: "path to file or directory, or to JSON file for metadata",
        })
        .action((infile, outfile) => {
            extract(infile, outfile);
        });
    program
        .command("convert <files...>")
        .description("convert one or more infiles to one outfile", {
            infile: "WAV, CAS, CMD, 3BN, or BAS file",
            outfile: "WAV, CAS, CMD, 3BN, BAS, or LST file",
        })
        .option("--baud <baud>", "output baud rate (250, 500, 1000, or 1500)")
        .action((files, options) => {
            const baud = options.baud !== undefined ? parseInt(options.baud) : undefined;
            if (files.length < 2) {
                console.log("Must specify at least one infile and exactly one outfile");
                process.exit(1);
            }
            const infiles = files.slice(0, files.length - 1);
            const outfile = files[files.length - 1];
            convert(infiles, outfile, baud);
        });
    /*
    program
        .command("hexdump <infile>")
        .description("display an annotated hexdump of infile", {
            infile: "WAV, CAS, CMD, 3BN, BAS, JV1, JV3, or DMK",
        })
        .action(infile => {
            hexdump(infile);
        });*/
    program
        .parse(process.argv);
}

