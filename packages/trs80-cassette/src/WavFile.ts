import {AudioFile} from "./AudioUtils.js";

/**
 * Rate used for writing files. We used to have 44.1 kHz here, but 22.05 kHz works just fine
 * and the WAV files are half the size.
 */
export const DEFAULT_SAMPLE_RATE = 22050;

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
 * Possible keys stored in the "metadata" field of the {@link AudioFile} object.
 *
 * https://exiftool.org/TagNames/RIFF.html#Info
 */
export const WAV_INFO_TAGS = new Map<string,string>([
    [ "AGES", "Rated" ],
    [ "CMNT", "Comment" ],
    [ "CODE", "Encoded By" ],
    [ "COMM", "Comments" ],
    [ "DIRC", "Directory" ],
    [ "DISP", "Sound Scheme Title" ],
    [ "DTIM", "Date Time Original" ],
    [ "GENR", "Genre" ],
    [ "IARL", "Archival Location" ],
    [ "IART", "Artist" ],
    [ "IAS1", "First Language" ],
    [ "IAS2", "Second Language" ],
    [ "IAS3", "Third Language" ],
    [ "IAS4", "Fourth Language" ],
    [ "IAS5", "Fifth Language" ],
    [ "IAS6", "Sixth Language" ],
    [ "IAS7", "Seventh Language" ],
    [ "IAS8", "Eighth Language" ],
    [ "IAS9", "Ninth Language" ],
    [ "IBSU", "Base URL" ],
    [ "ICAS", "Default Audio Stream" ],
    [ "ICDS", "Costume Designer" ],
    [ "ICMS", "Commissioned" ],
    [ "ICMT", "Comment" ],
    [ "ICNM", "Cinematographer" ],
    [ "ICNT", "Country" ],
    [ "ICOP", "Copyright" ],
    [ "ICRD", "Date Created" ],
    [ "ICRP", "Cropped" ],
    [ "IDIM", "Dimensions" ],
    [ "IDIT", "Date Time Original" ],
    [ "IDPI", "Dots Per Inch" ],
    [ "IDST", "Distributed By" ],
    [ "IEDT", "Edited By" ],
    [ "IENC", "Encoded By" ],
    [ "IENG", "Engineer" ],
    [ "IGNR", "Genre" ],
    [ "IKEY", "Keywords" ],
    [ "ILGT", "Lightness" ],
    [ "ILGU", "Logo URL" ],
    [ "ILIU", "Logo Icon URL" ],
    [ "ILNG", "Language" ],
    [ "IMBI", "More Info Banner Image" ],
    [ "IMBU", "More Info Banner URL" ],
    [ "IMED", "Medium" ],
    [ "IMIT", "More Info Text" ],
    [ "IMIU", "More Info URL" ],
    [ "IMUS", "Music By" ],
    [ "INAM", "Title" ],
    [ "IPDS", "Production Designer" ],
    [ "IPLT", "Num Colors" ],
    [ "IPRD", "Product" ],
    [ "IPRO", "Produced By" ],
    [ "IRIP", "Ripped By" ],
    [ "IRTD", "Rating" ],
    [ "ISBJ", "Subject" ],
    [ "ISFT", "Software" ],
    [ "ISGN", "Secondary Genre" ],
    [ "ISHP", "Sharpness" ],
    [ "ISMP", "Time Code" ],
    [ "ISRC", "Source" ],
    [ "ISRF", "Source Form" ],
    [ "ISTD", "Production Studio" ],
    [ "ISTR", "Starring" ],
    [ "ITCH", "Technician" ],
    [ "ITRK", "Track Number" ],
    [ "IWMU", "Watermark URL" ],
    [ "IWRI", "Written By" ],
    [ "LANG", "Language" ],
    [ "LOCA", "Location" ],
    [ "PRT1", "Part" ],
    [ "PRT2", "Number Of Parts" ],
    [ "RATE", "Rate" ],
    [ "STAR", "Starring" ],
    [ "STAT", "Statistics" ],
    [ "TAPE", "Tape Name" ],
    [ "TCDO", "End Timecode" ],
    [ "TCOD", "Start Timecode" ],
    [ "TITL", "Title" ],
    [ "TLEN", "Length" ],
    [ "TORG", "Organization" ],
    [ "TRCK", "Track Number" ],
    [ "TURL", "URL" ],
    [ "TVER", "Version" ],
    [ "VMAJ", "Vegas Version Major" ],
    [ "VMIN", "Vegas Version Minor" ],
    [ "YEAR", "Year" ],
]);

