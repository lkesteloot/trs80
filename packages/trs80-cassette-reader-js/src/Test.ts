
export enum TestType {
    // Expect a pulse half-way through the WAV file.
    LOW_SPEED_PULSE,
    // Expect no pulse half-way through the WAV file.
    LOW_SPEED_NO_PULSE,
    // Expect a sequence of header (zero) bits to be proofed. This is different than reading a bunch of zero bits.
    LOW_SPEED_PROOF,
    // Expect a sequence of bits (in "bin" or "binUrl"). First sample of WAV is previous bit's clock pulse.
    LOW_SPEED_BITS,
    // Expect a sequence of bits (in "bin" or "binUrl"). Start and end WAV file part-way through pulses.
    HIGH_SPEED_BITS,
}

const STRING_TO_TEST_TYPE: {[key: string]: TestType} = {
    "low-speed-pulse": TestType.LOW_SPEED_PULSE,
    "low-speed-no-pulse": TestType.LOW_SPEED_NO_PULSE,
    "low-speed-proof": TestType.LOW_SPEED_PROOF,
    "low-speed-bits": TestType.LOW_SPEED_BITS,
    "high-speed-bits": TestType.HIGH_SPEED_BITS,
};

/**
 * Individual test to run.
 */
export class Test {
    public readonly name: string;
    public readonly wavUrl: string;
    public readonly type: TestType;
    // If type == BITS, then exactly one of these must be set.
    // Sequence of "0" or "1" characters. Spaces are ignored.
    public readonly bin: string | undefined;
    public readonly binUrl: string | undefined;

    constructor(jsonTest: any) {
        this.name = jsonTest.name;
        this.wavUrl = jsonTest.wavUrl;
        this.type = STRING_TO_TEST_TYPE[jsonTest.type as string];
        this.bin = jsonTest.bin as string;
        this.binUrl = jsonTest.binUrl as string;
    }

    public isHighSpeed(): boolean {
        return this.type === TestType.HIGH_SPEED_BITS;
    }
}

/**
 * Batch of tests from a file.
 */
export class TestFile {
    public readonly name: string | undefined;
    public readonly url: string;
    public readonly tests: Test[] = [];
    public readonly includes: string[] = [];

    constructor(url: string, json: any) {
        this.url = url;
        this.name = json.name;

        const jsonTests = json.tests as any[];
        if (jsonTests === undefined) {
            throw new Error("file does not have top-level \"tests\" key");
        }

        for (const jsonTest of jsonTests) {
            if (typeof jsonTest === "string") {
                this.includes.push(jsonTest);
            } else {
                this.tests.push(new Test(jsonTest));
            }
        }
    }
}
