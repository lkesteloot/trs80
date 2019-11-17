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

        /**
         * Whether the binary represents a Basic program.
         * 
         * @returns {boolean}
         */
        isProgram() {
            return this.binary != null &&
                this.binary.length >= 3 &&
                this.binary[0] == 0xD3 &&
                this.binary[1] == 0xD3 &&
                this.binary[2] == 0xD3;
        }
    }

    return Program;
});