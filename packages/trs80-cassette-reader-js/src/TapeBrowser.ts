import {frameToTimestamp} from "./AudioUtils";
import * as Basic from "./Basic";
import * as Hexdump from "./Hexdump";
import {Program} from "./Program";
import {Tape} from "./Tape";
import {Cassette, Trs80} from "trs80-emulator";
import {WaveformDisplay} from "./WaveformDisplay";
import * as Edtasm from "./Edtasm";
import {BitType} from "./BitType";
import {Highlight} from "./Highlight";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {DisplaySamples} from "./DisplaySamples";
import {base64EncodeUint8Array, clearElement} from "./Utils";
import {CssScreen} from "trs80-emulator";
import {ControlPanel} from "trs80-emulator";

/**
 * Generic cassette that reads from a Int16Array.
 */
class Int16Cassette extends Cassette {
    private readonly samples: Int16Array;
    private frame: number = 0;
    private progressBar: HTMLProgressElement | undefined;

    constructor(samples: Int16Array, sampleRate: number) {
        super();
        this.samples = samples;
        this.samplesPerSecond = sampleRate;
    }

    public rewind(): void {
        this.frame = 0;
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
            console.log("Reading tape at " + frameToTimestamp(this.frame, this.samplesPerSecond));
        }
        if (this.progressBar !== undefined && this.frame % Math.floor(this.samplesPerSecond / 10) === 0) {
            this.progressBar.value = this.frame;
        }

        return this.frame < this.samples.length ? this.samples[this.frame++]/32768 : 0;
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
class TapeCassette extends Int16Cassette {
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
class ReconstructedCassette extends Int16Cassette {
    constructor(program: Program, sampleRate: number) {
        super(program.reconstructedSamples.samplesList[0], sampleRate);
    }
}

/**
 * Class that keeps track of various information about a pane.
 */
class Pane {
    element: HTMLElement;
    row?: HTMLElement;
    edtasmName?: string;
    willHide?: () => void;
    didHide?: () => void;
    willShow?: () => void;
    didShow?: () => void;

