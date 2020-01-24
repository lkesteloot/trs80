import {frameToTimestamp, HZ} from "./AudioUtils";
import * as Basic from "./Basic";
import * as Hexdump from "./Hexdump";
import {Program} from "./Program";
import {Tape} from "./Tape";
import {Cassette, Trs80} from "trs80-emulator";
import {WaveformDisplay} from "./WaveformDisplay";
import {decodeEdtasm} from "./Edtasm";
import {BitType} from "./BitType";
import {Highlight} from "./Highlight";

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
    edtasmName?: string;
    onHighlight?: (highlight: Highlight | undefined) => void;
    onSelect?: (selection: Highlight | undefined) => void;

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
 * Helper class to highlight or select elements.
 */
class Highlighter {
    /**
     * The TapeBrowser object, for updating highlights and selections.
     */
    private readonly tapeBrowser: TapeBrowser;
    /**
     * The program that all these elements belong to. In principle they could
     * belong to more than one, but not in our current UI.
     */
    private readonly program: Program;
    /**
     * Entire container of these element, to catch clicks outside any specific element.
     */
    private readonly container: HTMLElement;
    /**
     * All elements, index by the byte index.
     */
    readonly elements: HTMLElement[] = [];
    /**
     * Currently-highlighted elements.
     */
    readonly highlightedElements: HTMLElement[] = [];
    /**
     * Currently-selected elements.
     */
    readonly selectedElements: HTMLElement[] = [];

    /**
     * The start of the selection, if we're currently selecting.
     */
    private selectionBeginIndex: number | undefined;

    constructor(tapeBrowser: TapeBrowser, program: Program, container: HTMLElement) {
        this.tapeBrowser = tapeBrowser;
        this.program = program;
        this.container = container;

        container.addEventListener("mousedown", event => event.preventDefault());
        container.addEventListener("mouseup", event => {
            this.selectionBeginIndex = undefined;
            event.preventDefault();
        });
    }

    /**
     * Add an element to be highlighted.
     */
    public addElement(byteIndex: number, element: HTMLElement | undefined): void {
        // Allow undefined element for convenience of caller. Just ignore it.
        if (element === undefined) {
            return;
        }

        this.elements[byteIndex] = element;

        // Set up event listeners for highlighting.
        element.addEventListener("mouseenter", () => {
            this.tapeBrowser.setHighlight(new Highlight(this.program, byteIndex))
            if (this.selectionBeginIndex !== undefined) {
                this.tapeBrowser.setSelection(new Highlight(this.program, this.selectionBeginIndex, byteIndex));
            }
        });
        element.addEventListener("mouseleave", () => {
            if (this.selectionBeginIndex === undefined) {
                this.tapeBrowser.setHighlight(undefined)
            }
        });

        // Set up event listeners for selecting.
        element.addEventListener("mousedown", event => {
            this.tapeBrowser.setSelection(new Highlight(this.program, byteIndex));
            this.selectionBeginIndex = byteIndex;
            event.preventDefault();
        });
        element.addEventListener("mouseup", event => {
            this.selectionBeginIndex = undefined;
            event.preventDefault();
        });
    }

    /**
     * Highlight the specified elements.
     */
    public highlight(highlight: Highlight | undefined, program: Program, highlightClassName: string): void {
        for (const e of this.highlightedElements) {
            e.classList.remove(highlightClassName);
        }
        this.highlightedElements.splice(0);
        if (highlight !== undefined && highlight.program === program) {
            const e = this.elements[highlight.firstIndex];
            if (e !== undefined) {
                e.classList.add(highlightClassName);
                this.highlightedElements.push(e);
            }
        }
    }

    /**
     * Select the specified elements.
     */
    public select(highlight: Highlight | undefined, program: Program, selectClassName: string): void {
        for (const e of this.selectedElements) {
            e.classList.remove(selectClassName);
        }
        this.selectedElements.splice(0);
        if (highlight !== undefined && highlight.program === program) {
            for (let byteIndex = highlight.firstIndex; byteIndex <= highlight.lastIndex; byteIndex++) {
                const e = this.elements[byteIndex];
                if (e !== undefined) {
                    e.classList.add(selectClassName);
                    this.selectedElements.push(e);
                }
            }
        }
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

        zoomInButton.onclick = () => this.originalWaveformDisplay.zoomIn();
        zoomOutButton.onclick = () => this.originalWaveformDisplay.zoomOut();

        // Update left-side panel.
        this.updateTapeContents();

        this.originalWaveformDisplay.draw();
    }

