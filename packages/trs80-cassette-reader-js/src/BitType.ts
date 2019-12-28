
/**
 * Information about a particular bit.
 */
export enum BitType {
    /**
     * Represents a numerical zero (0).
     */
    ZERO,
    /**
     * Represents a numerical one (1).
     */
    ONE,
    /**
     * Represents a start bit in a byte.
     */
    START,
    /**
     * Represents an undecoded bit.
     */
    BAD,
}
