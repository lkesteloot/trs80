
import {BitType} from "./BitType.js";

/**
 * Information about one particular bit (its position and status).
 */
export class BitData {
    public startFrame: number;
    public endFrame: number;
    public bitType: BitType;

    /**
     * Create an object representing a bit.
     *
     * @param startFrame the first frame, inclusive.
     * @param endFrame the last frame, inclusive.
     * @param bitType what kind of bit it is.
     */
    constructor(startFrame: number, endFrame: number, bitType: BitType) {
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.bitType = bitType;
    }
}
