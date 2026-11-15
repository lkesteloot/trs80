import {describe, expect, it} from "vitest";
import {CRC_16_CCITT} from "./Crc16.js";

/**
 * The bit-at-a-time CRC update that the table replaces, to check the table against.
 */
function updateBitByBit(crc: number, data: number, generator: number): number {
    for (let shift = 8; shift < 16; shift++) {
        const isOne = ((crc ^ (data << shift)) & 0x8000) !== 0;
        crc <<= 1;
        if (isOne) {
            crc ^= generator;
        }
    }

    return crc & 0xFFFF;
}

describe("Crc16", () => {
    it("gives the standard check value for CRC-16-CCITT", () => {
        // The CRC-16/CCITT-FALSE check: "123456789" with a preset of 0xFFFF, the preset floppies use.
        let crc = 0xFFFF;
        for (const ch of "123456789") {
            crc = CRC_16_CCITT.update(crc, ch.charCodeAt(0));
        }
        expect(crc).to.equal(0x29B1);
    });

    it("matches the bit-by-bit update for every byte and many CRCs", () => {
        for (let crc = 0; crc < 0x10000; crc += 0x0101) {
            for (let data = 0; data < 256; data++) {
                expect(CRC_16_CCITT.update(crc, data)).to.equal(updateBitByBit(crc, data, 0x1021));
            }
        }
    });
});
