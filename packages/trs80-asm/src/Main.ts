
import {
    CmdLoadModuleHeaderChunk,
    CmdProgramBuilder,
    CmdTransferAddressChunk, encodeCmdProgram, encodeSystemProgram,
    IntelHexFileBuilder,
    IntelHexRecord,
    ProgramBuilder,
    RawBinaryFileBuilder,
    SystemProgramBuilder,
} from "trs80-base";
import { Asm } from "z80-asm";

function addAsmToBuilder(asm: Asm, builder: ProgramBuilder): void {
    for (const line of asm.assembledLines) {
        builder.addBytes(line.address, line.binary);
    }
}

/**
 * Generate a CMD binary from an assembled program
 *
 * @param name name (without extension) of the file, for the header.
 * @param entryPoint the entry point of the program.
 * @param asm assembled program.
 * @return the binary for the CMD program.
 */
export function asmToCmdBinary(name: string, entryPoint: number, asm: Asm): Uint8Array {
    const builder = new CmdProgramBuilder();
    addAsmToBuilder(asm, builder);
    const chunks = [
        CmdLoadModuleHeaderChunk.fromFilename(name),
        ... builder.getChunks(),
        CmdTransferAddressChunk.fromEntryPointAddress(entryPoint),
    ]
    return encodeCmdProgram(chunks);
}

/**
 * Generate a system binary from an assembled program
 *
 * @param name name (without extension) of the file, for the header.
 * @param entryPoint the entry point of the program.
 * @param asm assembled program.
 * @return the binary for the system program.
 */
export function asmToSystemBinary(name: string, entryPoint: number, asm: Asm): Uint8Array {
    const builder = new SystemProgramBuilder();
    addAsmToBuilder(asm, builder);
    const chunks = builder.getChunks();
    return encodeSystemProgram(name, chunks, entryPoint);
}

/**
 * Generate the lines for an Intel Hex file for an assembled program.
 */
export function asmToIntelHex(asm: Asm): string[] {
    const builder = new IntelHexFileBuilder();
    addAsmToBuilder(asm, builder);
    const chunks = [
        ... builder.getChunks(),
        IntelHexRecord.endOfFile(),
    ];
    return chunks.map(chunk => chunk.generateRecord());
}

/**
 * Generate a BIN or ROM file from the assembled program. Does not
 * output anything before the load address (org), and fills gaps with nuls.
 */
export function asmToRawBinary(org: number, asm: Asm): Uint8Array {
    const builder = new RawBinaryFileBuilder();
    addAsmToBuilder(asm, builder);
    return builder.getBinary(org);
}
