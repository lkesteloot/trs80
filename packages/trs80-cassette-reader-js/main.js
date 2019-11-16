
"use strict";

var gDropScreen = document.getElementById("drop_screen");
var gDropDiv = document.getElementById("drop_zone");
var gDataScreen = document.getElementById("data_screen");
var gDataCanvas = document.getElementById("data_canvas");
var gSamplesList = []; // Array<Float32Array>, 0 = origin, 1 = zoomed out 2x, etc.
var gDisplayLevel = 0; // Display level in gSamplesList.
var gCenterSample = 0; // Centered sample (in level 0).

/**
 * 
 * @param {Float32Array} samples 
 */
function processSamples(samples) {
    var samplesList = [samples];

    while (samplesList[samplesList.length - 1].length > 1) {
        var samples = samplesList[samplesList.length - 1];
        var half = Math.ceil(samples.length/2);
        var down = new Float32Array(half);

        for (var i = 0; i < half; i++) {
            var j = i*2;
            var value = j == samples.length - 1 ? samples[j] : Math.max(samples[j], samples[j + 1]);
            down[i] = value;
        }
        samplesList.push(down);
    }

    return samplesList;
}

/**
 * 
 * @param {Float32Array} samples
 */
function drawSamples() {
    const ctx = gDataCanvas.getContext('2d');
    const width = gDataCanvas.width;
    const height = gDataCanvas.height;
    const samples = gSamplesList[gDisplayLevel];
    const mag = Math.pow(2, gDisplayLevel);
    const centerSample = Math.floor(gCenterSample/mag);

    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgb(255, 255, 255)";
    const firstSample = Math.max(centerSample - Math.floor(width/2), 0);
    const lastSample = Math.min(centerSample + width - 1, samples.length - 1);

    const drawingLine = gDisplayLevel < 3;
    if (drawingLine) {
        ctx.beginPath();
    }
    for (var i = firstSample; i <= lastSample; i++) {
        var value = samples[i];
        var x = Math.floor(width/2) + (i - centerSample);
        var y = value*height/2;

        if (drawingLine) {
            if (i == firstSample) {
                ctx.moveTo(x, height/2 - y);
            } else {
                ctx.lineTo(x, height/2 - y);
            }
        } else {
            ctx.beginPath();
            ctx.moveTo(x, height/2 - y);
            ctx.lineTo(x, height/2 + y);
            ctx.stroke();
        }
    }
    if (drawingLine) {
        ctx.stroke();
    }
}

function zoomIn() {
    if (gDisplayLevel > 0) {
        gDisplayLevel -= 1;
        drawSamples();
    }
}

function zoomOut() {
    if (gDisplayLevel < gSamplesList.length - 1) {
        gDisplayLevel += 1;
        drawSamples();
    }
}

/**
 * 
 * @param {AudioBuffer} audioBuffer 
 */
function handleAudioBuffer(audioBuffer) {
    const samples = audioBuffer.getChannelData(0);
    gCenterSample = Math.floor(samples.length/2);
    gSamplesList = processSamples(samples);
    gDisplayLevel = 0;
    for (var i = 0; i < gSamplesList.length; i++) {
        const samples = gSamplesList[i];
        if (samples.length <= gDataCanvas.width) {
            gDisplayLevel = i;
            break;
        }
    }
    drawSamples();
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

function dragOverHandler(ev) {
    gDropDiv.classList.add("hover");

    // Prevent default behavior (prevent file from being opened).
    ev.preventDefault();
}

function dragLeaveHandler(ev) {
    gDropDiv.classList.remove("hover");
}

(function() {
    document.onkeydown = function (event) {
        // XXX should pick meta vs. ctrl based on platform (mac vs. pc).
        if (event.metaKey || event.ctrlKey) {
            if (event.keyCode == 187) {
                zoomIn();
                event.preventDefault();
            }
            if (event.keyCode == 189) {
                zoomOut();
                event.preventDefault();
            }
        }
    };

    // Configure dragging of samples canvas.
    var dragging = false;
    var dragInitialX = 0;
    var dragInitialCenterSample = 0;
    gDataCanvas.onmousedown = function (event) {
        dragging = true;
        dragInitialX = event.x;
        dragInitialCenterSample = gCenterSample;
        gDataCanvas.style.cursor = "grab";
    };
    gDataCanvas.onmouseup = function (event) {
        dragging = false;
        gDataCanvas.style.cursor = "auto";
    };
    gDataCanvas.onmousemove = function (event) {
        if (dragging) {
            var dx = event.x - dragInitialX;
            const mag = Math.pow(2, gDisplayLevel);
            gCenterSample = Math.round(dragInitialCenterSample - dx*mag);
            drawSamples();
        }
    }
})();
