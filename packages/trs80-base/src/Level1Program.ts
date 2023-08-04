import {AbstractTrs80File} from "./Trs80File.js";
import {ProgramAnnotation} from "./ProgramAnnotation.js";
import {hi, toHexWord, word} from "z80-base";

export enum Level1Type { UNKNOWN, BASIC, SYSTEM }

function level1TypeToString(type: Level1Type): string {
    switch (type) {
        case Level1Type.UNKNOWN:
            return "unknown type";
        case Level1Type.BASIC:
            return "Basic";
        case Level1Type.SYSTEM:
            return "system";
    }
}

/**
 * Guess the kind of program this is, based on the load address.
 *
 * https://www.trs-80.com/wordpress/tips/formats/#l1basictape
 */
function guessLevel1Type(startAddress: number): Level1Type {
    switch (hi(startAddress)) {
        case 0x40:
        case 0x41:
            return Level1Type.SYSTEM;

        case 0x42:
            return Level1Type.BASIC;

        default:
            return Level1Type.UNKNOWN;
    }
}

/**
 * Class representing a Level 1 program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 *
 * These can be either Basic or machine language, and the start address can be used
 * to guess.
 *
 * https://www.trs-80.com/wordpress/tips/formats/#l1basictape
 */
export class Level1Program extends AbstractTrs80File {
    public readonly className = "Level1Program";
    public readonly startAddress: number;
    public readonly endAddress: number; // exclusive
    public readonly checksum: number;
    public readonly entryPointAddress: number | undefined;

    constructor(binary: Uint8Array,
                error: string | undefined,
                annotations: ProgramAnnotation[],
                startAddress: number,
                endAddress: number,
                checksum: number,
                entryPointAddress: number | undefined) {

        super(binary, error, annotations);
        this.startAddress = startAddress;
        this.endAddress = endAddress;
        this.checksum = checksum;
        this.entryPointAddress = entryPointAddress;
    }

    public getDescription(): string {
        let description = "Level 1 program (" + level1TypeToString(this.guessLevel1Type());
        if (this.entryPointAddress !== undefined) {
            description += ", /" + this.entryPointAddress;
        }
        description += ")";
        return description;
    }

    public guessLevel1Type(): Level1Type {
        return guessLevel1Type(this.startAddress);
    }

    /**
     * Get the data without the header or checksum.
     */
    public getData(): Uint8Array {
        return this.binary.subarray(4, this.binary.length - 1);
    }
}

/**
 * Decodes a Level 1 program from the binary. If the binary is not at all a Level 1
 * program, returns undefined. If it's a Level 1 program with decoding errors, returns
 * partially-decoded binary and sets the "error" field.
 */
export function decodeLevel1Program(binary: Uint8Array): Level1Program | undefined {
    if (binary.length < 5) {
        // Need start/end address and checksum.
        return undefined;
    }

    const startAddress = word(binary[0], binary[1]);
    const endAddress = word(binary[2], binary[3]);
    const checksum = binary[binary.length - 1];
    let entryPointAddress: number | undefined;

    // Check sanity of addresses.
    if (binary.length !== endAddress - startAddress + 5) {
        // Addresses don't match, probably not Level 1 program.
        return undefined;
    }

    // Check checksum.
    let sum = 0;
    for (let i = 4; i < binary.length; i++) {
        sum += binary[i];
    }
    sum &= 0xFF;
    const checksumValid = sum === 0;
    // Don't fail if checksum fails. The above address check is pretty strict, so
    // a bad checksum likely indicates bad data in an actual Level 1 file.

    // Create annotations.
    const annotations: ProgramAnnotation[] = [];
    annotations.push(new ProgramAnnotation(`Start address (0x${toHexWord(startAddress)})`, 0, 2));
    annotations.push(new ProgramAnnotation(`End address (0x${toHexWord(endAddress)})`, 2, 4));
    // Heuristic for common system programs.
    if (startAddress === 0x41FE) {
        entryPointAddress = word(binary[5], binary[4]);
        annotations.push(new ProgramAnnotation(`Jump address (0x${toHexWord(entryPointAddress)})`, 4, 6));
    }
    annotations.push(new ProgramAnnotation("Checksum" + (checksumValid ? "" : " (invalid)"),
        binary.length - 1, binary.length));

    return new Level1Program(binary, checksumValid ? undefined : "bad checksum", annotations,
        startAddress, endAddress, checksum, entryPointAddress);
}
