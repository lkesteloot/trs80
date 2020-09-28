
/**
 * Information about one particular section of the waveform.
 */
export class WaveformAnnotation {
    /**
     * Text to display.
     */
    public readonly text: string;
    /**
     * First byte index into the binary array of the highlight, inclusive.
     */
    public readonly firstIndex: number;
    /**
     * Last byte index into the binary array of the highlight, inclusive.
     */
    public readonly lastIndex: number;

    /**
     * Create an object representing a section to annotate.
     *
     * @param text any text to display for that section.
     * @param firstIndex the first index into the binary, inclusive.
     * @param lastIndex the last index into the binary, inclusive.
     */
    constructor(text: string, firstIndex: number, lastIndex: number) {
        this.text = text;
        this.firstIndex = firstIndex;
        this.lastIndex = lastIndex;
    }
}
