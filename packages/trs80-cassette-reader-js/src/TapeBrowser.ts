
import {frameToTimestamp, HZ} from "./AudioUtils";
import {fromTokenized} from "./Basic";
import {BitType} from "./BitType";
import {Program} from "./Program";
import {Tape} from "./Tape";
import {pad} from "./Utils";
import {Cassette, Trs80} from "trs80-emulator";
import {WaveformDisplay} from "./WaveformDisplay";

/**
 * Generic cassette that reads from a Float32Array.
 */
class Float32Cassette extends Cassette {
    private readonly samples: Float32Array;
    private frame: number = 0;
    private progressBar: HTMLProgressElement;

    constructor(samples: Float32Array, samplesPerSecond: number, progressBar: HTMLProgressElement) {
        super();
        this.samples = samples;
        this.samplesPerSecond = samplesPerSecond;
        this.progressBar = progressBar;
        this.progressBar.max = this.samples.length;
    }

    public onMotorStart(): void {
        this.progressBar.style.display = "block";
    }

    public readSample(): number {
        if (this.frame % this.samplesPerSecond === 0) {
            console.log("Reading tape at " + frameToTimestamp(this.frame));
        }
        if (this.frame % Math.floor(this.samplesPerSecond / 10) === 0) {
            this.progressBar.value = this.frame;
        }

        return this.frame < this.samples.length ? this.samples[this.frame++] : 0;
    }

    public onMotorStop(): void {
        this.progressBar.style.display = "none";
    }
}

/**
 * Implementation of Cassette that reads from our displayed data.
 */
class TapeCassette extends Float32Cassette {
    constructor(tape: Tape, program: Program, progressBar: HTMLProgressElement) {
        const samples = tape.originalSamples.samplesList[0];

        // Start one second before the official program start, so that the machine
        // can detect the header.
        const begin = Math.max(0, program.startFrame - tape.sampleRate);

        // Go until one second after the detected end of our program.
        const end = Math.min(samples.length, program.endFrame + tape.sampleRate);

        super(samples.subarray(begin, end), tape.sampleRate, progressBar);
    }
}

/**
 * Implementation of Cassette that reads from our high-speed reconstruction.
 */
class ReconstructedCassette extends Float32Cassette {
    constructor(program: Program, progressBar: HTMLProgressElement) {
        super(program.reconstructedSamples.samplesList[0], HZ, progressBar);
    }
}

/**
 * Remove all children from element.
 */
function clearElement(e: HTMLElement): void {
    while (e.firstChild) {
        e.removeChild(e.firstChild);
    }
}

/**
 * UI for browsing a tape interactively.
 */
export class TapeBrowser {
    private tape: Tape;
    private readonly waveforms: HTMLElement;
    private readonly programText: HTMLElement;
    private readonly emulatorScreens: HTMLElement;
    private readonly reconstructedWaveforms: HTMLElement;
    private readonly reconstructedCanvas: HTMLCanvasElement;
    private readonly tapeContents: HTMLElement;
    private readonly originalWaveformDisplay = new WaveformDisplay();
    private readonly reconstructedWaveformDisplay = new WaveformDisplay();
    /**
     * Keep track of which TRS-80 emulator is running, if any.
     */
    private startedTrs80: Trs80 | undefined;
    /**
     * Keep track of which waveform display is showing, if any.
     */
    private currentWaveformDisplay: WaveformDisplay | undefined;

    constructor(tape: Tape,
                zoomInButton: HTMLButtonElement,
                zoomOutButton: HTMLButtonElement,
                waveforms: HTMLElement,
                originalCanvas: HTMLCanvasElement,
                filteredCanvas: HTMLCanvasElement,
                lowSpeedCanvas: HTMLCanvasElement,
                programText: HTMLElement,
                emulatorScreens: HTMLElement,
                reconstructedWaveforms: HTMLElement,
                reconstructedCanvas: HTMLCanvasElement,
                tapeContents: HTMLElement) {

        this.tape = tape;
        this.waveforms = waveforms;
        this.programText = programText;
        this.emulatorScreens = emulatorScreens;
        this.reconstructedWaveforms = reconstructedWaveforms;
        this.reconstructedCanvas = reconstructedCanvas;
        this.tapeContents = tapeContents;

        this.originalWaveformDisplay.addWaveform(originalCanvas, tape.originalSamples);
        this.originalWaveformDisplay.addWaveform(filteredCanvas, tape.filteredSamples);
        this.originalWaveformDisplay.addWaveform(lowSpeedCanvas, tape.lowSpeedSamples);
        this.tape.programs.forEach(program => this.originalWaveformDisplay.addProgram(program));
        this.originalWaveformDisplay.zoomToFitAll();
        this.currentWaveformDisplay = this.originalWaveformDisplay;

        this.reconstructedWaveformDisplay.addWaveform(this.reconstructedCanvas);

        zoomInButton.onclick = () => this.originalWaveformDisplay.zoomIn();
        zoomOutButton.onclick = () => this.originalWaveformDisplay.zoomOut();

        // Configure zoom keys.
        document.onkeypress = (event) => {
            if (event.key === "=" && this.currentWaveformDisplay !== undefined) {
                this.currentWaveformDisplay.zoomIn();
                event.preventDefault();
            }
            if (event.key === "-" && this.currentWaveformDisplay !== undefined) {
                this.currentWaveformDisplay.zoomOut();
                event.preventDefault();
            }
        };

        // Update left-side panel.
        this.updateTapeContents();

        this.currentWaveformDisplay.draw();
    }

