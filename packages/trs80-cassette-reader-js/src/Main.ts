
import { Tape } from "Tape";
import { TapeBrowser } from "TapeBrowser";
import { Uploader } from "Uploader";
import { Decoder } from "Decoder";

function handleAudioBuffer(audioBuffer: AudioBuffer) {
    console.log("Audio is " + audioBuffer.duration + " seconds, " +
                audioBuffer.numberOfChannels + " channels, " +
                    audioBuffer.sampleRate + " Hz");
    // TODO check that there's 1 channel and it's 48 kHz.

    const originalCanvas = document.getElementById("original_canvas") as HTMLCanvasElement;
    const filteredCanvas = document.getElementById("filtered_canvas") as HTMLCanvasElement;
    const programText = document.getElementById("program_text") as HTMLElement;
    const tapeContents = document.getElementById("tape_contents") as HTMLElement;

    const samples = audioBuffer.getChannelData(0);
    const tape = new Tape(samples);
    const decoder = new Decoder(tape);
    decoder.decode();
    const tapeBrowser = new TapeBrowser(tape, originalCanvas, filteredCanvas, programText, tapeContents);
    tapeBrowser.draw();

    // Switch screens.
    const dropScreen = document.getElementById("drop_screen") as HTMLElement;
    const dataScreen = document.getElementById("data_screen") as HTMLElement;
    dropScreen.style.display = "none";
    dataScreen.style.display = "block";
}

export function main() {
    const dropZone = document.getElementById("drop_zone") as HTMLElement;
    const dropUpload = document.getElementById("drop_upload") as HTMLInputElement;
    const dropS3 = document.querySelectorAll("#test_files button");
    const dropProgress = document.getElementById("drop_progress") as HTMLProgressElement;
    new Uploader(dropZone, dropUpload, dropS3, dropProgress, handleAudioBuffer);
}
