
// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.

import {AudioFile, concatAudio, highPassFilter} from "./AudioUtils.js";
import {DisplaySamples} from "./DisplaySamples.js";
import {Program} from "./Program.js";
import {WaveformAnnotation} from "./Annotations.js";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {LowSpeedTapeDecoder} from "./LowSpeedTapeDecoder.js";
import {DEFAULT_SAMPLE_RATE, writeWavFile} from "./WavFile.js";
import {concatByteArrays} from "teamten-ts-utils";
import {Cassette, CassetteSpeed} from "trs80-base";
import {HighSpeedTapeDecoder} from "./HighSpeedTapeDecoder.js";
import {ByteData} from "./ByteData.js";
import {BitData} from "./BitData.js";

const LOCAL_DATA_KEY = "tapes";

export interface SavedProgram {
    name: string,
    notes: string,
    /**
     * Representative timestamp, in seconds, for this program. This is roughly the half-way point of the
     * program on the tape.
     */
    timestamp: number,
    screenshot: string,
}

export interface SavedTape {
    name: string,
    notes: string,
    programs: SavedProgram[],
}

export interface SavedData {
    tapes: SavedTape[],
}

export class Tape {
    public name: string;
    public notes: string = "";
    public originalSamples: DisplaySamples;
    public filteredSamples: DisplaySamples;
    public lowSpeedSamples: DisplaySamples;
    public sampleRate: number;
    public programs: Program[];
    public readonly waveformAnnotations: WaveformAnnotation[] = [];
    public readonly onName = new SimpleEventDispatcher<string>();
    public readonly onNotes = new SimpleEventDispatcher<string>();

    /**
     * @param name text to display (e.g., "LOAD80-Feb82-s1").
     * @param audioFile original samples from the tape.
     */
    constructor(name: string, audioFile: AudioFile) {
        this.name = name;
        this.originalSamples = new DisplaySamples(audioFile.samples);
        this.filteredSamples = new DisplaySamples(highPassFilter(audioFile.samples, 500));
        this.lowSpeedSamples = new DisplaySamples(LowSpeedTapeDecoder.filterSamples(
            this.filteredSamples.samplesList[0], audioFile.rate));
        this.sampleRate = audioFile.rate;
        this.programs = [];
    }

    /**
     * Create a fake Tape object from a CAS file.
     */
    public static fromCas(name: string, cas: Cassette): Tape {
        // Empty audio file.
        const tape = new Tape(name, new AudioFile(DEFAULT_SAMPLE_RATE, new Int16Array(0)));

        let track = 1;
        let lastOffset = 0;
        let lastFrame = 0;
        for (const file of cas.files) {
            const baud = file.speed === CassetteSpeed.LOW_SPEED ? 500 : 1500;
            const bitsPerByte = file.speed === CassetteSpeed.LOW_SPEED ? 8 : 9;
            const startFrame = Math.round(lastFrame + (file.offset - lastOffset)*bitsPerByte/baud*DEFAULT_SAMPLE_RATE);
            const endOffset = file.offset + file.file.binary.length;
            const endFrame = Math.round(lastFrame + (endOffset - lastOffset)*bitsPerByte/baud*DEFAULT_SAMPLE_RATE);
            lastOffset = endOffset;
            lastFrame = endFrame;
            const decoder = file.speed === CassetteSpeed.LOW_SPEED
                ? new LowSpeedTapeDecoder(tape, baud)
                : new HighSpeedTapeDecoder(tape);
            const bitData: BitData[] = [];
            const byteData: ByteData[] = [];

            const program = new Program(track, 1, startFrame, endFrame, decoder, baud,
                file.file.binary, bitData, byteData);

            tape.addProgram(program);
        }

        return tape;
    }

    public addProgram(program: Program) {
        this.programs.push(program);
    }

    /**
     * Set the name of the tape, as set by the user.
     */
    public setName(name: string): void {
        if (name !== this.name) {
            this.name = name;
            this.onName.dispatch(name);
        }
    }

    /**
     * Set the notes for the tape, as set by the user.
     */
    public setNotes(notes: string): void {
        if (notes !== this.notes) {
            this.notes = notes;
            this.onNotes.dispatch(notes);
        }
    }

    /**
     * Return a .cas file version of the tape.
     */
    public asCasFile(): Uint8Array {
        return concatByteArrays(this.programs.map(program => program.asCasFile()));
    }

    /**
     * Return a .wav file version of the tape.
     */
    public asWavFile(): Uint8Array {
        const audioParts: Int16Array[] = [];

        for (const program of this.programs) {
            // One second of silence before each program.
            audioParts.push(new Int16Array(DEFAULT_SAMPLE_RATE));

            // The program itself.
            audioParts.push(program.asAudio());

            // One second of silence after each program.
            audioParts.push(new Int16Array(DEFAULT_SAMPLE_RATE));
        }

        return writeWavFile(concatAudio(audioParts), DEFAULT_SAMPLE_RATE);
    }

    /**
     * Listen for changes to local storage and apply them.
     */
    public listenForStorageChanges(): void {
        window.addEventListener("storage", event => {
            if (event.key === LOCAL_DATA_KEY) {
                this.loadUserData();
            }
        });
    }

    /**
     * Load the saved user data and apply to existing programs.
     */
    public loadUserData(): void {
        const data = Tape.loadAllData();

        for (const tapeData of data.tapes) {
            if (tapeData.name === this.name) {
                this.notes = tapeData.notes;
                for (const programData of tapeData.programs) {
                    for (const program of this.programs) {
                        if (program.isForTimestamp(programData.timestamp, this.sampleRate)) {
                            program.setName(programData.name ?? "");
                            program.setNotes(programData.notes ?? "");
                            program.setScreenshot(programData.screenshot ?? "");
                        }
                    }
                }
            }
        }
    }

    /**
     * Synchronously saves all user data (names and notes) to local storage.
     */
    public saveUserData(): void {
        const data = {
            tapes: [
                {
                    name: this.name,
                    notes: this.notes,
                    programs: this.programs.map(program => ({
                        name: program.name,
                        notes: program.notes,
                        screenshot: program.screenshot,
                        timestamp: program.getTimestamp(this.sampleRate),
                    })),
                },
            ],
        };

        Tape.saveAllDataAsJson(JSON.stringify(data))
    }

    /**
     * Get user data as a SavedData object.
     */
    public static loadAllData(): SavedData {
        const jsonData = window.localStorage.getItem(LOCAL_DATA_KEY);
        if (jsonData === null) {
            return { tapes: [] };
        }

        return JSON.parse(jsonData);
    }

    /**
     * Get user data as a formatted JSON object.
     */
    public static getAllDataAsJson(): string {
        // Re-format it nicely.
        return JSON.stringify(this.loadAllData(), null, 2);
    }

    /**
     * Set the full data from a JSON string.
     */
    public static saveAllDataAsJson(jsonData: string): void {
        window.localStorage.setItem(LOCAL_DATA_KEY, jsonData);
    }
}
