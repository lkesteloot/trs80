
import {Decoder} from "./Decoder";
import {Tape} from "./Tape";
import {TapeBrowser} from "./TapeBrowser";
import {Uploader} from "./Uploader";
import Split from "split.js";

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
    const tape = new Tape(nameFromPathname(pathname), samples, audioBuffer.sampleRate);
    const decoder = new Decoder(tape);
    decoder.decode();
    const tapeBrowser = new TapeBrowser(tape,
        document.getElementById("zoom_in_button") as HTMLButtonElement,
        document.getElementById("zoom_out_button") as HTMLButtonElement,
        document.getElementById("waveforms") as HTMLElement,
        document.getElementById("original_canvas") as HTMLCanvasElement,
        document.getElementById("filtered_canvas") as HTMLCanvasElement,
        document.getElementById("low_speed_canvas") as HTMLCanvasElement,
        document.getElementById("tape_contents") as HTMLElement,
        document.getElementById("top_data") as HTMLElement);

    // Switch screens.
    const dropScreen = document.getElementById("drop_screen") as HTMLElement;
    const dataScreen = document.getElementById("data_screen") as HTMLElement;
    dropScreen.classList.add("hidden");
    dataScreen.classList.remove("hidden");

    const loadAnotherButton = document.getElementById("load_another_button") as HTMLButtonElement;
    loadAnotherButton.onclick = () => {
        dropScreen.classList.remove("hidden");
        dataScreen.classList.add("hidden");
        if (uploader !== undefined) {
            uploader.reset();
        }
    };

    Split(["#data_screen > nav", "#data_screen > main"], {
        sizes: [20,80],
        minSize: [200, 200],
        snapOffset: 0,
    });
    Split(["#top_data", "#waveforms"], {
        sizes: [50,50],
        minSize: [100, 100],
        snapOffset: 0,
        direction: "vertical",
    });
}

export function main() {
    uploader = new Uploader(dropZone, dropUpload, dropS3, dropProgress, handleAudioBuffer);
}
