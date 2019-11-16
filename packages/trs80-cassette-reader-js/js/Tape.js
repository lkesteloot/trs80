// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.

"use strict";

define(function () {
    /**
     * 
     * @param {Float32Array} samples original samples from the tape.
     */
    var Tape = function (samples) {
        this.samplesList = [samples];

        while (this.samplesList[this.samplesList.length - 1].length > 1) {
            var samples = this.samplesList[this.samplesList.length - 1];
            var half = Math.ceil(samples.length / 2);
            var down = new Float32Array(half);

            for (var i = 0; i < half; i++) {
                var j = i * 2;
                var value = j == samples.length - 1 ? samples[j] : Math.max(samples[j], samples[j + 1]);
                down[i] = value;
            }
            this.samplesList.push(down);
        }
    };


    return Tape;
});