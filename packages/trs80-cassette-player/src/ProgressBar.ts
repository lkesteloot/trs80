
/**
 * Interface for a progress bar to show progress, for instance the position of a cassette tape.
 */
export interface ProgressBar {
    /**
     * Set the maximum value of the progress bar (when it's full). The minimum value
     * is always zero.
     */
    setMaxValue(maxValue: number): void;

    /**
     * Set the current value of the progress bar. Values less than 0 are clamped to
     * zero. Those greater than the max are clamped to the max.
     */
    setValue(value: number): void;

    /**
     * Rewind to the beginning. This can be instant or animated. The end result is that the
     * value is at zero, as if setValue(0) had been called.
     */
    rewind(): void;

    /**
     * Set whether to show the progress bar.
     */
    setShown(shown: boolean): void;
}
