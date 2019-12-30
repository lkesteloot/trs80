
// UI for browsing a tape interactively.

import {fromTokenized} from "./Basic";
import {BitData} from "./BitData";
import {BitType} from "./BitType";
import {DisplaySamples} from "./DisplaySamples";
import {Program} from "./Program";
import {Tape} from "./Tape";
import {pad} from "./Utils";
import {frameToTimestamp} from "./AudioUtils";

export class TapeBrowser {
    private tape: Tape;
    private waveforms: HTMLElement;
    private originalCanvas: HTMLCanvasElement;
    private filteredCanvas: HTMLCanvasElement;
    private lowSpeedCanvas: HTMLCanvasElement;
    private programText: HTMLElement;
    private tapeContents: HTMLElement;
    private displayWidth: number;
    private displayLevel: number = 0; // Initialized in zoomToFitAll()
    private centerSample: number = 0; // Initialized in zoomToFitAll()

    constructor(tape: Tape,
                zoomInButton: HTMLButtonElement,
                zoomOutButton: HTMLButtonElement,
                waveforms: HTMLElement,
                originalCanvas: HTMLCanvasElement,
                filteredCanvas: HTMLCanvasElement,
                lowSpeedCanvas: HTMLCanvasElement,
                programText: HTMLElement, tapeContents: HTMLElement) {

        this.tape = tape;
        this.waveforms = waveforms;
        this.originalCanvas = originalCanvas;
        this.filteredCanvas = filteredCanvas;
        this.lowSpeedCanvas = lowSpeedCanvas;
        this.programText = programText;
        this.tapeContents = tapeContents;
        this.displayWidth = originalCanvas.width;

        this.configureCanvas(originalCanvas);
        this.configureCanvas(filteredCanvas);
        this.configureCanvas(lowSpeedCanvas);

        this.zoomToFitAll();

        zoomInButton.onclick = () => this.zoomIn();
        zoomOutButton.onclick = () => this.zoomOut();

        // Configure zoom keys.
        document.onkeypress = (event) => {
            if (event.key === "=") {
                this.zoomIn();
                event.preventDefault();
            }
            if (event.key === "-") {
                this.zoomOut();
                event.preventDefault();
            }
        };

        // Update left-side panel.
        this.updateTapeContents();
    }

    public draw() {
        this.drawInCanvas(this.originalCanvas, this.tape.originalSamples);
        this.drawInCanvas(this.filteredCanvas, this.tape.filteredSamples);
        this.drawInCanvas(this.lowSpeedCanvas, this.tape.lowSpeedSamples);
    }

    /**
     *
     * @param {HTMLCanvasElement} canvas
     */
    private configureCanvas(canvas: HTMLCanvasElement) {
        let dragging = false;
        let dragInitialX = 0;
        let dragInitialCenterSample = 0;

        canvas.onmousedown = (event) => {
            dragging = true;
            dragInitialX = event.x;
            dragInitialCenterSample = this.centerSample;
            canvas.style.cursor = "grab";
        };

        canvas.onmouseup = () => {
            dragging = false;
            canvas.style.cursor = "auto";
        };

        canvas.onmousemove = (event) => {
            if (dragging) {
                const dx = event.x - dragInitialX;
                const mag = Math.pow(2, this.displayLevel);
                this.centerSample = Math.round(dragInitialCenterSample - dx * mag);
                this.draw();
            }
        };
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
    private drawInCanvas(canvas: HTMLCanvasElement, displaySamples: DisplaySamples) {
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        const samplesList = displaySamples.samplesList;
        const width = canvas.width;
        const height = canvas.height;
        const samples = samplesList[this.displayLevel];
        const mag = Math.pow(2, this.displayLevel);
        const centerSample = Math.floor(this.centerSample / mag);

        const frameToX = (i: number) => Math.floor(width / 2) + (i - centerSample);

        // Background.
        ctx.fillStyle = "rgb(0, 0, 0)";
        ctx.fillRect(0, 0, width, height);

        // Compute viewing window in zoom space.
        const firstSample = Math.max(centerSample - Math.floor(width / 2), 0);
        const lastSample = Math.min(centerSample + width - 1, samples.length - 1);

        // Compute viewing window in original space.
        const firstOrigSample = Math.floor(firstSample * mag);
        const lastOrigSample = Math.ceil(lastSample * mag);

        // Whether we're zoomed in enough to draw and line and individual bits.
        const drawingLine: boolean = this.displayLevel < 3;

        // Programs.
        for (const program of this.tape.programs) {
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

    private zoomIn() {
        if (this.displayLevel > 0) {
            this.displayLevel -= 1;
            this.draw();
        }
    }

    private zoomOut() {
        if (this.displayLevel < this.tape.originalSamples.samplesList.length - 1) {
            this.displayLevel += 1;
            this.draw();
        }
    }

    private zoomToBitData(bitData: BitData) {
        // Show a bit after a many bits before.
        const startFrame = bitData.startFrame - 1500;
        const endFrame = bitData.endFrame + 300;

        this.zoomToFit(startFrame, endFrame);
    }

    private zoomToFit(startFrame: number, endFrame: number) {
        const sampleCount = endFrame - startFrame;

        // Find appropriate zoom.
        this.displayLevel = this.computeFitLevel(sampleCount);

        // Visually centered sample (in level 0).
        this.centerSample = Math.floor((startFrame + endFrame)/2);

        this.draw();
    }

    private zoomToFitAll() {
        this.zoomToFit(0, this.tape.originalSamples.samplesList[0].length);
    }

    private showBinary(program: Program) {
        this.showProgramText();

        const div = this.programText;
        this.clearElement(div);
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

    /**
     *
     * @param {Program} program
     */
    private showBasic(program: Program) {
        this.showProgramText();

        const div = this.programText;
        this.clearElement(div);
        div.classList.add("basic");
        div.classList.remove("binary");

        fromTokenized(program.binary, div);
    }

    private showProgramText() {
        this.waveforms.style.display = "none";
        this.programText.style.display = "block";
    }

    private showCanvases() {
        this.waveforms.style.display = "block";
        this.programText.style.display = "none";
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
        this.clearElement(this.tapeContents);
        addRow(this.tape.name, () => {
            this.showCanvases();
            this.zoomToFitAll();
        });
        for (const program of this.tape.programs) {
            addRow("Track " + program.trackNumber + ", copy " + program.copyNumber + ", " + program.decoderName, null);
            addRow(frameToTimestamp(program.startFrame, true) + " to " +
                frameToTimestamp(program.endFrame, true) + " (" +
                frameToTimestamp(program.endFrame - program.startFrame, true) + ")", null);
            addRow("    Waveform", () => {
                this.showCanvases();
                this.zoomToFit(program.startFrame, program.endFrame);
            });
            addRow("    Binary", () => {
                this.showBinary(program);
            });
            if (program.isBasicProgram()) {
                addRow("    Basic", () => {
                    this.showBasic(program);
                });
            }
            let count = 1;
            for (const bitData of program.bits) {
                if (bitData.bitType === BitType.BAD) {
                    addRow("    Bit error " + count++ + " (" + frameToTimestamp(bitData.startFrame, true) + ")", () => {
                        this.showCanvases();
                        this.zoomToBitData(bitData);
                    });
                }
            }
        }
    }

    /**
     * Remove all children from element.
     *
     * @param {HTMLElement} e
     */
    private clearElement(e: HTMLElement) {
        while (e.firstChild) {
            e.removeChild(e.firstChild);
        }
    }
}
