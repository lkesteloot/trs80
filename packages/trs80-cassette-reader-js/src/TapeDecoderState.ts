// Enum for the state of a tape decoder.

export enum TapeDecoderState {
    /**
     * Decoder must start in UNDECIDED state.
     */
    UNDECIDED,

    /**
     * Go from UNDECIDED to DETECTED once it's sure that the encoding is its own. This usually
     * happens at the end of the header.
     */
    DETECTED,

    /**
     * Go from DETECTED to ERROR if an error is found (e.g., missing start bit).
     * Once in the ERROR state, the decoder won't be called again.
     */
    ERROR,

    /**
     * Go from DETECTED to FINISHED once the program is fully read.
     * Once in the FINISHED state, the decoder won't be given any more samples.
     */
    FINISHED,
}
