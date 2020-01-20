import {DisplaySamples} from "./DisplaySamples";
import {BitType} from "./BitType";
import {BitData} from "./BitData";
import {Program} from "./Program";

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
    private displayWidth: number = 0;
    private displayLevel: number = 0; // Initialized in zoomToFitAll()
    private centerSample: number = 0; // Initialized in zoomToFitAll()
    private waveforms: Waveform[] = [];
    private programs: Program[] = [];

    /**
     * Add a waveform to display.
     */
    public addWaveform(canvas: HTMLCanvasElement, samples?: DisplaySamples) {
        const displayWidth = canvas.width;
        if (this.displayWidth === 0) {
            this.displayWidth = displayWidth;
        } else if (this.displayWidth !== displayWidth) {
            throw new Error("Widths of the canvases must match");
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
     * Configure the mouse events in the canvas.
     */
    private configureCanvas(canvas: HTMLCanvasElement) {
        let dragging = false;
        let dragInitialX = 0;
        let dragInitialCenterSample = 0;

        canvas.addEventListener("mousedown", event => {
            dragging = true;
            dragInitialX = event.x;
            dragInitialCenterSample = this.centerSample;
            canvas.style.cursor = "grab";
        });

        canvas.addEventListener("mouseup", () => {
            dragging = false;
            canvas.style.cursor = "auto";
        });

        canvas.addEventListener("mousemove", event => {
            if (dragging) {
                const dx = event.x - dragInitialX;
                const mag = Math.pow(2, this.displayLevel);
                this.centerSample = Math.round(dragInitialCenterSample - dx * mag);
                this.draw();
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
        let displayLevel = Math.ceil(Math.log2(sampleCount / this.displayWidth));
        displayLevel = Math.max(displayLevel, 0);
        displayLevel = Math.min(displayLevel, sampleCount - 1);
        return displayLevel;
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {DisplaySamples} displaySamples
     */
    private drawInCanvas(canvas: HTMLCanvasElement, displaySamples?: DisplaySamples) {
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        const width = canvas.width;
        const height = canvas.height;

        // Background.
        ctx.fillStyle = "rgb(0, 0, 0)";
        ctx.fillRect(0, 0, width, height);

        if (displaySamples === undefined) {
            return;
        }

        const samplesList = displaySamples.samplesList;
        const samples = samplesList[this.displayLevel];
        const mag = Math.pow(2, this.displayLevel);
        const centerSample = Math.floor(this.centerSample / mag);

        const frameToX = (i: number) => Math.floor(width / 2) + (i - centerSample);

        // Compute viewing window in zoom space.
        const firstSample = Math.max(centerSample - Math.floor(width / 2), 0);
        const lastSample = Math.min(centerSample + width - 1, samples.length - 1);

        // Compute viewing window in original space.
        const firstOrigSample = Math.floor(firstSample * mag);
        const lastOrigSample = Math.ceil(lastSample * mag);

        // Whether we're zoomed in enough to draw and line and individual bits.
        const drawingLine: boolean = this.displayLevel < 3;

        // Programs.
        for (const program of this.programs) {
            if (drawingLine) {
                for (const bitInfo of program.bits) {
                    if (bitInfo.endFrame >= firstOrigSample && bitInfo.startFrame <= lastOrigSample) {
                        const x1 = frameToX(bitInfo.startFrame / mag);
                        const x2 = frameToX(bitInfo.endFrame / mag);
                        // console.log(bitInfo, x1, x2);
                        switch (bitInfo.bitType) {
                            case BitType.ZERO:
                                ctx.fillStyle = "rgb(50, 50, 50)";
                                break;
                            case BitType.ONE:
                                ctx.fillStyle = "rgb(100, 100, 100)";
                                break;
                            case BitType.START:
                                ctx.fillStyle = "rgb(20, 150, 20)";
                                break;
                            case BitType.BAD:
                                ctx.fillStyle = "rgb(150, 20, 20)";
                                break;
                        }
                        ctx.fillRect(x1, 0, x2 - x1 - 1, height);
                    }
                }
            } else {
                ctx.fillStyle = "rgb(50, 50, 50)";
                const x1 = frameToX(program.startFrame / mag);
                const x2 = frameToX(program.endFrame / mag);
                ctx.fillRect(x1, 0, x2 - x1, height);
            }
        }

        ctx.strokeStyle = "rgb(255, 255, 255)";
        if (drawingLine) {
            ctx.beginPath();
        }
        for (let i = firstSample; i <= lastSample; i++) {
            const value = samples[i];
            const x = frameToX(i);
            const y = value * height / 2;

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
    }

    /**
     * Zoom in one level.
     */
    public zoomIn() {
        if (this.displayLevel > 0) {
            this.displayLevel -= 1;
            this.draw();
        }
    }

    /**
     * Zoom out one level.
     */
    public zoomOut() {
        if (this.waveforms.length > 0 &&
            this.waveforms[0].samples !== undefined &&
            this.displayLevel < this.waveforms[0].samples.samplesList.length - 1) {

            this.displayLevel += 1;
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

        // Find appropriate zoom.
        this.displayLevel = this.computeFitLevel(sampleCount);

        // Visually centered sample (in level 0).
        this.centerSample = Math.floor((startFrame + endFrame)/2);

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
}


