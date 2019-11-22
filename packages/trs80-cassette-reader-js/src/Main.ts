
import { Tape } from "Tape";
import { TapeBrowser } from "TapeBrowser";
import { Uploader } from "Uploader";
import { Decoder } from "Decoder";

/**
 * @param {AudioBuffer} audioBuffer 
 */
function handleAudioBuffer(audioBuffer: AudioBuffer) {
    console.log("Audio is " + audioBuffer.duration + " seconds, " +
                audioBuffer.numberOfChannels + " channels, " +
                    audioBuffer.sampleRate + " Hz");
    // XXX check that there's 1 channel and it's 48 kHz.

    var originalCanvas = <HTMLCanvasElement> document.getElementById("original_canvas");
    var filteredCanvas = <HTMLCanvasElement> document.getElementById("filtered_canvas");
    var programText = <HTMLElement> document.getElementById("program_text");
    var tapeContents = <HTMLElement> document.getElementById("tape_contents");

    const samples = audioBuffer.getChannelData(0);
    const tape = new Tape(samples);
    var decoder = new Decoder(tape);
    decoder.decode();
    var tapeBrowser = new TapeBrowser(tape, originalCanvas, filteredCanvas, programText, tapeContents);
    tapeBrowser.draw();

    // Switch screens.
    var dropScreen = document.getElementById("drop_screen");
    var dataScreen = document.getElementById("data_screen");
    if (dropScreen) {
        dropScreen.style.display = "none";
    }
    if (dataScreen) {
        dataScreen.style.display = "block";
    }
}

export function main() {
    var dropZone = <HTMLElement> document.getElementById("drop_zone");
    var dropUpload = <HTMLInputElement> document.getElementById("drop_upload");
    new Uploader(dropZone, dropUpload, handleAudioBuffer);
}
