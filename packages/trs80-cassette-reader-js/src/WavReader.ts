import {AudioFile} from "./AudioUtils";

/**
 * Values for the "audioFormat" field.
 */
const WAVE_FORMAT_UNKNOWN = 0x0000; // Microsoft Unknown Wave Format
const WAVE_FORMAT_PCM = 0x0001; // Microsoft PCM Format
const WAVE_FORMAT_ADPCM = 0x0002; // Microsoft ADPCM Format
const WAVE_FORMAT_IEEE_FLOAT = 0x0003; // IEEE float
const WAVE_FORMAT_VSELP = 0x0004; // Compaq Computer's VSELP
const WAVE_FORMAT_IBM_CVSD = 0x0005; // IBM CVSD
const WAVE_FORMAT_ALAW = 0x0006; // 8-bit ITU-T G.711 A-law
const WAVE_FORMAT_MULAW = 0x0007; // 8-bit ITU-T G.711 µ-law
const WAVE_FORMAT_EXTENSIBLE = 0xFFFE; // Determined by SubFormat

/**
 * Reads strings, numbers, and arrays from a buffer.
 */
class ArrayBufferReader {
    private readonly arrayBuffer: ArrayBuffer;
    private readonly dataView: DataView;
    private index: number;
    public littleEndian = false;

    constructor(arrayBuffer: ArrayBuffer) {
        this.arrayBuffer = arrayBuffer;
        this.dataView = new DataView(arrayBuffer);
        this.index = 0;
    }

    /**
     * Whether we've reached the end of the buffer.
     */
    public eof(): boolean {
        return this.index >= this.arrayBuffer.byteLength;
    }

    /**
     * Read an ASCII string of length "length" from the input file.
     */
    public readString(length: number): string {
        let s = "";
        for (let i = 0; i < length; i++) {
            s += String.fromCharCode(this.dataView.getInt8(this.index++));
        }

        return s;
    }

    /**
     * Read an unsigned 16-bit value.
     */
    public readUint16(): number {
        const value = this.dataView.getUint16(this.index, this.littleEndian);
        this.index += 2;

        return value;
    }

    /**
     * Read an unsigned 32-bit value.
     */
    public readUint32(): number {
        const value = this.dataView.getUint32(this.index, this.littleEndian);
        this.index += 4;

        return value;
    }

    /**
     * Read a buffer of Int16 numbers.
     */
    public readInt16Array(byteLength: number): Int16Array {
        const array = new Int16Array(this.arrayBuffer, this.index, byteLength/2);
        this.index += byteLength;
        return array;
    }
}

/**
 * Reads a WAV file from a buffer, returning an AudioFile object.
*/
export function readWavFile(arrayBuffer: ArrayBuffer): AudioFile {
    const reader = new ArrayBufferReader(arrayBuffer);

    let rate: number | undefined = undefined;
    let samples: Int16Array | undefined = undefined;

    // Read ID.
    const riffId = reader.readString(4);
    if (riffId === "RIFF") {
        reader.littleEndian = true;
    } else if (riffId === "RIFX") {
        reader.littleEndian = false;
    } else {
        throw new Error('bad "chunk id": expected "RIFF" or "RIFX", got ' + riffId);
    }

    // Read chunk size. This is really how much is left in the entire file.
    const chunkSize = reader.readUint32();

    // Read format.
    const waveId = reader.readString(4);
    if (waveId !== "WAVE") {
        throw new Error('bad "format": expected "WAVE", got ' + waveId);
    }

    // Keep reading chunks.
    while (!reader.eof()) {
        // Chunk ID.
        const chunkId = reader.readString(4);
        const chunkSize = reader.readUint32();

        switch (chunkId) {
            case "fmt ": {
                if (chunkSize !== 16) {
                    throw new Error("Expected fmt size of 16, got " + chunkSize);
                }

                const audioFormat = reader.readUint16();
                const channels = reader.readUint16();
                rate = reader.readUint32();
                const byteRate = reader.readUint32(); // useless...
                const blockAlign = reader.readUint16(); // useless...
                const bitDepth = reader.readUint16();
                const signed = bitDepth !== 8;
                if (audioFormat !== WAVE_FORMAT_PCM) {
                    throw new Error("Can only handle PCM, not " + audioFormat);
                }
                break;
            }

            case "fact": {
                if (chunkSize !== 4) {
                    throw new Error("Expected fact size of 4, got " + chunkSize);
                }

                // There is currently only one field defined for the format dependant data.
                // It is a single 4-byte value that specifies the number of samples in the
                // waveform data chunk.
                //
                // The number of samples field is redundant for sampled data, since the Data
                // chunk indicates the length of the data. The number of samples can be
                // determined from the length of the data and the container size as determined
                // from the Format chunk.
                const numSamples = reader.readUint32();
                break;
            }

            case "data": {
                if (chunkSize === 0) {
                    // If we run into this, just read the rest of the array.
                    throw new Error("We don't handle 0-sized data");
                }
                samples = reader.readInt16Array(chunkSize);
                break;
            }
        }
    }

    if (samples === undefined || rate === undefined) {
        throw new Error("didn't get all the fields we need from WAV file");
    }

    return new AudioFile(rate, samples);
}
