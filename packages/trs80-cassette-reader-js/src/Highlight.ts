import {Program} from "./Program";

/**
 * Current selection or highlight.
 */
export class Highlight {
    /**
     * Program for the selection or highlight.
     */
    readonly program: Program;
    /**
     * First byte index into the binary array of the highlight, inclusive.
     */
    readonly firstIndex: number;
    /**
     * Last byte index into the binary array of the highlight, inclusive.
     */
    readonly lastIndex: number;

    constructor(program: Program, beginIndex: number, endIndex?: number) {
        this.program = program;

        // Default to one byte.
        endIndex = endIndex ?? beginIndex;

        // Re-order so that begin <= end.
        this.firstIndex = Math.min(beginIndex, endIndex);
        this.lastIndex = Math.max(beginIndex, endIndex);
    }
}
