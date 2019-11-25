// Handles uploading WAV files and decoding them.

export class Uploader {
    handleAudioBuffer: (audioBuffer: AudioBuffer) => void;
    progressBar: HTMLProgressElement;

    /**
     * @param dropZone any element where files can be dropped.
     * @param dropUpload file type input element.
     * @param dropS3 button to upload from S3.
     * @param dropProgress progress bar for loading large files.
     * @param handleAudioBuffer callback with AudioBuffer parameter.
     */
    constructor(dropZone: HTMLElement,
                dropUpload: HTMLInputElement,
                dropS3: HTMLButtonElement,
                dropProgress: HTMLProgressElement,
                handleAudioBuffer: (audioBuffer: AudioBuffer) => void) {
        const self = this;

        this.handleAudioBuffer = handleAudioBuffer;
        this.progressBar = dropProgress;

        dropZone.ondrop = function (ev) {
            self.dropHandler(ev);
        };
        dropZone.ondragover = function (ev) {
            dropZone.classList.add("hover");

            // Prevent default behavior (prevent file from being opened).
            ev.preventDefault();
        };
        dropZone.ondragleave = function () {
            dropZone.classList.remove("hover");
        };
        dropUpload.onchange = function () {
            if (dropUpload.files) {
                const file = dropUpload.files[0];
                if (file) {
                    self.handleDroppedFile(file);
                }
            }
        };
        dropUpload.onprogress = function (event) {
            self.showProgress(event);
        };
        dropS3.onclick = function () {
            const request = new XMLHttpRequest();
            request.open('GET', "https://trs80-cassettes.s3.us-east-2.amazonaws.com/lk/C-1-1.wav", true);
            request.responseType = "arraybuffer";
            request.onload = function () {
                self.handleArrayBuffer(request.response);
            };
            request.onprogress = function (event) {
                self.showProgress(event);
            };
            // For testing progress bar only:
            request.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            request.send();
        };
    }

    handleDroppedFile(file: File) {
        let self = this;
        console.log("File " + file.name + " has size " + file.size);
        // We could use file.arrayBuffer() here, but as of writing it's buggy
        // in Firefox 70. https://bugzilla.mozilla.org/show_bug.cgi?id=1585284
        let fileReader = new FileReader();
        fileReader.addEventListener("loadend", function () {
            if (fileReader.result instanceof ArrayBuffer) {
                self.handleArrayBuffer(fileReader.result);
            } else {
                console.log("Error: Unexpected type for fileReader.result: " +
                            fileReader.result);
            }
        });
        fileReader.addEventListener("progress", function (event) {
            self.showProgress(event);
        });
        fileReader.readAsArrayBuffer(file);
    }

    showProgress(event: ProgressEvent) {
        this.progressBar.style.display = "block";
        this.progressBar.value = event.loaded;
        this.progressBar.max = event.total;
    }

    handleArrayBuffer(arrayBuffer: ArrayBuffer) {
        let audioCtx = new window.AudioContext();
        audioCtx.decodeAudioData(arrayBuffer).then(this.handleAudioBuffer);
    }

    dropHandler(ev: DragEvent) {
        const self = this;

        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();

        if (ev.dataTransfer) {
            if (ev.dataTransfer.items) {
                // Use DataTransferItemList interface to access the files.
                for (let i = 0; i < ev.dataTransfer.items.length; i++) {
                    // If dropped items aren't files, reject them
                    if (ev.dataTransfer.items[i].kind === 'file') {
                        const file = ev.dataTransfer.items[i].getAsFile();
                        if (file) {
                            self.handleDroppedFile(file);
                        }
                    }
                }
            } else {
                // Use DataTransfer interface to access the files.
                for (let i = 0; i < ev.dataTransfer.files.length; i++) {
                    self.handleDroppedFile(ev.dataTransfer.files[i]);
                }
            }
        }
    }
}
