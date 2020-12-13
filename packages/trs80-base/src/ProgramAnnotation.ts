
/**
 * Information about one particular section of a program. The indices refer back to a binary
 * that the program was parsed from.
 */
export class ProgramAnnotation {
    /**
     * Text to display.
     */
    public readonly text: string;
    /**
     * First byte index into the binary array of the annotation, inclusive.
     */
    public readonly begin: number;
    /**
     * Last byte index into the binary array of the annotation, exclusive.
     */
    public readonly end: number;

    /**
     * Create an object representing a section to annotate.
     *
     * @param text any text to display for that section.
     * @param begin the first index into the binary, inclusive.
     * @param end the last index into the binary, exclusive.
     */
    constructor(text: string, begin: number, end: number) {
        this.text = text;
        this.begin = begin;
        this.end = end;
    }
}
