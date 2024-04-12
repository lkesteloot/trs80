import {ProgramBuilder, TRS80_SCREEN_BEGIN, TRS80_SCREEN_END, disasmForTrs80} from "trs80-base";
import * as RetroStoreProto from "retrostore-api";
import {AssemblyResults} from "./AssemblyResults";
import {instructionsToText} from "z80-disasm";
import {toHexWord} from "z80-base";

/**
 * Builder of chunks of memory for the RetroStore interface.
 */
class RetroStoreProgramBuilder extends ProgramBuilder {
    /**
     * Get RetroStore memory regions for the bytes given so far.
     */
    public getMemoryRegions(): RetroStoreProto.MemoryRegion[] {
        // Sort blocks by address (not really necessary for RetroStore).
        this.blocks.sort((a, b) => a.address - b.address);

        return this.blocks
            .map(block => ({
                start: block.address,
                length: block.bytes.length,
                data: new Uint8Array(block.bytes),
            }));
    }
}

// Uploads the already-assembled code to the RetroStore.
export async function uploadToRetroStore(assemblyResults: AssemblyResults) {
    if (assemblyResults.errorLines.length !== 0) {
        return;
    }
    const builder = new RetroStoreProgramBuilder();
    for (const line of assemblyResults.asm.assembledLines) {
        builder.addBytes(line.address, line.binary);
    }
    const { entryPoint } = assemblyResults.asm.getEntryPoint();
    if (entryPoint === undefined) {
        return;
    }
    const params: RetroStoreProto.UploadSystemStateParams = {
        state: {
            // Can't use the enum here because it's a "const enum", and the way we compile
            // TS is one file at a time (probably transpile only?). So must hack it with
            // a string that's cast.
            model: "MODEL_III" as RetroStoreProto.Trs80Model,
            registers: {
                pc: entryPoint,
            },
            memoryRegions: builder.getMemoryRegions(),
        },
    };
    console.log(params);
    const response = await fetch("https://retrostore.org/api/uploadState", {
        method: "POST",
        body: RetroStoreProto.encodeUploadSystemStateParams(params),
        mode: "cors",
        cache: "no-cache",
        redirect: "follow",
    });
    console.log(response);
    const arrayBuffer = await response.arrayBuffer();
    const x = RetroStoreProto.decodeApiResponseUploadSystemState(new Uint8Array(arrayBuffer));
    console.log(x);
    if (x.token !== undefined) {
        alert("Token is " + x.token.low);
    }
}

// Download a program from the RetroStore and return its disassembly.
export async function downloadFromRetroStore(): Promise<string | undefined> {
    const token = prompt("What is the RetroStore token?", "451");
    if (token === "" || token === null) {
        return undefined;
    }

    const params = {
        token: {
            low: parseInt(token, 10),
            high: 0,
            unsigned: true,
        },
    };
    const response = await fetch("https://retrostore.org/api/downloadState", {
        method: "POST",
        body: RetroStoreProto.encodeDownloadSystemStateParams(params),
        mode: "cors",
        cache: "no-cache",
        redirect: "follow",
    });
    console.log(response);
    const arrayBuffer = await response.arrayBuffer();
    const x = RetroStoreProto.decodeApiResponseDownloadSystemState(new Uint8Array(arrayBuffer));
    console.log(x);
    if (x.success !== true || x.systemState === undefined) {
        console.log("Failed request");
        return undefined;
    }

    const disasm = disasmForTrs80();
    let firstChunk = true;
    for (const memoryRegion of x.systemState.memoryRegions ?? []) {
        const data = memoryRegion.data;
        const start = memoryRegion.start;
        if (data !== undefined && start !== undefined) {
            let end = start + data.length;

            // Remove trailing zeros, they're not really part of the program. There's
            // a risk here that we remove too much!
            while (end > start && data[end - start - 1] === 0) {
                end -= 1;
            }

            const slice = data.slice(0, end - start);
            disasm.addChunk(slice, start);
            if (firstChunk && !(start >= TRS80_SCREEN_BEGIN && start < TRS80_SCREEN_END)) {
                disasm.addEntryPoint(start);
                firstChunk = false;
            }
        }
    }
    const regs = x.systemState.registers;
    const pc = regs?.pc;
    if (pc !== undefined) {
        disasm.addEntryPoint(pc);
    }

    const instructions = disasm.disassemble();
    const lines = instructionsToText(disasm, instructions, {});

    if (regs !== undefined) {
        function setRegister(value: number | undefined, name: string): void {
            if (value !== undefined) {
                if (name === "af") {
                    // Be sure to set up SP first and HL later.
                    lines.push("        ld hl,0x" + toHexWord(value));
                    lines.push("        push hl");
                    lines.push("        pop af");
                } else {
                    lines.push("        ld " + name + ",0x" + toHexWord(value));
                }
            }
        }

        lines.push("");
        lines.push("        ; Restore registers.");
        lines.push("fill_registers:");
        setRegister(regs.ix, "ix");
        setRegister(regs.iy, "iy");
        setRegister(regs.sp, "sp");
        setRegister(regs.af_prime, "af");
        lines.push("        ex af,af'");
        setRegister(regs.bc_prime, "bc");
        setRegister(regs.de_prime, "de");
        setRegister(regs.hl_prime, "hl");
        lines.push("        exx");
        setRegister(regs.af, "af");
        setRegister(regs.bc, "bc");
        setRegister(regs.de, "de");
        setRegister(regs.hl, "hl");

        if (regs.pc !== undefined) {
            lines.push("        jp 0x" + toHexWord(regs.pc));
        }
        lines.push("        end fill_registers");
    }

    return lines.join("\n") + "\n";
}
