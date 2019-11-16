
"use strict";

requirejs.config({
    // Force reloading of JS files.
    urlArgs: "bust=" + (new Date()).getTime()
});

requirejs(["Tape", "TapeBrowser"], function (Tape, TapeBrowser) {
    var gDropScreen = document.getElementById("drop_screen");
    var gDropZone = document.getElementById("drop_zone");
    var gDataScreen = document.getElementById("data_screen");
    var gDataCanvas = document.getElementById("data_canvas");
    var gTapeBrowser = null;

    /**
s     * @param {AudioBuffer} audioBuffer 
     */
    function handleAudioBuffer(audioBuffer) {
        const samples = audioBuffer.getChannelData(0);
        const tape = new Tape(samples);
        gTapeBrowser = new TapeBrowser(tape, [gDataCanvas]);
        gTapeBrowser.fitIn(gDataCanvas.width);
        gTapeBrowser.draw();
        gDropScreen.style.display = "none";
        gDataScreen.style.display = "block";
    }

    function handleDroppedFile(file) {
        var audioCtx = new window.AudioContext();
        console.log("File " + file.name + " has size " + file.size);
        var x = file.arrayBuffer();
        x.then(audioData => {
            console.log("Downloaded size is " + audioData.byteLength + " bytes");
            var y = audioCtx.decodeAudioData(audioData);
            y.then(audioBuffer => {
                console.log("Audio is " + audioBuffer.duration + " seconds, " + audioBuffer.numberOfChannels + " channels, " + audioBuffer.sampleRate + " Hz");
                // XXX check that there's 1 channel and it's 48 kHz.
                handleAudioBuffer(audioBuffer);
                audioBuffer
            });
        });
    }

    function dropHandler(ev) {
        // Prevent default behavior (Prevent file from being opened)
        ev.preventDefault();

        if (ev.dataTransfer.items) {
            // Use DataTransferItemList interface to access the files.
            for (var i = 0; i < ev.dataTransfer.items.length; i++) {
                // If dropped items aren't files, reject them
                if (ev.dataTransfer.items[i].kind === 'file') {
                    var file = ev.dataTransfer.items[i].getAsFile();
                    handleDroppedFile(file);
                }
            }
        } else {
            // Use DataTransfer interface to access the files.
            for (var i = 0; i < ev.dataTransfer.files.length; i++) {
                handleDroppedFile(ev.dataTransfer.files[i]);
            }
        }
    }

    (function () {
        document.onkeydown = function (event) {
            // XXX should pick meta vs. ctrl based on platform (mac vs. pc).
            if (event.metaKey || event.ctrlKey) {
                if (event.keyCode == 187) {
                    gTapeBrowser.zoomIn();
                    event.preventDefault();
                }
                if (event.keyCode == 189) {
                    gTapeBrowser.zoomOut();
                    event.preventDefault();
                }
            }
        };

        gDropZone.ondrop = dropHandler;
        gDropZone.ondragover = function (ev) {
            gDropZone.classList.add("hover");

            // Prevent default behavior (prevent file from being opened).
            ev.preventDefault();
        };
        gDropZone.ondragleave = function (ev) {
            gDropZone.classList.remove("hover");
        };

    })();
});
