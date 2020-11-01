import {DisplaySamples} from "./DisplaySamples";
import {BitType} from "./BitType";
import {BitData} from "./BitData";
import {Program} from "./Program";
import {Highlight} from "./Highlight";
import * as Basic from "./Basic";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {toHexByte} from "z80-base";
import {WaveformAnnotation} from "./WaveformAnnotation";
import {clearElement, withCommas} from "./Utils";
import {frameDurationToString, frameToTimestamp} from "./AudioUtils";
import {writeWavFile} from "./WavFile";

let gRadioButtonCounter = 1;

/**
 * Whether the user is selecting whole bytes or audio samples.
 */
enum SelectionMode { BYTES, SAMPLES }

/**
 * When adjusting the selection, whether changing one of its ends, or creating it from scratch.
 */
enum SelectionAdjustMode { LEFT, CREATE, RIGHT }

/**
 * An individual waveform to be displayed.
 */
class Waveform {
    public readonly canvas: HTMLCanvasElement;
    public readonly infoPanel: HTMLElement;
    public readonly samples: DisplaySamples;

    constructor(canvas: HTMLCanvasElement, infoPanel: HTMLElement, samples: DisplaySamples) {
        this.canvas = canvas;
        this.infoPanel = infoPanel;
        this.samples = samples;
    }
}

/**
 * A point to be drawn on the waveform.
 */
class PointAnnotation {
    public readonly frame: number;
    public readonly value: number;

    constructor(frame: number, value: number) {
        this.frame = frame;
        this.value = value;
    }
}

/**
 * Displays a list of different waveforms, synchronizing their pan and zoom.
 */
export class WaveformDisplay {
    /**
     * Dispatchers when the user highlights or selects in the canvas.
     */
    public readonly onHighlight = new SimpleEventDispatcher<Highlight | undefined>();
    public readonly onSelection = new SimpleEventDispatcher<Highlight | undefined>();
    public readonly onDoneSelecting = new SimpleEventDispatcher<any>();
    /**
     * The sample rate of the original recording.
     */
    private readonly sampleRate: number;
    /**
     * The width of the canvases, in pixels.
     */
    private displayWidth: number = 0;
    /**
     * The zoom level, where 0 means all the way zoomed in and each original
     * audio sample maps to one column of pixels on the screen; 1 means
     * zoomed out from that by a factor of two, etc.
     */
    private zoom: number = 0; // Initialized in zoomToFitAll()
    /**
     * The max value that zoom can have.
     */
    private maxZoom: number = 0;
    /**
     * The sample in the middle of the display, in original samples.
     */
    private centerSample: number = 0; // Initialized in zoomToFitAll()
    /**
     * All the waveforms we're displaying, and their canvases.
     */
    private waveforms: Waveform[] = [];
    /**
     * All the programs represented on these waveforms.
     */
    private programs: Program[] = [];
    /**
     * Start of current highlight, if any, in original samples, inclusive.
     */
    private startHighlightFrame: number | undefined;
    /**
     * End of current highlight, if any, in original samples, inclusive.
     */
    private endHighlightFrame: number | undefined;
    /**
     * Start of current selection, if any, in original samples, inclusive. This is for
     * when selecting bytes.
     */
    private startSelectionFrame: number | undefined;
    /**
     * End of current selection, if any, in original samples, inclusive. This is for
     * when selecting bytes.
     */
    private endSelectionFrame: number | undefined;
    /**
     * Start of current selection, if any, in original samples, inclusive. This is for
     * when selecting samples.
     */
    private startSampleSelectionFrame: number | undefined;
    /**
     * End of current selection, if any, in original samples, inclusive. This is for
     * when selecting samples.
     */
    private endSampleSelectionFrame: number | undefined;
    /**
     * Listeners of the maxZoom property.
     */
    private onMaxZoom = new SimpleEventDispatcher<number>();
    /**
     * Listeners of the zoom property.
     */
    private onZoom = new SimpleEventDispatcher<number>();
    /**
     * List of annotations to display in the displays.
     */
    private annotations: WaveformAnnotation[] = [];
    /**
     * What the user wants to select.
     */
    private selectionMode = SelectionMode.BYTES;
    /**
     * Point annotations to draw.
     */
    private readonly pointAnnotations: PointAnnotation[] = [];

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /**
     * Add a waveform to display.
     */
    public addWaveform(canvas: HTMLCanvasElement, infoPanel : HTMLElement, samples: DisplaySamples) {
        const displayWidth = canvas.width;
        if (this.displayWidth === 0) {
            this.displayWidth = displayWidth;
        } else if (this.displayWidth !== displayWidth) {
            throw new Error("Widths of the canvases must match");
        }

        // Compute max display level.
        let newMaxZoom = samples.samplesList.length - 1;
        if (newMaxZoom !== this.maxZoom) {
            this.maxZoom = newMaxZoom;
            this.onMaxZoom.dispatch(newMaxZoom);
        }

        this.waveforms.push(new Waveform(canvas, infoPanel, samples));
        this.configureCanvas(canvas);
    }

