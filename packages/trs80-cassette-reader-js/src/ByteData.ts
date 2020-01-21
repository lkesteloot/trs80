
/**
 * Information about one particular byte (its position).
 */
export class ByteData {
    public startFrame: number;
    public endFrame: number;

    /**
     * Create an object representing a byte.
     *
     * @param startFrame the first frame, inclusive.
     * @param endFrame the last frame, inclusive.
     */
    constructor(startFrame: number, endFrame: number) {
        this.startFrame = startFrame;
        this.endFrame = endFrame;
    }
}
