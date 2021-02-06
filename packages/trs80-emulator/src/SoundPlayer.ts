import {Mutable} from "./Mutable";

const PROCESSOR_NAME = "trs80-audio-processor";

const PROCESSOR_JS = `
// Generates the TRS-80 sound.
class Trs80SoundProcessor extends AudioWorkletProcessor {
    // This parameter is the audio itself. We just pass it on.
    static get parameterDescriptors() {
        return [{
            name: "audioValue",
            defaultValue: 0,
        }];
    }

    constructor() {
        super();
    }

    // Process 128 audio samples at a time.
    process(inputs, outputs, parameters) {
        // We only have one output.
        const output = outputs[0];

        // The parameter that holds the actual audio.
        const audioValue = parameters.audioValue;

        // We should be mono, but send to all channels anyway.
        for (let channelNumber = 0; channelNumber < output.length; channelNumber++) {
            const channel = output[channelNumber];

            for (let i = 0; i < channel.length; i++) {
                const value = audioValue.length === 1 ? audioValue[0] : audioValue[i];
                
                // 10% volume.
                channel[i] = value/10;
            }
        }

        // Keep going.
        return true;
    }
}

// Register ourselves by name.
registerProcessor("${PROCESSOR_NAME}", Trs80SoundProcessor);
`;

/**
 * Minimum time of silence before we suspend the audio player. Be generous here because we lose a bit of
 * audio after resuming, so you really only want to do it after the sound-making program has stopped.
 */
const MIN_SILENT_TIME_S = 30;

/**
 * Simple node to access the processor.
 */
class Trs80SoundNode extends AudioWorkletNode {
    constructor(context: AudioContext) {
        super(context, PROCESSOR_NAME);
    }
}

/**
 * Handles playing of sound through the cassette port.
 */
export class SoundPlayer implements Mutable {
    private muted = true;
    private audioContext: AudioContext | undefined = undefined;
    private audioValue: AudioParam | undefined = undefined;
    // Difference between computer time and audio time, in seconds.
    private adjustment = 0;
    private lastAudioTime = 0;
    private isSuspended = false;

    /**
     * Sets the value sent to the cassette, from the set -1, 0, or 1.
     */
    public setAudioValue(value: number, tStateCount: number, clockHz: number): void {
        if (!this.muted && this.audioContext !== undefined && this.audioValue !== undefined) {
            if (this.isSuspended) {
                this.audioContext.resume();
                this.isSuspended = false;
            }

            const computerTime = tStateCount / clockHz;
            const audioTime = this.audioContext.currentTime;

            const delta = computerTime - audioTime;
            const error = delta - this.adjustment;
            if (error < 0 || error > 0.050) {
                // We always need computer time to be ahead of audio time or it won't be heard.
                this.adjustment = delta - 0.025;
            }

            this.audioValue.setValueAtTime(value, computerTime - this.adjustment);

            // Remember when we last played audio.
            this.lastAudioTime = audioTime;
        }
    }

    /**
     * Mutes the audio. This is the default.
     */
    public mute(): void {
        if (!this.muted) {
            this.muted = true;
            if (this.audioContext !== undefined) {
                this.audioContext.suspend();
                this.isSuspended = true;
            }
        }
    }

    /**
     * Unmutes the audio.
     */
    public unmute(): void {
        if (this.muted) {
            if (this.audioContext === undefined) {
                this.enableAudio();
            }
            this.muted = false;
            if (this.audioContext !== undefined) {
                this.audioContext.resume();
                this.isSuspended = false;
            }
        }
    }

    /**
     * Whether we're muted.
     */
    public isMuted(): boolean {
        return this.muted;
    }

    /**
     * Check whether it's been too long since we played audio and we should suspend the player (so that the
     * speaker icon disappears from the tab).
     */
    private checkAutoSuspend(): void {
        if (this.audioContext !== undefined && !this.isSuspended && this.audioContext.currentTime - this.lastAudioTime >= MIN_SILENT_TIME_S) {
            this.audioContext.suspend();
            this.isSuspended = true;
        }
    }

    /**
     * Start the audio processor.
     */
    private enableAudio() {
        // Create the audio context. We have to do this as a result of a user action, like a mouse click.
        this.audioContext = new AudioContext({
            latencyHint: "interactive",
        });

        const audioContext = this.audioContext;

        // Load our module.
        const moduleUrl = "data:text/javascript;base64," + btoa(PROCESSOR_JS);
        this.audioContext.audioWorklet.addModule(moduleUrl).then(() => {
            // I don't know why we need this, but I can't figure out a way to "start" our own node.
            const constantSourceNode = audioContext.createConstantSource();

            // Our own node, which ignores its input and generates the audio.
            const node = new Trs80SoundNode(audioContext);

            // Into this parameter we'll write the actual audio values.
            this.audioValue = node.parameters.get("audioValue");
            if (this.audioValue === undefined) {
                throw new Error("Unknown param audioValue");
            }

            // Automatically suspend the audio if we've not played sound in a while.
            setInterval(() => this.checkAutoSuspend(), 1000);

            // Hook up the pipeline.
            constantSourceNode.connect(node).connect(audioContext.destination);
            constantSourceNode.start();
        });
    }
}