    /**
     * Make the canvas and its surrounding elements to display a waveform.
     */
    public static makeWaveformDisplay(label: string, samples: DisplaySamples, parent: HTMLElement, waveformDisplay: WaveformDisplay): void {
        let labelElement = document.createElement("p");
        labelElement.innerText = label;
        parent.appendChild(labelElement);

        let container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexFlow = "row nowrap";
        container.style.justifyContent = "flex-start";
        container.style.alignItems = "flex-start";
        parent.appendChild(container);

        let canvas = document.createElement("canvas");
        canvas.classList.add("waveform");
        canvas.width = 800;
        canvas.height = 400;
        container.appendChild(canvas);

        let infoPanel = document.createElement("div");
        infoPanel.style.marginLeft = "30px";
        container.appendChild(infoPanel);
        waveformDisplay.addWaveform(canvas, infoPanel, samples);
    }

    /**
     * Add a program to highlight in the waveform.
     */
    public addProgram(program: Program) {
        this.programs.push(program);
    }

    /**
     * Set the list of annotations. A reference will be kept to this list.
     */
    public setAnnotations(annotations: WaveformAnnotation[]): void {
        this.annotations = annotations;
    }

    /**
     * Add a point annotation to draw.
     */
    public addPointAnnotation(frame: number, value: number): void {
        this.pointAnnotations.push(new PointAnnotation(frame, value));
        this.draw();
    }

    /**
     * Update the current highlight.
     */
    public setHighlight(highlight: Highlight | undefined): void {
        this.startHighlightFrame = undefined;
        this.endHighlightFrame = undefined;

        if (highlight !== undefined) {
            let byteData = highlight.program.byteData[highlight.firstIndex];
            if (byteData !== undefined) {
                this.startHighlightFrame = byteData.startFrame;
                this.endHighlightFrame = byteData.endFrame;
            }

            byteData = highlight.program.byteData[highlight.lastIndex];
            if (byteData !== undefined) {
                this.endHighlightFrame = byteData.endFrame;
            }
        }

        this.draw();
    }

    /**
     * Update the current highlight.
     */
    public setSelection(selection: Highlight | undefined): void {
        this.startSelectionFrame = undefined;
        this.endSelectionFrame = undefined;

        if (selection !== undefined) {
            let byteData = selection.program.byteData[selection.firstIndex];
            if (byteData !== undefined) {
                this.startSelectionFrame = byteData.startFrame;
                this.endSelectionFrame = byteData.endFrame;
            }

            byteData = selection.program.byteData[selection.lastIndex];
            if (byteData !== undefined) {
                this.endSelectionFrame = byteData.endFrame;
            }
        }

        this.draw();
        this.updateInfoPanels();
    }

    /**
     * Zoom to fit the current selection, if any.
     */
    public doneSelecting(): void {
        if (this.startSelectionFrame !== undefined && this.endSelectionFrame !== undefined) {
            this.zoomToFit(this.startSelectionFrame, this.endSelectionFrame);
        }
    }

    /**
     * Makes a block element to place above a set of waveform displays.
     */
    public makeControls(showSelectionType: boolean): HTMLElement {
        const controls = document.createElement("div");

        // Zoom controls.
        controls.appendChild(this.makeZoomControls());

        // Instructions.
        const instructions = document.createElement("span");
        instructions.innerHTML = "<b>Shift</b>: Zoom in&nbsp;&nbsp;&nbsp;&nbsp;<b>Alt-Shift</b>: Zoom out&nbsp;&nbsp;&nbsp;&nbsp;<b>Alt</b>: Select";
        instructions.style.marginLeft = "30px";
        controls.appendChild(instructions);

        // Selection type.
        if (showSelectionType) {
            const selectionLabel = document.createElement("span");
            selectionLabel.innerText = "Select: ";
            selectionLabel.style.marginLeft = "30px";
            selectionLabel.style.fontWeight = "bold";
            controls.append(selectionLabel);

            // Unique name for this group of inputs.
            const name = "selection-type-radio-name-" + gRadioButtonCounter;
            gRadioButtonCounter += 1;

            // Options for selection mode.
            let selectionModes = [
                {
                    label: "Bytes",
                    selectionMode: SelectionMode.BYTES,
                    checked: true,
                },
                {
                    label: "Samples",
                    selectionMode: SelectionMode.SAMPLES,
                    checked: false,
                },
            ];

            for (const {label, selectionMode, checked} of selectionModes) {
                const labelNode = document.createElement("label");
                const radioInput = document.createElement("input") as HTMLInputElement;
                radioInput.type = "radio";
                radioInput.name = name;
                radioInput.checked = checked;
                radioInput.addEventListener("change", () => this.setSelectionMode(selectionMode));
                labelNode.appendChild(radioInput);
                labelNode.append(" " + label);
                controls.appendChild(labelNode);
            }
        }

        return controls;
    }

