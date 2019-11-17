"use strict";

define(function () {
    class Program {
        /**
         * 
         * @param {number} trackNumber 
         * @param {number} copyNumber 
         * @param {number} startFrame 
         * @param {number} endFrame
         * @param {Uint8Array} binary 
         */
        constructor(trackNumber, copyNumber, startFrame, endFrame, binary) {
            this.trackNumber = trackNumber;
            this.copyNumber = copyNumber;
            this.startFrame = startFrame;
            this.endFrame = endFrame;
            this.binary = binary;
        }
    }

    return Program;
});