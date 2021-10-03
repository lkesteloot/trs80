import * as BasicRender from "./BasicRender";
import * as SystemProgramRender from "./SystemProgramRender";
import * as CmdProgramRender from "./CmdProgramRender";
import * as Hexdump from "./Hexdump";
import {CassettePlayer, Trs80} from "trs80-emulator";
import {ControlPanel, CanvasScreen, ProgressBar, SettingsPanel, PanelType, WebKeyboard} from "trs80-emulator-web";
import {WaveformDisplay} from "./WaveformDisplay";
import * as Edtasm from "./Edtasm";
import {Highlight} from "./Highlight";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {clearElement} from "./Utils";
import {Highlighter} from "./Highlighter";
import {
    BasicProgram,
    CmdProgram,
    decodeBasicProgram,
    decodeCmdProgram,
    decodeSystemProgram, SystemProgram, Trs80File
} from "trs80-base";
import {BitType, DEFAULT_SAMPLE_RATE, DisplaySamples, frameToTimestamp, Program, Tape} from "trs80-cassette";
import {WebSoundPlayer} from "../../trs80-emulator-web/dist/WebSoundPlayer";

/**
 * Generic cassette that reads from a Int16Array.
 */
class Int16Cassette extends CassettePlayer {
    private readonly samples: Int16Array;
    private frame: number = 0;
    private progressBar: ProgressBar | undefined;
    private motorOn = false;
    private rewinding = false;

    constructor(samples: Int16Array, sampleRate: number) {
        super();
        this.samples = samples;
        this.samplesPerSecond = sampleRate;
    }

    public rewind(): void {
        if (this.progressBar === undefined) {
            this.frame = 0;
        } else {
            this.rewinding = true;
            this.updateProgressBarVisibility();
            const updateRewind = () => {
                if (this.frame > 0) {
                    this.frame = Math.max(0, Math.round(this.frame - this.samples.length/30));
                    this.progressBar?.setValue(this.frame);
                    window.requestAnimationFrame(updateRewind);
                } else {
                    this.rewinding = false;
                    this.updateProgressBarVisibility();
                }
            };
            // Wait for progress bar to become visible.
            setTimeout(updateRewind, 150);
        }
    }

    public setProgressBar(progressBar: ProgressBar): void {
        this.progressBar = progressBar;
        this.progressBar.setMaxValue(this.samples.length);
    }

    public onMotorStart(): void {
        this.motorOn = true;
        this.updateProgressBarVisibility();
    }

    public readSample(): number {
        if (this.rewinding) {
            // Can't read while rewinding.
            return 0;
        } else {
            if (this.frame % this.samplesPerSecond === 0) {
                console.log("Reading tape at " + frameToTimestamp(this.frame, this.samplesPerSecond));
            }
            if (this.progressBar !== undefined &&
                (this.frame % Math.floor(this.samplesPerSecond / 10) === 0 ||
                    this.frame == this.samples.length - 1)) {

                this.progressBar.setValue(this.frame);
            }

            return this.frame < this.samples.length ? this.samples[this.frame++] / 32768 : 0;
        }
    }

    public onMotorStop(): void {
        this.motorOn = false;
        this.updateProgressBarVisibility();
    }

    private updateProgressBarVisibility() {
        if (this.progressBar !== undefined) {
            if (this.motorOn || this.rewinding) {
                this.progressBar.show();
            } else {
                this.progressBar.hide();
            }
        }
    }
}

/**
 * Implementation of Cassette that reads from our displayed data.
 */
class TapeCassette extends Int16Cassette {
    constructor(tape: Tape, program: Program | undefined) {
        const samples = tape.originalSamples.samplesList[0];

        // Start one second before the official program start, so that the machine
        // can detect the header.
        const begin = program === undefined ? 0 : Math.max(0, program.startFrame - tape.sampleRate);

        // Go until one second after the detected end of our program.
        const end = program === undefined ? samples.length : Math.min(samples.length, program.endFrame + tape.sampleRate);

        super(samples.subarray(begin, end), tape.sampleRate);
    }
}

