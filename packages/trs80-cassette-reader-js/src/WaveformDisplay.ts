import {DisplaySamples} from "./DisplaySamples";
import {BitType} from "./BitType";
import {BitData} from "./BitData";
import {Program} from "./Program";
import {Highlight} from "./Highlight";
import * as Basic from "./Basic";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {toHexByte} from "z80-base";
import {WaveformAnnotation} from "./WaveformAnnotation";

/**
 * An individual waveform to be displayed.
 */
class Waveform {
    public readonly canvas: HTMLCanvasElement;
    public samples: DisplaySamples | undefined;

    constructor(canvas: HTMLCanvasElement, samples?: DisplaySamples) {
        this.canvas = canvas;
        this.samples = samples;
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
     * Start of current selection, if any, in original samples, inclusive.
     */
    private startSelectionFrame: number | undefined;
    /**
     * End of current selection, if any, in original samples, inclusive.
     */
    private endSelectionFrame: number | undefined;
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
     * Add a waveform to display.
     */
    public addWaveform(canvas: HTMLCanvasElement, samples: DisplaySamples) {
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

        this.waveforms.push(new Waveform(canvas, samples));
        this.configureCanvas(canvas);
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
     * Create zoom control elements, bind them to this waveform display, and return them.
     * These are not guaranteed to be a block element. Caller should warp them in
     * a div if that's what they want.
     */
    public makeZoomControls(): HTMLElement {
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
     * Configure the mouse events in the canvas.
     */
    private configureCanvas(canvas: HTMLCanvasElement) {
        let dragging = false;
        let dragInitialX = 0;
        let dragInitialCenterSample = 0;
        let inCanvas = false;
        let holdingShift = false;
        let holdingAlt = false;
        let selectionStart: Highlight | undefined = undefined;

        const updateCursor = () => {
            canvas.style.cursor = holdingShift ? (holdingAlt ? "zoom-out" : "zoom-in")
                : holdingAlt ? "auto"
                : dragging ? "grabbing"
                : "grab";
        };
        updateCursor();

        // Mouse enter/leave events.
        canvas.addEventListener("mouseenter", event => {
            inCanvas = true;
            holdingAlt = event.altKey;
            updateCursor();
        });
        canvas.addEventListener("mouseleave", () => {
            inCanvas = false;
        });

        // Mouse click events.
        canvas.addEventListener("mousedown", event => {
            if (holdingShift) {
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
                const highlight = this.highlightAt(frame);
                if (highlight !== undefined) {
                    selectionStart = highlight;
                    this.onSelection.dispatch(highlight);
                }
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
                selectionStart = undefined;
            }
        });
        canvas.addEventListener("mousemove", event => {
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
            } else if (holdingAlt) {
                const frame = this.screenXToOriginalFrame(event.offsetX);
                const highlight = this.highlightAt(frame);
                this.onHighlight.dispatch(highlight);
            }
        });

        // Keyboard events.
        document.addEventListener("keydown", event => {
            if (inCanvas) {
                if (event.key === "Alt") {
                    holdingAlt = true;
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
    private drawInCanvas(canvas: HTMLCanvasElement, displaySamples?: DisplaySamples) {
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

        if (displaySamples === undefined) {
            return;
        }

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

        return this.centerSample + pixelOffset*mag;
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
}


