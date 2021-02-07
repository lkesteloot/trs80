
import {
    CmdLoadBlockChunk,
    CmdProgram,
    CmdTransferAddressChunk, SystemChunk,
    SystemProgram,
    TRS80_SCREEN_BEGIN,
    TRS80_SCREEN_END
} from "trs80-base";
import {Disasm, Z80_KNOWN_LABELS} from "z80-disasm";
import {TRS80_MODEL_III_KNOWN_LABELS} from "./KnownLabels";

// Whether to try to disassemble this chunk.
function shouldDisassembleSystemProgramChunk(chunk: SystemChunk): boolean {
    if (chunk.loadAddress >= TRS80_SCREEN_BEGIN && chunk.loadAddress + chunk.data.length <= TRS80_SCREEN_END) {
        return false;
    }

    // Various addresses that don't represent code.
    if (chunk.loadAddress === 0x4210 || chunk.loadAddress === 0x401E) {
        return false;
    }

    return true;
}

/**
 * Create and configure a disassembler for the specified program.
 */
export function disasmForTrs80Program(program: SystemProgram | CmdProgram): Disasm {
    const disasm = new Disasm();

    disasm.addLabels(Z80_KNOWN_LABELS);
    disasm.addLabels(TRS80_MODEL_III_KNOWN_LABELS);
    if (program.entryPointAddress !== undefined) {
        disasm.addLabels([[program.entryPointAddress, "main"]]);
    }
    if (program instanceof CmdProgram) {
        for (const chunk of program.chunks) {
            if (chunk instanceof CmdLoadBlockChunk) {
                disasm.addChunk(chunk.loadData, chunk.address);
            }
            if (chunk instanceof CmdTransferAddressChunk) {
                // Not sure what to do here. I've seen junk after this block, and we risk
                // overwriting valid things in memory. I suspect that CMD parsers of the time,
                // when running into this block, would immediately just jump to the address
                // and ignore everything after it, so let's emulate that.
                break;
            }
        }
    } else {
        for (const chunk of program.chunks) {
            if (shouldDisassembleSystemProgramChunk(chunk)) {
                disasm.addChunk(chunk.data, chunk.loadAddress);
            }
        }
    }
    if (program.entryPointAddress !== undefined) {
        disasm.addEntryPoint(program.entryPointAddress);
    }

    return disasm;
}
