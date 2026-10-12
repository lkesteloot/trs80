import {describe, expect, it} from "vitest";
import {Cassette} from "./Cassette.js";
import {decodeTrs80File} from "./Trs80FileDecoder.js";

/**
 * A low-speed CAS file holding the BASIC program "10 PRINT".
 */
function makeLowSpeedCas(): Uint8Array {
    const header = new Array(256).fill(0x00);
    const sync = [0xA5];
    // Tape header and name, then one line (next-line address, line number, PRINT), then the end.
    const program = [0xD3, 0xD3, 0xD3, 0x41, 0xF0, 0x42, 0x0A, 0x00, 0xB2, 0x00, 0x00, 0x00];
    return new Uint8Array([...header, ...sync, ...program]);
}

/**
 * Shift the bits of the binary right, as if the recording had started that many bits early.
 */
function shiftRight(binary: Uint8Array, bitCount: number): Uint8Array {
    const result = new Uint8Array(binary.length + 1);
    for (let i = 0; i < binary.length; i++) {
        result[i] |= binary[i] >> bitCount;
        result[i + 1] |= (binary[i] << (8 - bitCount)) & 0xFF;
    }
    return result;
}

/**
 * Decode the binary as a CAS file, which must be a cassette.
 */
function decodeCas(binary: Uint8Array): Cassette {
    const file = decodeTrs80File(binary, {filename: "test.cas"});
    if (!(file instanceof Cassette)) {
        throw new Error("didn't decode a cassette, got " + file.className);
    }
    return file;
}

describe("cassette", () => {
    it("decodes a low-speed file", () => {
        const cassette = decodeCas(makeLowSpeedCas());
        expect(cassette.files.length).to.equal(1);
        expect(cassette.files[0].file.className).to.equal("BasicProgram");
        expect(cassette.files[0].file.error).to.be.undefined;
    });
    it("decodes a low-speed file that isn't byte-aligned", () => {
        // This used to throw.
        const aligned = decodeCas(makeLowSpeedCas());
        for (let bitCount = 1; bitCount < 8; bitCount++) {
            const cassette = decodeCas(shiftRight(makeLowSpeedCas(), bitCount));
            expect(cassette.files.length).to.equal(1);
            expect(cassette.files[0].file.className).to.equal("BasicProgram");
            expect(Array.from(cassette.files[0].binary.subarray(0, 12)))
                .to.eql(Array.from(aligned.files[0].binary));
        }
    });
});
