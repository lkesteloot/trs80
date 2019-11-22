
import { pad } from "Utils";

// Expected HZ on tape.
export const HZ = 48000;

/**
 * @param samples samples to filter.
 * @param size size of filter
 * @returns filtered samples.
 */
export function filterSamples(samples : Float32Array, size: number): Float32Array {
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
}

export function frameToTimestamp(frame: number) {
    var time = frame / HZ;

    var ms = Math.floor(time * 1000);
    var sec = Math.floor(ms / 1000);
    ms -= sec * 1000;
    var min = Math.floor(sec / 60);
    sec -= min * 60;
    var hour = Math.floor(min / 60);
    min -= hour * 60;

    return hour + ":" + pad(min, 10, 2) + ":" + pad(sec, 10, 2) + "." + pad(ms, 10, 3) + " (frame " + frame + ")";
}
