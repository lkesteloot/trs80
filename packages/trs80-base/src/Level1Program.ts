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
 * Guess the kind of program this is, based on the start address.
 *
 * https://www.trs-80.com/sub-tips-file-formats.htm#l1basictape
 */
function guessLevel1Type(startAddress: number): Level1Type {
    if (startAddress === 0x4200) {
        return Level1Type.BASIC;
    }

    const page = hi(startAddress);
    return page === 0x40 || page === 0x41
        ? Level1Type.SYSTEM
        : Level1Type.UNKNOWN;
}

/**
 * A single line of Level 1 Basic.
 */
export class Level1BasicLine {
    public readonly lineNumber: number;
    public readonly code: string;

    constructor(lineNumber: number, text: string) {
        this.lineNumber = lineNumber;
        this.code = text;
    }
}

/**
 * Class representing a Level 1 program. If the "error" field is set, then something
 * went wrong with the program and the data may be partially loaded.
 *
 * These can be either Basic or machine language, and the start address can be used
 * to guess.
 *
 * https://www.trs-80.com/sub-tips-file-formats.htm#l1basictape
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
        return this.binary.subarray(4, 4 + this.endAddress - this.startAddress);
    }

    /**
     * Convert an address in memory to the original byte offset in the binary.
     * Returns undefined if invalid.
     */
    public addressToByteOffset(address: number): number | undefined {
        return address < this.startAddress || address >= this.endAddress
            ? undefined
            : address - this.startAddress + 4;
    }

    /**
     * Decodes the Basic program, or returns an error.
     */
    public decodeBasic(): Level1BasicLine[] | string {
        if (this.guessLevel1Type() !== Level1Type.BASIC) {
            return "not a Basic program";
        }

        const decoder = new TextDecoder("ASCII");
        const lines: Level1BasicLine[] = [];
        const data = this.getData();
        let i = 0;
        while (i < data.length) {
            // Need two bytes for line number and carriage return.
            if (i + 2 >= data.length) {
                return "truncated Basic program";
            }
            const lineNumberLow = data[i++];
            const lineNumberHigh = data[i++];
            const lineNumber = word(lineNumberHigh, lineNumberLow);
            const codeBegin = i;
            while (i < data.length && data[i] !== 0x0D) {
                i++;
            }
            if (i === data.length) {
                return "Basic program missing carrage return at end of line " + lineNumber;
            }
            const codeEnd = i;

            const code = decoder.decode(data.subarray(codeBegin, codeEnd));
            lines.push(new Level1BasicLine(lineNumber, code));
            // Skip carriage return.
            i++;
        }
        return lines;
    }
}

/**
 * Decodes a Level 1 program from the binary. If the binary is not at all a Level 1
 * program, returns undefined. If it's a Level 1 program with decoding errors, returns
 * partially-decoded binary and sets the "error" field.
 */
export function decodeLevel1Program(binary: Uint8Array): Level1Program | undefined {
    if (binary.length < 5) {
        // Need start/end addresses and checksum.
        return undefined;
    }

    // Big endian:
    const startAddress = word(binary[0], binary[1]);
    const endAddress = word(binary[2], binary[3]); // exclusive

    // Check sanity of addresses.
    let programSize = endAddress - startAddress;
    let expectedBinarySize = programSize + 5;
    if (false) {
        console.log("startAddress = " + startAddress);
        console.log("endAddress = " + endAddress);
        console.log("programSize = " + programSize);
        console.log("expectedBinarySize = " + expectedBinarySize);
        console.log("binary.length = " + binary.length);
    }
    // Allow some blank bytes at the end.
    if (startAddress < 0x4000 || programSize < 0 ||
        binary.length < expectedBinarySize || binary.length > expectedBinarySize + 32) {

        // Addresses don't match, probably not Level 1 program.
        return undefined;
    }

    // Check checksum.

    let checksumLocation = expectedBinarySize - 1;
    const checksum = binary[checksumLocation];
    let sum = 0;
    for (let i = 4; i <= checksumLocation; i++) {
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
    let entryPointAddress: number | undefined;
    if (startAddress === 0x41FE) {
        entryPointAddress = word(binary[5], binary[4]);
        annotations.push(new ProgramAnnotation(`Entry point (0x${toHexWord(entryPointAddress)})`, 4, 6));
    }
    annotations.push(new ProgramAnnotation("Checksum" + (checksumValid ? "" : " (invalid)"),
        checksumLocation, checksumLocation + 1));
    if (checksumLocation < binary.length - 1) {
        annotations.push(new ProgramAnnotation("Junk", checksumLocation + 1, binary.length));
    }

    return new Level1Program(binary, checksumValid ? undefined : "bad checksum", annotations,
        startAddress, endAddress, checksum, entryPointAddress);
}
