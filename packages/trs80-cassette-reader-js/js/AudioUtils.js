"use strict";

define(function () {
    function pad(n, size) {
        var s = n.toString();

        while (s.length < size) {
            s = "0" + s;
        }

        return s;
    }

    return {
        // Expected HZ on tape.
        HZ: 48000,

        /**
         * @param {Float32Array} samples samples to filter.
         * @param {number} size size of filter
         * @returns {Float32Array} filtered samples.
         */
        filterSamples: function (samples, size) {
            var out = new Float32Array(samples.length);
            var sum = 0;

            for (var i = 0; i < samples.length; i++) {
                sum += samples[i];
                if (i >= size) {
                    sum -= samples[i - size];
                }

                // Subtract out the average of the last "size" samples (to estimate local DC component).
                out[i] = samples[i] - sum / size;
            }

            return out;
        },

        frameToTimestamp: function (frame) {
            var time = frame / this.HZ;

            var ms = Math.floor(time * 1000);
            var sec = Math.floor(ms / 1000);
            ms -= sec * 1000;
            var min = Math.floor(sec / 60);
            sec -= min * 60;
            var hour = Math.floor(min / 60);
            min -= hour * 60;

            return hour + ":" + pad(min, 2) + ":" + pad(sec, 2) + "." + pad(ms, 3) + " (frame " + frame + ")";
        }
    };
});