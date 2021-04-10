
import * as fs from "fs";
import * as path from "path";
import { program } from "commander";
import {
    decodeSystemProgram,
    decodeTrs80File,
    decodeTrsdos, Trsdos,
    TrsdosDirEntry,
    trsdosProtectionLevelToString
} from "trs80-base";
import {withCommas} from "teamten-ts-utils";
import {Decoder, Program, readWavFile, Tape} from "trs80-cassette";

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
            const tape = new Tape(filename, wavFile);
            const decoder = new Decoder(tape);
            decoder.decode();

            for (const program of tape.programs) {
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
                // TODO
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
 * Handle the "convert" command.
 */
function convert(infile: string, outfile: string): void {

}

/**
 * Handle the "hexdump" command.
 */
function hexdump(infile: string): void {

}

function main() {
    program
        .storeOptionsAsProperties(false)
        .name("trs80-tool");
    program
        .command("dir <infile>")
        .description("list files in the infile", {
            infile: "WAV, JV1, JV3, or DMK file (TRSDOS floppies only)",
        })
        .action(infile => {
            dir(infile);
        });
    program
        .command("extract <infile> <outfile>")
        .description("extract files in the infile", {
            infile: "WAV, JV1, JV3, or DMK file (TRSDOS floppies only)",
            outfile: "path to file or directory, or to JSON file for metadata",
        })
        .action((infile, outfile) => {
            extract(infile, outfile);
        });
    program
        .command("convert <infile> <outfile>")
        .description("convert infile to outfile", {
            infile: "WAV, CAS, CMD, 3BN, or BAS file",
            outfile: "WAV, CAS, CMD, 3BN, BAS, or LST file",
        })
        .action((infile, outfile) => {
            convert(infile, outfile);
        });
    program
        .command("hexdump <infile>")
        .description("display an annotated hexdump of infile", {
            infile: "WAV, CAS, CMD, 3BN, BAS, JV1, JV3, or DMK",
        })
        .action(infile => {
            hexdump(infile);
        });
    program
        .parse(process.argv);
}

main();