    /**
     * Sets the selection mode. Does not update the radio buttons.
     */
    private setSelectionMode(selectionMode: SelectionMode): void {
        this.selectionMode = selectionMode;
        this.draw();
        this.updateInfoPanels();
    }

    /**
     * Create zoom control elements, bind them to this waveform display, and return them.
     * These are not guaranteed to be a block element. Caller should warp them in
     * a div if that's what they want.
     */
    private makeZoomControls(): HTMLElement {
        const label = document.createElement("label") as HTMLLabelElement;
        label.innerText = "Zoom: ";

        const input = document.createElement("input") as HTMLInputElement;
        input.type = "range";
        label.appendChild(input);

        // We want to flip this horizontally, so make the slider's value
        // the negative of the real zoom.
        input.min = (-this.maxZoom).toString();
        input.max = "0";
        this.onMaxZoom.subscribe(maxZoom => input.min = (-maxZoom).toString());
        this.onZoom.subscribe(zoom => input.value = (-zoom).toString());

        input.addEventListener("input", () => {
            this.setZoom(-parseInt(input.value), undefined);
        });

        return label;
    }

    /**
     * Configure the mouse and keyboard events in the canvas.
     */
    private configureCanvas(canvas: HTMLCanvasElement) {
        let dragging = false;
        let dragInitialX = 0;
        let dragInitialCenterSample = 0;
        let inCanvas = false;
        let holdingShift = false;
        let holdingAlt = false;
        let selectionStart: Highlight | undefined = undefined;
        let selectingSamples = false;
        let selectionAdjustMode = SelectionAdjustMode.CREATE;
        let lastSeenMouseX = 0;
        let lastSeenMouseY = 0;

        const updateCursor = () => {
            canvas.style.cursor = holdingShift ? (holdingAlt ? "zoom-out" : "zoom-in")
                : holdingAlt ? (selectionAdjustMode === SelectionAdjustMode.CREATE ? "auto" : "col-resize")
                : dragging ? "grabbing"
                : "grab";
        };
        updateCursor();

        // See if we're on the edge of a sample selection area.
        const updateSelectionAdjustMode = () => {
            selectionAdjustMode = SelectionAdjustMode.CREATE;
            if (holdingAlt && this.selectionMode === SelectionMode.SAMPLES &&
                this.startSampleSelectionFrame !== undefined && this.endSampleSelectionFrame !== undefined) {

                const startX = this.originalFrameToScreenX(this.startSampleSelectionFrame);
                if (Math.abs(lastSeenMouseX - startX) < 4) {
                    selectionAdjustMode = SelectionAdjustMode.LEFT;
                }
                const endX = this.originalFrameToScreenX(this.endSampleSelectionFrame);
                if (Math.abs(lastSeenMouseX - endX) < 4) {
                    selectionAdjustMode = SelectionAdjustMode.RIGHT;
                }
            }
            updateCursor();
        };

        // Mouse enter/leave events.
        canvas.addEventListener("mouseenter", event => {
            inCanvas = true;
            holdingAlt = event.altKey;
            holdingShift = event.shiftKey;
            updateSelectionAdjustMode();
            updateCursor();
        });
        canvas.addEventListener("mouseleave", () => {
            inCanvas = false;
        });

        // Mouse click events.
        canvas.addEventListener("mousedown", event => {
            if (holdingShift) {
                // Zoom.
                if (holdingAlt) {
                    // Zoom out.
                    this.setZoom(this.zoom + 1, event.offsetX);
                } else {
                    // Zoom in.
                    this.setZoom(this.zoom - 1, event.offsetX);
                }
            } else if (holdingAlt) {
                // Start selecting.
                const frame = this.screenXToOriginalFrame(event.offsetX);
                if (this.selectionMode === SelectionMode.BYTES) {
                    // Selecting bytes.
                    const highlight = this.highlightAt(frame);
                    if (highlight !== undefined) {
                        selectionStart = highlight;
                        this.onSelection.dispatch(highlight);
                    }
                } else {
                    // Selecting samples.
                    switch (selectionAdjustMode) {
                        case SelectionAdjustMode.LEFT:
                            this.startSampleSelectionFrame = this.endSampleSelectionFrame;
                            break;
                        case SelectionAdjustMode.CREATE:
                            this.startSampleSelectionFrame = frame;
                            break;
                        case SelectionAdjustMode.RIGHT:
                            // Nothing.
                            break;
                    }
                    this.endSampleSelectionFrame = frame;
                    selectingSamples = true;
                    this.draw();
                }
                this.updateInfoPanels();
            } else {
                // Start pan.
                dragging = true;
                dragInitialX = event.offsetX;
                dragInitialCenterSample = this.centerSample;
                updateCursor();
            }
        });
        window.addEventListener("mouseup", () => {
            if (dragging) {
                dragging = false;
                updateCursor();
            } else if (selectionStart !== undefined) {
                this.onDoneSelecting.dispatch(this);
                this.updateInfoPanels();
                selectionStart = undefined;
            } else if (selectingSamples) {
                // Done selecting samples.
                if (this.startSampleSelectionFrame !== undefined && this.endSampleSelectionFrame !== undefined) {
                    if (this.startSampleSelectionFrame === this.endSampleSelectionFrame) {
                        // Deselect.
                        this.startSampleSelectionFrame = undefined;
                        this.endSampleSelectionFrame = undefined;
                    } else if (this.startSampleSelectionFrame > this.endSampleSelectionFrame) {
                        // Put in the right order.
                        const tmp = this.startSampleSelectionFrame;
                        this.startSampleSelectionFrame = this.endSampleSelectionFrame;
                        this.endSampleSelectionFrame = tmp;
                    }
                }
                selectingSamples = false;
                this.draw();
                this.updateInfoPanels();
            }
        });
        canvas.addEventListener("mousemove", event => {
            lastSeenMouseX = event.offsetX;
            lastSeenMouseY = event.offsetY;

            if (dragging) {
                const dx = event.offsetX - dragInitialX;
                const mag = Math.pow(2, this.zoom);
                this.centerSample = Math.round(dragInitialCenterSample - dx * mag);
                this.draw();
            } else if (selectionStart !== undefined) {
                const frame = this.screenXToOriginalFrame(event.offsetX);
                const highlight = this.highlightAt(frame);
                if (highlight !== undefined && highlight.program === selectionStart.program) {
                    this.onSelection.dispatch(new Highlight(highlight.program,
                        selectionStart.firstIndex, highlight.lastIndex));
                }
            } else if (selectingSamples) {
                this.endSampleSelectionFrame = this.screenXToOriginalFrame(event.offsetX);
                this.draw();
                this.updateInfoPanels();
            } else if (holdingAlt) {
                const frame = this.screenXToOriginalFrame(event.offsetX);
                const highlight = this.highlightAt(frame);
                this.onHighlight.dispatch(highlight);
                updateSelectionAdjustMode();
            }
        });

        // Keyboard events.
        document.addEventListener("keydown", event => {
            if (inCanvas) {
                if (event.key === "Alt") {
                    holdingAlt = true;
                    updateSelectionAdjustMode();
                    updateCursor();
                }
                if (event.key === "Shift") {
                    holdingShift = true;
                    updateCursor();
                }
            }
        });
        document.addEventListener("keyup", event => {
            if (inCanvas) {
                if (event.key === "Alt") {
                    holdingAlt = false;
                    updateSelectionAdjustMode();
                    updateCursor();
                }
                if (event.key === "Shift") {
                    holdingShift = false;
                    updateCursor();
                }
            }
        });
    }

