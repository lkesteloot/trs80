import * as fs from "fs";
import * as path from "path";
import {
    BYTES_PER_SECTOR,
    CMD_END_OF_PDS_MEMBER,
    CmdIsamDirectoryEntryChunk,
    CmdLoadBlockChunk, CmdProgram, SystemProgram, addModel3RomEntryPoints, decodeTrs80File, disasmForTrs80, disasmForTrs80Program } from "trs80-base";
import {toHex, toHexByte } from "z80-base";
import {Disasm, HexFormat, instructionsToText, InstructionsToTextConfig } from "z80-disasm";
import {loadFile} from "./utils.js";
import {expandFile} from "./InputFile.js";

/**
 * Whether the CMD file is structured as a Partial Data Set. Some LDOS SYS files
 * are like this, and must be disassembled differently.
 */
function isPdsFile(trs80File: CmdProgram): boolean {
    for (const chunk of trs80File.chunks) {
        if (chunk.type === CMD_END_OF_PDS_MEMBER) {
            return true;
        }
    }

    return false;
}

/**
 * Partial Data Set (PDS) files include several overlays, each of which must be disassembled separately.
 * This is used by SYS6.SYS and SYS7.SYS in LDOS/VTOS.
 */
function decodePdsFile(trs80File: CmdProgram, createLabels: boolean, useKnownLabels: boolean, hexFormat: HexFormat,
                       full: boolean, toTextOptions: InstructionsToTextConfig): void {
    // Map from sector/offset to list of ISAM directory entries.
    // The key is the sector*256 plus the offset.
    const offsetToDirEntries: Map<number, CmdIsamDirectoryEntryChunk[]> = new Map();

    for (const chunk of trs80File.chunks) {
        if (chunk instanceof CmdIsamDirectoryEntryChunk) {
            const offset = chunk.sectorNumber*BYTES_PER_SECTOR + chunk.offset;
            const dirEntries = offsetToDirEntries.get(offset);
            if (dirEntries === undefined) {
                offsetToDirEntries.set(offset, [chunk]);
            } else {
                dirEntries.push(chunk);
            }
        }
    }

    // Sort the entries by offset.
    const offsets = Array.from(offsetToDirEntries.keys()).sort((a, b) => a - b);

    for (const offset of offsets) {
        const disasm = disasmForTrs80();

        disasm.setCreateLabels(createLabels);
        disasm.setUseKnownLabels(useKnownLabels);
        disasm.setHexFormat(hexFormat);
        disasm.setFullDisassembly(full);

        // Add binary.
        for (const chunk of trs80File.chunks) {
            if (chunk.offset >= offset) {
                if (chunk instanceof CmdLoadBlockChunk) {
                    disasm.addChunk(chunk.loadData, chunk.address);
                } else if (chunk.type === CMD_END_OF_PDS_MEMBER) {
                    break;
                }
            }
        }

        // Add labels for the various entry points.
        const dirEntries = offsetToDirEntries.get(offset)!!;
        for (const dirEntry of dirEntries) {
            const key = dirEntry.key;
            const transferAddress = dirEntry.transferAddress;
            disasm.addLabel(transferAddress, "isam_" + toHexByte(key));
            disasm.addEntryPoint(transferAddress);
        }

        const instructions = disasm.disassemble();
        const text = instructionsToText(disasm, instructions, toTextOptions).join("\n");
        console.log("; Overlay at offset 0x" + toHex(offset, 6) + ":");
        console.log(text);
        console.log("");
    }
}

/**
 * Disassemble a program.
 *
 * @param trs80File program to disassemble.
 * @param entryPoints additional entry points in binary.
 * @param makeListing whether to make a listing (as opposed to just disassembling).
 */
export function disassemble(trs80File: CmdProgram | SystemProgram, entryPoints: number[], makeListing: boolean):
    [binary: Uint8Array, description: string] {

    const disasm = disasmForTrs80Program(trs80File);
    for (const entryPoint of entryPoints) {
        disasm.addEntryPoint(entryPoint);
    }
    const instructions = disasm.disassemble()
    const text = instructionsToText(disasm, instructions, {
        makeListing,
        hexByteCount: 4,
    }).join("\n") + "\n";
    const outBinary = new TextEncoder().encode(text);
    const description = "Disassembled " + (trs80File.className === "CmdProgram" ? "CMD program" : "system program");

    return [outBinary, description];
}

/**
 * Handle the "disasm" command.
 */
export function disasm(filename: string, makeListing: boolean, org: number | undefined, entryPoints: number[],
                       createLabels: boolean, useKnownLabels: boolean, showBinary: boolean, hexFormat: HexFormat,
                       upperCase: boolean, full: boolean, dataComment: boolean) {

    const toTextOptions: InstructionsToTextConfig = {
        makeListing,
        showBinary,
        hexFormat,
        upperCase,
        dataComment,
        hexByteCount: 4,
    };

    // Read the file.
    const buffer = loadFile(filename);
    if (typeof buffer === "string") {
        console.log(buffer);
        return;
    }

    // Create and configure the disassembler.
    let disasm: Disasm;
    let mainEntryPoint: number | undefined = undefined;
    const ext = path.extname(filename).toUpperCase();
    const inputFiles = expandFile(filename, false);
    if (inputFiles.length === 0) {
        console.log("No file to disassemble");
        return;
    }
    if (inputFiles.length > 1) {
        console.log("Only disassembling first file");
    }
    const inputFile = inputFiles[0];
    const trs80File = inputFile.trs80File;
    switch (trs80File.className) {
        case "CmdProgram":
            // Special case to handle SYS6.SYS and SYS7.SYS in LDOS/VTOS.
            if (isPdsFile(trs80File)) {
                decodePdsFile(trs80File, createLabels, useKnownLabels, hexFormat, full, toTextOptions);
                return;
            }
            // FALLTHROUGH.
        case "SystemProgram":
        case "Level1Program":
        case "BootSector":
            disasm = disasmForTrs80Program(trs80File);
            mainEntryPoint = trs80File.entryPointAddress;
            break;

        case "RawBinaryFile":
            if (ext === ".ROM" || ext === ".BIN") {
                disasm = disasmForTrs80();
                disasm.addChunk(buffer, org ?? 0);
                if (org !== undefined || entryPoints.length === 0) {
                    disasm.addEntryPoint(org ?? 0);
                }
                mainEntryPoint = org ?? 0;
                // Do this with a flag, the ROM might not be from a Model 3:
                // addModel3RomEntryPoints(disasm);
            } else {
                console.log("Can't disassemble files of type " + ext);
                return;
            }
            break;

        default:
            console.log("Can't disassemble files of type " + ext);
            return;
    }

    disasm.setCreateLabels(createLabels);
    disasm.setUseKnownLabels(useKnownLabels);
    disasm.setHexFormat(hexFormat);
    disasm.setFullDisassembly(full);

    // Add extra entry points, if any.
    for (const entryPoint of entryPoints) {
        disasm.addEntryPoint(entryPoint);
    }

    if (mainEntryPoint === undefined && entryPoints.length > 0) {
        mainEntryPoint = entryPoints[0];
    }

    const instructions = disasm.disassemble();
    const text = instructionsToText(disasm, instructions, {
            ... toTextOptions,
            mainEntryPoint,
        }
    ).join("\n");
    console.log(text);
}
