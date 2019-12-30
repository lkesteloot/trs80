
import {Decoder} from "./Decoder";
import {Tape} from "./Tape";
import {TapeBrowser} from "./TapeBrowser";
import {Uploader} from "./Uploader";

const zoomInButton = document.getElementById("zoom_in_button") as HTMLButtonElement;
const zoomOutButton = document.getElementById("zoom_out_button") as HTMLButtonElement;
const waveforms = document.getElementById("waveforms") as HTMLElement;
const originalCanvas = document.getElementById("original_canvas") as HTMLCanvasElement;
const filteredCanvas = document.getElementById("filtered_canvas") as HTMLCanvasElement;
const lowSpeedCanvas = document.getElementById("low_speed_canvas") as HTMLCanvasElement;
const programText = document.getElementById("program_text") as HTMLElement;
const tapeContents = document.getElementById("tape_contents") as HTMLElement;
const dropZone = document.getElementById("drop_zone") as HTMLElement;
const dropUpload = document.getElementById("drop_upload") as HTMLInputElement;
const dropS3 = document.querySelectorAll("#test_files button");
const dropProgress = document.getElementById("drop_progress") as HTMLProgressElement;
let uploader: Uploader | undefined;

function nameFromPathname(pathname: string): string {
    let name = pathname;

    // Keep only last component.
    let pos = name.lastIndexOf("/");
    if (pos >= 0) {
        name = name.substr(pos + 1);
    }

    // Remove extension.
    pos = name.lastIndexOf(".");
    if (pos >= 0) {
        name = name.substr(0, pos);
    }

    return name;
}

function handleAudioBuffer(pathname: string, audioBuffer: AudioBuffer) {
    console.log("Audio is " + audioBuffer.duration + " seconds, " +
                audioBuffer.numberOfChannels + " channels, " +
                    audioBuffer.sampleRate + " Hz");
    // TODO check that there's 1 channel.

    const samples = audioBuffer.getChannelData(0);
    const tape = new Tape(nameFromPathname(pathname), samples);
    const decoder = new Decoder(tape);
    decoder.decode();
    const tapeBrowser = new TapeBrowser(tape, zoomInButton, zoomOutButton, waveforms,
        originalCanvas, filteredCanvas, lowSpeedCanvas, programText, tapeContents);
    tapeBrowser.draw();

    // Switch screens.
    const dropScreen = document.getElementById("drop_screen") as HTMLElement;
    const dataScreen = document.getElementById("data_screen") as HTMLElement;
    dropScreen.style.display = "none";
    dataScreen.style.display = "block";

    const loadAnotherButton = document.getElementById("load_another_button") as HTMLButtonElement;
    loadAnotherButton.onclick = () => {
        dropScreen.style.display = "block";
        dataScreen.style.display = "none";
        if (uploader !== undefined) {
            uploader.reset();
        }
    };
}

export function main() {
    uploader = new Uploader(dropZone, dropUpload, dropS3, dropProgress, handleAudioBuffer);
}
