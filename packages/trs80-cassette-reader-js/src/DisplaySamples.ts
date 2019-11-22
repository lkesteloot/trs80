
export class DisplaySamples {
    samplesList: Float32Array[];

    constructor(samples: Float32Array) {
        this.samplesList = [samples];
        this.filterDown();
    }

    filterDown() {
        // Sample down for quick display.
        while (this.samplesList[this.samplesList.length - 1].length > 1) {
            var samples = this.samplesList[this.samplesList.length - 1];
            var half = Math.ceil(samples.length / 2);
            var down = new Float32Array(half);
            for (var i = 0; i < half; i++) {
                var j = i * 2;
                var value = j == samples.length - 1 ? samples[j] : Math.max(samples[j], samples[j + 1]);
                down[i] = value;
            }
            this.samplesList.push(down);
        }
    }
}