    /**
     * Draw all the waveforms.
     */
    public draw() {
        for (const waveform of this.waveforms) {
            this.drawInCanvas(waveform.canvas, waveform.samples);
        }
    }

    /**
     * Compute fit level to fit the specified number of samples.
     *
     * @param sampleCount number of samples we want to display.
     */
    private computeFitLevel(sampleCount: number): number {
        let zoom = Math.ceil(Math.log2(sampleCount / this.displayWidth));
        zoom = Math.max(zoom, 0);
        zoom = Math.min(zoom, sampleCount - 1);
        return zoom;
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {DisplaySamples} displaySamples
     */
    private drawInCanvas(canvas: HTMLCanvasElement, displaySamples: DisplaySamples) {
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        const width = canvas.width;
        const height = canvas.height;

        // Get the theme variables.
        canvas.classList.add("dark-mode");
        const style = getComputedStyle(canvas);
        const backgroundColor = style.getPropertyValue("--background");
        const selectionColor = style.getPropertyValue("--background-highlights");
        const highlightColor = "rgba(0, 0, 0, 0.2)";
        const braceColor = style.getPropertyValue("--foreground-secondary");
        const labelColor = style.getPropertyValue("--foreground");
        const waveformColor = style.getPropertyValue("--blue");
        const startColor = style.getPropertyValue("--cyan");
        const badColor = style.getPropertyValue("--red");

        // Background.
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        const samplesList = displaySamples.samplesList;
        const samples = samplesList[this.zoom];
        const mag = Math.pow(2, this.zoom);
        const centerSample = Math.floor(this.centerSample / mag);

        // From zoom space sample to X.
        const frameToX = (i: number) => Math.floor(width / 2) + (i - centerSample);

        // Compute viewing window in zoom space.
        const firstSample = Math.max(centerSample - Math.floor(width / 2), 0);
        const lastSample = Math.min(centerSample + width - 1, samples.length - 1);

        // Compute viewing window in original space.
        const firstOrigSample = Math.floor(firstSample * mag);
        const lastOrigSample = Math.ceil(lastSample * mag);

        // Whether we're zoomed in enough to draw and line and individual bits.
        const drawingLine: boolean = this.zoom < 3;

        if (this.selectionMode === SelectionMode.BYTES) {
            // Selection.
            if (this.startSelectionFrame !== undefined && this.endSelectionFrame !== undefined) {
                ctx.fillStyle = selectionColor;
                const x1 = frameToX(this.startSelectionFrame / mag);
                const x2 = frameToX(this.endSelectionFrame / mag);
                ctx.fillRect(x1, 0, Math.max(x2 - x1, 1), height);
            }

            // Highlight.
            if (this.startHighlightFrame !== undefined && this.endHighlightFrame !== undefined) {
                ctx.fillStyle = highlightColor;
                const x1 = frameToX(this.startHighlightFrame / mag);
                const x2 = frameToX(this.endHighlightFrame / mag);
                ctx.fillRect(x1, 0, Math.max(x2 - x1, 1), height);
            }
        } else {
            // Selecting samples.
            if (this.startSampleSelectionFrame !== undefined && this.endSampleSelectionFrame !== undefined) {
                ctx.fillStyle = selectionColor;
                let x1 = frameToX(this.startSampleSelectionFrame / mag);
                let x2 = frameToX(this.endSampleSelectionFrame / mag);
                if (x2 < x1) {
                    // Might be backwards while dragging.
                    const tmp = x1;
                    x1 = x2;
                    x2 = tmp;
                }

                ctx.fillRect(x1, 0, Math.max(x2 - x1, 1), height);

                // Highlight center of selection.
                const midX = (x1 + x2)/2;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
                ctx.beginPath();
                ctx.moveTo(midX, 0);
                ctx.lineTo(midX, height);
                ctx.stroke();
            }
        }

        // Y=0 axis.
        ctx.strokeStyle = selectionColor;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Programs and bits.
        for (const program of this.programs) {
            if (drawingLine) {
                // Highlight bits.
                for (const bitInfo of program.bitData) {
                    if (bitInfo.endFrame >= firstOrigSample && bitInfo.startFrame <= lastOrigSample) {
                        const x1 = frameToX(bitInfo.startFrame / mag);
                        const x2 = frameToX(bitInfo.endFrame / mag);

                        let bitBraceColor: string;
                        let label: string;
                        let bitLabelColor: string;
                        switch (bitInfo.bitType) {
                            case BitType.ZERO:
                                bitBraceColor = braceColor;
                                bitLabelColor = labelColor;
                                label = "0";
                                break;
                            case BitType.ONE:
                                bitBraceColor = braceColor;
                                bitLabelColor = labelColor;
                                label = "1";
                                break;
                            case BitType.START:
                                bitBraceColor = startColor;
                                bitLabelColor = startColor;
                                label = "START";
                                break;
                            case BitType.BAD:
                                bitBraceColor = badColor;
                                bitLabelColor = badColor;
                                label = "BAD";
                                break;
                        }

                        this.drawBraceAndLabel(ctx, height, x1, x2, bitBraceColor, label, bitLabelColor, true);
                    }
                }
            } else if (this.zoom < 5) {
                // Highlight annotations, if we have them.
                if (program.annotations !== undefined) {
                    for (const annotation of program.annotations) {
                        let startFrame: number | undefined = undefined;
                        let endFrame: number | undefined = undefined;
                        for (let i = annotation.firstIndex; i <= annotation.lastIndex; i++) {
                            const byteInfo = program.byteData[i];
                            if (byteInfo !== undefined) {
                                if (startFrame === undefined || endFrame === undefined) {
                                    startFrame = byteInfo.startFrame;
                                    endFrame = byteInfo.endFrame;
                                } else {
                                    startFrame = Math.min(startFrame, byteInfo.startFrame);
                                    endFrame = Math.max(endFrame, byteInfo.endFrame);
                                }
                            }
                        }
                        if (endFrame !== undefined && startFrame !== undefined &&
                            endFrame >= firstOrigSample && startFrame <= lastOrigSample) {

                            const x1 = frameToX(startFrame / mag);
                            const x2 = frameToX(endFrame / mag);
                            this.drawBraceAndLabel(ctx, height, x1, x2, braceColor, annotation.text, labelColor, true);
                        }
                    }
                } else {
                    // Highlight bytes.
                    for (const byteInfo of program.byteData) {
                        if (byteInfo.endFrame >= firstOrigSample && byteInfo.startFrame <= lastOrigSample) {
                            const x1 = frameToX(byteInfo.startFrame / mag);
                            const x2 = frameToX(byteInfo.endFrame / mag);
                            let byteValue = byteInfo.value;
                            const basicToken = Basic.getToken(byteValue);
                            const label = byteValue < 32 ? "^" + String.fromCodePoint(byteValue + 64)
                                : byteValue === 32 ? '\u2423' // Open box to represent space.
                                    : byteValue < 128 ? String.fromCodePoint(byteValue)
                                        : program.isBasicProgram() && basicToken !== undefined ? basicToken
                                            : toHexByte(byteValue);

                            this.drawBraceAndLabel(ctx, height, x1, x2, braceColor, label, labelColor, true);
                        }
                    }
                }
            } else {
                // Highlight the whole program.
                const x1 = frameToX(program.startFrame / mag);
                const x2 = frameToX(program.endFrame / mag);
                this.drawBraceAndLabel(ctx, height, x1, x2, braceColor, program.getShortLabel(), labelColor, true);
            }
        }

        // Draw waveform.
        ctx.strokeStyle = waveformColor;
        if (drawingLine) {
            ctx.beginPath();
        }
        for (let i = firstSample; i <= lastSample; i++) {
            const value = samples[i];
            const x = frameToX(i);
            const y = value * height / 65536;

            if (drawingLine) {
                if (i === firstSample) {
                    ctx.moveTo(x, height / 2 - y);
                } else {
                    ctx.lineTo(x, height / 2 - y);
                }
            } else {
                ctx.beginPath();
                ctx.moveTo(x, height / 2 - y);
                ctx.lineTo(x, height / 2 + y);
                ctx.stroke();
            }
        }
        if (drawingLine) {
            ctx.stroke();
        }

        // Find entry in annotations just before our first sample.
        let index = 0; // this.findFirstAnnotation(firstOrigSample);
        if (index !== undefined) {
            // Draw annotations.
            ctx.strokeStyle = braceColor;
            while (index < this.annotations.length) {
                const annotation = this.annotations[index];
                // TODO these are supposed to be byte indices, but they're being treated like frames:
                const x1 = frameToX(annotation.firstIndex / mag);
                const x2 = frameToX(annotation.lastIndex / mag);
                this.drawBraceAndLabel(ctx, height, x1, x2, braceColor, annotation.text, labelColor, false);
                index++;
            }
        }

        // Draw point annotations.
        ctx.fillStyle = badColor;
        for (const pointAnnotation of this.pointAnnotations) {
            const x = frameToX(pointAnnotation.frame / mag);
            const y = height/2 - pointAnnotation.value * height / 65536;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    /**
     * Find the index of the first annotation at or after firstSample, or undefined
     * if no annotations are at or after it.
     */
    /*
    private findFirstAnnotation(firstSample: number): number | undefined {
        let low = 0;
        let high = this.annotations.length - 1;
        while (low <= high && this.annotations[high].frame >= firstSample) {
            if (low === high) {
                return low;
            }
            let mid = Math.floor((low + high)/2);
            if (this.annotations[mid].frame < firstSample) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return undefined;
    }*/

    /**
     * Set the zoom level to a particular value.
     *
     * @param zoom new zoom level.
     * @param screenX pixel to keep at the same place, or undefined to mean the horizontal center.
     */
    public setZoom(zoom: number, screenX: number | undefined): void {
        if (screenX === undefined) {
            screenX = Math.round(this.displayWidth / 2);
        }

        const newZoom = Math.min(Math.max(0, zoom), this.maxZoom);
        if (newZoom !== this.zoom) {
            const frame = this.screenXToOriginalFrame(screenX);
            this.zoom = newZoom;
            this.centerSample = frame - Math.round((screenX - this.displayWidth/2)*Math.pow(2, newZoom));
            this.onZoom.dispatch(newZoom);
            this.draw();
        }
    }

    /**
     * Zoom to fit a particular bit.
     */
    public zoomToBitData(bitData: BitData) {
        // Show a bit after a many bits before.
        const startFrame = bitData.startFrame - 1500;
        const endFrame = bitData.endFrame + 300;

        this.zoomToFit(startFrame, endFrame);
    }

    /**
     * Zoom to fit a range of samples.
     */
    public zoomToFit(startFrame: number, endFrame: number) {
        const sampleCount = endFrame - startFrame;

        // Visually centered sample (in level 0).
        this.centerSample = Math.floor((startFrame + endFrame)/2);

        // Find appropriate zoom.
        this.setZoom(this.computeFitLevel(sampleCount), undefined);

        this.draw();
    }

    /**
     * Zoom to fit all samples.
     */
    public zoomToFitAll() {
        if (this.waveforms.length > 0 && this.waveforms[0].samples !== undefined) {
            this.zoomToFit(0, this.waveforms[0].samples.samplesList[0].length);
        }
    }

    /**
     * Draw a down-facing brace withe specified label.
     */
    private drawBraceAndLabel(ctx: CanvasRenderingContext2D, height: number,
                              left: number, right: number,
                              braceColor: string, label: string,
                              labelColor: string, drawOnTop: boolean): void {

        const middle = (left + right)/2;

        const leading = 16;

        // Don't have more than two lines, there's no space for it.
        const lines = label.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Don't use a custom font here, they load asynchronously and we're not told when they
            // finish loading, so we can't redraw and the initial draw uses some default serif font.
            ctx.font = '10pt monospace';
            ctx.fillStyle = labelColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            const y = drawOnTop ? 38 - (lines.length - i - 1)*leading : height - 35 + i*leading;
            ctx.fillText(line, middle, y);
        }

        ctx.strokeStyle = braceColor;
        ctx.lineWidth = 1;
        this.drawBrace(ctx, left, middle, right, 40, height - 40, drawOnTop);
    }

    /**
     * Draw a horizontal brace, pointing up, facing down.
     */
    private drawBrace(ctx: CanvasRenderingContext2D,
                      left: number, middle: number, right: number,
                      top: number, bottom: number,
                      drawOnTop: boolean): void {

        const radius = Math.min(10, (right - left) / 4);
        const lineY = drawOnTop ? top + 20 : bottom - 20;
        const pointY = drawOnTop ? top : bottom;
        const otherY = drawOnTop ? bottom - 40 : top + 40;

        ctx.beginPath();
        ctx.moveTo(left, otherY);
        if (left === right) {
            ctx.lineTo(left, lineY);
        } else {
            ctx.arcTo(left, lineY, left + radius, lineY, radius);
            ctx.arcTo(middle, lineY, middle, pointY, radius);
            ctx.arcTo(middle, lineY, middle + radius, lineY, radius);
            ctx.arcTo(right, lineY, right, lineY + (drawOnTop ? radius : -radius), radius);
            ctx.lineTo(right, otherY);
        }
        ctx.stroke();
    }

    /**
     * Convert a screen (pixel) X location to the frame number in the original waveform.
     */
    private screenXToOriginalFrame(screenX: number): number {
        const mag = Math.pow(2, this.zoom);

        // Offset in pixels from center of canvas.
        const pixelOffset = screenX - Math.floor(this.displayWidth / 2);

        // Convert to frame.
        let frame = this.centerSample + pixelOffset*mag;

        // Clamp at end.
        if (this.waveforms.length > 0) {
            const waveform = this.waveforms[0];
            if (waveform.samples.samplesList.length > 0) {
                const maxFrame = waveform.samples.samplesList[0].length - 1;
                frame = Math.min(frame, maxFrame);
            }
        }

        // Clamp at start.
        frame = Math.max(frame, 0);

        return frame;
    }

    /**
     * Convert an original (unzoomed) sample to its X coordinate. Does not clamp to display range.
     */
    private originalFrameToScreenX(frame: number): number {
        const mag = Math.pow(2, this.zoom);
        const centerSample = Math.floor(this.centerSample / mag);
        return Math.floor(this.displayWidth / 2) + (frame / mag - centerSample);
    }

    /**
     * Return a highlight for the specified frame (in original samples), or undefined
     * if not found.
     */
    private highlightAt(frame: number): Highlight | undefined {
        for (const program of this.programs) {
            for (let byteIndex = 0; byteIndex < program.byteData.length; byteIndex++) {
                const byteData = program.byteData[byteIndex];
                if (frame >= byteData.startFrame && frame <= byteData.endFrame) {
                    return new Highlight(program, byteIndex);
                }
            }
        }

        return undefined;
    }

    /**
     * Update the statistics displayed on the info panels of each waveform.
     */
    private updateInfoPanels(): void {
        let startFrame: number | undefined = undefined;
        let endFrame: number | undefined = undefined;
        if (this.selectionMode === SelectionMode.BYTES && this.startSelectionFrame !== undefined && this.endSelectionFrame !== undefined) {
            // Swap around.
            startFrame = Math.min(this.startSelectionFrame, this.endSelectionFrame);
            endFrame = Math.max(this.startSelectionFrame, this.endSelectionFrame);
        } else if (this.selectionMode === SelectionMode.SAMPLES && this.startSampleSelectionFrame !== undefined && this.endSampleSelectionFrame !== undefined) {
            // Swap around.
            startFrame = Math.min(this.startSampleSelectionFrame, this.endSampleSelectionFrame);
            endFrame = Math.max(this.startSampleSelectionFrame, this.endSampleSelectionFrame);
        }

        if (startFrame !== undefined && endFrame !== undefined) {
            for (const waveform of this.waveforms) {
                const infoPanel = waveform.infoPanel;

                const duration = endFrame - startFrame;

                let minValue: number | undefined = undefined;
                let maxValue: number | undefined = undefined;
                let samples = waveform.samples.samplesList[0];
                for (let frame = startFrame; frame <= endFrame; frame++) {
                    const value = samples[frame];
                    if (minValue === undefined || value < minValue) {
                        minValue = value;
                    }
                    if (maxValue === undefined || value > maxValue) {
                        maxValue = value;
                    }
                }

                const parts: string[] = [];
                parts.push("<b>Start frame:</b> " + frameToTimestamp(startFrame, this.sampleRate) + "<br>");
                parts.push("<b>End frame:</b> " + frameToTimestamp(endFrame, this.sampleRate) + "<br>");
                parts.push("<b>Duration:</b> " + frameDurationToString(duration, this.sampleRate) + "<br>");
                if (maxValue !== undefined) {
                    parts.push("<b>Maximum value:</b> " + withCommas(maxValue) + "<br>");
                }
                if (minValue !== undefined) {
                    parts.push("<b>Minimum value:</b> " + withCommas(minValue) + "<br>");
                }
                infoPanel.innerHTML = parts.join("");

                // Button to save WAV file of selection.
                const saveButton = document.createElement("button");
                saveButton.innerText = "Save WAV File";
                saveButton.classList.add("nice_button");
                saveButton.style.marginTop = "20px";
                const constStartFrame = startFrame;
                const constEndFrame = endFrame;
                saveButton.addEventListener("click", () =>
                    this.saveWavFile(waveform.samples.samplesList[0], constStartFrame, constEndFrame));
                infoPanel.appendChild(saveButton);
            }
        } else {
            // No selection, erase panel.
            for (const waveform of this.waveforms) {
                clearElement(waveform.infoPanel);
            }
        }
    }

    /**
     * Create a WAV file and auto-download it to the user.
     */
    private saveWavFile(samples: Int16Array, startFrame: number, endFrame: number): void {
        const wav = writeWavFile(samples.subarray(startFrame, endFrame + 1), this.sampleRate);
        const a = document.createElement("a");
        const blob = new Blob([wav], {type: "audio/wav"});
        a.href = window.URL.createObjectURL(blob);
        a.download = "clip.wav";
        a.click();
    }
}


