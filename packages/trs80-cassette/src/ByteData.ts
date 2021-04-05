
/**
 * Information about one particular byte (its position).
 */
export class ByteData {
    public value: number;
    public startFrame: number;
    public endFrame: number;

    /**
     * Create an object representing a byte.
     *
     * @param value the byte value (0-255).
     * @param startFrame the first frame, inclusive.
     * @param endFrame the last frame, inclusive.
     */
    constructor(value: number, startFrame: number, endFrame: number) {
        this.value = value;
        this.startFrame = startFrame;
        this.endFrame = endFrame;
    }
}