    /**
     * Update the highlighted byte.
     */
    public setHighlight(highlight: Highlight | undefined): void {
        // Alert panes.
        for (const pane of this.panes) {
            pane.onHighlight?.(highlight);
        }

        // Update waveform.
        this.originalWaveformDisplay.setHighlight(highlight);
    }

    /**
     * Update the selected byte.
     */
    public setSelection(selection: Highlight | undefined): void {
        console.log(selection);
        // Alert panes.
        for (const pane of this.panes) {
            pane.onSelect?.(selection);
        }

        // Update waveform.
        this.originalWaveformDisplay.setSelection(selection);
    }

    private makeMetadataPane(program: Program, basicPane?: Pane, edtasmPane?: Pane): Pane {
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
        if (basicPane !== undefined) {
            addKeyValue("Type", "Basic program", () => this.showPane(basicPane));
        } else if (edtasmPane !== undefined) {
            addKeyValue("Type", "Assembly program (" + edtasmPane.edtasmName + ")", () => this.showPane(edtasmPane));
        } else {
            addKeyValue("Type", "Unknown");
        }

        let count = 1;
        for (const bitData of program.bitData) {
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

        const hexHighlighter = new Highlighter(this, program, div);
        const asciiHighlighter = new Highlighter(this, program, div);

        const [hexElements, asciiElements] = Hexdump.create(program.binary, div);

        hexElements.forEach((e, byteIndex) => hexHighlighter.addElement(byteIndex, e));
        asciiElements.forEach((e, byteIndex) => asciiHighlighter.addElement(byteIndex, e));

        let pane = new Pane(div);
        pane.onHighlight = highlight => {
            hexHighlighter.highlight(highlight, program, Hexdump.highlightClassName);
            asciiHighlighter.highlight(highlight, program, Hexdump.highlightClassName);
        };
        pane.onSelect = selection => {
            hexHighlighter.select(selection, program, Hexdump.selectClassName);
            asciiHighlighter.select(selection, program, Hexdump.selectClassName);
        };
        return pane;
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

        const elements = Basic.fromTokenized(program.binary, div);

        const highlighter = new Highlighter(this, program, div);

        elements.forEach((e, byteIndex) => highlighter.addElement(byteIndex, e));

        let pane = new Pane(div);
        pane.onHighlight = highlight => {
            highlighter.highlight(highlight, program, Basic.highlightClassName);
        };
        pane.onSelect = selection => {
            highlighter.select(selection, program, Basic.selectClassName);
        };
        return pane;
    }

    private makeEdtasmPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("program");
        div.classList.add("edtasm");

        const name = decodeEdtasm(program.binary, div);

        const pane = new Pane(div);
        pane.edtasmName = name;
        return pane;
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
            if (onClick !== undefined) {
                div.classList.add("selectable_row");
                div.onclick = onClick;
            }
            this.tapeContents.appendChild(div);
            return div;
        };

        // Show the name of the whole tape.
        const title = addRow(this.tape.name);
        title.classList.add("tape_title");

        // Create panes for each program.
        for (const program of this.tape.programs) {
            // Header for program.
            const row = addRow("Track " + program.trackNumber + ", copy " + program.copyNumber + ", " + program.decoderName);
            row.classList.add("program_title");

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

            // Make these panes here so they're accessible from the metadata page.
            const basicPane = program.isBasicProgram() ? this.makeBasicPane(program) : undefined;
            const edtasmPane = program.isEdtasmProgram() ? this.makeEdtasmPane(program) : undefined;

            // Metadata pane.
            let metadataLabel = frameToTimestamp(program.startFrame, true) + " to " +
                frameToTimestamp(program.endFrame, true) + " (" +
                frameToTimestamp(program.endFrame - program.startFrame, true) + ")";
            addPane(metadataLabel, this.makeMetadataPane(program, basicPane, edtasmPane));

            // Make the various panes.
            addPane("Binary", this.makeBinaryPane(program));
            addPane("Reconstructed", this.makeReconstructedPane(program));
            if (basicPane !== undefined) {
                addPane("Basic", basicPane);
                addPane("Emulator (original)", this.makeEmulatorPane(program, new TapeCassette(this.tape, program)));
                addPane("Emulator (reconstructed)", this.makeEmulatorPane(program, new ReconstructedCassette(program)));
            }
            if (edtasmPane !== undefined) {
                addPane("Assembly (" + edtasmPane.edtasmName + ")", edtasmPane);
            }
        }

        // Show the first pane.
        if (this.panes.length > 0) {
            this.showPane(this.panes[0]);
        }
    }
}
