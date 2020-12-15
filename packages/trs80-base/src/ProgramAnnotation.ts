
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
     * Byte index into the binary array of the start of the annotation, inclusive.
     */
    public readonly begin: number;
    /**
     * Byte index into the binary array of the end of the annotation, exclusive.
     */
    public readonly end: number;

    constructor(text: string, begin: number, end: number) {
        this.text = text;
        this.begin = begin;
        this.end = end;
    }
}
