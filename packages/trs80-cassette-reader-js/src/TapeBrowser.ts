
import {frameToTimestamp, HZ} from "./AudioUtils";
import {fromTokenized} from "./Basic";
import {BitType} from "./BitType";
import {Program} from "./Program";
import {Tape} from "./Tape";
import {pad} from "./Utils";
import {Cassette, Trs80} from "trs80-emulator";
import {WaveformDisplay} from "./WaveformDisplay";
import {decodeEdtasm} from "./Edtasm";

/**
 * Generic cassette that reads from a Float32Array.
 */
class Float32Cassette extends Cassette {
    private readonly samples: Float32Array;
    private frame: number = 0;
    private progressBar: HTMLProgressElement | undefined;

    constructor(samples: Float32Array, samplesPerSecond: number) {
        super();
        this.samples = samples;
        this.samplesPerSecond = samplesPerSecond;
    }

    public setProgressBar(progressBar: HTMLProgressElement): void {
        this.progressBar = progressBar;
        this.progressBar.max = this.samples.length;
    }

    public onMotorStart(): void {
        if (this.progressBar !== undefined) {
            this.progressBar.classList.remove("hidden");
        }
    }

    public readSample(): number {
        if (this.frame % this.samplesPerSecond === 0) {
            console.log("Reading tape at " + frameToTimestamp(this.frame));
        }
        if (this.progressBar !== undefined && this.frame % Math.floor(this.samplesPerSecond / 10) === 0) {
            this.progressBar.value = this.frame;
        }

        return this.frame < this.samples.length ? this.samples[this.frame++] : 0;
    }

    public onMotorStop(): void {
        if (this.progressBar !== undefined) {
            this.progressBar.classList.add("hidden");
        }
    }
}

/**
 * Implementation of Cassette that reads from our displayed data.
 */
class TapeCassette extends Float32Cassette {
    constructor(tape: Tape, program: Program) {
        const samples = tape.originalSamples.samplesList[0];

        // Start one second before the official program start, so that the machine
        // can detect the header.
        const begin = Math.max(0, program.startFrame - tape.sampleRate);

        // Go until one second after the detected end of our program.
        const end = Math.min(samples.length, program.endFrame + tape.sampleRate);

        super(samples.subarray(begin, end), tape.sampleRate);
    }
}

/**
 * Implementation of Cassette that reads from our high-speed reconstruction.
 */
class ReconstructedCassette extends Float32Cassette {
    constructor(program: Program) {
        super(program.reconstructedSamples.samplesList[0], HZ);
    }
}

/**
 * Class that keeps track of various information about a pane.
 */
class Pane {
    element: HTMLElement;
    waveformDisplay?: WaveformDisplay;
    trs80?: Trs80;

    constructor(element: HTMLElement) {
        this.element = element;
    }

    setWaveformDisplay(waveformDisplay: WaveformDisplay): Pane {
        this.waveformDisplay = waveformDisplay;
        return this;
    }

    setTrs80(trs80: Trs80): Pane {
        this.trs80 = trs80;
        return this;
    }
}

/**
 * UI for browsing a tape interactively.
 */
export class TapeBrowser {
    private readonly tape: Tape;
    private readonly waveforms: HTMLElement;
    private readonly tapeContents: HTMLElement;
    private readonly topData: HTMLElement;
    private readonly originalWaveformDisplay = new WaveformDisplay();
    /**
     * Keep track of which waveform display is showing, if any.
     */
    private currentWaveformDisplay: WaveformDisplay | undefined;
    /**
     * All the panes we created in the upper-right (program, etc.).
     */
    private panes: Pane[] = [];

    constructor(tape: Tape,
                zoomInButton: HTMLButtonElement,
                zoomOutButton: HTMLButtonElement,
                waveforms: HTMLElement,
                originalCanvas: HTMLCanvasElement,
                filteredCanvas: HTMLCanvasElement,
                lowSpeedCanvas: HTMLCanvasElement,
                tapeContents: HTMLElement,
                topData: HTMLElement) {

        this.tape = tape;
        this.waveforms = waveforms;
        this.tapeContents = tapeContents;
        this.topData = topData;

        this.originalWaveformDisplay.addWaveform(originalCanvas, tape.originalSamples);
        this.originalWaveformDisplay.addWaveform(filteredCanvas, tape.filteredSamples);
        this.originalWaveformDisplay.addWaveform(lowSpeedCanvas, tape.lowSpeedSamples);
        this.tape.programs.forEach(program => this.originalWaveformDisplay.addProgram(program));
        this.originalWaveformDisplay.zoomToFitAll();
        this.currentWaveformDisplay = this.originalWaveformDisplay;

        zoomInButton.onclick = () => this.originalWaveformDisplay.zoomIn();
        zoomOutButton.onclick = () => this.originalWaveformDisplay.zoomOut();

        /*
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
         */

        // Update left-side panel.
        this.updateTapeContents();

        this.currentWaveformDisplay.draw();
    }

