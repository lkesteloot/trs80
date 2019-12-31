
// Interface for fetching cassette audio data. We make this a concrete
// class because rollup.js can't handle exported interfaces.
export class Cassette {
    /**
     * The number of samples per second that this audio represents.
     */
    public samplesPerSecond: number = 44100;

    /**
     * Read the next sample. Must be in the range -1 to 1. If we try to read off
     * the end of the cassette, just return zero.
     */
    public readSample(): number {
        return 0;
    }
}