    constructor(element: HTMLElement) {
        this.element = element;
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
    /**
     * An element we should scroll to after we become visible.
     */
    private scrollToElement: HTMLElement | undefined;

    constructor(tapeBrowser: TapeBrowser, program: Program, container: HTMLElement) {
        this.tapeBrowser = tapeBrowser;
        this.program = program;
        this.container = container;

        container.addEventListener("mousedown", event => event.preventDefault());
        window.addEventListener("mouseup", event => {
            if (this.selectionBeginIndex !== undefined) {
                this.selectionBeginIndex = undefined;
                this.tapeBrowser.doneSelecting(this);
                event.preventDefault();
            }
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
            this.tapeBrowser.setHighlight(new Highlight(this.program, byteIndex));
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

    /**
     * Called when the user is done selecting and we should scroll to the selection.
     */
    public doneSelecting(): void {
        // Bring the middle element into view.
        if (this.selectedElements.length > 0) {
            const midElement = this.selectedElements[Math.floor(this.selectedElements.length / 2)];
            if (midElement.offsetHeight === 0) {
                // Not visible, do this later.
                this.scrollToElement = midElement;
            } else {
                midElement.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }
        }
    }

    /**
     * This set of elements was just shown.
     */
    public didShow(): void {
        if (this.scrollToElement !== undefined) {
            this.scrollToElement.scrollIntoView({
                behavior: "auto",
                block: "center",
            });
            this.scrollToElement = undefined;
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
    /**
     * Current highlight, or undefined if none.
     */
    private highlight: Highlight | undefined;
    /**
     * Current selection, or undefined if none.
     */
    private selection: Highlight | undefined;
    /**
     * Dispatcher for highlight property.
     */
    private readonly onHighlight = new SimpleEventDispatcher<Highlight | undefined>();
    /**
     * Dispatcher for selection property.
     */
    private readonly onSelection = new SimpleEventDispatcher<Highlight | undefined>();
    /**
     * Dispatcher for the selection being done. Value is the source of the selecting process.
     */
    private readonly onDoneSelecting = new SimpleEventDispatcher<any>();

    constructor(tape: Tape,
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

        this.makeOriginalSamplesWaveforms(waveforms);
        this.tape.programs.forEach(program => this.originalWaveformDisplay.addProgram(program));
        this.originalWaveformDisplay.draw();

        // Update left-side panel.
        this.updateTapeContents();

    }

    /**
     * Update the highlighted byte.
     */
    public setHighlight(highlight: Highlight | undefined): void {
        this.highlight = highlight;
        this.onHighlight.dispatch(this.highlight);
    }

    /**
     * Update the selected byte.
     */
    public setSelection(selection: Highlight | undefined): void {
        this.selection = selection;
        this.onSelection.dispatch(this.selection);
    }

    /**
     * Called when the user has finished selecting part of the data (releases the mouse button).
     */
    public doneSelecting(source: any): void {
        this.onDoneSelecting.dispatch(source);
    }

    /**
     * Fill the parent with the labels and canvases to display the specified waveforms
     * and their labels.
     */
    private makeWaveforms(parent: HTMLElement, waveformDisplay: WaveformDisplay,
                         sampleSets: { label: string, samples: DisplaySamples }[]): void {

        clearElement(parent);

        const zoomControls = document.createElement("div");
        zoomControls.appendChild(waveformDisplay.makeZoomControls());
        parent.appendChild(zoomControls);

        for (const sampleSet of sampleSets) {
            let label = document.createElement("p");
            label.innerText = sampleSet.label;
            parent.appendChild(label);

            let canvas = document.createElement("canvas");
            canvas.width = 800;
            canvas.height = 400;
            waveformDisplay.addWaveform(canvas, sampleSet.samples);
            parent.appendChild(canvas);
        }

        this.onHighlight.subscribe(highlight => waveformDisplay.setHighlight(highlight));
        this.onSelection.subscribe(selection => waveformDisplay.setSelection(selection));
        this.onDoneSelecting.subscribe(source => {
            if (source !== waveformDisplay) {
                waveformDisplay.doneSelecting()
            }
        });

        waveformDisplay.onHighlight.subscribe(highlight => this.setHighlight(highlight));
        waveformDisplay.onSelection.subscribe(selection => this.setSelection(selection));
        waveformDisplay.onDoneSelecting.subscribe(source => this.doneSelecting(source));

        waveformDisplay.zoomToFitAll();
    }

    /**
     * Make the lower-right pane of original waveforms.
     */
    private makeOriginalSamplesWaveforms(waveforms: HTMLElement): void {
        this.makeWaveforms(waveforms, this.originalWaveformDisplay, [
            {
                label: "Original waveform:",
                samples: this.tape.originalSamples,
            },
            {
                label: "High-pass filtered to get rid of DC:",
                samples: this.tape.filteredSamples,
            },
            {
                label: "Differentiated for low-speed decoding:",
                samples: this.tape.lowSpeedSamples,
            },
        ]);
    }

    /**
     * Make pane of metadata for a program.
     */
    private makeMetadataPane(program: Program, basicPane?: Pane, edtasmPane?: Pane): Pane {
        const div = document.createElement("div");
        div.classList.add("metadata");
        div.style.display = "flex";

        const textInfoDiv = document.createElement("div");
        div.appendChild(textInfoDiv);

        const h1 = document.createElement("h1");
        h1.innerText = "Track " + program.trackNumber + ", copy " + program.copyNumber;
        textInfoDiv.appendChild(h1);

        const table = document.createElement("table");
        textInfoDiv.appendChild(table);

        // Add entry with any data cell for value. Returns the key element.
        const addKeyElement = (key: string, valueElement: HTMLTableDataCellElement) => {
            const row = document.createElement("tr");

            const keyElement = document.createElement("td");
            keyElement.classList.add("key");
            keyElement.innerText = key + ":";
            row.appendChild(keyElement);

            row.appendChild(valueElement);

            table.appendChild(row);

            return keyElement;
        };

        // Add entry with text (possibly clickable) for value.
        const addKeyValue = (key: string, value: string, click?: () => void) => {
            const valueElement = document.createElement("td");
            valueElement.classList.add("value");
            valueElement.innerText = value;
            if (click !== undefined) {
                valueElement.classList.add("clickable");
                valueElement.addEventListener("click", click);
            }

            addKeyElement(key, valueElement);
        };

        addKeyValue("Decoder", program.decoderName);
        addKeyValue("Start time", frameToTimestamp(program.startFrame, this.tape.sampleRate), () =>
            this.originalWaveformDisplay.zoomToFit(program.startFrame - 100, program.startFrame + 100));
        addKeyValue("End time", frameToTimestamp(program.endFrame, this.tape.sampleRate), () =>
            this.originalWaveformDisplay.zoomToFit(program.endFrame - 100, program.endFrame + 100));
        addKeyValue("Duration", frameToTimestamp(program.endFrame - program.startFrame, this.tape.sampleRate, true), () =>
            this.originalWaveformDisplay.zoomToFit(program.startFrame, program.endFrame));
        addKeyValue("Binary", "Download " + program.binary.length + " bytes", () => {
            // Download binary.
            const a = document.createElement("a");
            a.href = "data:application/octet-stream;base64," + base64EncodeUint8Array(program.binary);
            a.download = program.getShortLabel().replace(" ", "-") + ".bin";
            a.click();
        });
        if (basicPane !== undefined) {
            addKeyValue("Type", "Basic program", () => this.showPane(basicPane));
        } else if (edtasmPane !== undefined) {
            addKeyValue("Type", "Assembly program" + (edtasmPane.edtasmName ? " (" + edtasmPane.edtasmName + ")" : ""),
                () => this.showPane(edtasmPane));
        } else {
            addKeyValue("Type", "Unknown");
        }

        // Add editable fields.
        {
            const td = document.createElement("td");
            td.classList.add("value");

            const input = document.createElement("input");
            input.classList.add("name");
            program.onName.subscribe(name => input.value = name);
            input.value = program.name;
            td.appendChild(input);

            addKeyElement("Name", td);

            input.addEventListener("input", event => {
                program.setName(input.value);
                this.tape.saveUserData();
            });
        }
        {
            const td = document.createElement("td");
            td.classList.add("value");

            const input = document.createElement("textarea");
            input.classList.add("notes");
            input.rows = 5;
            program.onNotes.subscribe(notes => input.value = notes);
            input.value = program.notes;
            td.appendChild(input);

            const keyElement = addKeyElement("Notes", td);
            keyElement.classList.add("top");

            input.addEventListener("input", event => {
                program.setNotes(input.value);
                this.tape.saveUserData();
            });
        }

        // Add bit errors.
        let count = 1;
        for (const bitData of program.bitData) {
            if (bitData.bitType === BitType.BAD) {
                addKeyValue("Bit error " + count++, frameToTimestamp(bitData.startFrame, this.tape.sampleRate), () =>
                    this.originalWaveformDisplay.zoomToBitData(bitData));
            }
        }

        // Add screenshot.
        const screenshotDiv = document.createElement("div");
        screenshotDiv.style.marginLeft = "20pt";
        div.appendChild(screenshotDiv);
        const screenshotScreen = new CssScreen(screenshotDiv);
        screenshotScreen.displayScreenshot(program.screenshot);
        program.onScreenshot.subscribe(screenshot => {
            screenshotScreen.displayScreenshot(screenshot)
        });

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

        this.onHighlight.subscribe(highlight => {
            hexHighlighter.highlight(highlight, program, Hexdump.highlightClassName);
            asciiHighlighter.highlight(highlight, program, Hexdump.highlightClassName);
        });
        this.onSelection.subscribe(selection => {
            hexHighlighter.select(selection, program, Hexdump.selectClassName);
            asciiHighlighter.select(selection, program, Hexdump.selectClassName);
        });
        this.onDoneSelecting.subscribe(source => {
            if (source !== hexHighlighter && source !== asciiHighlighter) {
                hexHighlighter.doneSelecting();
                asciiHighlighter.doneSelecting();
            }
        });

        let pane = new Pane(div);
        pane.didShow = () => {
            hexHighlighter.didShow();
            asciiHighlighter.didShow();
        };
        return pane;
    }

    /**
     * Make the pane of the audio sample we reconstruct from the bits.
     */
    private makeReconstructedPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("reconstructed_waveform");

        this.makeWaveforms(div, new WaveformDisplay(), [
            {
                label: "Reconstructed high-speed waveform:",
                samples: program.reconstructedSamples,
            }
        ]);

        return new Pane(div);
    }

    private makeBasicPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("program");

        const elements = Basic.fromTokenized(program.binary, div);

        const highlighter = new Highlighter(this, program, div);
        elements.forEach((e, byteIndex) => highlighter.addElement(byteIndex, e));

        this.onHighlight.subscribe(highlight => {
            highlighter.highlight(highlight, program, Basic.highlightClassName);
        });
        this.onSelection.subscribe(selection => {
            highlighter.select(selection, program, Basic.selectClassName);
        });
        this.onDoneSelecting.subscribe(source => {
            if (source !== highlighter) {
                highlighter.doneSelecting();
            }
        });

        let pane = new Pane(div);
        pane.didShow = () => {
            highlighter.didShow();
        };
        return pane;
    }

    private makeEdtasmPane(program: Program): Pane {
        const div = document.createElement("div");
        div.classList.add("program");

        const [name, elements] = Edtasm.decodeEdtasm(program.binary, div);

        const highlighter = new Highlighter(this, program, div);
        elements.forEach((e, byteIndex) => highlighter.addElement(byteIndex, e));

        this.onHighlight.subscribe(highlight => {
            highlighter.highlight(highlight, program, Edtasm.highlightClassName);
        });
        this.onSelection.subscribe(selection => {
            highlighter.select(selection, program, Edtasm.selectClassName);
        });
        this.onDoneSelecting.subscribe(source => {
            if (source !== highlighter) {
                highlighter.doneSelecting();
            }
        });

        const pane = new Pane(div);
        pane.edtasmName = name;
        pane.didShow = () => {
            highlighter.didShow();
        };
        return pane;
    }

    private makeEmulatorPane(program: Program, cassette: Int16Cassette): Pane {
        const div = document.createElement("div");

        const screenDiv = document.createElement("div");
        div.appendChild(screenDiv);

        const progressBar = document.createElement("progress");
        progressBar.classList.add("hidden");
        cassette.setProgressBar(progressBar);
        div.appendChild(progressBar);

        const screen = new CssScreen(screenDiv);
        const trs80 = new Trs80(screen, cassette);
        let controlPanel = new ControlPanel(screen.getNode());
        controlPanel.addResetButton(() => trs80.reset());
        controlPanel.addTapeRewindButton(() => {
            cassette.rewind();
        });
        controlPanel.addScreenshotButton(() => {
            const screenshot = trs80.getScreenshot();
            program.setScreenshot(screenshot);
            this.tape.saveUserData();
        });
        trs80.reset();

        let pane = new Pane(div);
        pane.didShow = () => trs80.start();
        pane.didHide = () => trs80.stop();
        return pane;
    }

    /**
     * Show a particular pane and hide all others.
     */
    private showPane(pane: Pane): void {
        // Hide all others.
        for (const otherPane of this.panes) {
            if (otherPane !== pane) {
                otherPane.willHide?.();
                otherPane.element.classList.add("hidden");
                otherPane.row?.classList.remove("selected");
                otherPane.didHide?.();
            }
        }

        // Show this one.
        pane.willShow?.();
        pane.element.classList.remove("hidden");
        pane.row?.classList.add("selected");
        pane.didShow?.();
    }

    /**
     * Create the panes and the table of contents for them on the left.
     */
    private updateTapeContents() {
        // Add a new section that we can style all at once.
        const addSection = () => {
            const sectionDiv = document.createElement("div");
            this.tapeContents.appendChild(sectionDiv);
            return sectionDiv;
        };

        let sectionDiv: HTMLDivElement = addSection();

        // Add a row to the table of contents.
        const addRow = (text: string, onClick?: ((this: GlobalEventHandlers, ev: MouseEvent) => any)) => {
            const rowDiv = document.createElement("div");
            rowDiv.classList.add("tape_contents_row");
            rowDiv.innerText = text;
            if (onClick !== undefined) {
                rowDiv.classList.add("selectable_row");
                rowDiv.onclick = onClick;
            }
            sectionDiv.appendChild(rowDiv);
            return rowDiv;
        };

        // Show the name of the whole tape.
        const title = addRow(this.tape.name);
        title.classList.add("tape_title");

        // Create panes for each program.
        let previousTrackNumber = -1;
        let firstCopyOfTrack: Program | undefined = undefined;

        for (const program of this.tape.programs) {
            let duplicateCopy = false;

            sectionDiv = addSection();

            // Header for program.
            const row = addRow(program.name || program.getLabel());
            program.onName.subscribe(name => row.innerText = program.name || program.getLabel());
            row.classList.add("program_title");

            // Dividing line for new tracks.
            if (program.trackNumber !== previousTrackNumber) {
                row.classList.add("new_track");
                previousTrackNumber = program.trackNumber;
                firstCopyOfTrack = program;
            } else if (firstCopyOfTrack !== undefined) {
                // Non-first copies.
                if (program.sameBinaryAs(firstCopyOfTrack)) {
                    sectionDiv.classList.add("duplicate_copy");
                    duplicateCopy = true;
                }
            }

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
            let metadataLabel = frameToTimestamp(program.startFrame, this.tape.sampleRate, true) + " to " +
                frameToTimestamp(program.endFrame, this.tape.sampleRate, true) + " (" +
                frameToTimestamp(program.endFrame - program.startFrame, this.tape.sampleRate, true) + ")";
            addPane(metadataLabel, this.makeMetadataPane(program, basicPane, edtasmPane));

            // Make the various panes.
            addPane("Binary" + (duplicateCopy ? " (same as copy " + firstCopyOfTrack?.copyNumber + ")" : ""),
                this.makeBinaryPane(program));
            addPane("Reconstructed", this.makeReconstructedPane(program));
            if (basicPane !== undefined) {
                addPane("Basic", basicPane);
                addPane("Emulator (original)", this.makeEmulatorPane(program, new TapeCassette(this.tape, program)));
                addPane("Emulator (reconstructed)", this.makeEmulatorPane(program, new ReconstructedCassette(program, this.tape.sampleRate)));
            }
            if (edtasmPane !== undefined) {
                addPane("Assembly" + (edtasmPane.edtasmName ? " (" + edtasmPane.edtasmName + ")" : ""), edtasmPane);
            }
        }

        // Show the first pane.
        if (this.panes.length > 0) {
            this.showPane(this.panes[0]);
        }
    }
}
