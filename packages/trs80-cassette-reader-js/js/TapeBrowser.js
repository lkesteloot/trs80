// UI for browsing a tape interactively.

"use strict";

define(["Tape"], function (Tape) {

    class TapeBrowser {
        /**
         * @param {Tape} tape
         * @param {Array<HTMLCanvasElement>} canvases
         */
        constructor(tape, canvases) {
            var self = this;
            this.tape = tape;
            this.canvases = canvases;

            for (var canvas of canvases) {
                this.configureCanvas(canvas);
            }

            // Display level in the tape's samplesList.
            this.displayLevel = this.computeFitLevel(canvases[0].width);

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
            const sampleCount = this.tape.originalSamples.samplesList.length;
            var displayLevel = Math.ceil(Math.log2(width / sampleCount));
            displayLevel = Math.max(displayLevel, 0);
            displayLevel = Math.min(displayLevel, sampleCount - 1);
            return displayLevel;
        }

        draw() {
            this.drawInCanvas(this.canvases[0], this.tape.originalSamples);
            if (this.canvases.length > 1) {
                this.drawInCanvas(this.canvases[1], this.tape.filteredSamples);
            }
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

            ctx.fillStyle = 'rgb(0, 0, 0)';
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = "rgb(255, 255, 255)";
            const firstSample = Math.max(centerSample - Math.floor(width / 2), 0);
            const lastSample = Math.min(centerSample + width - 1, samples.length - 1);

            const drawingLine = this.displayLevel < 3;
            if (drawingLine) {
                ctx.beginPath();
            }
            for (var i = firstSample; i <= lastSample; i++) {
                var value = samples[i];
                var x = Math.floor(width / 2) + (i - centerSample);
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
    }

    return TapeBrowser;
});