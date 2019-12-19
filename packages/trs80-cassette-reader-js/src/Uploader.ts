/*
 * Copyright 2019 Lawrence Kesteloot
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Handles uploading WAV files and decoding them.

export class Uploader {
    private handleAudioBuffer: (audioBuffer: AudioBuffer) => void;
    private progressBar: HTMLProgressElement;

    /**
     * @param dropZone any element where files can be dropped.
     * @param dropUpload file type input element.
     * @param dropS3 buttons to upload from S3.
     * @param dropProgress progress bar for loading large files.
     * @param handleAudioBuffer callback with AudioBuffer parameter.
     */
    constructor(dropZone: HTMLElement,
                dropUpload: HTMLInputElement,
                dropS3: NodeList,
                dropProgress: HTMLProgressElement,
                handleAudioBuffer: (audioBuffer: AudioBuffer) => void) {

        this.handleAudioBuffer = handleAudioBuffer;
        this.progressBar = dropProgress;

        dropZone.ondrop = (ev) => this.dropHandler(ev);
        dropZone.ondragover = (ev) => {
            dropZone.classList.add("hover");

            // Prevent default behavior (prevent file from being opened).
            ev.preventDefault();
        };
        dropZone.ondragleave = () => dropZone.classList.remove("hover");
        dropUpload.onchange = () => {
            if (dropUpload.files) {
                const file = dropUpload.files[0];
                if (file) {
                    this.handleDroppedFile(file);
                }
            }
        };
        dropUpload.onprogress = (event) => this.showProgress(event);
        dropS3.forEach((node) => {
            const button = node as HTMLButtonElement;
            button.onclick = () => {
                const url = button.getAttribute("data-src") as string;
                const request = new XMLHttpRequest();
                request.open("GET", url, true);
                request.responseType = "arraybuffer";
                request.onload = () => this.handleArrayBuffer(request.response);
                request.onprogress = (event) => this.showProgress(event);
                // For testing progress bar only:
                /// request.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                request.send();
            };
        });
    }

    private handleDroppedFile(file: File) {
        console.log("File " + file.name + " has size " + file.size);
        // We could use file.arrayBuffer() here, but as of writing it's buggy
        // in Firefox 70. https://bugzilla.mozilla.org/show_bug.cgi?id=1585284
        const fileReader = new FileReader();
        fileReader.addEventListener("loadend", () => {
            if (fileReader.result instanceof ArrayBuffer) {
                this.handleArrayBuffer(fileReader.result);
            } else {
                console.log("Error: Unexpected type for fileReader.result: " +
                            fileReader.result);
            }
        });
        fileReader.addEventListener("progress", (event) => this.showProgress(event));
        fileReader.readAsArrayBuffer(file);
    }

    private showProgress(event: ProgressEvent) {
        this.progressBar.style.display = "block";
        this.progressBar.value = event.loaded;
        this.progressBar.max = event.total;
    }

    private handleArrayBuffer(arrayBuffer: ArrayBuffer) {
        const audioCtx = new window.AudioContext();
        audioCtx.decodeAudioData(arrayBuffer).then(this.handleAudioBuffer);
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
