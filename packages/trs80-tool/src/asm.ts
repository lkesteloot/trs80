import * as fs from "fs";
import * as path from "path";
import {colors} from "./colors.js";
import {pluralizeWithCount, ToolError} from "./utils.js";
import {Z80_KNOWN_LABELS, toHex, toHexWord } from "z80-base";
import { asmToCmdBinary, asmToIntelHex, asmToRawBinary, asmToSystemBinary } from "trs80-asm";
import {Asm, FileSystem} from "z80-asm";
import {DEFAULT_SAMPLE_RATE, binaryAsCasFile, casAsAudio, writeWavFile } from "trs80-cassette";
import {CassetteSpeed, TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS, TRS80_MODEL_III_KNOWN_LABELS } from "trs80-base";
import {ModelType, modelTypeAsmConstants} from "trs80-emulator";
import {assertNever} from "z80-base";

const TIME_ASM = false;

/**
 * Node fs implementation of FileSystem.
 */
class FileSystemImpl implements FileSystem {
    readBinaryFile(pathname: string): Uint8Array | undefined {
        try {
            return fs.readFileSync(pathname);
        } catch (e) {
            return undefined;
        }
    }

    readDirectory(pathname: string): string[] | undefined {
        try {
            return fs.readdirSync(pathname);
        } catch (e) {
            return undefined;
        }
    }

    readTextFile(pathname: string): string[] | undefined {
        try {
            return fs.readFileSync(pathname, "utf-8").split(/\r?\n/);
        } catch (e) {
            return undefined;
        }
    }
}

/**
 * Create an assembler for the given model, with the predefined labels and constants for that model.
 */
function createAsm(modelType: ModelType): Asm {
    const asm = new Asm(new FileSystemImpl());
    asm.addKnownLabels(Z80_KNOWN_LABELS);
    for (const {name, value} of modelTypeAsmConstants(modelType)) {
        asm.addConstant(name, value);
    }
    switch (modelType) {
        case ModelType.MODEL1:
            // The known labels we have are Model III ROM addresses, which are wrong for the Model I.
            break;

        case ModelType.MODEL3:
        case ModelType.MODEL4:
            asm.addKnownLabels(TRS80_MODEL_III_KNOWN_LABELS);
            asm.addKnownLabels(TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS);
            break;

        default:
            assertNever(modelType);
    }
    return asm;
}

/**
 * Handle the "asm" command.
 */
export function asm(srcPathname: string, outPathname: string, speed: CassetteSpeed, lstPathname: string | undefined,
                    modelType: ModelType): void {
    const { name } = path.parse(srcPathname);

    if (TIME_ASM) {
        for (let round = 0; round < 3; round++) {
            const COUNT = 100;
            const before = Date.now();
            for (let i = 0; i < COUNT; i++) {
                const asm = createAsm(modelType);
                const sourceFile = asm.assembleFile(srcPathname);
            }
            const after = Date.now();
            console.log("Average time for round", round, "is", Math.round((after - before)/COUNT), "ms");
        }
    }

    // Assemble program.
    const asm = createAsm(modelType);
    const sourceFile = asm.assembleFile(srcPathname);
    if (sourceFile === undefined) {
        console.log("Cannot read file " + srcPathname);
        return;
    }

    // Generate listing.
    if (lstPathname !== undefined) {
        const lstFd = fs.openSync(lstPathname, "w");

        for (const line of asm.assembledLines) {
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
    for (const line of asm.assembledLines) {
        if (line.error !== undefined) {
            console.log(colors.muted(line.line));
            console.log(colors.error("error: " + line.error));
            console.log();
            errorCount += 1;
        }
    }

    // Don't generate output if we have errors.
    if (errorCount !== 0) {
        throw new ToolError(pluralizeWithCount(errorCount, "error"));
    }

    // Guess the entry point if necessary.
    const { entryPoint, guessed } = asm.getEntryPoint();
    if (entryPoint === undefined) {
        throw new ToolError("No entry point specified");
    }

    if (guessed) {
        console.log("Warning: No entry point specified, guessing 0x" + toHexWord(entryPoint));
    }

    // Generate output.
    let binary: Uint8Array;
    const extension = path.parse(outPathname).ext.toUpperCase();
    switch (extension) {
        case ".CMD": {
            // Convert to CMD file.
            binary = asmToCmdBinary(name, entryPoint, asm);
            break;
        }

        case ".3BN":
        case ".CAS":
        case ".WAV": {
            // Convert to 3BN file.
            binary = asmToSystemBinary(name, entryPoint, asm);

            if (extension === ".CAS" || extension === ".WAV") {
                // Convert to CAS.
                binary = binaryAsCasFile(binary, speed);

                if (extension === ".WAV") {
                    // Convert to WAV.
                    const audio = casAsAudio(binary, speed, DEFAULT_SAMPLE_RATE);
                    binary = writeWavFile(audio, DEFAULT_SAMPLE_RATE);
                }
            }
            break;
        }

        case ".BIN":
            binary = asmToRawBinary(0, asm);
            break;

        case ".HEX": {
            const lines = asmToIntelHex(asm);
            const text = lines.join("\n") + "\n";
            binary = Buffer.from(text, "ascii");
            break;
        }

        default:
            console.log("Unknown output type: " + outPathname);
            return;
    }

    // Write output.
    const binFd = fs.openSync(outPathname, "w");
    fs.writeSync(binFd, binary);
    fs.closeSync(binFd);
}
