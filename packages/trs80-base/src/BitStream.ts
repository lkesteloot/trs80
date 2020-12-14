
// TODO unused. Delete?
export class BitStream {
    public readonly data: Uint8Array;
    public readonly bitCount: number;
    public bitIndex: number = 0;
    public startBits: number = 0;

    constructor(data: Uint8Array) {
        this.data = data;
        this.bitCount = data.length*8;
    }

    public readByte(): number {
        const value = this.peekByte();

        this.bitIndex += this.startBits + 8;

        return value;
    }

    public peekByte(ahead: number = 0): number {
        const bitIndex = this.bitIndex + ahead*(8 + this.startBits) + this.startBits;
        if (bitIndex + 8 > this.bitCount) {
            throw new Error("End of bit stream");
        }

        const byteIndex = Math.floor(bitIndex/8);
        const bitOffset = bitIndex%8;

        let value = this.data[byteIndex] << bitOffset;
        if (bitOffset !== 0) {
            value |= this.data[byteIndex + 1] >> (8 - bitOffset);
        }

        return value;
    }
}
