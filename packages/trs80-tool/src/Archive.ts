import * as fs from "fs";
import * as path from "path";
import { withCommas } from "teamten-ts-utils";
import {CassetteFile, CassetteSpeed, Trsdos, TrsdosDirEntry, decodeLevel1Program, decodeSystemProgram,
    decodeTrs80File, decodeTrsdos, getTrs80FileExtension, isFloppy, trsdosProtectionLevelToString } from "trs80-base";
import {Decoder, Program, Tape, readWavFile } from "trs80-cassette";

/**
 * Super class for files that are nested in another file, such as a floppy or cassette.
 */
export abstract class ArchiveFile {
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
export class WavFile extends ArchiveFile {
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
        } else if (decodeSystemProgram(program.binary, false) !== undefined) {
            extension = ".3BN";
        } else if (decodeLevel1Program(program.binary) !== undefined) {
            extension = ".L1";
        }
        return program.getPseudoFilename() + extension;
    }

    public getDirString(): string {
        return this.filename.padEnd(12) + " " +
            withCommas(this.program.binary.length).padStart(8) + "  " +
            this.program.speed.nominalBaud + " baud";
    }

    public getBinary(): Uint8Array {
        return this.program.binary;
    }
}

/**
 * Nested file that came from a CAS file.
 */
export class CasFile extends ArchiveFile {
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
            this.cassetteFile.speed.nominalBaud + " baud";
    }
}

/**
 * Nested file that came from a TRSDOS floppy.
 */
export class TrsdosFile extends ArchiveFile {
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
export class Archive {
    public readonly error: string | undefined;
    public readonly files: ArchiveFile[] = [];
    public readonly tape: Tape | undefined;

    constructor(filename: string) {
        // Read the file.
        let buffer;
        try {
            buffer = fs.readFileSync(filename);
        } catch (e: any) {
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
            const file = decodeTrs80File(buffer, { filename });

            if (isFloppy(file)) {
                const trsdos = decodeTrsdos(file);
                if (trsdos !== undefined) {
                    for (const dirEntry of trsdos.getDirEntries(false)) {
                        this.files.push(new TrsdosFile(trsdos, dirEntry));
                    }
                } else {
                    this.error = "Operating system of floppy is unrecognized.";
                }
            } else if (file.className === "Cassette") {
                let counter = 1;
                const name = path.parse(filename).name;
                for (const cassetteFile of file.files) {
                    const cassetteFilename = name + "-T" + counter + getTrs80FileExtension(cassetteFile.file);
                    this.files.push(new CasFile(cassetteFilename, cassetteFile));
                    counter += 1;
                }
            } else {
                this.error = "This file type (" + file.className + ") does not have nested files.";
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
