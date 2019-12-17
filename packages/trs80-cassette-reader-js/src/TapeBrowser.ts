// UI for browsing a tape interactively.

import {Tape} from "Tape";
import {pad} from "Utils";
import {fromTokenized} from "Basic";
import {DisplaySamples} from "DisplaySamples";
import {Program} from "./Program";
import {BitType} from "./BitType";
import {BitData} from "./BitData";

export class TapeBrowser {
    tape: Tape;
    waveforms: HTMLElement;
    originalCanvas: HTMLCanvasElement;
    filteredCanvas: HTMLCanvasElement;
    lowSpeedCanvas: HTMLCanvasElement;
    programText: HTMLElement;
    tapeContents: HTMLElement;
    displayWidth: number;
    displayLevel: number = 0; // Initialized in zoomToFitAll()
    centerSample: number = 0; // Initialized in zoomToFitAll()

    constructor(tape: Tape,
                zoomInButton: HTMLButtonElement,
                zoomOutButton: HTMLButtonElement,
                waveforms: HTMLElement,
                originalCanvas: HTMLCanvasElement,
                filteredCanvas: HTMLCanvasElement,
                lowSpeedCanvas: HTMLCanvasElement,
                programText: HTMLElement, tapeContents: HTMLElement) {

        const self = this;
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

        zoomInButton.onclick = function () {
            self.zoomIn();
        };
        zoomOutButton.onclick = function () {
            self.zoomOut();
        };

        // Configure zoom keys.
        document.onkeypress = function (event) {
            if (event.key === '=') {
                self.zoomIn();
                event.preventDefault();
            }
            if (event.key === '-') {
                self.zoomOut();
                event.preventDefault();
            }
        };

        // Update left-side panel.
        this.updateTapeContents();
    }

    /**
     *
     * @param {HTMLCanvasElement} canvas
     */
    configureCanvas(canvas: HTMLCanvasElement) {
        const self = this;
        let dragging = false;
        let dragInitialX = 0;
        let dragInitialCenterSample = 0;

        canvas.onmousedown = function (event) {
            dragging = true;
            dragInitialX = event.x;
            dragInitialCenterSample = self.centerSample;
            canvas.style.cursor = "grab";
        };

        canvas.onmouseup = function () {
            dragging = false;
            canvas.style.cursor = "auto";
        };

        canvas.onmousemove = function (event) {
            if (dragging) {
                const dx = event.x - dragInitialX;
                const mag = Math.pow(2, self.displayLevel);
                self.centerSample = Math.round(dragInitialCenterSample - dx * mag);
                self.draw();
            }
        }
    }

    /**
     * Compute fit level to fit the specified number of samples.
     *
     * @param sampleCount number of samples we want to display.
     */
    computeFitLevel(sampleCount: number): number {
        let displayLevel = Math.ceil(Math.log2(sampleCount / this.displayWidth));
        displayLevel = Math.max(displayLevel, 0);
        displayLevel = Math.min(displayLevel, sampleCount - 1);
        return displayLevel;
    }

