import * as fs from "fs";
import * as path from "path";
import { CmdProgram, SystemProgram, decodeTrs80File } from "trs80-base";
import {addModel3RomEntryPoints, disasmForTrs80, disasmForTrs80Program } from "trs80-disasm";
import {Disasm, HexFormat, instructionsToText } from "z80-disasm";

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
    const text = instructionsToText(instructions, { makeListing }).join("\n") + "\n";
    const outBinary = new TextEncoder().encode(text);
    const description = "Disassembled " + (trs80File.className === "CmdProgram" ? "CMD program" : "system program");

    return [outBinary, description];
}

/**
 * Handle the "disasm" command.
 */
export function disasm(filename: string, makeListing: boolean, org: number | undefined, entryPoints: number[],
                       createLabels: boolean, useKnownLabels: boolean, showBinary: boolean, hexFormat: HexFormat) {
    // Read the file.
    let buffer;
    try {
        buffer = fs.readFileSync(filename);
    } catch (e: any) {
        console.log("Can't open \"" + filename + "\": " + e.message);
        return;
    }

    // Create and configure the disassembler.
    let disasm: Disasm;
    const ext = path.extname(filename).toUpperCase();
    if (ext === ".CMD" || ext === ".3BN" || ext === ".SYS" || ext === ".L1") {
        const trs80File = decodeTrs80File(buffer, filename);
        if (trs80File.className !== "CmdProgram"
            && trs80File.className !== "SystemProgram"
            && trs80File.className !== "Level1Program") {
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

    disasm.setCreateLabels(createLabels);
    disasm.setUseKnownLabels(useKnownLabels);
    disasm.setHexFormat(hexFormat);

    // Add extra entry points, if any.
    for (const entryPoint of entryPoints) {
        disasm.addEntryPoint(entryPoint);
    }

    const instructions = disasm.disassemble()
    const text = instructionsToText(instructions, { makeListing, showBinary, hexFormat }).join("\n");
    console.log(text);
}
