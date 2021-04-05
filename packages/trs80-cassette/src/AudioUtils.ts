
import {pad, withCommas} from "./Utils";

export class AudioFile {
    // In samples per second.
    rate: number;
    samples: Int16Array;

    constructor(rate: number, samples: Int16Array) {
        this.rate = rate;
        this.samples = samples;
    }
}

/**
 * Simple high-pass filter.
 *
 * @param samples samples to filter.
 * @param size size of filter
 * @returns filtered samples.
 */
export function highPassFilter(samples: Int16Array, size: number): Int16Array {
    const out = new Int16Array(samples.length);
    let sum = 0;

    for (let i = 0; i < size; i++) {
        sum += samples[i];

        // Subtract out the average of the last "size" samples (to estimate local DC component).
        out[i] = clampToInt16(samples[i] - sum / size);
    }
    for (let i = size; i < samples.length; i++) {
        sum += samples[i] - samples[i - size];

        // Subtract out the average of the last "size" samples (to estimate local DC component).
        out[i] = clampToInt16(samples[i] - sum / size);
    }

    return out;
}

/**
 * @param frame the frame number to be described as a timestamp.
 * @param hz number of frames per second in original recording.
 * @param brief omit hour if zero, omit milliseconds and frame itself.
 */
export function frameToTimestamp(frame: number, hz: number, brief?: boolean) {
    const time = frame / hz;

    let ms = Math.floor(time * 1000);
    let sec = Math.floor(ms / 1000);
    ms -= sec * 1000;
    let min = Math.floor(sec / 60);
    sec -= min * 60;
    const hour = Math.floor(min / 60);
    min -= hour * 60;

    if (brief) {
        return (hour !== 0 ? hour + ":" + pad(min, 10, 2) : min) + ":" + pad(sec, 10, 2);
    } else {
        return hour + ":" + pad(min, 10, 2) + ":" + pad(sec, 10, 2) + "." + pad(ms, 10, 3) + " (frame " + withCommas(frame) + ")";
    }
}

/**
 * @param frame the frame duration to be described as a string.
 * @param hz number of frames per second in original recording.
 */
export function frameDurationToString(frame: number, hz: number) {
    const time = frame / hz;

    let us = Math.floor(time * 1000000);
    let sec = Math.floor(us / 1000000);
    us -= sec * 1000000;
    let min = Math.floor(sec / 60);
    sec -= min * 60;
    const hour = Math.floor(min / 60);
    min -= hour * 60;

    return (hour !== 0 ? hour + ":" + pad(min, 10, 2) : min) + ":" + pad(sec, 10, 2) + "." +
        withCommas(pad(us, 10, 6)) + " (" + withCommas(frame) + " frame" + (frame === 1 ? "" : "s") + ")";
}

/**
 * Concatenate a list of audio samples into one.
 */
export function concatAudio(samplesList: Int16Array[]): Int16Array {
    const length = samplesList.reduce((sum, samples) => sum + samples.length, 0);
    const allSamples = new Int16Array(length);

    let offset = 0;
    for (const samples of samplesList) {
        allSamples.set(samples, offset);
        offset += samples.length;
    }

    return allSamples;
}

/**
 * Clamp the number to the range of signed 16-bit int.
 */
export function clampToInt16(x: number): number {
    return Math.max(Math.min(Math.round(x), 32767), -32768);
}

/**
 * Generate a certain amount of silence.
 */
export function makeSilence(seconds: number, sampleRate: number): Int16Array {
    return new Int16Array(Math.round(seconds*sampleRate));
}