    private showBinary(program: Program) {
        this.showProgramText();

        const div = this.programText;
        clearElement(div);
        div.classList.add("binary");
        div.classList.remove("basic");

        const binary = program.binary;
        for (let addr = 0; addr < binary.length; addr += 16) {
            const line = document.createElement("div");

            let e = document.createElement("span");
            e.classList.add("address");
            e.innerText = pad(addr, 16, 4) + "  ";
            line.appendChild(e);

            // Hex.
            let subAddr;
            e = document.createElement("span");
            e.classList.add("hex");
            for (subAddr = addr; subAddr < binary.length && subAddr < addr + 16; subAddr++) {
                e.innerText += pad(binary[subAddr], 16, 2) + " ";
            }
            for (; subAddr < addr + 16; subAddr++) {
                e.innerText += "   ";
            }
            e.innerText += "  ";
            line.appendChild(e);

            // ASCII.
            for (subAddr = addr; subAddr < binary.length && subAddr < addr + 16; subAddr++) {
                const c = binary[subAddr];
                e = document.createElement("span");
                if (c >= 32 && c < 127) {
                    e.classList.add("ascii");
                    e.innerText += String.fromCharCode(c);
                } else {
                    e.classList.add("ascii-unprintable");
                    e.innerText += ".";
                }
                line.appendChild(e);
            }
            div.appendChild(line);
        }
    }

    private showBasic(program: Program) {
        this.showProgramText();

        const div = this.programText;
        clearElement(div);
        div.classList.add("basic");
        div.classList.remove("binary");

        fromTokenized(program.binary, div);
    }

    private showEmulator(screen: HTMLElement, trs80: Trs80) {
        this.showEmulatorScreens();

        // Show just this screen.
        this.emulatorScreens.querySelectorAll(":scope > div")
            .forEach((e) => (e as HTMLElement).style.display = e === screen ? "block" : "none");

        // Start the machine.
        this.stopTrs80();
        trs80.start();
        this.startedTrs80 = trs80;
    }

    private stopTrs80(): void {
        if (this.startedTrs80 !== undefined) {
            this.startedTrs80.stop();
            this.startedTrs80 = undefined;
        }
    }

    private showProgramText() {
        this.stopTrs80();
        this.waveforms.style.display = "none";
        this.programText.style.display = "block";
        this.emulatorScreens.style.display = "none";
        this.reconstructedWaveforms.style.display = "none";
        this.currentWaveformDisplay = undefined;
    }

    private showWaveforms() {
        this.stopTrs80();
        this.waveforms.style.display = "block";
        this.programText.style.display = "none";
        this.emulatorScreens.style.display = "none";
        this.reconstructedWaveforms.style.display = "none";
        this.currentWaveformDisplay = this.originalWaveformDisplay;
    }

    private showEmulatorScreens() {
        this.waveforms.style.display = "none";
        this.programText.style.display = "none";
        this.emulatorScreens.style.display = "block";
        this.reconstructedWaveforms.style.display = "none";
        this.currentWaveformDisplay = undefined;
    }

    private showReconstructedWaveforms(program: Program): void {
        this.stopTrs80();
        this.waveforms.style.display = "none";
        this.programText.style.display = "none";
        this.emulatorScreens.style.display = "none";
        this.reconstructedWaveforms.style.display = "block";
        this.currentWaveformDisplay = this.reconstructedWaveformDisplay;

        this.reconstructedWaveformDisplay.replaceSamples(this.reconstructedCanvas, program.reconstructedSamples);
        this.reconstructedWaveformDisplay.zoomToFitAll();
    }

    private updateTapeContents() {
        const addRow = (text: string, onClick: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null) => {
            const div = document.createElement("div");
            div.classList.add("tape_contents_row");
            div.innerText = text;
            if (onClick != null) {
                div.classList.add("selectable_row");
                div.onclick = onClick;
            }
            this.tapeContents.appendChild(div);
        };
        clearElement(this.tapeContents);
        this.stopTrs80();
        clearElement(this.emulatorScreens);
        addRow(this.tape.name, () => {
            this.showWaveforms();
            this.originalWaveformDisplay.zoomToFitAll();
        });
        for (const program of this.tape.programs) {
            addRow("Track " + program.trackNumber + ", copy " + program.copyNumber + ", " + program.decoderName, null);
            addRow(frameToTimestamp(program.startFrame, true) + " to " +
                frameToTimestamp(program.endFrame, true) + " (" +
                frameToTimestamp(program.endFrame - program.startFrame, true) + ")", null);
            addRow("    Waveforms", () => {
                this.showWaveforms();
                this.originalWaveformDisplay.zoomToFit(program.startFrame, program.endFrame);
            });
            addRow("    Binary", () => {
                this.showBinary(program);
            });
            addRow("    Reconstructed", () => {
                this.showReconstructedWaveforms(program);
            });
            if (program.isBasicProgram()) {
                addRow("    Basic", () => {
                    this.showBasic(program);
                });
                const screen = document.createElement("div");
                screen.style.display = "none";
                const progressBar = document.createElement("progress");
                progressBar.style.display = "none";
                // const trs80 = new Trs80(screen, new TapeCassette(this.tape, program));
                const trs80 = new Trs80(screen, new ReconstructedCassette(program, progressBar));
                trs80.reset();
                this.emulatorScreens.appendChild(screen);
                this.emulatorScreens.appendChild(progressBar);
                addRow("    Emulator", () => {
                    this.showEmulator(screen, trs80);
                });
            }
            let count = 1;
            for (const bitData of program.bits) {
                if (bitData.bitType === BitType.BAD) {
                    addRow("    Bit error " + count++ + " (" + frameToTimestamp(bitData.startFrame, true) + ")", () => {
                        this.showWaveforms();
                        this.originalWaveformDisplay.zoomToBitData(bitData);
                    });
                }
            }
        }
    }
}
