
// Handles uploading WAV files and decoding them.
import {AudioFile} from "./AudioUtils";
import {readWavFile} from "./WavFile";
import {encodeLowSpeed} from "./LowSpeedTapeEncoder";

export class Uploader {
    private readonly uploadInput: HTMLInputElement;
    private readonly handleAudioBuffer: (pathname: string, audioFile: AudioFile) => void;
    private progressBar: HTMLProgressElement;

    /**
     * @param dropZone any element where files can be dropped.
     * @param inputElement file type input element.
     * @param dropS3 buttons to upload from S3.
     * @param dropProgress progress bar for loading large files.
     * @param handleAudioBuffer callback with AudioBuffer parameter.
     */
    constructor(dropZone: HTMLElement,
                inputElement: HTMLInputElement,
                dropS3: NodeList,
                dropProgress: HTMLProgressElement,
                handleAudioBuffer: (pathname: string, audioFile: AudioFile) => void) {

        this.uploadInput = inputElement;
        this.handleAudioBuffer = handleAudioBuffer;
        this.progressBar = dropProgress;

        dropZone.ondrop = (ev) => this.dropHandler(ev);
        dropZone.ondragover = (ev) => {
            dropZone.classList.add("hover");

            // Prevent default behavior (prevent file from being opened).
            ev.preventDefault();
        };
        dropZone.ondragleave = () => dropZone.classList.remove("hover");
        inputElement.onchange = () => {
            if (inputElement.files) {
                const file = inputElement.files[0];
                if (file) {
                    this.handleDroppedFile(file);
                }
            }
        };
        inputElement.onprogress = (event) => this.showProgress(event);
        dropS3.forEach((node) => {
            const button = node as HTMLButtonElement;
            button.onclick = () => {
                const url = button.getAttribute("data-src") as string;
                const request = new XMLHttpRequest();
                request.open("GET", url, true);
                request.responseType = "arraybuffer";
                request.onload = () => this.handleArrayBuffer(url, request.response);
                request.onprogress = (event) => this.showProgress(event);
                // For testing progress bar only:
                /// request.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                request.send();
            };
        });
    }

    public reset(): void {
        this.progressBar.classList.add("hidden");
        this.uploadInput.value = "";
    }

    private handleDroppedFile(file: File) {
        console.log("File " + file.name + " has size " + file.size);
        // We could use file.arrayBuffer() here, but as of writing it's buggy
        // in Firefox 70. https://bugzilla.mozilla.org/show_bug.cgi?id=1585284
        const fileReader = new FileReader();
        fileReader.addEventListener("loadend", () => {
            if (fileReader.result instanceof ArrayBuffer) {
                this.handleArrayBuffer(file.name, fileReader.result);
            } else {
                console.log("Error: Unexpected type for fileReader.result: " +
                            fileReader.result);
            }
        });
        fileReader.addEventListener("progress", (event) => this.showProgress(event));
        fileReader.readAsArrayBuffer(file);
    }

    private showProgress(event: ProgressEvent) {
        this.progressBar.classList.remove("hidden");
        this.progressBar.value = event.loaded;
        this.progressBar.max = event.total;
    }

    private handleArrayBuffer(pathname: string, arrayBuffer: ArrayBuffer) {
        const rate = 44100;

        let audioFile;
        if (pathname.toLowerCase().endsWith(".cas")) {
            audioFile = new AudioFile(rate, encodeLowSpeed(new Uint8Array(arrayBuffer), rate));
        } else if (pathname.toLowerCase().endsWith(".bas")) {
            // Add tape header.
            const buffers = [
                new Uint8Array(256),
                new Uint8Array([0xA5, 0xD3, 0xD3, 0xD3]),
                new Uint8Array(arrayBuffer),
            ];
            const allBytes = this.concatByteArrays(buffers);

            audioFile = new AudioFile(rate, encodeLowSpeed(allBytes, rate));
        } else {
            audioFile = readWavFile(arrayBuffer);
        }
        this.handleAudioBuffer(pathname, audioFile);
    }

    /**
     * Concatenate a list of byte arrays into one.
     */
    private concatByteArrays(samplesList: Uint8Array[]): Uint8Array {
        const length = samplesList.reduce((sum, samples) => sum + samples.length, 0);
        const allBytes = new Uint8Array(length);

        let offset = 0;
        for (const samples of samplesList) {
            allBytes.set(samples, offset);
            offset += samples.length;
        }

        return allBytes;
    }

    private dropHandler(ev: DragEvent) {
        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();

        if (ev.dataTransfer) {
            if (ev.dataTransfer.items) {
                // Use DataTransferItemList interface to access the files.
                for (const item of ev.dataTransfer.items) {
                    // If dropped items aren't files, reject them
                    if (item.kind === "file") {
                        const file = item.getAsFile();
                        if (file) {
                            this.handleDroppedFile(file);
                        }
                    }
                }
            } else {
                // Use DataTransfer interface to access the files.
                for (const file of ev.dataTransfer.files) {
                    this.handleDroppedFile(file);
                }
            }
        }
    }
}
