
import {ProgramBuilder} from "trs80-base";
import * as RetroStoreProto from "retrostore-api";
import {AssemblyResults} from "./AssemblyResults";

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
    for (const line of assemblyResults.sourceFile.assembledLines) {
        builder.addBytes(line.address, line.binary);
    }
    let entryPoint = assemblyResults.asm.entryPoint;
    if (entryPoint === undefined) {
        for (const line of assemblyResults.sourceFile.assembledLines) {
            if (line.binary.length > 0) {
                entryPoint = line.address;
                break;
            }
        }
    }
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
    console.log(arrayBuffer);
    const x = RetroStoreProto.decodeApiResponseUploadSystemState(new Uint8Array(arrayBuffer));
    console.log(x);
    if (x.token !== undefined) {
        console.log("Token: " + x.token.low);
        alert("Code is " + x.token.low);
    }
}