    private makeBinaryPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("program");
        div.classList.add("binary");

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

        return new Pane(div);
    }

    private makeReconstructedPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("reconstructed_waveform");

        const p = document.createElement("p");
        p.innerText = "Reconstructed high-speed waveform:";
        div.appendChild(p);

        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 400;
        div.appendChild(canvas);

        const waveformDisplay = new WaveformDisplay();
        waveformDisplay.addWaveform(canvas);
        waveformDisplay.replaceSamples(canvas, program.reconstructedSamples);
        waveformDisplay.zoomToFitAll();

        return new Pane(div).setWaveformDisplay(waveformDisplay);
    }

    private makeBasicPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("program");
        div.classList.add("basic");

        fromTokenized(program.binary, div);

        return new Pane(div);
    }

    private makeEdtasmPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("program");
        div.classList.add("edtasm");

        decodeEdtasm(program.binary, div);

        return new Pane(div);
    }

    private makeEmulatorPane(program: Program, cassette: Float32Cassette): Pane {
        const div = document.createElement("div");

        const screen = document.createElement("div");
        div.appendChild(screen);

        const progressBar = document.createElement("progress");
        progressBar.classList.add("hidden");
        cassette.setProgressBar(progressBar);
        div.appendChild(progressBar);

        const trs80 = new Trs80(screen, cassette);
        trs80.reset();

        return new Pane(div).setTrs80(trs80);
    }

    /**
     * Show a particular pane and hide all others.
     */
    private showPane(pane: Pane): void {
        // Hide all others.
        for (const hiddenPane of this.panes) {
            if (hiddenPane !== pane) {
                hiddenPane.element.classList.add("hidden");
                hiddenPane.trs80?.stop();
            }
        }

        // Show this one.
        pane.element.classList.remove("hidden");
        pane.trs80?.start();
    }

    /**
     * Create the panes and the table of contents for them on the left.
     */
    private updateTapeContents() {
        // Add a row to the table of contents.
        const addRow = (text: string, onClick: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null) => {
            const div = document.createElement("div");
            div.classList.add("tape_contents_row");
            div.innerText = text;
            if (onClick != null) {
                div.classList.add("selectable_row");
                div.onclick = onClick;
            }
            this.tapeContents.appendChild(div);
            return div;
        };

        // Show the name of the whole tape, and have it zoom out.
        addRow(this.tape.name, () => {
            this.originalWaveformDisplay.zoomToFitAll();
        });

        // Create panes for each program.
        for (const program of this.tape.programs) {
            // Header for program.
            const row = addRow("Track " + program.trackNumber + ", copy " + program.copyNumber + ", " + program.decoderName, null);
            row.style.marginTop = "1em";

            // Span of program.
            addRow("    " + frameToTimestamp(program.startFrame, true) + " to " +
                frameToTimestamp(program.endFrame, true) + " (" +
                frameToTimestamp(program.endFrame - program.startFrame, true) + ")",
                () => this.originalWaveformDisplay.zoomToFit(program.startFrame, program.endFrame));

            // Add a pane to the top-right, register it, and add it to table of contents.
            const addPane = (label: string, pane: Pane) => {
                pane.element.classList.add("pane");
                pane.element.classList.add("hidden");
                this.topData.appendChild(pane.element);
                this.panes.push(pane);
                addRow("    " + label, () => {
                    this.showPane(pane);
                });
            };

            // Make the various panes.
            addPane("Binary", this.makeBinaryPane(program));
            addPane("Reconstructed", this.makeReconstructedPane(program));
            if (program.isBasicProgram()) {
                addPane("Basic", this.makeBasicPane(program));
                addPane("Emulator (original)", this.makeEmulatorPane(program, new TapeCassette(this.tape, program)));
                addPane("Emulator (reconstructed)", this.makeEmulatorPane(program, new ReconstructedCassette(program)));
            }
            if (program.isEdtasmProgram()) {
                addPane("Assembly", this.makeEdtasmPane(program));
            }
            /* TODO
            let count = 1;
            for (const bitData of program.bits) {
                if (bitData.bitType === BitType.BAD) {
                    addRow("    Bit error " + count++ + " (" + frameToTimestamp(bitData.startFrame, true) + ")", () => {
                        this.originalWaveformDisplay.zoomToBitData(bitData);
                    });
                }
            }
             */
        }
    }
}