/**
 * Reads strings, numbers, and arrays from a buffer.
 */
class ArrayBufferReader {
    private readonly dataView: DataView;
    public index: number; // Relative to start of data view.
    public littleEndian = false;

    constructor(data: ArrayBuffer | Uint8Array) {
        this.dataView = data instanceof Uint8Array
            ? new DataView(data.buffer, data.byteOffset, data.length)
            : new DataView(data);
        this.index = 0;
    }

    /**
     * Whether we've reached the end of the buffer.
     */
    public eof(): boolean {
        return this.index >= this.dataView.byteLength;
    }

    /**
     * Skip this many bytes in the file.
     */
    public skip(bytes: number): void {
        this.index += bytes;
    }

    /**
     * Read an ASCII string of length "length" from the input file.
     *
     * @param length number of bytes to read
     * @param absorbNul if false, nuls stop parsing; if true, are ignored but parsing continues
     */
    public readString(length: number, absorbNul = false): string {
        let s = "";
        for (let i = 0; i < length && this.index < this.dataView.byteLength; i++) {
            const byte = this.dataView.getInt8(this.index++);
            if (byte === 0x00) {
                if (!absorbNul) {
                    break;
                }
            } else {
                s += String.fromCharCode(byte);
            }
        }

        return s;
    }