/**
 * Implementation of Cassette that reads from our high-speed reconstruction.
 */
class ReconstructedCassette extends Int16Cassette {
    constructor(samples: DisplaySamples, sampleRate: number) {
        super(samples.samplesList[0], sampleRate);
    }
}

/**
 * Empty cassette for when there's nothing to read.
 */
class EmptyCassette extends Int16Cassette {
    constructor() {
        super(new Int16Array(0), DEFAULT_SAMPLE_RATE);
    }
}

/**
 * Class that keeps track of various information about a pane.
 */
class Pane {
    element: HTMLElement;
    row?: HTMLElement;
    programName?: string;
    willHide?: () => void;
    didHide?: () => void;
    willShow?: () => void;
    didShow?: () => void;

    constructor(element: HTMLElement) {
        this.element = element;
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
    private readonly originalWaveformDisplay: WaveformDisplay;
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
        this.originalWaveformDisplay = new WaveformDisplay(tape.sampleRate);

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
                          showSelectionType: boolean,
                          sampleSets: { label: string, samples: DisplaySamples }[]): void {

        clearElement(parent);

        parent.appendChild(waveformDisplay.makeControls(showSelectionType));

        for (const sampleSet of sampleSets) {
            waveformDisplay.addWaveformAndChrome(sampleSet.label, sampleSet.samples, parent);
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
        waveformDisplay.queueDraw();
    }

    /**
     * Make the lower-right pane of original waveforms.
     */
    private makeOriginalSamplesWaveforms(waveforms: HTMLElement): void {
        this.originalWaveformDisplay.addWaveformAnnotations(this.tape.waveformAnnotations);
        this.makeWaveforms(waveforms, this.originalWaveformDisplay, true, [
            {
                label: "Original waveform:",
                samples: this.tape.originalSamples,
            },
            {
                label: "High-pass filtered to get rid of DC:",
                samples: this.tape.filteredSamples,
            },
            {
                label: "Pre-processed for low-speed decoding:",
                samples: this.tape.lowSpeedSamples,
            },
        ]);
    }

    /**
     * Make pane of metadata for a program.
     */
    private makeMetadataPane(program: Program | Tape, basicPane?: Pane, systemPane?: Pane, edtasmPane?: Pane,
                             cmdPane?: Pane, onProgramClick?: (program: Program) => void): Pane {

        const div = document.createElement("div");
        div.classList.add("metadata");
        div.style.display = "flex";

        const textInfoDiv = document.createElement("div");
        div.appendChild(textInfoDiv);

        const h1 = document.createElement("h1");
        h1.innerText = program instanceof Program
            ? "Track " + program.trackNumber + ", copy " + program.copyNumber
            : "Whole Tape";
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
        const addKeyValues = (key: string, values: string[], click?: (value: string) => void) => {
            const valuesElement = document.createElement("td");
            valuesElement.classList.add("value");
            for (const value of values) {
                const valueElement = document.createElement("span");
                valueElement.innerText = value;
                if (click !== undefined) {
                    valueElement.classList.add("clickable");
                    valueElement.addEventListener("click", () => click(value));
                }
                valuesElement.appendChild(valueElement);
            }

            addKeyElement(key, valuesElement);
        };

        if (program instanceof Program) {
            addKeyValue("Decoder", program.decoder.getName());
        }
        const startFrame = program instanceof Program ? program.startFrame : 0;
        const endFrame = program instanceof Program ? program.endFrame : program.originalSamples.samplesList[0].length;
        addKeyValue("Start time", frameToTimestamp(startFrame, this.tape.sampleRate), () =>
            this.originalWaveformDisplay.zoomToFit(startFrame - 100, startFrame + 100));
        addKeyValue("End time", frameToTimestamp(endFrame, this.tape.sampleRate), () =>
            this.originalWaveformDisplay.zoomToFit(endFrame - 100, endFrame + 100));
        addKeyValue("Duration", frameToTimestamp(endFrame - startFrame, this.tape.sampleRate, true), () =>
            this.originalWaveformDisplay.zoomToFit(startFrame, endFrame));
        if (program instanceof Program) {
            const binExtention = basicPane !== undefined ? ".BAS"
                : systemPane !== undefined ? ".3BN"
                    : cmdPane !== undefined ? ".CMD"
                        : ".BIN";
            addKeyValues("Download", [binExtention, ".CAS", ".WAV"], (extension: string) => {
                // Download binary.
                const a = document.createElement("a");
                let contents;
                let type;

                if (extension === ".CAS") {
                    contents = program.asCasFile();
                    type = "application/octet-stream";
                } else if (extension === ".WAV") {
                    contents = program.asWavFile();
                    type = "audio/wav";
                } else {
                    contents = program.binary;
                    type = "application/octet-stream";
                }

                const blob = new Blob([contents], {type: type});
                a.href = window.URL.createObjectURL(blob);

                a.download = (this.tape.name + "-" + program.getShortLabel()).replace(/ /g, "-") + extension;
                a.click();
            });
            if (basicPane !== undefined) {
                addKeyValue("Type", "Basic program", () => this.showPane(basicPane));
            } else if (systemPane !== undefined) {
                addKeyValue("Type", "System program" + (systemPane.programName ? " (" + systemPane.programName + ")" : ""),
                    () => this.showPane(systemPane));
            } else if (edtasmPane !== undefined) {
                addKeyValue("Type", "Assembly program" + (edtasmPane.programName ? " (" + edtasmPane.programName + ")" : ""),
                    () => this.showPane(edtasmPane));
            } else if (cmdPane !== undefined) {
                addKeyValue("Type", "CMD program" + (cmdPane.programName ? " (" + cmdPane.programName + ")" : ""),
                    () => this.showPane(cmdPane));
            } else {
                addKeyValue("Type", "Unknown");
            }
        } else {
            addKeyValues("Download", [".CAS", ".WAV"], (extension: string) => {
                // Download binary.
                const a = document.createElement("a");
                let contents;
                let type;

                if (extension === ".CAS") {
                    contents = program.asCasFile();
                    type = "application/octet-stream";
                } else {
                    contents = program.asWavFile();
                    type = "audio/wav";
                }

                const blob = new Blob([contents], {type: type});
                a.href = window.URL.createObjectURL(blob);
                a.download = (this.tape.name).replace(/ /g, "-") + extension;
                a.click();
            });
        }

        // Add editable fields.
        if (program instanceof Program) {
            const td = document.createElement("td");
            td.classList.add("value");

            const input = document.createElement("input");
            input.type = "text";
            input.classList.add("name");
            program.onName.subscribe(name => input.value = name);
            input.value = program.name;
            // Spec says "off", but Chrome ignores that, so use "chrome-off".
            input.autocomplete = "chrome-off";
            td.appendChild(input);

            addKeyElement("Name", td);

            input.addEventListener("input", event => {
                program.setName(input.value);
                this.tape.saveUserData();
            });
        }
        {
            // Show note.
            const td = document.createElement("td");
            td.classList.add("value");

            const input = document.createElement("textarea");
            input.classList.add("notes");
            input.rows = 5;
            program.onNotes.subscribe(notes => input.value = notes);
            input.value = program.notes;
            // Spec says "off", but Chrome ignores that, so use "chrome-off".
            input.autocomplete = "chrome-off";
            td.appendChild(input);

            const keyElement = addKeyElement("Notes", td);
            keyElement.classList.add("top");

            input.addEventListener("input", event => {
                program.setNotes(input.value);
                this.tape.saveUserData();
            });
        }

        if (program instanceof Program) {
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
            const screenshotScreen = new CanvasScreen();
            const updateScreenshot = (screenshot: string) => {
                clearElement(screenshotDiv);
                if (screenshot !== "") {
                    screenshotScreen.displayScreenshot(program.screenshot);
                    screenshotDiv.append(screenshotScreen.asImage());
                }
            };
            program.onScreenshot.subscribe(screenshot => {
                updateScreenshot(screenshot);
            });
            updateScreenshot(program.screenshot);
        } else {
            const screenshotsDiv = document.createElement("div");
            div.appendChild(screenshotsDiv);
            for (const subprogram of program.programs) {
                const screenshotDiv = document.createElement("div");
                screenshotDiv.style.marginLeft = "20pt";
                screenshotDiv.style.marginBottom = "20pt";
                screenshotDiv.style.float = "left";
                if (onProgramClick !== undefined) {
                    screenshotDiv.style.cursor = "pointer";
                    screenshotDiv.addEventListener("click", () => onProgramClick(subprogram));
                }
                screenshotsDiv.appendChild(screenshotDiv);
                const screenshotScreen = new CanvasScreen();
                const updateScreenshot = function (screenshot: string) {
                    clearElement(screenshotDiv);
                    if (screenshot !== "") {
                        screenshotScreen.displayScreenshot(screenshot);
                        const image = screenshotScreen.asImage();
                        image.style.maxWidth = "200px";
                        screenshotDiv.append(image);
                        screenshotDiv.style.display = "block";
                    } else {
                        screenshotDiv.style.display = "none";
                    }
                };
                updateScreenshot(subprogram.screenshot);
                subprogram.onScreenshot.subscribe(screenshot => {
                    updateScreenshot(screenshot);
                });
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
        hexHighlighter.addHighlightables(hexElements);
        asciiHighlighter.addHighlightables(asciiElements);

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
    private makeReconstructedPane(samples: DisplaySamples): Pane {
        const div = document.createElement("div");
        div.classList.add("reconstructed_waveform");

        this.makeWaveforms(div, new WaveformDisplay(this.tape.sampleRate), false, [
            {
                label: "Reconstructed low-speed waveform:",
                samples: samples,
            }
        ]);

        return new Pane(div);
    }

    private makeBasicPane(program: Program, basicProgram: BasicProgram): Pane {
        const div = document.createElement("div");
        div.classList.add("program");

        const highlightables = BasicRender.toDiv(basicProgram, div);

        const highlighter = new Highlighter(this, program, div);
        highlighter.addHighlightables(highlightables);

        this.onHighlight.subscribe(highlight => {
            highlighter.highlight(highlight, program, BasicRender.highlightClassName);
        });
        this.onSelection.subscribe(selection => {
            highlighter.select(selection, program, BasicRender.selectClassName);
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

    private makeSystemPane(program: Program, systemProgram: SystemProgram): Pane | undefined {
        const div = document.createElement("div");
        div.classList.add("program");
        div.classList.add("system-program");

        const [highlightables, annotations] = SystemProgramRender.toDiv(systemProgram, div);
        const highlighter = new Highlighter(this, program, div);
        highlighter.addHighlightables(highlightables);
        if (program.annotations === undefined) {
            program.annotations = [];
        }
        program.annotations.push(...systemProgram.annotations, ...annotations);

        this.onHighlight.subscribe(highlight => {
            highlighter.highlight(highlight, program, SystemProgramRender.highlightClassName);
        });
        this.onSelection.subscribe(selection => {
            highlighter.select(selection, program, SystemProgramRender.selectClassName);
        });
        this.onDoneSelecting.subscribe(source => {
            if (source !== highlighter) {
                highlighter.doneSelecting();
            }
        });

        let pane = new Pane(div);
        if (systemProgram.filename !== "") {
            pane.programName = systemProgram.filename;
        }
        pane.didShow = () => {
            highlighter.didShow();
        };
        return pane;
    }

    private makeCmdPane(program: Program, cmdProgram: CmdProgram): Pane | undefined {
        const div = document.createElement("div");
        div.classList.add("program");
        div.classList.add("cmd-program");

        const [highlightables, annotations] = CmdProgramRender.toDiv(cmdProgram, div);
        const highlighter = new Highlighter(this, program, div);
        highlighter.addHighlightables(highlightables);
        if (program.annotations === undefined) {
            program.annotations = [];
        }
        program.annotations.push(...cmdProgram.annotations, ...annotations);

        this.onHighlight.subscribe(highlight => {
            highlighter.highlight(highlight, program, CmdProgramRender.highlightClassName);
        });
        this.onSelection.subscribe(selection => {
            highlighter.select(selection, program, CmdProgramRender.selectClassName);
        });
        this.onDoneSelecting.subscribe(source => {
            if (source !== highlighter) {
                highlighter.doneSelecting();
            }
        });

        let pane = new Pane(div);
        if (cmdProgram.filename !== "") {
            pane.programName = cmdProgram.filename;
        }
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
        highlighter.addHighlightables(elements);

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
        pane.programName = name;
        pane.didShow = () => {
            highlighter.didShow();
        };
        return pane;
    }

    /**
     * Create a pane with an emulator pointing at the cassette and program.
     */
    private makeEmulatorPane(program: Program | undefined, cassette: Int16Cassette | undefined, trs80File?: Trs80File): Pane {
        const div = document.createElement("div");

        const screenDiv = document.createElement("div");
        div.appendChild(screenDiv);

        const screen = new CanvasScreen();
        screenDiv.append(screen.getNode());
        const keyboard = new WebKeyboard();
        const soundPlayer = new WebSoundPlayer();
        const trs80 = new Trs80(screen, keyboard, cassette ?? new EmptyCassette(), soundPlayer);
        keyboard.configureKeyboard();

        const reboot = () => {
            trs80.reset();

            if (trs80File !== undefined) {
                trs80.runTrs80File(trs80File);
            }
        };

        const hardwareSettingsPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.HARDWARE);
        const viewPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.VIEW);
        const controlPanel = new ControlPanel(screen.getNode());
        controlPanel.addResetButton(reboot);
        if (cassette !== undefined) {
            controlPanel.addTapeRewindButton(() => {
                cassette.rewind();
            });
        }
        if (program !== undefined) {
            controlPanel.addScreenshotButton(() => {
                const screenshot = trs80.getScreenshot();
                program.setScreenshot(screenshot);
                this.tape.saveUserData();
            });
        }
        controlPanel.addSettingsButton(hardwareSettingsPanel);
        controlPanel.addSettingsButton(viewPanel);
        if (cassette !== undefined) {
            const progressBar = new ProgressBar(screen.getNode());
            cassette.setProgressBar(progressBar);
        }
        reboot();

        const pane = new Pane(div);
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

        // Add a row to the table of contents. Returns the row div.
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
        let copiesOfTrack: Program[] = [];

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

        // Map from program to action when its screenshot is clicked.
        const screenshotClickAction: WeakMap<Program,() => void> = new WeakMap<Program, () => void>();

        // Header for tape.
        const row = addRow("Whole tape");
        row.classList.add("program_title");
        let metadataLabel = frameToTimestamp(0, this.tape.sampleRate, true) + " to " +
            frameToTimestamp(this.tape.originalSamples.samplesList[0].length, this.tape.sampleRate, true);
        addPane(metadataLabel, this.makeMetadataPane(this.tape, undefined, undefined, undefined, undefined,
            (program) => {
                screenshotClickAction.get(program)?.();
            }));
        addPane("Emulator", this.makeEmulatorPane(undefined, new TapeCassette(this.tape, undefined)));

        // Section for each program.
        for (const program of this.tape.programs) {
            let duplicateOfCopy: Program | undefined = undefined;

            sectionDiv = addSection();

            // Header for program.
            const row = addRow(program.name || program.getLabel());
            program.onName.subscribe(name => row.innerText = program.name || program.getLabel());
            row.classList.add("program_title");

            // Dividing line for new tracks.
            if (program.trackNumber !== previousTrackNumber) {
                row.classList.add("new_track");
                previousTrackNumber = program.trackNumber;
                copiesOfTrack = [];
            } else {
                // See if this is an exact version of a previous copy.
                for (const previousProgram of copiesOfTrack) {
                    if (program.sameBinaryAs(previousProgram)) {
                        sectionDiv.classList.add("duplicate_copy");
                        duplicateOfCopy = previousProgram;
                        break;
                    }
                }
            }
            copiesOfTrack.push(program);

            // Decode the programs.
            const basicProgram = decodeBasicProgram(program.binary);
            const systemProgram = decodeSystemProgram(program.binary);
            const cmdProgram = decodeCmdProgram(program.binary);

            // Make these panes here so they're accessible from the metadata page.
            const basicPane = basicProgram !== undefined ? this.makeBasicPane(program, basicProgram) : undefined;
            const systemPane = systemProgram !== undefined ? this.makeSystemPane(program, systemProgram) : undefined;
            const edtasmPane = program.isEdtasmProgram() ? this.makeEdtasmPane(program) : undefined;
            const cmdPane = cmdProgram !== undefined ? this.makeCmdPane(program, cmdProgram) : undefined;

            // Metadata pane.
            let metadataLabel = frameToTimestamp(program.startFrame, this.tape.sampleRate, true) + " to " +
                frameToTimestamp(program.endFrame, this.tape.sampleRate, true) + " (" +
                frameToTimestamp(program.endFrame - program.startFrame, this.tape.sampleRate, true) + ")";
            const bitErrorCount = program.countBitErrors();
            if (bitErrorCount > 0) {
                metadataLabel += ", " + bitErrorCount + " error" + (bitErrorCount === 1 ? "" : "s");
            }
            let metadataPane = this.makeMetadataPane(program, basicPane, systemPane, edtasmPane, cmdPane, undefined);
            addPane(metadataLabel, metadataPane);
            screenshotClickAction.set(program, () => {
                this.showPane(metadataPane);
                metadataPane.row?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                })
            });

            // Make the various panes.
            addPane("Binary" + (duplicateOfCopy !== undefined ? " (same as copy " + duplicateOfCopy.copyNumber + ")" : ""),
                this.makeBinaryPane(program));
            if (program.reconstructedSamples !== undefined) {
                addPane("Reconstructed", this.makeReconstructedPane(program.reconstructedSamples));
            }
            if (basicPane !== undefined) {
                addPane("Basic program", basicPane);
            }
            if (systemPane !== undefined) {
                addPane("System program" + (systemPane.programName ? " (" + systemPane.programName + ")" : ""), systemPane);
            }
            if (cmdPane !== undefined) {
                addPane("CMD program" + (cmdPane.programName ? " (" + cmdPane.programName + ")" : ""), cmdPane);
            }
            if (edtasmPane !== undefined) {
                addPane("Assembly" + (edtasmPane.programName ? " (" + edtasmPane.programName + ")" : ""), edtasmPane);
            }
            if (basicPane !== undefined || systemPane !== undefined) {
                let emulatorLabel = "Emulator (original, " + (program.decoder.isHighSpeed() ? "high" : "low") + " speed)";
                addPane(emulatorLabel, this.makeEmulatorPane(program, new TapeCassette(this.tape, program)));
                if (program.reconstructedSamples !== undefined) {
                    addPane("Emulator (reconstructed, low speed)",
                        this.makeEmulatorPane(program, new ReconstructedCassette(program.reconstructedSamples, this.tape.sampleRate)));
                }
            }

            const trs80File = systemProgram ?? cmdProgram ?? basicProgram;
            if (trs80File !== undefined) {
                addPane("Emulator (auto-run)", this.makeEmulatorPane(program, undefined, trs80File));
            }
        }

        // Show the first pane.
        if (this.panes.length > 0) {
            this.showPane(this.panes[0]);
        }
    }
}
