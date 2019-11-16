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
            var audioCtx = new window.AudioContext();
            console.log("File " + file.name + " has size " + file.size);
            var x = file.arrayBuffer();
            x.then(audioData => {
                console.log("Downloaded size is " + audioData.byteLength + " bytes");
                var y = audioCtx.decodeAudioData(audioData);
                y.then(audioBuffer => {
                    console.log("Audio is " + audioBuffer.duration + " seconds, " + audioBuffer.numberOfChannels + " channels, " + audioBuffer.sampleRate + " Hz");
                    // XXX check that there's 1 channel and it's 48 kHz.
                    this.handleAudioBuffer(audioBuffer);
                });
            });
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