    draw() {
        this.drawInCanvas(this.originalCanvas, this.tape.originalSamples);
        this.drawInCanvas(this.filteredCanvas, this.tape.filteredSamples);
        this.drawInCanvas(this.lowSpeedCanvas, this.tape.lowSpeedSamples);
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {DisplaySamples} displaySamples
     */
    drawInCanvas(canvas: HTMLCanvasElement, displaySamples: DisplaySamples) {
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const samplesList = displaySamples.samplesList;
        const width = canvas.width;
        const height = canvas.height;
        const samples = samplesList[this.displayLevel];
        const mag = Math.pow(2, this.displayLevel);
        const centerSample = Math.floor(this.centerSample / mag);

        const frameToX = function (i: number) {
            return Math.floor(width / 2) + (i - centerSample);
        };

        // Background.
        ctx.fillStyle = 'rgb(0, 0, 0)';
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
        for (let program of this.tape.programs) {
            if (drawingLine) {
                for (let bitInfo of program.bits) {
                    if (bitInfo.endFrame >= firstOrigSample && bitInfo.startFrame <= lastOrigSample) {
                        let x1 = frameToX(bitInfo.startFrame / mag);
                        let x2 = frameToX(bitInfo.endFrame / mag);
                        // console.log(bitInfo, x1, x2);
                        switch (bitInfo.bitType) {
                            case BitType.ZERO:
                                ctx.fillStyle = 'rgb(50, 50, 50)';
                                break;
                            case BitType.ONE:
                                ctx.fillStyle = 'rgb(100, 100, 100)';
                                break;
                            case BitType.START:
                                ctx.fillStyle = 'rgb(20, 150, 20)';
                                break;
                            case BitType.BAD:
                                ctx.fillStyle = 'rgb(150, 20, 20)';
                                break;
                        }
                        ctx.fillRect(x1, 0, x2 - x1 - 1, height);
                    }
                }
            } else {
                ctx.fillStyle = 'rgb(50, 50, 50)';
                let x1 = frameToX(program.startFrame / mag);
                let x2 = frameToX(program.endFrame / mag);
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
                if (i == firstSample) {
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

    zoomIn() {
        if (this.displayLevel > 0) {
            this.displayLevel -= 1;
            this.draw();
        }
    }

    zoomOut() {
        if (this.displayLevel < this.tape.originalSamples.samplesList.length - 1) {
            this.displayLevel += 1;
            this.draw();
        }
    }

    zoomToBitData(bitData: BitData) {
        // Show a bit after a many bits before.
        const startFrame = bitData.startFrame - 1500;
        const endFrame = bitData.endFrame + 300;

        this.zoomToFit(startFrame, endFrame);
    }

    zoomToFit(startFrame: number, endFrame: number) {
        const sampleCount = endFrame - startFrame;

        // Find appropriate zoom.
        this.displayLevel = this.computeFitLevel(sampleCount);

        // Visually centered sample (in level 0).
        this.centerSample = Math.floor((startFrame + endFrame)/2);

        this.draw();
    }

    zoomToFitAll() {
        this.zoomToFit(0, this.tape.originalSamples.samplesList[0].length);
    }

    showBinary(program: Program) {
        this.showProgramText();

        const div = this.programText;
        this.clearElement(div);
        div.classList.add("binary");
        div.classList.remove("basic");

        const binary = program.binary;
        for (let addr = 0; addr < binary.length; addr += 16) {
            let line = document.createElement("div");

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
                let c = binary[subAddr];
                e = document.createElement("span");
                if (c >= 32 && c < 127) {
                    e.classList.add("ascii");
                    e.innerText += String.fromCharCode(c);
                } else {
                    e.classList.add("ascii-unprintable");
                    e.innerText += '.';
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
    showBasic(program: Program) {
        this.showProgramText();

        const div = this.programText;
        this.clearElement(div);
        div.classList.add("basic");
        div.classList.remove("binary");

        fromTokenized(program.binary, div);
    }

    showProgramText() {
        this.waveforms.style.display = "none";
        this.programText.style.display = "block";
    }

    showCanvases() {
        this.waveforms.style.display = "block";
        this.programText.style.display = "none";
    }

    updateTapeContents() {
        let self = this;
        let addRow = function (text: string, onClick: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null) {
            let div = document.createElement("div");
            div.classList.add("tape_contents_row");
            div.innerText = text;
            if (onClick != null) {
                div.classList.add("selectable_row");
                div.onclick = onClick;
            }
            self.tapeContents.appendChild(div);
        };
        this.clearElement(this.tapeContents);
        addRow("Entire recording", function () {
            self.showCanvases();
            self.zoomToFitAll();
        });
        for (let program of this.tape.programs) {
            addRow("Track " + program.trackNumber + ", copy " + program.copyNumber, null);
            addRow("    Waveform", function () {
                self.showCanvases();
                self.zoomToFit(program.startFrame, program.endFrame);
            });
            addRow("    Binary", function () {
                self.showBinary(program);
            });
            if (program.isProgram()) {
                addRow("    Basic", function () {
                    self.showBasic(program);
                });
            }
            let count = 1;
            for (let bitData of program.bits) {
                if (bitData.bitType == BitType.BAD) {
                    addRow("    Bit error " + count++, function () {
                        self.showCanvases();
                        self.zoomToBitData(bitData);
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
    clearElement(e: HTMLElement) {
        while (e.firstChild) {
            e.removeChild(e.firstChild);
        }
    }
}
