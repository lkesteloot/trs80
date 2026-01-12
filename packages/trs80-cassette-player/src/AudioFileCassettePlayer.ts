import {AudioFile, concatAudio, encodeHighSpeed, encodeLowSpeed, totalAudioSamples, wrapHighSpeed, wrapLowSpeed} from "trs80-cassette";
import { CassettePlayer } from "trs80-emulator";
import {ProgressBar} from "./ProgressBar.js";
import { Cassette, CassetteSpeed } from "trs80-base";

/**
 * CassettePlayer for an AudioFile.
 */
export class AudioFileCassettePlayer extends CassettePlayer {
    /**
     * The number of samples per second that this audio represents.
     */
    public samplesPerSecond: number = 44100;
    public audioFile = AudioFile.makeEmpty();
    private frame: number = 0;
    private progressBar: ProgressBar | undefined;
    private motorOn = false;

    /**
     * Create the cassette player for the audio file.
     *
     * @param audioFile the audio file to play.
     * @param startFrame which frame to start at.
     */
    public setAudioFile(audioFile: AudioFile, startFrame = 0) {
        this.audioFile = audioFile;
        this.frame = startFrame;
        this.samplesPerSecond = audioFile.rate;
        this.progressBar?.setMaxValue(audioFile.samples.length);
    }

    /**
     * Create the cassette player for the cassette file.
     *
     * @param casFile cassette file to convert to audio.
     * @param skip position the tape after the first "skip" files.
     */
    public setCasFile(casFile: Cassette, skip: number): void {
        // Make audio for each file at the appropriate speed.
        const samplesList: Int16Array[] = [];
        let startFrame = 0;
        const samplesPerSecond = 44100;
        for (const cassetteFile of casFile.files) {
            let samples: Int16Array;

            switch (cassetteFile.speed) {
                case CassetteSpeed.VERY_LOW:
                case CassetteSpeed.LOW:
                    samples = encodeLowSpeed(wrapLowSpeed(cassetteFile.file.binary), samplesPerSecond, cassetteFile.speed);
                    break;

                case CassetteSpeed.HIGH:
                    samples = encodeHighSpeed(wrapHighSpeed(cassetteFile.file.binary), samplesPerSecond);
                    break;

                default:
                    throw new Error("Unsupported speed: " + cassetteFile.speed.nominalBaud);
            }

            // Skip to this file.
            if (skip === 0) {
                startFrame = totalAudioSamples(samplesList);
            }
            skip -= 1;

            samplesList.push(samples);

            // Silence between files.
            samplesList.push(new Int16Array(samplesPerSecond));
        }

        this.setAudioFile(new AudioFile(samplesPerSecond, concatAudio(samplesList)), startFrame);
    }

    public onMotorStart(): void {
        this.motorOn = true;
        this.updateProgressBarVisibility();
    }

    public readSample(): number {
        if (this.progressBar !== undefined &&
            (this.frame % Math.floor(this.samplesPerSecond / 10) === 0 ||
                this.frame == this.audioFile.samples.length - 1)) {

            this.progressBar.setValue(this.frame);
        }

        return this.frame < this.audioFile.samples.length
            ? this.audioFile.samples[this.frame++] / 32768
            : 0;
    }

    public onMotorStop(): void {
        this.motorOn = false;
        this.updateProgressBarVisibility();
    }

    public rewind(): void {
        this.frame = 0;
        this.progressBar?.rewind();
    }

    public setProgressBar(progressBar: ProgressBar): void {
        this.progressBar = progressBar;
        this.progressBar.setMaxValue(this.audioFile.samples.length);
    }

    private updateProgressBarVisibility() {
        this.progressBar?.setShown(this.motorOn);
    }
}
