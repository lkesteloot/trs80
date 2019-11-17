// UI for browsing a tape interactively.

"use strict";

define(["Tape"], function (Tape) {

    class TapeBrowser {
        /**
         * @param {Tape} tape
         * @param {HTMLCanvasElement} originalCanvas
         * @param {HTMLCanvasElement} filteredCanvas
         * @param {HTMLElement} tapeContents
         */
        constructor(tape, originalCanvas, filteredCanvas, tapeContents) {
            var self = this;
            this.tape = tape;
            this.originalCanvas = originalCanvas;
            this.filteredCanvas = filteredCanvas;
            this.tapeContents = tapeContents;

            this.configureCanvas(originalCanvas);
            this.configureCanvas(filteredCanvas);

            // Display level in the tape's samplesList.
            this.displayLevel = this.computeFitLevel(originalCanvas.width);

            // Visually centered sample (in level 0).
            this.centerSample = Math.floor(tape.originalSamples.samplesList[0].length / 2);

            // Configure zoom keys.
            document.onkeydown = function (event) {
                // XXX should pick meta vs. ctrl based on platform (mac vs. pc).
                if (event.metaKey || event.ctrlKey) {
                    if (event.keyCode == 187) {
                        self.zoomIn();
                        event.preventDefault();
                    }
                    if (event.keyCode == 189) {
                        self.zoomOut();
                        event.preventDefault();
                    }
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
            var displayLevel = Math.ceil(Math.log2(sampleCount/width));
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
                let x1 = frameToX(program.startFrame/mag);
                let x2 = frameToX(program.endFrame/mag);
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

        updateTapeContents() {
            let self = this;
            let addRow = function (text) {
                let div = document.createElement("div");
                div.classList.add("tape_contents_row");
                div.innerText = text;
                self.tapeContents.appendChild(div);
            };
            while (this.tapeContents.firstChild) {
                this.tapeContents.removeChild(this.tapeContents.firstChild);
            }
            for (let program of this.tape.programs) {
                addRow("Track " + program.trackNumber + ", copy " + program.copyNumber);
                addRow("    Binary");

                if (program.isProgram()) {
                    addRow("    Basic");
                }
            }
        }
    }

    return TapeBrowser;
});