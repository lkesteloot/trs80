"use strict";

define(function () {
    class Program {
        /**
         * 
         * @param {number} trackNumber 
         * @param {number} copyNumber 
         * @param {number} startFrame 
         * @param {Uint8Array} binary 
         */
        constructor(trackNumber, copyNumber, startFrame, binary) {
            this.trackNumber = trackNumber;
            this.copyNumber = copyNumber;
            this.startFrame = startFrame;
            this.binary = binary;
        }
    }

    return Program;
});