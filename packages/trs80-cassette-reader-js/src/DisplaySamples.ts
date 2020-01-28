
/**
 * Samples that are pre-filtered so we can display them zoomed out quickly.
 */
export class DisplaySamples {
    /**
     * Index 0 are the original samples, index 1 are halved, etc.
     */
    public samplesList: Float32Array[];

    constructor(samples: Float32Array) {
        this.samplesList = [samples];
        this.filterDown();
    }

    /**
     * Sample down for quick display.
     */
    private filterDown() {
        while (this.samplesList[this.samplesList.length - 1].length > 500) {
            const samples = this.samplesList[this.samplesList.length - 1];
            const half = Math.ceil(samples.length / 2);
            const down = new Float32Array(half);
            for (let i = 0; i < half; i++) {
                const j = i * 2;
                down[i] = j === samples.length - 1 ? samples[j] : Math.max(samples[j], samples[j + 1]);
            }
            this.samplesList.push(down);
        }
    }
}
