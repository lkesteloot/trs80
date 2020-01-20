import {frameToTimestamp, HZ} from "./AudioUtils";
import {fromTokenized} from "./Basic";
import {Program} from "./Program";
import {Tape} from "./Tape";
import {pad} from "./Utils";
import {Cassette, Trs80} from "trs80-emulator";
import {WaveformDisplay} from "./WaveformDisplay";
import {decodeEdtasm} from "./Edtasm";
import {BitType} from "./BitType";

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
    row?: HTMLElement;
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

        clearElement(tapeContents);
        clearElement(topData);

        this.originalWaveformDisplay.addWaveform(originalCanvas, tape.originalSamples);
        this.originalWaveformDisplay.addWaveform(filteredCanvas, tape.filteredSamples);
        this.originalWaveformDisplay.addWaveform(lowSpeedCanvas, tape.lowSpeedSamples);
        this.tape.programs.forEach(program => this.originalWaveformDisplay.addProgram(program));
        this.originalWaveformDisplay.zoomToFitAll();
        this.currentWaveformDisplay = this.originalWaveformDisplay;

        zoomInButton.onclick = () => this.originalWaveformDisplay.zoomIn();
        zoomOutButton.onclick = () => this.originalWaveformDisplay.zoomOut();

        // Update left-side panel.
        this.updateTapeContents();

        this.currentWaveformDisplay.draw();
    }

    private makeMetadataPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("metadata");

        const h1 = document.createElement("h1");
        h1.innerText = "Track " + program.trackNumber + ", copy " + program.copyNumber;
        div.appendChild(h1);

        const table = document.createElement("table");
        div.appendChild(table);

        const addKeyValue = (key: string, value: string, click?: () => void) => {
            const row = document.createElement("tr");

            const keyElement = document.createElement("td");
            keyElement.classList.add("key");
            keyElement.innerText = key + ":";
            row.appendChild(keyElement);

            const valueElement = document.createElement("td");
            valueElement.classList.add("value");
            valueElement.innerText = value;
            if (click !== undefined) {
                valueElement.classList.add("clickable");
                valueElement.addEventListener("click", click);
            }
            row.appendChild(valueElement);

            table.appendChild(row);
        };

        addKeyValue("Decoder", program.decoderName);
        addKeyValue("Start time", frameToTimestamp(program.startFrame), () =>
            this.originalWaveformDisplay.zoomToFit(program.startFrame - 100, program.startFrame + 100));
        addKeyValue("End time", frameToTimestamp(program.endFrame), () =>
            this.originalWaveformDisplay.zoomToFit(program.endFrame - 100, program.endFrame + 100));
        addKeyValue("Duration", frameToTimestamp(program.endFrame - program.startFrame, true), () =>
            this.originalWaveformDisplay.zoomToFit(program.startFrame, program.endFrame));

        let count = 1;
        for (const bitData of program.bits) {
            if (bitData.bitType === BitType.BAD) {
                addKeyValue("Bit error " + count++, frameToTimestamp(bitData.startFrame), () =>
                    this.originalWaveformDisplay.zoomToBitData(bitData));
            }
        }

        return new Pane(div);
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

        const zoomInButton = document.createElement("button");
        zoomInButton.innerText = "Zoom In";
        zoomInButton.classList.add("nice_button");
        zoomInButton.addEventListener("click", () => waveformDisplay.zoomIn());
        div.appendChild(zoomInButton);

        div.appendChild(document.createTextNode(" "));

        const zoomOutButton = document.createElement("button");
        zoomOutButton.innerText = "Zoom Out";
        zoomOutButton.classList.add("nice_button");
        zoomOutButton.addEventListener("click", () => waveformDisplay.zoomOut());
        div.appendChild(zoomOutButton);

        const p = document.createElement("p");
        p.innerText = "Reconstructed high-speed waveform:";
        div.appendChild(p);

        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 400;
        div.appendChild(canvas);

        const waveformDisplay = new WaveformDisplay();
        waveformDisplay.addWaveform(canvas, program.reconstructedSamples);
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
        for (const otherPane of this.panes) {
            if (otherPane !== pane) {
                otherPane.element.classList.add("hidden");
                otherPane.row?.classList.remove("selected");
                otherPane.trs80?.stop();
            }
        }

        // Show this one.
        pane.element.classList.remove("hidden");
        pane.row?.classList.add("selected");
        pane.trs80?.start();
    }

    /**
     * Create the panes and the table of contents for them on the left.
     */
    private updateTapeContents() {
        // Add a row to the table of contents.
        const addRow = (text: string, onClick?: ((this: GlobalEventHandlers, ev: MouseEvent) => any)) => {
            const div = document.createElement("div");
            div.classList.add("tape_contents_row");
            div.innerText = text;
            if (onClick != undefined) {
                div.classList.add("selectable_row");
                div.onclick = onClick;
            }
            this.tapeContents.appendChild(div);
            return div;
        };

        // Show the name of the whole tape.
        const title = addRow(this.tape.name);
        title.style.fontWeight = "100";
        title.style.fontSize = "24pt";

        // Create panes for each program.
        for (const program of this.tape.programs) {
            // Header for program.
            const row = addRow("Track " + program.trackNumber + ", copy " + program.copyNumber + ", " + program.decoderName);
            row.style.marginTop = "1em";

            // Add a pane to the top-right, register it, and add it to table of contents.
            const addPane = (label: string, pane: Pane) => {
                pane.element.classList.add("pane");
                pane.element.classList.add("hidden");
                this.topData.appendChild(pane.element);
                this.panes.push(pane);
                pane.row = addRow("    " + label, () => {
                    this.showPane(pane);
                });
            };

            // Metadata pane.
            let metadataLabel = frameToTimestamp(program.startFrame, true) + " to " +
                frameToTimestamp(program.endFrame, true) + " (" +
                frameToTimestamp(program.endFrame - program.startFrame, true) + ")";
            addPane(metadataLabel, this.makeMetadataPane(program));

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
        }

        // Show the first pane.
        if (this.panes.length > 0) {
            this.showPane(this.panes[0]);
        }
    }
}
