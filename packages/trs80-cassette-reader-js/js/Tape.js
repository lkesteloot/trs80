// Represents a recorded tape, with its audio samples,
// filtered-down samples for display, and other information
// we got from it.

"use strict";

define(["DisplaySamples"], function (DisplaySamples) {
    /**
     * @param {Float32Array} samples original samples from the tape.
     */
    class Tape {
        constructor(samples) {
            this.originalSamples = new DisplaySamples(samples);
            this.filteredSamples = new DisplaySamples(this.filterSamples(samples, 500));
        }

        /**
         * @param {Float32Array} samples samples to filter.
         * @param {number} size size of filter
         * @returns {Float32Array} filtered samples.
         */
        filterSamples(samples, size) {
            var out = new Float32Array(samples.length);
            var sum = 0;
    
            for (var i = 0; i < samples.length; i++) {
                sum += samples[i];
                if (i >= size) {
                    sum -= samples[i - size];
                }
    
                // Subtract out the average of the last "size" samples (to estimate local DC component).
                out[i] = samples[i] - sum/size;
            }
    
            return out;
        }
    }

    return Tape;
});