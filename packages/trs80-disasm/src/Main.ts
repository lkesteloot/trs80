
import {
    CmdLoadBlockChunk,
    CmdProgram,
    CmdTransferAddressChunk, SystemChunk,
    SystemProgram,
    TRS80_MODEL_III_BASIC_TOKENS,
    TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS,
    TRS80_MODEL_III_KNOWN_LABELS,
    TRS80_SCREEN_BEGIN,
    TRS80_SCREEN_END,
} from "trs80-base";
import { Z80_KNOWN_LABELS } from "z80-base";
import {Disasm} from "z80-disasm";

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
 * Add all the entry point addresses we know of for the Model III ROM.
 */
export function addModel3RomEntryPoints(disasm: Disasm): void {
    for (const basicToken of TRS80_MODEL_III_BASIC_TOKENS) {
        if (basicToken.address !== undefined) {
            disasm.addEntryPoint(basicToken.address);
        }
    }

    // There are ad-hoc -- I just grabbed some addresses from web pages. This should be scrapped and
    // properly re-done with labels. See https://www.trs-80.com/wordpress/disassembled-rom/
    const addresses = [
        0x0005,
        0x0008,
        0x000B,
        0x000D,
        0x0010,
        0x0018,
        0x0020,
        0x0023,
        0x0028,
        0x0030,
        0x0038,
        0x0040,
        0x0041,
        0x0043,
        0x0044, 0x0045, // NOP
        0x0050,
        0x0055,
        0x005A,
        0x005F,
        0x0060,
        0x0063,
        0x0066,
        0x0069,
        0x006C,
        0x0071,
        0x0102,
        0x01D3,
        0x01F5,
        0x0210,
        0x0228,
        0x022C,
        0x0232,
        0x0235,
        0x023D,
        0x0243,
        0x025F,
        0x0261,
        // 0x0266,  // Actual data.
        0x0284,
        0x0287,
        0x0293,
        0x0296,
        0x0298,
        0x02A1,
        0x02A8,
        0x02A9,
        0x03C2,
        0x0473,
        0x0809, // log
        0x0B26, // fix
        0x0BAA, // math
        0x0BC7, // subint
        0x0BF2, // mltint
        0x13E1, // math
        0x13E7, // sqrt
        0x13F2, // pow
        0x1494, // math
        0x14C9, // rnd
        0x1C96, // compare symbol; jumped to from 0x4000, see RST 8.
    ];

    // Jump table.
    for (let address = 0x3000; address < 0x3036; address += 3) {
        disasm.addEntryPoint(address);
    }

    // Ad-hoc addresses.
    for (const address of addresses) {
        disasm.addEntryPoint(address);
    }
}

/**
 * Create and configure a disassembler for the TRS-80.
 */
export function disasmForTrs80(): Disasm {
    const disasm = new Disasm();

    disasm.addLabels(Z80_KNOWN_LABELS);
    disasm.addLabels(TRS80_MODEL_III_KNOWN_LABELS);
    disasm.addLabels(TRS80_MODEL_III_BASIC_TOKENS_KNOWN_LABELS);

    // The RST 8 instruction (0xCF) eats up one extra byte.
    disasm.addAdditionalDataLength(0xCF, 1);

    return disasm;
}

/**
 * Create and configure a disassembler for the specified program.
 */
export function disasmForTrs80Program(program: SystemProgram | CmdProgram): Disasm {
    const disasm = disasmForTrs80();

    if (program.entryPointAddress !== undefined) {
        disasm.addLabel(program.entryPointAddress, "main");
    }
    if (program.className === "CmdProgram") {
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
    } else if (program.className === "SystemProgram") {
        for (const chunk of program.chunks) {
            if (shouldDisassembleSystemProgramChunk(chunk)) {
                disasm.addChunk(chunk.data, chunk.loadAddress);
            }
        }
    } else {
        throw new Error("program is neither SystemProgram nor CmdProgram");
    }
    if (program.entryPointAddress !== undefined) {
        disasm.addEntryPoint(program.entryPointAddress);
    }

    return disasm;
}
