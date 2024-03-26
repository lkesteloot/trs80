import * as fs from "fs";
import * as path from "path";
import {
    CassetteFile,
    Trs80File,
    Trsdos, TrsdosDirEntry, decodeTrs80CassetteFile, decodeTrs80File, decodeTrsdos, getTrs80FileExtension, isFloppy, trsdosProtectionLevelToString } from "trs80-base";
import {Decoder, Program, Tape, readWavFile } from "trs80-cassette";

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

    constructor(filename: string, binary: Uint8Array, trs80File: Trs80File) {
        this.filename = filename;
        this.binary = binary;
        this.trs80File = trs80File;
    }

    /**
     * Set the Trs80File for this input file.
     */
    public setFile(trs80File: Trs80File): void {
        this.trs80File = trs80File;
    }

    /**
     * Optional baud rate, if applicable.
     */
    public getBaud(): number | undefined {
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
}

/**
 * Input file that came from an audio file.
 */
export class WavInputFile extends InputFile {
    public readonly program: Program;

    constructor(program: Program) {
        const trs80File = decodeTrs80CassetteFile(program.binary);
        const filename = program.getPseudoFilename() + getTrs80FileExtension(trs80File);
        super(filename, program.binary, trs80File);
        this.program = program;
    }

    public override getDirExtras(): string[] {
        return [
            this.program.baud + " baud",
        ];
    }

    public override getBaud(): number | undefined {
        return this.program.baud;
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
            this.cassetteFile.getBaud() + " baud",
        ];
    }

    public override getBaud(): number | undefined {
        return this.cassetteFile.getBaud();
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
        const binary = trsdos.readFile(dirEntry);
        const trs80File = decodeTrs80File(binary, filename);
        super(filename, binary, trs80File);
        this.trsdos = trsdos;
        this.dirEntry = dirEntry;
    }

    public override getDirExtras(): string[] {
        return [
            this.dirEntry.getFullDateString(),
            trsdosProtectionLevelToString(this.dirEntry.getProtectionLevel(), this.trsdos.version),
        ];
    }

    public override getDate(): Date | undefined {
        return this.dirEntry.getDate();
    }
}

/**
 * Load the file. If the file can contain other files (floppies, cassettes, and wav files),
 * then expand the file and return the contained files. Otherwise just return the file.
 */
export function expandFile(inFilename: string, includeSystemFiles: boolean): InputFile[] {
    const inFiles: InputFile[] = [];

    const { base, ext } = path.parse(inFilename);

    let buffer;
    try {
        buffer = fs.readFileSync(inFilename);
    } catch (e: any) {
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
            inFiles.push(new WavInputFile(program));
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
                inFiles.push(new InputFile(base, buffer, trs80File));
            } else {
                // Expand floppy.
                for (const dirEntry of trsdos.getDirEntries(includeSystemFiles)) {
                    inFiles.push(new TrsdosInputFile(trsdos, dirEntry));
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
            inFiles.push(new InputFile(base, buffer, trs80File));
        }
    }

    return inFiles;
}
