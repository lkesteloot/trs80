import {Mutable} from "./Mutable";

const PROCESSOR_NAME = "trs80-audio-processor";

const SPIN_URL = "https://raw.githubusercontent.com/lkesteloot/trs80-emulator/83e7fabd7d26f3e197329ee05a7c8ffc4063362c/sounds/spin.mp3";

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
    private floppyMotorOn = false;
    private floppySpinAudioBuffer: AudioBuffer | undefined = undefined;
    private floppySpinSourceNode: AudioBufferSourceNode | undefined = undefined;
    private floppySpinGainNode: GainNode | undefined = undefined;
    // Difference between computer time and audio time, in seconds.
    private adjustment = 0;
    private lastAudioTime = 0;
    private isSuspended = false;

    /**
     * Resume the audio context if necessary.
     */
    private resumeAudio(): void {
        if (this.isSuspended && this.audioContext !== undefined) {
            this.audioContext.resume();
            this.isSuspended = false;
        }
    }

    /**
     * Sets the value sent to the cassette, from the set -1, 0, or 1.
     */
    public setAudioValue(value: number, tStateCount: number, clockHz: number): void {
        if (!this.muted && this.audioContext !== undefined && this.audioValue !== undefined) {
            this.resumeAudio();

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
     * Update the sound system about the state of the floppy motors.
     */
    public setFloppyMotorOn(motorOn: boolean): void {
        this.floppyMotorOn = motorOn;
        this.updateFloppySpin();
    }

    /**
     * Start or stop the background floppy spinning noise depending on the state of the motor.
     */
    private updateFloppySpin(): void {
        if (!this.floppyMotorOn && this.floppySpinSourceNode !== undefined &&
            this.floppySpinGainNode !== undefined && this.audioContext !== undefined) {

            // Stop playing spin sound.

            const endTime = this.audioContext.currentTime + 0.2;
            this.floppySpinGainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
            this.floppySpinGainNode.gain.linearRampToValueAtTime(0, endTime);
            this.floppySpinSourceNode.stop(endTime);
            this.floppySpinSourceNode = undefined;
            this.floppySpinGainNode = undefined;
        } else if (this.floppyMotorOn && this.floppySpinSourceNode === undefined &&
            this.floppySpinAudioBuffer !== undefined && this.audioContext !== undefined) {

            // Start playing spin sound.

            this.resumeAudio();

            this.floppySpinGainNode = this.audioContext.createGain();
            this.floppySpinGainNode.connect(this.audioContext.destination);
            this.floppySpinGainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            this.floppySpinGainNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.2);

            this.floppySpinSourceNode = this.audioContext.createBufferSource();
            this.floppySpinSourceNode.buffer = this.floppySpinAudioBuffer;
            this.floppySpinSourceNode.connect(this.floppySpinGainNode);
            this.floppySpinSourceNode.loop = true;
            this.floppySpinSourceNode.start();

            // Remember when we last played audio.
            this.lastAudioTime = this.audioContext.currentTime;
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
        if (this.audioContext !== undefined && !this.isSuspended &&
            this.floppySpinSourceNode === undefined &&
            this.audioContext.currentTime - this.lastAudioTime >= MIN_SILENT_TIME_S) {

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

        // Get the background spin sound.
        fetch(SPIN_URL)
            .then(response => {
                if (response.status === 200) {
                    return response.blob();
                } else {
                    return Promise.reject("fetch failed: " + response.statusText);
                }
            })
            .then(blob => blob.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                this.floppySpinAudioBuffer = audioBuffer;
                this.updateFloppySpin();
            })
            .catch(e => {
                // TODO.
                console.error(e);
            });
    }
}