    /**
     * Read an unsigned 8-bit value.
     */
    public readUint8(): number {
        const value = this.dataView.getUint8(this.index);
        this.index += 1;

        return value;
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
     * Read a buffer of Uint8 numbers.
     */
    public readUint8Array(byteLength: number): Uint8Array {
        const array = new Uint8Array(this.dataView.buffer,
            this.dataView.byteOffset + this.index, byteLength);
        this.index += byteLength;
        return array;
    }

    /**
     * Read a buffer of Int16 numbers.
     */
    public readInt16Array(byteLength: number): Int16Array {
        const array = new Int16Array(this.dataView.buffer,
            this.dataView.byteOffset + this.index, byteLength/2);
        this.index += byteLength;
        return array;
    }
}

/**
 * Reads a WAV file from a buffer, returning an AudioFile object.
*/
export function readWavFile(arrayBuffer: ArrayBuffer): AudioFile {
    const reader = new ArrayBufferReader(arrayBuffer);

    const metadata = new Map<string,string>();

    let rate: number | undefined = undefined;
    let samples: Int16Array | undefined = undefined;
    let bitDepth: number | undefined = undefined;
    let channels = 1;

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
        if (chunkId.length < 4) {
            // Premature end of file.
            console.log("End of file part-way through chunk ID in WAV file: \"" + chunkId + "\" length "
                + chunkId.length + " char " + chunkId.charCodeAt(0) + " index " + reader.index);
            break;
        }
        const chunkSize = reader.readUint32();

        switch (chunkId) {
            case "fmt ": {
                if (chunkSize < 16) {
                    throw new Error("Expected fmt size of at least 16, got " + chunkSize);
                }

                const audioFormat = reader.readUint16();
                channels = reader.readUint16();
                rate = reader.readUint32();
                const byteRate = reader.readUint32(); // useless...
                const blockAlign = reader.readUint16(); // useless...
                bitDepth = reader.readUint16();
                if (audioFormat !== WAVE_FORMAT_PCM) {
                    throw new Error("Can only handle PCM, not " + audioFormat);
                }
                const expectBlockAlign = Math.ceil(bitDepth*channels/8);
                if (blockAlign !== expectBlockAlign) {
                    throw new Error("Expected block align of " + expectBlockAlign + ", not " + blockAlign);
                }

                // Read the rest of the optional parameters. These are allowed but we don't do anything
                // with them.
                for (let i = 16; i < chunkSize; i++) {
                    const byte = reader.readUint8();
                    // console.log("Got extra byte in wav fmt chunk: 0x" + toHexByte(byte));
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
                if (bitDepth === 8) {
                    const samples8 = reader.readUint8Array(chunkSize);

                    // Convert from 8-bit unsigned to 16-bit signed; pick first channel.
                    samples = new Int16Array(samples8.length/channels);
                    for (let i = 0; i < samples.length; i++) {
                        samples[i] = (samples8[i*channels] - 128)*255;
                    }
                } else if (bitDepth === 16) {
                    const samples16 = reader.readInt16Array(chunkSize);

                    if (channels === 1) {
                        samples = samples16;
                    } else {
                        // Pick first channel.
                        samples = new Int16Array(samples16.length/channels);
                        for (let i = 0; i < samples.length; i++) {
                            samples[i] = samples16[i*channels];
                        }
                    }
                } else {
                    throw new Error("Can only handle bit depths of 8 and 16, not " + bitDepth);
                }
                break;
            }

            case "LIST": {
                // Name-value pairs.
                const listChunk = reader.readUint8Array(chunkSize);
                const listReader = new ArrayBufferReader(listChunk);
                listReader.littleEndian = reader.littleEndian;
                const listId = listReader.readString(4);
                if (listId === "INFO") {
                    // Standard INFO chunk, read name/value pairs.
                    while (!listReader.eof()) {
                        // Chunk ID.
                        const listChunkId = listReader.readString(4);
                        if (listChunkId.length < 4) {
                            // Premature end of file.
                            console.log("End of file part-way through list chunk ID in WAV file: \"" + listChunkId + "\" length "
                                + listChunkId.length + " char " + listChunkId.charCodeAt(0) + " index " + listReader.index);
                            break;
                        }
                        const listChunkSize = listReader.readUint32();
                        const listChunkData = listReader.readString(listChunkSize, true);
                        metadata.set(listChunkId, listChunkData);
                    }
                } else {
                    // Non-standard LIST chunk, ignore it.
                    console.log("Ignoring LIST chunk of sub-type " + listId);
                }

                break;
            }

            default:
                // console.log("Skipping unknown WAV chunk " + chunkId + " of " + chunkSize + " bytes");
                reader.skip(chunkSize);
                break;
        }
    }

    if (samples === undefined || rate === undefined) {
        throw new Error("didn't get all the fields we need from WAV file");
    }

    return new AudioFile(rate, samples, metadata);
}

/**
 * Convert samples to a WAV file.
 *
 * http://soundfile.sapp.org/doc/WaveFormat/
 */
export function writeWavFile(samples: Int16Array, sampleRate: number): Uint8Array {
    const channelCount = 1;
    const bitDepth = 8;

    // Total size of WAV file.
    const totalSize = 11*4 + samples.length*bitDepth/8;
    const wav = new ArrayBuffer(totalSize);
    const wavData = new DataView(wav);

    let index = 0;
    const writeString = (s: string) => {
        for (let i = 0; i < s.length; i++) {
            wavData.setUint8(index, s.charCodeAt(i));
            index += 1;
        }
    };
    const writeUint8 = (n: number) => {
        wavData.setUint8(index, n);
        index += 1;
    };
    const writeUint16 = (n: number) => {
        wavData.setUint16(index, n, true);
        index += 2;
    };
    const writeInt16 = (n: number) => {
        wavData.setInt16(index, n, true);
        index += 2;
    };
    const writeUint32 = (n: number) => {
        wavData.setUint32(index, n, true);
        index += 4;
    };

    // Main header.
    writeString("RIFF");
    writeUint32(totalSize - 8);
    writeString("WAVE");

    // Format chunk.
    writeString("fmt ");
    writeUint32(16); // Chunk size.
    writeUint16(WAVE_FORMAT_PCM);
    writeUint16(channelCount);
    writeUint32(sampleRate);
    writeUint32(sampleRate*channelCount*bitDepth/8); // Byte rate.
    writeUint16(channelCount*bitDepth/8); // Block align.
    writeUint16(bitDepth);

    // Data chunk.
    writeString("data");
    writeUint32(samples.length*bitDepth/8);
    for (let i = 0; i < samples.length; i++) {
        // Convert from 16-bit signed to 8-bit unsigned.
        const sample = Math.min(Math.max(Math.round(samples[i]/256 + 128), 0), 255);

        writeUint8(sample);
    }

    if (index !== totalSize) {
        throw new Error("wrote " + index + " but expected " + totalSize);
    }

    return new Uint8Array(wav);
}
