
import { pad } from "Utils";

// Expected HZ on tape.
export const HZ = 48000;

/**
 * Simple high-pass filter.
 *
 * @param samples samples to filter.
 * @param size size of filter
 * @returns filtered samples.
 */
export function highPassFilter(samples : Float32Array, size: number): Float32Array {
    const out = new Float32Array(samples.length);
    let sum = 0;

    for (let i = 0; i < samples.length; i++) {
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
    const time = frame / HZ;

    let ms = Math.floor(time * 1000);
    let sec = Math.floor(ms / 1000);
    ms -= sec * 1000;
    let min = Math.floor(sec / 60);
    sec -= min * 60;
    const hour = Math.floor(min / 60);
    min -= hour * 60;

    return hour + ":" + pad(min, 10, 2) + ":" + pad(sec, 10, 2) + "." + pad(ms, 10, 3) + " (frame " + frame + ")";
}
