// UI for browsing a tape interactively.

import { Tape } from "Tape";
import { pad } from "Utils";
import { fromTokenized } from "Basic";

export class TapeBrowser {
    tape: Tape;
    originalCanvas: HTMLCanvasElement;
    filteredCanvas: HTMLCanvasElement;
    programText: HTMLElement;
    tapeContents: HTMLElement;
    displayLevel: number;
    centerSample: number;

    /**
     * @param {Tape} tape
     * @param {HTMLCanvasElement} originalCanvas
     * @param {HTMLCanvasElement} filteredCanvas
     * @param {HTMLElement} programText
     * @param {HTMLElement} tapeContents
     */
    constructor(tape, originalCanvas, filteredCanvas, programText, tapeContents) {
        var self = this;
        this.tape = tape;
        this.originalCanvas = originalCanvas;
        this.filteredCanvas = filteredCanvas;
        this.programText = programText;
        this.tapeContents = tapeContents;

        this.configureCanvas(originalCanvas);
        this.configureCanvas(filteredCanvas);

        // Display level in the tape's samplesList.
        this.displayLevel = this.computeFitLevel(originalCanvas.width);

        // Visually centered sample (in level 0).
        this.centerSample = Math.floor(tape.originalSamples.samplesList[0].length / 2);

        // Configure zoom keys.
        document.onkeypress = function (event) {
            if (event.keyCode == 61) {
                self.zoomIn();
                event.preventDefault();
            }
            if (event.keyCode == 45) {
                self.zoomOut();
                event.preventDefault();
            }
        };

        // Update tape contents.
        this.updateTapeContents();
    }

    /**
     *
     * @param {HTMLCanvasElement} canvas
     */
    configureCanvas(canvas) {
        var self = this;
        var dragging = false;
        var dragInitialX = 0;
        var dragInitialCenterSample = 0;

        canvas.onmousedown = function (event) {
            dragging = true;
            dragInitialX = event.x;
            dragInitialCenterSample = self.centerSample;
            canvas.style.cursor = "grab";
        };

        canvas.onmouseup = function (event) {
            dragging = false;
            canvas.style.cursor = "auto";
        };

        canvas.onmousemove = function (event) {
            if (dragging) {
                var dx = event.x - dragInitialX;
                const mag = Math.pow(2, self.displayLevel);
                self.centerSample = Math.round(dragInitialCenterSample - dx * mag);
                self.draw();
            }
        }
    }

    /**
     * @param {number} width the width of the canvas we'll initially display in.
     */
    computeFitLevel(width) {
        const sampleCount = this.tape.originalSamples.samplesList[0].length;
        var displayLevel = Math.ceil(Math.log2(sampleCount / width));
        displayLevel = Math.max(displayLevel, 0);
        displayLevel = Math.min(displayLevel, sampleCount - 1);
        return displayLevel;
    }

    draw() {
        this.drawInCanvas(this.originalCanvas, this.tape.originalSamples);
        this.drawInCanvas(this.filteredCanvas, this.tape.filteredSamples);
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {DisplaySamples} displaySamples
     */
    drawInCanvas(canvas, displaySamples) {
        const ctx = canvas.getContext('2d');
        const samplesList = displaySamples.samplesList;
        const width = canvas.width;
        const height = canvas.height;
        const samples = samplesList[this.displayLevel];
        const mag = Math.pow(2, this.displayLevel);
        const centerSample = Math.floor(this.centerSample / mag);

        var frameToX = function (i) {
            return Math.floor(width / 2) + (i - centerSample);
        };

        // Background.
        ctx.fillStyle = 'rgb(0, 0, 0)';
        ctx.fillRect(0, 0, width, height);

        // Programs.
        ctx.fillStyle = 'rgb(50, 50, 50)';
        for (let program of this.tape.programs) {
            let x1 = frameToX(program.startFrame / mag);
            let x2 = frameToX(program.endFrame / mag);
            ctx.fillRect(x1, 0, x2 - x1, height);
        }

        ctx.strokeStyle = "rgb(255, 255, 255)";
        const firstSample = Math.max(centerSample - Math.floor(width / 2), 0);
        const lastSample = Math.min(centerSample + width - 1, samples.length - 1);

        const drawingLine = this.displayLevel < 3;
        if (drawingLine) {
            ctx.beginPath();
        }
        for (var i = firstSample; i <= lastSample; i++) {
            var value = samples[i];
            var x = frameToX(i);
            var y = value * height / 2;

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

    /**
     * 
     * @param {Program} program 
     */
    showBinary(program) {
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
    showBasic(program) {
        this.showProgramText();

        const div = this.programText;
        this.clearElement(div);
        div.classList.add("basic");
        div.classList.remove("binary");

        fromTokenized(program.binary, div);
    }

    showProgramText() {
        this.originalCanvas.style.display = "none";
        this.filteredCanvas.style.display = "none";
        this.programText.style.display = "block";
    }

    showCanvases() {
        this.originalCanvas.style.display = "block";
        this.filteredCanvas.style.display = "block";
        this.programText.style.display = "none";
    }

    updateTapeContents() {
        let self = this;
        let addRow = function (text, onClick) {
            let div = document.createElement("div");
            div.classList.add("tape_contents_row");
            div.innerText = text;
            if (onClick) {
                div.onclick = onClick;
            }
            self.tapeContents.appendChild(div);
        };
        this.clearElement(this.tapeContents);
        for (let program of this.tape.programs) {
            addRow("Track " + program.trackNumber + ", copy " + program.copyNumber, function () {
                self.showCanvases();
            });
            addRow("    Binary", function () {
                self.showBinary(program);
            });
            if (program.isProgram()) {
                addRow("    Basic", function () {
                    self.showBasic(program);
                });
            }
        }
    }

    /**
     * Remove all children from element.
     * 
     * @param {HTMLElement} e
     */
    clearElement(e) {
        while (e.firstChild) {
            e.removeChild(e.firstChild);
        }
    }
}
