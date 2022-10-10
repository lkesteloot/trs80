
import {
    CmdLoadModuleHeaderChunk,
    CmdProgramBuilder,
    CmdTransferAddressChunk, encodeCmdProgram, encodeSystemProgram,
    SystemProgramBuilder,
} from "trs80-base";
import { Asm } from "z80-asm";

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
    for (const line of asm.assembledLines) {
        builder.addBytes(line.address, line.binary);
    }
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
    for (const line of asm.assembledLines) {
        builder.addBytes(line.address, line.binary);
    }
    const chunks = builder.getChunks();
    return encodeSystemProgram(name, chunks, entryPoint);
}
