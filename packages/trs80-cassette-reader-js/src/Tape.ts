
// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.

import {AudioFile, highPassFilter} from "./AudioUtils";
import {DisplaySamples} from "./DisplaySamples";
import {LowSpeedTapeDecoder} from "./LowSpeedTapeDecoder";
import {Program} from "./Program";
import {WaveformAnnotation} from "./WaveformAnnotation";

const LOCAL_DATA_KEY = "tapes";

export interface SavedProgram {
    name: string,
    notes: string,
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
    public originalSamples: DisplaySamples;
    public filteredSamples: DisplaySamples;
    public lowSpeedSamples: DisplaySamples;
    public sampleRate: number;
    public programs: Program[];
    public readonly annotations: WaveformAnnotation[] = [];

    /**
     * @param name text to display (e.g., "LOAD80-Feb82-s1").
     * @param audioFile original samples from the tape.
     */
    constructor(name: string, audioFile: AudioFile) {
        this.name = name;
        this.originalSamples = new DisplaySamples(audioFile.samples);
        this.filteredSamples = new DisplaySamples(highPassFilter(audioFile.samples, 500));
        this.lowSpeedSamples = new DisplaySamples(LowSpeedTapeDecoder.filterSamples(
            this.filteredSamples.samplesList[0]));
        this.sampleRate = audioFile.rate;
        this.programs = [];
    }

    public addProgram(program: Program) {
        this.programs.push(program);
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
                    notes: "",
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
