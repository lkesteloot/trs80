// Handles uploading WAV files and decoding them.

"use strict";

define(function () {

    class Uploader {
        /**
         * @param {HTMLElement} dropZone any element where files can be dropped.
         * @param {*} handleAudioBuffer callback with AudioBuffer parameter.
         */
        constructor(dropZone, handleAudioBuffer) {
            var self = this;

            this.handleAudioBuffer = handleAudioBuffer;

            dropZone.ondrop = function (ev) {
                self.dropHandler(ev);
            }
            dropZone.ondragover = function (ev) {
                dropZone.classList.add("hover");

                // Prevent default behavior (prevent file from being opened).
                ev.preventDefault();
            };
            dropZone.ondragleave = function (ev) {
                dropZone.classList.remove("hover");
            };
        }

        handleDroppedFile(file) {
            let self = this;
            let audioCtx = new window.AudioContext();
            console.log("File " + file.name + " has size " + file.size);
            // We could use file.arrayBuffer() here, but as of writing it's buggy
            // in Firefox 70. https://bugzilla.mozilla.org/show_bug.cgi?id=1585284
            let fileReader = new FileReader();
            fileReader.addEventListener("loadend", function () {
                audioCtx.decodeAudioData(fileReader.result).then(self.handleAudioBuffer);
            });
            fileReader.readAsArrayBuffer(file);
        }

        dropHandler(ev) {
            var self = this;

            // Prevent default behavior (Prevent file from being opened)
            ev.preventDefault();

            if (ev.dataTransfer.items) {
                // Use DataTransferItemList interface to access the files.
                for (var i = 0; i < ev.dataTransfer.items.length; i++) {
                    // If dropped items aren't files, reject them
                    if (ev.dataTransfer.items[i].kind === 'file') {
                        var file = ev.dataTransfer.items[i].getAsFile();
                        self.handleDroppedFile(file);
                    }
                }
            } else {
                // Use DataTransfer interface to access the files.
                for (var i = 0; i < ev.dataTransfer.files.length; i++) {
                    self.handleDroppedFile(ev.dataTransfer.files[i]);
                }
            }
        }
    }

    return Uploader;
});
