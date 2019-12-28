
export class DisplaySamples {
    public samplesList: Float32Array[];

    constructor(samples: Float32Array) {
        this.samplesList = [samples];
        this.filterDown();
    }

    private filterDown() {
        // Sample down for quick display.
        while (this.samplesList[this.samplesList.length - 1].length > 1) {
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
