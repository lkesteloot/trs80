
"use strict";

requirejs.config({
    // Force reloading of JS files.
    urlArgs: "bust=" + (new Date()).getTime()
});

requirejs(["Tape", "TapeBrowser", "Uploader", "Decoder"], function (Tape, TapeBrowser, Uploader, Decoder) {
    /**
     * @param {AudioBuffer} audioBuffer 
     */
    function handleAudioBuffer(audioBuffer) {
        var originalCanvas = document.getElementById("original_canvas");
        var filteredCanvas = document.getElementById("filtered_canvas");
        var tapeContents = document.getElementById("tape_contents");
    
        const samples = audioBuffer.getChannelData(0);
        const tape = new Tape(samples);
        var decoder = new Decoder(tape);
        decoder.decode();
        var tapeBrowser = new TapeBrowser(tape, originalCanvas, filteredCanvas, tapeContents);
        tapeBrowser.draw();

        // Switch screens.
        var dropScreen = document.getElementById("drop_screen");
        var dataScreen = document.getElementById("data_screen");
        dropScreen.style.display = "none";
        dataScreen.style.display = "block";
    }

    (function () {
        var dropZone = document.getElementById("drop_zone");
        new Uploader(dropZone, handleAudioBuffer);
    })();
});
