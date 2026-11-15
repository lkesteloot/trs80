
/**
 * Performs CRC-16 operations treating bits as big-endian.
 *
 * https://en.wikipedia.org/wiki/Cyclic_redundancy_check
 * https://en.wikipedia.org/wiki/Computation_of_cyclic_redundancy_checks
 * https://en.wikipedia.org/wiki/Mathematics_of_cyclic_redundancy_checks
 */
export class Crc16 {
    /**
     * For each value of the CRC's high byte XORed with the next data byte, what the eight
     * shift-and-XOR steps of that byte contribute to the CRC. Reading the disk's sectors spends
     * most of its time computing CRCs, so we do one lookup per byte rather than eight steps.
     */
    private readonly table = new Uint16Array(256);

    /**
     * Specifies the generator, which must be a 16-bit value.
     */
    constructor(generator: number) {
        for (let i = 0; i < 256; i++) {
            let crc = i << 8;
            for (let bit = 0; bit < 8; bit++) {
                const isOne = (crc & 0x8000) !== 0;
                crc <<= 1;
                if (isOne) {
                    crc ^= generator;
                }
            }
            this.table[i] = crc & 0xFFFF;
        }
    }

    /**
     * Update the CRC with the new data, which must be a byte.
     *
     * @return the new CRC.
     */
    public update(crc: number, data: number): number {
        return ((crc << 8) ^ this.table[((crc >> 8) ^ data) & 0xFF]) & 0xFFFF;
    }
}

/**
 * The CRC-16-CCITT polynomial, used for floppy disks. The polynomial is
 * x^16 + x^12 + x^5 + 1, which maps to 0x11021, but the leading 1 is
 * removed because it doesn't affect the outcome.
 */
export const CRC_16_CCITT = new Crc16(0x1021);
