// UI for browsing a tape interactively.

"use strict";

define(["Tape"], function (Tape) {

    class TapeBrowser {
        /**
         * @param {Tape} tape
         * @param {Array<HTMLCanvasElement>} canvases
         */
        constructor(tape, canvases) {
            this.tape = tape;
            this.canvases = canvases;

            for (var canvas of canvases) {
                this.configureCanvas(canvas);
            }

            // Display level in the tape's samplesList.
            this.displayLevel = 0;

            // Visually centered sample (in level 0).
            this.centerSample = Math.floor(tape.samplesList[0].length / 2);
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
        fitIn(width) {
            const sampleCount = this.tape.samplesList.length;
            var displayLevel = Math.ceil(Math.log2(width / sampleCount));
            displayLevel = Math.max(displayLevel, 0);
            displayLevel = Math.min(displayLevel, this.tape.samplesList.length - 1);
            this.displayLevel = displayLevel;
        }

        draw() {
            for (var canvas of this.canvases) {
                this.drawInCanvas(canvas);
            }
        }

        /**
         * 
         * @param {HTMLCanvasElement} canvas 
         */
        drawInCanvas(canvas) {
            const ctx = canvas.getContext('2d');
            const samplesList = this.tape.samplesList;
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
            if (this.displayLevel < this.tape.samplesList.length - 1) {
                this.displayLevel += 1;
                this.draw();
            }
        }
    }

    return TapeBrowser;
});